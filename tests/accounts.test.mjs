import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {get} from 'node:http';
import {createAccounts} from '../server/accounts.mjs';
import {createLocalServer} from '../server/app.mjs';
const root=resolve(import.meta.dirname,'..');
test('accounts normalize email, hash passwords, persist sessions, reject bad credentials and revoke logout',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-accounts-'));let clock=Date.now();let store;
  try{
    store=await createAccounts({directory,now:()=>clock});
    const first=await store.enter('register',{email:'  Tester@Example.com ',password:'synthetic-pass-123'},'one');
    assert.equal(first.user.email,'tester@example.com');assert.deepEqual(store.user(first.token),first.user);
    await assert.rejects(store.enter('register',{email:'tester@example.com',password:'different-pass'},'two'),{code:'EMAIL_REGISTERED'});
    await assert.rejects(store.enter('login',{email:'tester@example.com',password:'wrong-password'},'three'),{code:'INVALID_CREDENTIALS'});
    await assert.rejects(store.enter('login',{email:'missing@example.com',password:'wrong-password'},'four'),{code:'INVALID_CREDENTIALS'});
    await assert.rejects(store.enter('register',{email:'invalid',password:'synthetic-pass'},'five'),{code:'INVALID_EMAIL'});
    await assert.rejects(store.enter('register',{email:'a@b.com',password:'short'},'six'),{code:'INVALID_PASSWORD'});
    store.close();store=await createAccounts({directory,now:()=>clock});assert.deepEqual(store.user(first.token),first.user);
    const again=await store.enter('login',{email:'TESTER@example.com',password:'synthetic-pass-123'},'seven');assert.equal(again.user.id,first.user.id);
    store.logout(again.token);assert.equal(store.user(again.token),null);
    clock+=8*86400000;assert.equal(store.user(first.token),null);
    store.close();store=null;const bytes=await readFile(resolve(directory,'accounts.sqlite'));assert.ok(!bytes.includes(Buffer.from('synthetic-pass-123')));assert.ok(!bytes.includes(Buffer.from(first.token)));
  }finally{store?.close();await rm(directory,{recursive:true,force:true});}
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
    app=await createLocalServer({projectRoot:root,port:0,host:'0.0.0.0',publicOrigin:'http://game.example:8807',authRequired:true,accountDirectory:directory,card});
    const base='http://127.0.0.1:'+await app.start();
    const post=(path,data,cookie='',headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(data)});
    assert.equal((await fetch(base+'/terminal',{redirect:'manual'})).headers.get('location'),'/login');
    const login=await fetch(base+'/login');assert.equal(login.status,200);assert.match(await login.text(),/account-form/);
    for(const path of ['/api/bootstrap','/api/character-cards'])assert.equal((await fetch(base+path)).status,401);
    assert.equal((await post('/api/access',{})).status,401);
    assert.equal((await post('/api/auth/register',{email:'one@example.com',password:'synthetic-pass' },'',{Origin:'https://other.example'})).status,403);
    assert.equal((await post('/api/auth/register',{email:'one@example.com',password:'synthetic-pass' },'',{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await post('/api/auth/register',{extra:'x'.repeat(9000)})).status,413);
    const registration=await post('/api/auth/register',{email:'one@example.com',password:'synthetic-pass'});assert.equal(registration.status,200);
    const cookie=registration.headers.get('set-cookie').split(';')[0];assert.match(registration.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\//);
    const user=(await registration.json()).user;
    const terminal=await fetch(base+'/terminal',{headers:{Cookie:cookie}});assert.equal(terminal.status,200);const html=await terminal.text();assert.ok(html.includes(user.id));assert.match(html,/\/auth\/account.js/);assert.ok(!html.includes('synthetic-pass'));
    const bootstrap=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(bootstrap.status,200);const apiCookie=bootstrap.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/new-game',{persona:{name:'Tester'}},cookie+'; '+apiCookie)).status,200);
    const second=await post('/api/auth/register',{email:'two@example.com',password:'synthetic-pass'});const secondCookie=second.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/new-game',{persona:{name:'Tester'}},secondCookie+'; '+apiCookie)).status,401);
    assert.equal((await fetch(base+'/server/private/accounts/accounts.sqlite',{headers:{Cookie:cookie}})).status,404);
    const hostStatus=host=>new Promise((resolve,reject)=>get(base+'/api/health',{headers:{Host:host}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
    assert.equal(await hostStatus('game.example:8807'),200);
    assert.equal(await hostStatus('foreign.example'),403);
    assert.equal((await post('/api/auth/logout',{},cookie)).status,200);
    assert.equal((await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).status,401);
  }finally{if(app){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}await rm(directory,{recursive:true,force:true});}
});
