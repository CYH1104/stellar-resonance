import {test} from 'node:test';import assert from 'node:assert/strict';
import {createCloudBackup} from '../server/cloud-backup.mjs';
import {createCloudSave} from '../src/domain/cloudBackup.ts';
import {newSession,defaults} from '../src/domain/story.ts';
import {createLocalServer} from '../server/app.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const text=createCloudSave(newSession('云端测试',{name:'玩家',appearance:'',personality:'',background:''},''),defaults());
for(const provider of ['github','gitee']){
 test(provider+' creates or reuses a private repository and roundtrips a backup without touching other paths',async()=>{
  const calls=[];let repo,stored;const fake=async(url,options)=>{calls.push({url,...options});const p=new URL(url).pathname.replace(/^\/api\/v5/,'');const body=options.body?(provider==='gitee'?Object.fromEntries(new URLSearchParams(options.body)):JSON.parse(options.body)):null;
   if(p==='/user')return Response.json({login:'tester'});
   if(options.body&&provider==='gitee')assert.equal(body.access_token,'user-supplied-test-token');
   if(p==='/user/repos'){assert.equal(body.private,provider==='gitee'?'true':true);repo={private:true,default_branch:'main'};return Response.json(repo,{status:201});}
   if(p==='/repos/tester/backups')return repo?Response.json(repo):Response.json({},{status:404});
   if(p==='/repos/tester/backups/contents/stellar-workspace-backup.json')return Response.json({},{status:404});
   assert.ok(p.startsWith('/repos/tester/backups/contents/stellar-backups'));
   if(options.method==='GET'){if(p.endsWith('/stellar-backups'))return Response.json(stored?[{type:'file',name:'测试.json',sha:'a'.repeat(40),size:100}]:[]);return stored?Response.json({type:'file',size:100,content:stored,sha:'a'.repeat(40)}):Response.json({},{status:404});}
   assert.equal(options.method,provider==='github'||stored?'PUT':'POST');if(provider==='gitee')assert.match(options.headers['Content-Type'],/^application\/x-www-form-urlencoded/);assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64').toString('utf8')),JSON.parse(text));stored=body.content;return Response.json({content:{sha:'b'.repeat(40)}});
  };
  const api=createCloudBackup(fake),base={provider,token:'user-supplied-test-token',repository:'backups'};
  assert.equal((await api({...base,action:'connect'})).created,true);assert.equal((await api({...base,action:'connect'})).created,false);await api({...base,action:'upload',file:'测试.json',text});await api({...base,action:'upload',file:'测试.json',text});assert.equal((await api({...base,action:'list'})).files.length,1);assert.equal(JSON.parse((await api({...base,action:'download',file:'测试.json'})).text).schema,'stellar-cloud-save-v1');
  assert.equal(calls.filter(c=>c.url.endsWith('/user/repos')).length,1);for(const c of calls){assert.equal(c.mode,'cors');assert.equal(c.credentials,'omit');assert.equal(c.headers['User-Agent'],undefined);assert.ok(c.url.startsWith(provider==='github'?'https://api.github.com/':'https://gitee.com/api/v5/'));assert.ok(!c.url.includes(base.token));assert.equal(c.redirect,'error');}
 });
 test(provider+' refuses public repositories, invalid paths and invalid backup data',async()=>{
  const base={provider,token:'test',repository:'backup'};const api=createCloudBackup(async url=>Response.json(url.endsWith('/user')?{login:'tester'}:{private:false}));await assert.rejects(api({...base,action:'connect'}),{code:'CLOUD_PRIVATE_REPOSITORY_REQUIRED'});
  const privateApi=createCloudBackup(async url=>url.endsWith('/user')?Response.json({login:'tester'}):url.includes('/contents/')?Response.json({},{status:404}):Response.json({private:true,default_branch:'main'}));
  await assert.rejects(privateApi({...base,action:'upload',file:'../secret.json',text}),{code:'CLOUD_INVALID_FILE'});await assert.rejects(privateApi({...base,action:'upload',file:'test.json',text:'{}'}),{code:'CLOUD_INVALID_BACKUP'});
 });
}
test('backup route requires the local session and same origin before any platform request',async()=>{
 const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));let calls=0;
 const app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async url=>{calls++;return Response.json(url.endsWith('/user')?{login:'tester'}:{private:true,default_branch:'main'});}});
 try{const base='http://127.0.0.1:'+await app.start(),post=(headers={})=>fetch(base+'/api/cloud-backup',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({provider:'github',token:'synthetic',repository:'backup',action:'connect'})});
  assert.equal((await post()).status,401);assert.equal(calls,0);const boot=await fetch(base+'/api/bootstrap'),Cookie=boot.headers.get('set-cookie').split(';')[0];assert.equal((await post({Cookie,Origin:'https://untrusted.invalid'})).status,403);assert.equal(calls,0);
  const valid=await post({Cookie,Origin:base});assert.equal(valid.status,200);assert.equal((await valid.json()).owner,'tester');assert.equal(calls,2);
 }finally{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}
});

test('reports platform validation failures separately from permissions without exposing credentials',async()=>{const api=createCloudBackup(async()=>Response.json({message:'secret-token'},{status:422}));await assert.rejects(api({provider:'gitee',repository:'backups',token:'secret-token',action:'connect'}),e=>e.code==='CLOUD_VALIDATION_FAILED'&&e.upstreamStatus===422&&!e.message.includes('secret-token'));});

