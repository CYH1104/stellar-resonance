import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalServer } from './app.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try {
  const app=await createLocalServer({projectRoot,port:Number(process.env.PORT||5173)});
  const port=await app.start();
  const response=await fetch(`http://127.0.0.1:${port}/api/health`);const health=await response.json();
  await mkdir(resolve(projectRoot,'server/.local'),{recursive:true});
  await writeFile(resolve(projectRoot,'server/.local/runtime.json'),JSON.stringify({...health,port}));
  console.log(`Local server ready: http://127.0.0.1:${port}/\nServer-held world card. Configure a model in Settings to generate stories. Private files are not served.`);
}catch(error){console.error(error.code==='EADDRINUSE'?'Port already in use. Close the old preview window first.':'Local server could not start. Check the build and server/private data.');process.exit(1);}
