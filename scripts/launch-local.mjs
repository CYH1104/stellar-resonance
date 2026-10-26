import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import {loadCard} from '../server/load-card.mjs';
import {resolveChannel,resolveInstanceName} from '../server/channel.mjs';
import {prepareRelease,commitRelease} from '../server/release.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const projectId=createHash('sha256').update(root).digest('hex').slice(0,16);
// 实例由 TERMINAL_INSTANCE 决定：stable（稳定版，8807/8808）或 test（测试版，9000/9001）。
// 两个实例的日志、runtime.json、url.txt 与私有数据目录互不覆盖，端口扫描也各自独立。
const portBase=Number(process.env.PORT||0)||0;
const channel=resolveChannel({explicit:process.env.TERMINAL_CHANNEL,port:portBase||undefined});
const instanceName=resolveInstanceName({explicit:process.env.TERMINAL_INSTANCE,channel});
const stable=instanceName==='stable';
const stateDir=stable?resolve(root,'server/.local'):resolve(root,'server/.local/instances',instanceName);
const privateDir=stable?resolve(root,'server/private'):resolve(root,'server/private/instances',instanceName);
const firstPort=portBase||(channel==='test'?9000:8807),lastPort=firstPort+7;
const editorPort=Number(process.env.EDITOR_PORT||(channel==='test'?9001:8808));
// 默认只重启该实例已确认的发布版本；改了代码要显式发布，才不会被另一个实例的构建带走。
const publish=process.argv.includes('--publish')||process.env.TERMINAL_PUBLISH==='1';
async function health(port){try{const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(600)});if(!response.ok)return;return await response.json();}catch{return;}}
async function available(port){return new Promise(resolve=>{const socket=createServer();socket.once('error',()=>resolve(false));socket.listen(port,'127.0.0.1',()=>socket.close(()=>resolve(true)));});}
const ours=info=>info?.app==='stellar-resonance-local'&&info.projectId===projectId&&info.channel===channel&&(info.instanceName||info.channel)===instanceName;
try {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<24||(major===24&&minor<12))throw new Error('Node.js 24.12 or newer is required.');
  await readFile(resolve(root,'dist/index.html'));await loadCard(root);await mkdir(stateDir,{recursive:true});
  let previous;try{previous=JSON.parse(await readFile(resolve(stateDir,'runtime.json'),'utf8'));}catch{}
  // 没有 runtime.json（手动启动或记录遗失）时，用本次实际探测到的端口回退，
  // 不用 previous.port 这种可能不存在的值；身份必须同时匹配通道与实例名才复用。
  let info,probed=Number(previous?.port)||firstPort;
  if(previous?.port)info=await health(previous.port);
  if(!ours(info)){const running=await health(probed=firstPort);info=ours(running)?running:undefined;}
  if(probed===firstPort&&info?.port)probed=info.port;
  // 显式发布：先准备快照并写下目标版本；服务确认跑在该版本上后，才推进已确认指针。
  let target='';
  if(publish){
    target=(await prepareRelease(root,instanceName)).buildId;
    if(ours(info)&&info.release!==target)throw new Error(`该实例正在运行旧快照 ${info.release}，请先运行 stop-local，再发布 ${target}。`);
    await writeFile(resolve(stateDir,'pending-release.json'),JSON.stringify({buildId:target}));
  }
  if(!(info&&ours(info)&&info.version==='0.20.5')){
    let port;for(let candidate=firstPort;candidate<=lastPort;candidate++){if(await available(candidate)){port=candidate;break;}}
    if(!port)throw new Error(`No local port available (${firstPort}-${lastPort}). Close an old preview.`);
    const log=await open(resolve(stateDir,'server.log'),'a');
    const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EDITOR_PORT:String(editorPort),TERMINAL_CHANNEL:channel,TERMINAL_INSTANCE:instanceName},detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
    const pid=child.pid;child.unref();await log.close();
    for(let attempt=0;attempt<40;attempt++){await pause(150);const check=await health(port);if(ours(check)&&check.pid===pid){info={...check,port};break;}}
    if(!info||info.pid!==pid)throw new Error(`Server did not become ready. See ${resolve(stateDir,'server.log')}.`);
  }else info={...info,port:info.port||probed};
  if(publish){
    if(info.release!==target)throw new Error(`启动后的快照 ${info.release} 与发布目标 ${target} 不一致。`);
    await commitRelease(root,instanceName,target);
    await rm(resolve(stateDir,'pending-release.json'),{force:true});
  }
  const url=`http://127.0.0.1:${info.port}/terminal`;
  await writeFile(resolve(stateDir,'url.txt'),url);
  console.log(`Ready (${channel}): ${url}\nRelease: ${info.release||'unpinned'}\nState: ${stateDir}\nServer-held world card. Configure model in Settings.`);
}catch(error){console.error(error.message);process.exit(1);}
