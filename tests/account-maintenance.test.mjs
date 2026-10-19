import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createAccounts} from '../server/accounts.mjs';
import {createLocalServer} from '../server/app.mjs';
import {editorAccessKey} from '../server/editor-gateway.mjs';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
const password='test-password-123';
test('existing five-column account database migrates without changing old passwords',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'academy-account-migration-')),db=new DatabaseSync(resolve(directory,'accounts.sqlite')),salt='legacy-test-salt';
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL)');db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('legacy-id','legacy@qq.com',salt,scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex'),Date.now());db.close();
 const accounts=await createAccounts({directory,requireInvite:true});try{const result=await accounts.enter('login',{email:'legacy@qq.com',password},'legacy');assert.equal(result.user.id,'legacy-id');assert.equal(result.user.dataVersion,undefined);}finally{accounts.close();await rm(directory,{recursive:true,force:true});}
});
test('invites consume atomically, normalize input, revoke unused codes and keep old login unaffected',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'academy-invites-')),accounts=await createAccounts({directory,requireInvite:true});
 try{await assert.rejects(accounts.enter('register',{email:'missing@qq.com',password},'missing'),{code:'INVITE_REQUIRED'});
 const [code,revoke]=accounts.generateInvites({count:2,batch:'week1'});assert.ok(accounts.revokeInvite(revoke));
 await assert.rejects(accounts.enter('register',{email:'revoked@qq.com',password,inviteCode:revoke},'revoked'),{code:'INVITE_INVALID'});
 const results=await Promise.allSettled(['a','b'].map(name=>accounts.enter('register',{email:name+'@qq.com',password,inviteCode:code.toLowerCase().replace('-','')},name)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'INVITE_INVALID');
 const success=results.find(r=>r.status==='fulfilled').value;assert.equal((await accounts.enter('login',{email:success.user.email,password},'login')).user.id,success.user.id);assert.equal(accounts.revokeInvite(code),false);assert.equal(accounts.inviteStats()[0].used,1);
 const bytes=await readFile(resolve(directory,'accounts.sqlite'));assert.ok(!bytes.includes(Buffer.from(code)));assert.ok(!bytes.includes(Buffer.from(code.replace('-',''))));
 }finally{accounts.close();await rm(directory,{recursive:true,force:true});}
});
test('reset links invalidate previous links, expire, reject replay and revoke every device session',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'academy-password-'));let clock=Date.now();const accounts=await createAccounts({directory,now:()=>clock});
 try{const a=await accounts.enter('register',{email:'reset@qq.com',password},'register'),b=await accounts.enter('login',{email:a.user.email,password},'login');
 const first=accounts.issueReset(a.user.email),second=accounts.issueReset(a.user.email);assert.equal(accounts.checkReset(first.token),false);assert.equal(accounts.checkReset(second.token),true);
 const results=await Promise.allSettled([1,2].map(i=>accounts.applyReset({token:second.token,password:'new-password-123'},'reset'+i)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(accounts.user(a.token),null);assert.equal(accounts.user(b.token),null);
 await assert.rejects(accounts.applyReset({token:second.token,password},'replay'),{code:'RESET_INVALID'});await assert.rejects(accounts.enter('login',{email:a.user.email,password},'old'),{code:'INVALID_CREDENTIALS'});await accounts.enter('login',{email:a.user.email,password:'new-password-123'},'new');
 const expires=accounts.issueReset(a.user.email);clock+=86400001;assert.equal(accounts.checkReset(expires.token),false);assert.equal(accounts.issueReset('absent@qq.com'),null);
 }finally{accounts.close();await rm(directory,{recursive:true,force:true});}
});
test('data reset requires confirmation/password, advances data scope, and deletion removes only the selected account',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'academy-delete-')),accounts=await createAccounts({directory});
 try{const a=await accounts.enter('register',{email:'one@qq.com',password},'a'),other=await accounts.enter('register',{email:'two@qq.com',password},'b');
 await assert.rejects(accounts.maintain(a.token,{password,confirmation:'wrong'},'reset','wrong'),{code:'CONFIRMATION_REQUIRED'});await assert.rejects(accounts.maintain(a.token,{password:'incorrect-password',confirmation:'重置数据'},'reset','bad'),{code:'INVALID_CREDENTIALS'});assert.ok(accounts.user(a.token));
 await accounts.maintain(a.token,{password,confirmation:'重置数据'},'reset','reset');assert.equal(accounts.user(a.token),null);const login=await accounts.enter('login',{email:a.user.email,password},'login');assert.equal(login.user.dataVersion,1);assert.ok(accounts.user(other.token));
 const reset=accounts.issueReset(a.user.email);await accounts.maintain(login.token,{password,confirmation:'删除账号'},'delete','delete');assert.equal(accounts.find(a.user.email),null);assert.equal(accounts.user(login.token),null);assert.equal(accounts.checkReset(reset.token),false);assert.ok(accounts.user(other.token));
 }finally{accounts.close();await rm(directory,{recursive:true,force:true});}
});
test('HTTP registration requires invite, editor account operations require admin and reset endpoints work without login',async()=>{
 const root=resolve(import.meta.dirname,'..'),directory=await mkdtemp(resolve(tmpdir(),'academy-admin-http-')),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 const app=await createLocalServer({projectRoot:root,port:0,authRequired:true,accountDirectory:directory,card});
 try{const base='http://127.0.0.1:'+await app.start(),post=(path,data,cookie='')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
 assert.equal((await(await fetch(base+'/api/auth/policy')).json()).inviteRequired,true);assert.equal((await post('/api/auth/register',{email:'http@qq.com',password})).status,400);
 assert.equal((await post('/editor/api/accounts/invites',{count:1,batch:'http'})).status,401);
 const login=await post('/editor/login',{key:await editorAccessKey(root)}),admin=login.headers.get('set-cookie').split(';')[0];
 const codes=(await(await post('/editor/api/accounts/invites',{count:1,batch:'http'},admin)).json()).codes;
 const registration=await post('/api/auth/register',{email:'http@qq.com',password,inviteCode:codes[0]}),cookie=registration.headers.get('set-cookie').split(';')[0];assert.equal(registration.status,200);
 assert.equal((await fetch(base+'/account',{headers:{Cookie:cookie}})).status,200);assert.equal((await post('/editor/api/accounts/search',{email:'http@qq.com'},cookie)).status,401);
 const reset=await(await post('/editor/api/accounts/reset',{email:'http@qq.com'},admin)).json(),token=new URL(reset.url).searchParams.get('token');assert.ok(token);assert.equal((await(await fetch(base+'/api/auth/reset/check?token='+token)).json()).ok,true);
 assert.equal((await post('/api/auth/reset/apply',{token,password:'updated-password-123'})).status,200);assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).status,200);assert.equal((await(await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).json()).user,null);
 const newLogin=await post('/api/auth/login',{email:'http@qq.com',password:'updated-password-123'}),newCookie=newLogin.headers.get('set-cookie').split(';')[0];assert.equal((await post('/api/auth/reset-data',{password:'updated-password-123',confirmation:'重置数据'},newCookie)).status,200);
 }finally{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});}
});
