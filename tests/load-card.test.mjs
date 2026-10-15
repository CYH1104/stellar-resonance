import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
import {loadCard} from '../server/load-card.mjs';
test('fresh checkout uses the shareable example, while private card takes priority and parse failures stay explicit',async()=>{
  const prefix=resolve(tmpdir(),'stellar-card-test-'),root=await mkdtemp(prefix);
  try{
    await mkdir(resolve(root,'server/example'),{recursive:true});await writeFile(resolve(root,'server/example/feature-demo.json'),JSON.stringify({name:'synthetic example'}));assert.deepEqual(await loadCard(root),{name:'synthetic example'});
    await mkdir(resolve(root,'server/private'));await writeFile(resolve(root,'server/private/extracted-pro.json'),JSON.stringify({name:'synthetic private'}));assert.deepEqual(await loadCard(root),{name:'synthetic private'});
    await writeFile(resolve(root,'server/private/extracted-pro.json'),'{bad json');await assert.rejects(loadCard(root),SyntaxError);
  }finally{assert.ok(resolve(root).startsWith(prefix)&&resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});}
});
