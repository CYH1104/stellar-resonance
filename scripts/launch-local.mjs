import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import {loadCard} from '../server/load-card.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const local=resolve(root,'server/.local');const projectId=createHash('sha256').update(root).digest('hex').slice(0,16);
async function health(port){try{const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(600)});if(!response.ok)return;return await response.json();}catch{return;}}
async function available(port){return new Promise(resolve=>{const socket=createServer();socket.once('error',()=>resolve(false));socket.listen(port,'127.0.0.1',()=>socket.close(()=>resolve(true)));});}
try {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<24||(major===24&&minor<12))throw new Error('Node.js 24.12 or newer is required.');
  await readFile(resolve(root,'dist/index.html'));await loadCard(root);await mkdir(local,{recursive:true});
  let previous;try{previous=JSON.parse(await readFile(resolve(local,'runtime.json'),'utf8'));}catch{}
  let info=previous?await health(previous.port):undefined;
  if(!(info?.app==='stellar-resonance-local'&&info.projectId===projectId&&info.instance===previous.instance&&info.version==='0.19.0')){
    let port;for(let candidate=5173;candidate<=5180;candidate++){if(await available(candidate)){port=candidate;break;}}
    if(!port)throw new Error('No local port available (5173-5180). Close an old preview.');
    const log=await open(resolve(local,'server.log'),'a');
    const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
    const pid=child.pid;child.unref();await log.close();
    for(let attempt=0;attempt<40;attempt++){await pause(150);const check=await health(port);if(check?.app==='stellar-resonance-local'&&check.projectId===projectId&&check.pid===pid){info={...check,port};break;}}
    if(!info||info.pid!==pid)throw new Error('Server did not become ready. See server/.local/server.log.');
  }else info={...info,port:previous.port};
  const url=`http://127.0.0.1:${info.port}/`;
  await writeFile(resolve(local,'url.txt'),url);console.log(`Ready: ${url}\nServer-held world card. Configure model in Settings. Run stop-local.bat to stop.`);
}catch(error){console.error(error.message);process.exit(1);}
