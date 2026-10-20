import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {get} from 'node:http';
import {createAccounts} from '../server/accounts.mjs';
import {createLocalServer} from '../server/app.mjs';
import {readAccountRecords} from '../server/account-records.mjs';
import {readRelayRecords} from '../server/relay-records.mjs';
import {editorAccessKey} from '../server/editor-gateway.mjs';
const root=resolve(import.meta.dirname,'..');
test('accounts normalize email, hash passwords, persist sessions, reject bad credentials and revoke logout',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-accounts-'));let clock=Date.now();let store;
  try{
    store=await createAccounts({directory,now:()=>clock});
    const first=await store.enter('register',{email:'  Tester@QQ.com ',password:'synthetic-pass-123'},'one');
    assert.equal(first.user.email,'tester@qq.com');assert.deepEqual(store.user(first.token),first.user);
    const records=await readAccountRecords(resolve(directory,'accounts.sqlite'));
    assert.equal(records.total,1);assert.equal(records.users[0].email,'tester@qq.com');
    assert.deepEqual(Object.keys(records.users[0]).sort(),['email','id','registeredAt']);
    assert.ok(!JSON.stringify(records).includes('synthetic-pass-123'));assert.ok(!JSON.stringify(records).includes(first.token));
    assert.equal((await readAccountRecords(resolve(directory,'accounts.sqlite'),{email:'TESTER@QQ.COM'})).total,1);
    assert.equal((await readAccountRecords(resolve(directory,'accounts.sqlite'),{email:'missing@qq.com'})).total,0);
    await assert.rejects(store.enter('register',{email:'tester@qq.com',password:'different-pass'},'two'),{code:'EMAIL_REGISTERED'});
    await assert.rejects(store.enter('login',{email:'tester@qq.com',password:'wrong-password'},'three'),{code:'INVALID_CREDENTIALS'});
    await assert.rejects(store.enter('login',{email:'missing@example.com',password:'wrong-password'},'four'),{code:'INVALID_CREDENTIALS'});
    await assert.rejects(store.enter('register',{email:'invalid',password:'synthetic-pass'},'five'),{code:'INVALID_EMAIL'});
    await assert.rejects(store.enter('register',{email:'a@b.com',password:'short'},'six'),{code:'INVALID_PASSWORD'});
    store.close();store=await createAccounts({directory,now:()=>clock});assert.deepEqual(store.user(first.token),first.user);
    const again=await store.enter('login',{email:'TESTER@qq.com',password:'synthetic-pass-123'},'seven');assert.equal(again.user.id,first.user.id);
    store.logout(again.token);assert.equal(store.user(again.token),null);
    clock+=8*86400000;assert.equal(store.user(first.token),null);
    store.close();store=null;const bytes=await readFile(resolve(directory,'accounts.sqlite'));assert.ok(!bytes.includes(Buffer.from('synthetic-pass-123')));assert.ok(!bytes.includes(Buffer.from(first.token)));
  }finally{store?.close();await rm(directory,{recursive:true,force:true});}
});
test('only QQ domains can register, including QQ aliases, without affecting existing non-QQ logins',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-qq-'));const store=await createAccounts({directory});
  try{
    for(const email of ['a@example.com','a@foxmail.com','a@qq.com.example.com','a@qq.com@evil.com','a+tag@qq.com'])await assert.rejects(store.enter('register',{email,password:'synthetic-pass'},email));
    const numeric=await store.enter('register',{email:'123456789@qq.com',password:'synthetic-pass'},'numeric');assert.equal(numeric.user.email,'123456789@qq.com');
    const alias=await store.enter('register',{email:'  Example.Alias@QQ.COM ',password:'synthetic-pass'},'alias');assert.equal(alias.user.email,'example.alias@qq.com');
    // Simulate an account registered before the QQ-only policy.
    const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(resolve(directory,'accounts.sqlite'));
    db.prepare('UPDATE users SET email=? WHERE id=?').run('old@example.com',alias.user.id);db.close();
    assert.equal((await store.enter('login',{email:'old@example.com',password:'synthetic-pass'},'legacy')).user.id,alias.user.id);
    assert.equal((await readAccountRecords(resolve(directory,'absent.sqlite'))).total,0);
    await assert.rejects(readAccountRecords(resolve(directory,'accounts.sqlite'),{limit:0}));
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('account operations are rate limited',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-rate-'));const store=await createAccounts({directory});
  try{for(let i=0;i<12;i++)await assert.rejects(store.enter('login',{email:'invalid',password:'synthetic-pass'},'same-ip'),{code:'INVALID_EMAIL'});await assert.rejects(store.enter('login',{},'same-ip'),{code:'AUTH_RATE_LIMIT',status:429});}finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('public mode requires accounts and a configured origin; game APIs and HTML require login',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-auth-http-'));let app;
  try{
    await assert.rejects(createLocalServer({projectRoot:root,host:'0.0.0.0',authRequired:false,publicOrigin:'http://game.example:8807'}),/PUBLIC_SERVER/);
    await assert.rejects(createLocalServer({projectRoot:root,host:'0.0.0.0'}),/PUBLIC_SERVER/);
    const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
    app=await createLocalServer({projectRoot:root,port:0,host:'0.0.0.0',publicOrigin:'http://game.example:8807',authRequired:true,invitesRequired:false,accountDirectory:directory,card});
    const base='http://127.0.0.1:'+await app.start();
    const post=(path,data,cookie='',headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(data)});
    assert.equal((await fetch(base+'/terminal',{redirect:'manual'})).headers.get('location'),'/login');
    const login=await fetch(base+'/login');assert.equal(login.status,200);assert.match(await login.text(),/account-form/);
    for(const path of ['/api/bootstrap','/api/character-cards'])assert.equal((await fetch(base+path)).status,401);
    assert.equal((await post('/api/access',{})).status,401);
    const rejected=await post('/api/auth/register',{email:'new@example.com',password:'synthetic-pass'});assert.equal(rejected.status,400);assert.equal((await rejected.json()).code,'QQ_EMAIL_REQUIRED');
    assert.equal((await post('/api/auth/register',{email:'one@qq.com',password:'synthetic-pass' },'',{Origin:'https://other.example'})).status,403);
    assert.equal((await post('/api/auth/register',{email:'one@qq.com',password:'synthetic-pass' },'',{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await post('/api/auth/register',{extra:'x'.repeat(9000)})).status,413);
    const registration=await post('/api/auth/register',{email:'one@qq.com',password:'synthetic-pass'});assert.equal(registration.status,200);
    const cookie=registration.headers.get('set-cookie').split(';')[0];assert.match(registration.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\//);
    const user=(await registration.json()).user;
    const terminal=await fetch(base+'/terminal',{headers:{Cookie:cookie}});assert.equal(terminal.status,200);const html=await terminal.text();assert.ok(html.includes(user.id));assert.match(html,/\/auth\/account.js/);assert.ok(!html.includes('synthetic-pass'));
    const bootstrap=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(bootstrap.status,200);const apiCookie=bootstrap.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/connection',{profileId:'main',apiBaseUrl:'https://relay.example:8443/v1'},cookie+'; '+apiCookie)).status,403);
    assert.equal((await post('/editor/api/accounts/relay-policy',{origins:['https://relay.example:8443']},cookie)).status,401);
    const adminLogin=await post('/editor/login',{key:await editorAccessKey(root)}),admin=adminLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/editor/api/accounts/relay-policy',{origins:['https://relay.example:8443']},admin)).status,200);
    assert.equal((await post('/api/connection',{profileId:'main',apiBaseUrl:'https://relay.example:8443/v1'},cookie+'; '+apiCookie)).status,200);
    assert.equal((await post('/api/connection',{profileId:'other',apiBaseUrl:'https://relay.example/v1'},cookie+'; '+apiCookie)).status,403);
    const relays=await readRelayRecords(resolve(directory,'accounts.sqlite'));
    assert.equal(relays.length,1);assert.equal(relays[0].email,user.email);assert.equal(relays[0].origin,'https://relay.example:8443');
    assert.equal((await post('/editor/api/accounts/relays',{},cookie+'; '+apiCookie)).status,401);
    assert.equal((await post('/api/new-game',{persona:{name:'Tester'}},cookie+'; '+apiCookie)).status,200);
    const second=await post('/api/auth/register',{email:'two@qq.com',password:'synthetic-pass'});const secondCookie=second.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/new-game',{persona:{name:'Tester'}},secondCookie+'; '+apiCookie)).status,401);
    assert.equal((await fetch(base+'/server/private/accounts/accounts.sqlite',{headers:{Cookie:cookie}})).status,404);
    const hostStatus=host=>new Promise((resolve,reject)=>get(base+'/api/health',{headers:{Host:host}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
    assert.equal(await hostStatus('game.example:8807'),200);
    assert.equal(await hostStatus('foreign.example'),403);
    const logout=await post('/api/auth/logout',{},cookie+'; '+apiCookie);assert.equal(logout.status,200);
    assert.equal(logout.headers.getSetCookie().length,2);for(const value of logout.headers.getSetCookie())assert.match(value,/Max-Age=0/);
    assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await (await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).json()).user,null);
    const returned=await fetch(base+'/terminal',{headers:{Cookie:cookie+'; '+apiCookie},redirect:'manual'});assert.equal(returned.status,302);assert.equal(returned.headers.get('location'),'/login');
    assert.equal((await post('/api/new-game',{persona:{name:'Tester'}},cookie+'; '+apiCookie)).status,401);
    assert.equal((await fetch(base+'/api/bootstrap',{headers:{Cookie:secondCookie}})).status,200);
    const relogin=await post('/api/auth/login',{email:'one@qq.com',password:'synthetic-pass',remember:true});assert.equal(relogin.status,200);assert.match(relogin.headers.get('set-cookie'),/Max-Age=2592000/);const freshCookie=relogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base+'/terminal',{headers:{Cookie:freshCookie}})).status,200);
    assert.equal((await post('/api/new-game',{persona:{name:'Tester'}},freshCookie+'; '+apiCookie)).status,401);
    assert.equal((await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).status,401);
    const temporary=await post('/api/auth/login',{email:'one@qq.com',password:'synthetic-pass',remember:false});assert.equal(temporary.status,200);assert.doesNotMatch(temporary.headers.get('set-cookie'),/Max-Age|Expires/i);
  }finally{if(app){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}await rm(directory,{recursive:true,force:true});}
});

 test('remembered login lasts thirty days, legacy lasts seven, and logout still revokes it',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'academy-remember-'));let clock=Date.now();const store=await createAccounts({directory,now:()=>clock});
 try{
 const normal=await store.enter('register',{email:'remember@qq.com',password:'synthetic-pass'},'one');
 const remembered=await store.enter('login',{email:'remember@qq.com',password:'synthetic-pass',remember:true},'two');
 const temporary=await store.enter('login',{email:'remember@qq.com',password:'synthetic-pass',remember:false},'three');
 assert.equal(remembered.maxAge,2592000);assert.equal(temporary.maxAge,null);
 await assert.rejects(store.enter('login',{email:'remember@qq.com',password:'synthetic-pass',remember:'true'},'four'),{code:'INVALID_REMEMBER'});
 clock+=8*86400000;assert.equal(store.user(normal.token),null);assert.equal(store.user(temporary.token),null);assert.ok(store.user(remembered.token));
 const revoked=await store.enter('login',{email:'remember@qq.com',password:'synthetic-pass',remember:true},'five');store.logout(revoked.token);assert.equal(store.user(revoked.token),null);
 clock+=23*86400000;assert.equal(store.user(remembered.token),null);
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
 });
