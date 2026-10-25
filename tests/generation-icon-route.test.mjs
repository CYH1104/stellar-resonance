import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

test('generation and unread favicons are served by the production route with authentication enabled',async()=>{
 const root=resolve(import.meta.dirname,'..'),directory=await mkdtemp(resolve(tmpdir(),'academy-favicon-'));
 const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
 const app=await createLocalServer({projectRoot:root,port:0,card,authRequired:true,accountDirectory:directory});
 try{
  const base=`http://127.0.0.1:${await app.start()}`;
  for(const state of ['generating','unread']){
   const path=`/assets/favicon-${state}.svg`,response=await fetch(base+path);
   assert.equal(response.status,200,path);
   assert.match(response.headers.get('content-type'),/image\/svg\+xml/);
   const body=await response.text();assert.equal(body,await readFile(resolve(root,'public'+path),'utf8'));
   assert.ok(body.includes(state==='unread'?'#369bff':'#9299a4'));
  }
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('academy-favicon-'));await rm(directory,{recursive:true,force:true});}
});
