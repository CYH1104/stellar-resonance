// 双通道实例隔离：发布快照、管理登录 Cookie、实例配置冲突与启动回退。
// 这里跑真实的 HTTP 路由与真实的快照/启动逻辑，只有上游模型与子进程入口被替换。
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,stat,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLocalServer} from '../server/app.mjs';
import {editorAccessKey} from '../server/editor-gateway.mjs';
import {createReleaseSnapshot,prepareRelease,readReleaseSnapshot} from '../server/release.mjs';
import {instanceDescriptor,resolveInstanceName} from '../server/channel.mjs';

const root=resolve(import.meta.dirname,'..');
const fixture=await mkdtemp(resolve('.integration','channel-instance-'));
const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const projectId=hash(root),fixtureProjectId=hash(fixture).slice(0,16);

await mkdir(resolve(fixture,'dist/assets'),{recursive:true});
await writeFile(resolve(fixture,'dist/index.html'),'<!doctype html><html><head></head><body>academy-shell</body></html>');
await writeFile(resolve(fixture,'dist/assets/probe.js'),'stable-original');
await writeFile(resolve(fixture,'星穹游戏终端 (1).html'),'<html><head><script>window.academy=1;</script></head><body>terminal-shell</body></html>');
await mkdir(resolve(fixture,'server/auth-ui'),{recursive:true});
for(const file of ['login.html','manage.html','editor-login.html'])await writeFile(resolve(fixture,'server/auth-ui',file),'<!doctype html><html><body>auth</body></html>');
await mkdir(resolve(fixture,'server/editor-ui'),{recursive:true});
await writeFile(resolve(fixture,'server/editor-ui/editor.html'),'<!doctype html><html><body>editor</body></html>');
await mkdir(resolve(fixture,'server/example'),{recursive:true});
await writeFile(resolve(fixture,'server/example/academy-places.json'),'[]');

const opened=[];
async function service(channel,release,{authRequired=false,privateDir}={}){
  const app=await createLocalServer({projectRoot:fixture,card,port:0,channel,releaseDir:release.dir,authRequired,invitesRequired:false,privateDir:privateDir||resolve(fixture,'private-'+channel)});
  opened.push(app.server);
  return {base:`http://127.0.0.1:${await app.start()}`,app};
}
const close=async server=>{server.closeAllConnections();await new Promise(done=>server.close(done));};

test('a running instance keeps serving its own snapshot while the shared build is replaced',async()=>{
  const stableRelease=await createReleaseSnapshot(fixture,'stable');
  const testRelease=await createReleaseSnapshot(fixture,'test');
  const stable=await service('stable',stableRelease),tested=await service('test',testRelease);
  try{
    const asset=async base=>(await fetch(base+'/assets/probe.js')).text();
    const terminal=async base=>hash(await (await fetch(base+'/terminal')).text());
    const health=async base=>await (await fetch(base+'/api/health')).json();
    const stableBefore={asset:await asset(stable.base),terminal:await terminal(stable.base),health:await health(stable.base)};
    assert.equal(stableBefore.asset,'stable-original');
    assert.equal(stableBefore.health.release,stableRelease.buildId);

    // 模拟更新测试实例：共享工作树重新构建，dist 与终端页都被替换，测试实例重新固定快照。
    await writeFile(resolve(fixture,'dist/assets/probe.js'),'test-update');
    await writeFile(resolve(fixture,'星穹游戏终端 (1).html'),'<html><head><script>window.academy=2;</script></head><body>terminal-test-update</body></html>');
    const rebuilt=await createReleaseSnapshot(fixture,'test');
    assert.notEqual(rebuilt.buildId,testRelease.buildId,'a rebuilt tree must produce a new snapshot id');
    const testedAgain=await service('test',rebuilt);
    assert.equal(await asset(testedAgain.base),'test-update');
    assert.notEqual(await terminal(testedAgain.base),stableBefore.terminal,'the updated instance must serve the new page');

    // 稳定实例的页面、资源与进程身份都不变。
    assert.equal(await asset(stable.base),stableBefore.asset);
    assert.equal(hash(await (await fetch(stable.base+'/terminal')).text()),stableBefore.terminal);
    const stableAfter=await health(stable.base);
    assert.equal(stableAfter.instance,stableBefore.health.instance);
    assert.equal(stableAfter.pid,stableBefore.health.pid);
    assert.equal(stableAfter.release,stableRelease.buildId);
  }finally{await close(stable.app.server);await close(tested.app.server);}
});

