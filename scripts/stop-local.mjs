import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try {
  const state=JSON.parse(await readFile(resolve(root,'server/.local/runtime.json'),'utf8'));
  const response=await fetch(`http://127.0.0.1:${state.port}/api/health`,{signal:AbortSignal.timeout(1000)});const live=await response.json();
  if(live.app!=='stellar-resonance-local'||live.instance!==state.instance||live.projectId!==state.projectId||live.pid!==state.pid)throw Error('Not the recorded local service; no process stopped.');
  process.kill(state.pid);console.log('Local test server stopped.');
}catch(error){console.log('No matching running local test server.');}