test('shows bounded platform reason and redacts the access token',async()=>{const api=createCloudBackup(async()=>Response.json({message:'email required token=private-token'},{status:400}));await assert.rejects(api({provider:'gitee',repository:'backups',token:'private-token',action:'connect'}),e=>e.code==='CLOUD_REQUEST_REJECTED'&&e.cloudDetail.includes('email required')&&!e.cloudDetail.includes('private-token'));});

test('gitee creates root backup in an uninitialized repository without guessing a branch',async()=>{
 let stored,puts=0;const api=createCloudBackup(async(url,options)=>{const path=new URL(url).pathname;assert.ok(!url.includes('ref=master'));
 if(path==='/api/v5/user')return Response.json({login:'tester'});
 if(path==='/api/v5/repos/tester/backups')return Response.json({private:true,default_branch:null});
 if(path.endsWith('/contents/stellar-backups'))return Response.json({},{status:404});
 assert.ok(path.endsWith('/contents/stellar-workspace-backup.json'));
 if(options.method==='GET')return stored?Response.json({type:'file',name:'stellar-workspace-backup.json',size:stored.length,sha:'a'.repeat(40),content:stored}):Response.json({message:'File'},{status:404});
 const body=Object.fromEntries(new URLSearchParams(options.body));assert.equal(body.access_token,'synthetic');assert.equal(body.branch,undefined);assert.equal(options.method,stored?'PUT':'POST');if(stored)assert.equal(body.sha,'a'.repeat(40));stored=body.content;puts++;return Response.json({});
 });const base={provider:'gitee',repository:'backups',token:'synthetic'};
 await api({...base,action:'upload',file:'stellar-workspace-backup.json',text});await api({...base,action:'upload',file:'stellar-workspace-backup.json',text});assert.equal(puts,2);assert.equal((await api({...base,action:'list'})).files.length,1);assert.deepEqual(JSON.parse((await api({...base,action:'download',file:'stellar-workspace-backup.json'})).text),JSON.parse(text));
});

test('identifies the exact failed platform write without exposing the token',async()=>{const api=createCloudBackup(async(url,options)=>{if(url.endsWith('/user'))return Response.json({login:'tester'});if(url.endsWith('/repos/tester/backups'))return Response.json({private:true,default_branch:'main'});if(options.method==='GET')return Response.json({message:'File'},{status:404});const body=new URLSearchParams(options.body);assert.equal(body.get('access_token'),'write-token');return Response.json({message:'File'},{status:404});});await assert.rejects(api({provider:'gitee',repository:'backups',token:'write-token',action:'upload',file:'stellar-workspace-backup.json',text}),e=>e.cloudStep==='新建备份文件'&&e.upstreamStatus===404&&e.cloudDetail==='File');});

test('treats a Gitee HTTP-200 File error object as missing and creates instead of updating',async()=>{
 let writes=0;const api=createCloudBackup(async(url,options)=>{
 if(url.endsWith('/user'))return Response.json({login:'tester'});
 if(url.endsWith('/repos/tester/backups'))return Response.json({private:true,default_branch:'main'});
 if(options.method==='GET')return Response.json({message:'File',status:404});
 assert.equal(options.method,'POST');const body=new URLSearchParams(options.body);assert.equal(body.has('sha'),false);writes++;return Response.json({});
 });await api({provider:'gitee',repository:'backups',token:'synthetic',action:'upload',file:'stellar-workspace-backup.json',text});assert.equal(writes,1);
});
test('rejects malformed existing file metadata without sending a write',async()=>{
 let writes=0;const api=createCloudBackup(async(url,options)=>{if(url.endsWith('/user'))return Response.json({login:'tester'});if(url.endsWith('/repos/tester/backups'))return Response.json({private:true,default_branch:'main'});if(options.method==='GET')return Response.json({type:'file',sha:null});writes++;return Response.json({});});
 await assert.rejects(api({provider:'gitee',repository:'backups',token:'synthetic',action:'upload',file:'stellar-workspace-backup.json',text}),{code:'CLOUD_INVALID_FILE_METADATA'});assert.equal(writes,0);
});

for(const shape of ['no-type','list','wrapped'])test('overwrites the fixed backup using current local data with '+shape+' metadata',async()=>{
 let sent;const row={name:'stellar-workspace-backup.json',sha:'a'.repeat(40),size:10};const metadata=shape==='no-type'?row:shape==='list'?[{name:'other.json',sha:'b'.repeat(40)},row]:{data:row};
 const api=createCloudBackup(async(url,options)=>{if(url.endsWith('/user'))return Response.json({login:'tester'});if(url.endsWith('/repos/tester/backups'))return Response.json({private:true,default_branch:'main'});if(options.method==='GET')return Response.json(metadata);assert.equal(options.method,'PUT');sent=Object.fromEntries(new URLSearchParams(options.body));return Response.json({});});
 await api({provider:'gitee',repository:'backups',token:'synthetic',action:'upload',file:'stellar-workspace-backup.json',text});assert.equal(sent.sha,row.sha);assert.deepEqual(JSON.parse(Buffer.from(sent.content,'base64').toString('utf8')),JSON.parse(text));
});