test('the same runtime content resolves to one immutable snapshot instead of a new copy',async()=>{
  const first=await createReleaseSnapshot(fixture,'test');
  const second=await createReleaseSnapshot(fixture,'test');
  assert.equal(first.buildId,second.buildId);
  assert.equal(first.dir,second.dir);
  // 快照里必须包含请求期读取的终端页与后台页面，缺一项就仍会被共享工作树影响。
  assert.ok((await readFile(resolve(first.dir,'星穹游戏终端 (1).html'),'utf8')).includes('terminal-test-update'));
  assert.ok((await readFile(resolve(first.dir,'server/auth-ui/login.html'),'utf8')).includes('auth'));
});

test('editor logins on two ports never overwrite or log each other out',async()=>{
  const stableDir=resolve(fixture,'editor-stable'),testDir=resolve(fixture,'editor-test');
  const stable=await service('stable',await createReleaseSnapshot(fixture,'stable'),{authRequired:true,privateDir:stableDir});
  const tested=await service('test',await createReleaseSnapshot(fixture,'test'),{authRequired:true,privateDir:testDir});
  try{
    const login=async(base,key)=>{
      const response=await fetch(base+'/editor/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
      assert.equal(response.status,200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const access=(base,cookie)=>fetch(base+'/editor/api/accounts/search',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:'{"email":"nobody@example.com"}'}).then(response=>response.status);
    const stableCookie=await login(stable.base,await editorAccessKey(fixture,stableDir));
    const testCookie=await login(tested.base,await editorAccessKey(fixture,testDir));
    assert.equal(stableCookie.split('=')[0],'academy_editor','the stable admin cookie keeps its existing name');
    assert.notEqual(testCookie.split('=')[0],stableCookie.split('=')[0],'each instance needs its own admin cookie name');
    assert.equal(await access(stable.base,stableCookie),200);
    // 另一个实例的管理 Cookie 不能授权本实例，也覆盖不掉本实例的登录态。
    assert.equal(await access(stable.base,testCookie),401);
    assert.equal(await access(tested.base,testCookie),200);
    await fetch(tested.base+'/editor/logout',{method:'POST',headers:{Cookie:testCookie},body:'{}'});
    assert.equal(await access(tested.base,testCookie),401);
    assert.equal(await access(stable.base,stableCookie),200,'logging out of the test editor must not end the stable session');
  }finally{await close(stable.app.server);await close(tested.app.server);}
});

test('reserved instance names cannot cross channels',async()=>{
  assert.throws(()=>resolveInstanceName({channel:'test',explicit:'stable'}),/INVALID_TERMINAL_INSTANCE/);
  assert.throws(()=>resolveInstanceName({channel:'stable',explicit:'test'}),/INVALID_TERMINAL_INSTANCE/);
  assert.equal(resolveInstanceName({channel:'test'}),'test');
  assert.equal(resolveInstanceName({channel:'stable'}),'stable');
  assert.equal(resolveInstanceName({channel:'test',explicit:'test-b'}),'test-b');
  assert.equal(instanceDescriptor({channel:'stable',instanceName:'stable'}).editorCookie,'academy_editor');
  assert.equal(instanceDescriptor({channel:'test',instanceName:'test'}).editorCookie,'academy_editor_test');
  // 生产入口必须在建目录、复制资料或打开数据库之前就拒绝冲突配置。
  const output=await new Promise(done=>{
    const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:'18999',TERMINAL_CHANNEL:'test',TERMINAL_INSTANCE:'stable'},windowsHide:true});
    let text='';child.stderr.on('data',chunk=>text+=chunk);child.stdout.on('data',chunk=>text+=chunk);
    child.on('close',code=>done({code,text,pid:child.pid}));
  });
  assert.equal(output.code,1);
  assert.match(output.text,/TERMINAL_CHANNEL must be stable or test/);
});

