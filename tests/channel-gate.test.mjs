// 双端功能相同：手机能力一致，账号、会话 Cookie 与数据目录继续隔离。
// 这里跑的是真实路由与真实提示词拼装，只有上游 fetch 被替换，用来精确观察实际发出的请求。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';

const root=resolve(import.meta.dirname,'..');
const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));

async function start(channel,{privateDir,calls}={}){
  const app=await createLocalServer({projectRoot:root,port:0,card,channel,privateDir,fetchImpl:async(_url,options)=>{
    calls?.push(JSON.parse(options.body));
    return new Response(JSON.stringify({choices:[{message:{content:'正文。<SR_STATE>{"presentCharacterIds":[],"characters":[],"event":"已观察"}</SR_STATE><SR_DONE>'}}]}),{headers:{'Content-Type':'application/json'}});
  }});
  const base=`http://127.0.0.1:${await app.start()}`;
  const boot=await fetch(base+'/api/bootstrap');
  const cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  return {app,base,cookie,post};
}
const close=async server=>{server.closeAllConnections();await new Promise(done=>server.close(done));};

const profile={id:'channel-main',model:'synthetic',apiBaseUrl:'https://synthetic.example/v1',temperature:.7,maxTokens:1600};
const state={player:{id:'player',name:'玩家',present:true},characters:[],variables:{终端码:{player:'81111111111'}}};
const terminalContext={initialized:false,groups:[],newGroupIds:Array.from({length:5},(_,i)=>`g-${i}`),friendIds:[],courses:[]};
const generation={sessionId:'channel-session',turnId:'channel-turn',persona:{name:'玩家'},opening:'开场',input:'我走进教室。',history:[],presets:[],memories:[],state,profile,key:'synthetic-key',terminalContext,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))};

for(const channel of ['stable','test'])test(channel+' exposes the same phone routes and prompt assembly',async()=>{
  const calls=[], {app,base,post}=await start(channel,{calls});
  try{
    const health=await (await fetch(base+'/api/health')).json();
    assert.equal(health.channel,channel);assert.equal(health.terminal,true);
    const boot=await (await fetch(base+'/api/bootstrap')).json();
    assert.equal(boot.capabilities.terminal,true);assert.equal(boot.capabilities.channel,channel);
    assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
    const code=await post('/api/terminal-code',{sessionId:'s',state,self:true});
    assert.equal(code.status,200);assert.ok((await code.json()).code);
    const generated=await post('/api/generate',generation);assert.equal(generated.status,200);
    assert.ok((await generated.text()).includes('"type":"done"'));assert.equal(calls.length,1);
    assert.ok(JSON.stringify(calls[0]).includes('终端通讯录是当前会话的私有剧情数据'));
    // Existing users can still generate without enabling or configuring the phone.
    const withoutPhone=await post('/api/generate',{...generation,terminalContext:undefined});
    assert.equal(withoutPhone.status,200);assert.ok((await withoutPhone.text()).includes('"type":"done"'));
  }finally{await close(app.server);}
});

test('the two channels stay distinct instances on the same project',async()=>{
  const stable=await start('stable'),tested=await start('test');
  try{
    const stableHealth=await (await fetch(stable.base+'/api/health')).json();
    const testHealth=await (await fetch(tested.base+'/api/health')).json();
    assert.equal(stableHealth.projectId,testHealth.projectId,'same checkout, so project identity matches');
    assert.notEqual(stableHealth.instance,testHealth.instance);
    assert.notEqual(stableHealth.channel,testHealth.channel);
    // Cookie 名称必须区分，否则两个端口会互相顶掉登录态。
    const stableCookie=stable.cookie.split('=')[0],testCookie=tested.cookie.split('=')[0];
    assert.notEqual(stableCookie,testCookie);
    assert.ok(!stableCookie.endsWith('_test'),'the stable cookie name keeps its existing form');
    assert.ok(testCookie.endsWith('_test'));
  }finally{await close(stable.app.server);await close(tested.app.server);}
});

test('invalid channel values are refused instead of silently enabling the phone',async()=>{
  await assert.rejects(createLocalServer({projectRoot:root,port:0,card,channel:'preview'}),/INVALID_TERMINAL_CHANNEL/);
});

test('the two channels keep separate account stores and sessions',async()=>{
  const base=await mkdtemp(resolve('.integration','channel-auth-'));
  const stableDir=resolve(base,'stable'),testDir=resolve(base,'test');
  let stable,tested;
  try{
    stable=await createLocalServer({projectRoot:root,port:0,card,channel:'stable',privateDir:stableDir,authRequired:true,invitesRequired:false});
    tested=await createLocalServer({projectRoot:root,port:0,card,channel:'test',privateDir:testDir,authRequired:true,invitesRequired:false});
    const stableBase=`http://127.0.0.1:${await stable.start()}`,testBase=`http://127.0.0.1:${await tested.start()}`;
    // 账号库各自独立：测试实例不会写正式账号库。
    for(const dir of [stableDir,testDir])assert.ok((await readdir(dir)).includes('accounts'));
    // 两个实例各自注册同名账号：账号库互不共享，不会读写对方的正式账号。
    const register=async base=>{
      const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'channel-probe@qq.com',password:'Channel-Probe-1'})});
      assert.equal(response.status,200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const stableAccount=await register(stableBase),testAccount=await register(testBase);
    const session=async(base,accountCookie)=>(await fetch(base+'/api/bootstrap',{headers:{Cookie:accountCookie}})).headers.get('set-cookie').split(';')[0];
    const stableCookie=await session(stableBase,stableAccount),testCookie=await session(testBase,testAccount);
    assert.notEqual(stableCookie.split('=')[0],testCookie.split('=')[0]);
    // 会话校验同时看账号 Cookie，所以两个端口的登录态只能各自生效。
    const call=(base,cookie)=>fetch(base+'/api/cloud-backup',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({snapshot:{version:1,sessions:[],preferences:{}}})});
    assert.notEqual((await call(stableBase,`${stableAccount}; ${stableCookie}`)).status,401,'the stable cookies authorise the stable port');
    assert.equal((await call(testBase,`${stableAccount}; ${stableCookie}`)).status,401,'the stable login must not authorise the test port');
    assert.notEqual((await call(testBase,`${testAccount}; ${testCookie}`)).status,401,'the test cookies authorise the test port');
    assert.equal((await call(stableBase,`${testAccount}; ${testCookie}`)).status,401,'the test login must not authorise the stable port');
  }finally{
    if(stable)await close(stable.server);
    if(tested)await close(tested.server);
    await rm(base,{recursive:true,force:true});
  }
});

test('game HTML entrypoints prohibit iframe navigation while retaining srcdoc rendering support',async()=>{
 const {app,base}=await start('test');
 try{for(const path of ['/','/index.html','/terminal']){const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(response.headers.get('content-security-policy'),"frame-src 'none'; object-src 'none'");}}
 finally{await close(app.server);}
});
