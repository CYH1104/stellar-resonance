import {createEditorServer} from './editor.mjs';
import {loadCard} from './load-card.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalServer } from './app.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try {
  const host=process.env.HOST||'127.0.0.1';
  let port=Number(process.env.PORT||5173);
  const editorPortSetting=Number(process.env.EDITOR_PORT||8808);
  const app=await createLocalServer({projectRoot,port,host,publicOrigin:process.env.PUBLIC_ORIGIN||'',authRequired:process.env.AUTH_REQUIRED==='1'||host!=='127.0.0.1',editorPort:editorPortSetting});
  const editor=createEditorServer({projectRoot,card:await loadCard(projectRoot),port:editorPortSetting,gameUrl:()=> (process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:`http://127.0.0.1:${port}`)+'/terminal'});
  const editorPort=await editor.start();
  port=await app.start();
  console.log('Private editor ready: http://127.0.0.1:'+editorPort+'/');
  const response=await fetch(`http://127.0.0.1:${port}/api/health`);const health=await response.json();
  await mkdir(resolve(projectRoot,'server/.local'),{recursive:true});
  await writeFile(resolve(projectRoot,'server/.local/runtime.json'),JSON.stringify({...health,port}));
  console.log(`Local server ready: http://127.0.0.1:${port}/\nServer-held world card. Configure a model in Settings to generate stories. Private files are not served.`);
}catch(error){console.error(error.code==='EADDRINUSE'?'Port already in use. Close the old preview window first.':'Local server could not start. Check the build and server/private data.');process.exit(1);}