test('the launcher adopts an already running instance when runtime.json is missing or corrupt',async()=>{
  const healthServer=createServer((request,response)=>{
    response.setHeader('Content-Type','application/json');
    response.end(JSON.stringify({app:'stellar-resonance-local',version:'0.20.5',runtime:'local-card',projectId:fixtureProjectId,instance:'synthetic-instance',pid:process.pid,accountsRequired:true,channel:'stable',terminal:false,instanceName:'stable',port:healthServer.address().port,release:'synthetic-release'}));
  });
  await new Promise(done=>healthServer.listen(0,'127.0.0.1',done));
  const port=healthServer.address().port;
  let launcher=await readFile(resolve(root,'scripts/launch-local.mjs'),'utf8');
  launcher=launcher.replace("import {loadCard} from '../server/load-card.mjs';","const loadCard=async()=>({});")
    .replace("'../server/channel.mjs'",JSON.stringify(pathToFileURL(resolve(root,'server/channel.mjs')).href))
    .replace("'../server/release.mjs'",JSON.stringify(pathToFileURL(resolve(root,'server/release.mjs')).href))
    .replace("const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');",'const root='+JSON.stringify(fixture)+';');
  const probe=resolve(fixture,'launch-probe.mjs');
  await writeFile(probe,launcher);
  const run=()=>new Promise(done=>{
    const child=spawn(process.execPath,[probe],{cwd:root,env:{...process.env,PORT:String(port),TERMINAL_CHANNEL:'stable',TERMINAL_INSTANCE:'stable'},windowsHide:true});
    let text='';child.stdout.on('data',chunk=>text+=chunk);child.stderr.on('data',chunk=>text+=chunk);
    child.on('close',code=>done({code,text}));
  });
  try{
    // 没有 runtime.json：不能因为读取 previous.port 而崩溃，应复用已探测到的实例。
    const missing=await run();
    assert.equal(missing.code,0,missing.text);
    assert.match(missing.text,new RegExp(`127\\.0\\.0\\.1:${port}/terminal`));
    assert.match(await readFile(resolve(fixture,'server/.local/url.txt'),'utf8'),new RegExp(`:${port}/terminal`));
    // 损坏的 runtime.json 同样按"没有记录"处理。
    await mkdir(resolve(fixture,'server/.local'),{recursive:true});
    await writeFile(resolve(fixture,'server/.local/runtime.json'),'{"port":');
    const corrupt=await run();
    assert.equal(corrupt.code,0,corrupt.text);
    assert.match(corrupt.text,new RegExp(`127\\.0\\.0\\.1:${port}/terminal`));
  }finally{await new Promise(done=>healthServer.close(done));}
});

