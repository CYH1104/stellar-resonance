import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {resolveChannel,resolveInstanceName} from '../server/channel.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// 与启动器一致：stable 用 server/.local，其他实例用 server/.local/instances/<name>。
const channel=resolveChannel({explicit:process.env.TERMINAL_CHANNEL,port:Number(process.env.PORT||0)||undefined});
const instanceName=resolveInstanceName({explicit:process.env.TERMINAL_INSTANCE,channel});
const stateDir=instanceName==='stable'?resolve(root,'server/.local'):resolve(root,'server/.local/instances',instanceName);
try {
  const state=JSON.parse(await readFile(resolve(stateDir,'runtime.json'),'utf8'));
  const response=await fetch(`http://127.0.0.1:${state.port}/api/health`,{signal:AbortSignal.timeout(1000)});const live=await response.json();
  if(live.app!=='stellar-resonance-local'||live.instance!==state.instance||live.projectId!==state.projectId||live.pid!==state.pid||(live.channel||'stable')!==channel||(live.instanceName||live.channel)!==instanceName)throw Error('Not the recorded local service; no process stopped.');
  process.kill(state.pid);console.log(`Local ${channel} server stopped.`);
}catch(error){console.log('No matching running local test server.');}