// 普通重启只认已确认版本：另一个实例更新共享工作树后，本实例重启不能跟着换版本。
test('an ordinary restart keeps the confirmed release even after the shared tree was rebuilt',async()=>{
  const root2=await mkdtemp(resolve('.integration','channel-restart-'));
  const port=19000+Math.floor(Math.random()*500);
  await mkdir(resolve(root2,'dist/assets'),{recursive:true});
  await writeFile(resolve(root2,'dist/index.html'),'<!doctype html><html><head></head><body>shell</body></html>');
  await writeFile(resolve(root2,'dist/assets/probe.js'),'asset-A');
  await mkdir(resolve(root2,'server'),{recursive:true});
  for(const file of ['channel.mjs','release.mjs','index.mjs'])await writeFile(resolve(root2,'server',file),await readFile(resolve(root,'server',file)));
  const entry=marker=>["import {createServer} from 'node:http';","import {readFile} from 'node:fs/promises';","import {dirname,resolve} from 'node:path';","import {fileURLToPath} from 'node:url';",
    "const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');",
    "const asset=await readFile(resolve(root,'dist/assets/probe.js'),'utf8');",
    `const code='${marker}';`,
    "const server=createServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({app:'stellar-resonance-local',version:'0.20.5',asset,code,release:process.env.STELLAR_RELEASE_ID,instance:process.env.TERMINAL_INSTANCE,channel:process.env.TERMINAL_CHANNEL,pid:process.pid,port:server.address().port}));});",
    "server.listen(Number(process.env.PORT),'127.0.0.1');"].join('\n');
  await writeFile(resolve(root2,'server/index-main.mjs'),entry('code-A'));
  const bootAndWait=async()=>{
    const child=spawn(process.execPath,['server/index.mjs'],{cwd:root2,env:{...process.env,PORT:String(port),TERMINAL_CHANNEL:'stable',TERMINAL_INSTANCE:'stable'},windowsHide:true});
    let text='';child.stderr.on('data',chunk=>text+=chunk);child.stdout.on('data',chunk=>text+=chunk);
    let health;
    for(let attempt=0;attempt<60;attempt++){
      await new Promise(done=>setTimeout(done,100));
      try{const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(300)});health=await response.json();break;}catch{}
    }
    assert.ok(health,`bootstrap must serve health: ${text}`);
    return {child,health};
  };
  let running;
  try{
    running=await bootAndWait();
    assert.equal(running.health.asset,'asset-A');
    const stableRelease=running.health.release;
    assert.ok(stableRelease);
    // 测试实例在共享工作树上重新构建并发布：稳定实例已确认的版本不受影响。
    await writeFile(resolve(root2,'dist/assets/probe.js'),'asset-B');
    const testRelease=await createReleaseSnapshot(root2,'test');
    assert.notEqual(testRelease.buildId,stableRelease);
    assert.equal((await readReleaseSnapshot(root2,'stable')).buildId,stableRelease);
    running.child.kill();await new Promise(done=>running.child.once('close',done));
    // 普通重启：不得采用测试版刚构建出来的内容。
    running=await bootAndWait();
    assert.equal(running.health.release,stableRelease);
    assert.equal(running.health.asset,'asset-A');
    assert.equal(running.health.code,'code-A');
    // 后端代码同样被固定：共享工作树改了入口，重启后仍是快照里那一版。
    await writeFile(resolve(root2,'server/index-main.mjs'),entry('code-B'));
    running.child.kill();await new Promise(done=>running.child.once('close',done));
    running=await bootAndWait();
    assert.equal(running.health.release,stableRelease);
    assert.equal(running.health.code,'code-A');
    // 显式发布之后才切换到新版本。
    const published=await createReleaseSnapshot(root2,'stable');
    assert.notEqual(published.buildId,stableRelease);
    running.child.kill();await new Promise(done=>running.child.once('close',done));
    running=await bootAndWait();
    assert.equal(running.health.release,published.buildId);
    assert.equal(running.health.asset,'asset-B');
    assert.equal(running.health.code,'code-B');
  }finally{
    if(running?.child&&!running.child.killed){running.child.kill();await new Promise(done=>running.child.once('close',done));}
    await rm(root2,{recursive:true,force:true}).catch(()=>{});
  }
});

// 连续准备多个构建但都没有切换成功时，正在运行的旧版本必须继续可访问。
test('preparing new builds never deletes the snapshot a running process is serving',async()=>{
  const root3=await mkdtemp(resolve('.integration','channel-retention-'));
  await mkdir(resolve(root3,'dist/assets'),{recursive:true});
  await writeFile(resolve(root3,'dist/index.html'),'<!doctype html><html><head></head><body>shell</body></html>');
  await writeFile(resolve(root3,'dist/assets/probe.js'),'asset-A');
  const first=await createReleaseSnapshot(root3,'stable');
  const app=await createLocalServer({projectRoot:root3,card,port:0,channel:'stable',releaseDir:first.dir,privateDir:resolve(root3,'private')});
  try{
    const base=`http://127.0.0.1:${await app.start()}`;
    assert.equal(await (await fetch(base+'/assets/probe.js')).text(),'asset-A');
    for(const marker of ['asset-B','asset-C','asset-D','asset-E']){
      await writeFile(resolve(root3,'dist/assets/probe.js'),marker);
      const prepared=await prepareRelease(root3,'stable');
      assert.notEqual(prepared.buildId,first.buildId);
    }
    // 没有一个新构建通过健康检查，所以已确认版本和运行中的快照都不能被清理。
    assert.equal((await readReleaseSnapshot(root3,'stable')).buildId,first.buildId);
    const response=await fetch(base+'/assets/probe.js');
    assert.equal(response.status,200);
    assert.equal(await response.text(),'asset-A');
    assert.ok(await stat(resolve(first.dir,'dist/assets/probe.js')).then(()=>true).catch(()=>false));
  }finally{await close(app.server);await rm(root3,{recursive:true,force:true});}
});

after(async()=>{for(const server of opened)await close(server).catch(()=>{});await rm(fixture,{recursive:true,force:true});});
