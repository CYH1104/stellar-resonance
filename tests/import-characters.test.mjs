import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {resolve} from 'node:path';
import {importCharacters} from '../server/import-characters.mjs';import {createEditorStore} from '../server/editor-store.mjs';
test('role import updates by ID and preserves other roles, worldbook, map, account files; dry-run does not write',async()=>{
 const root=await mkdtemp(resolve('.integration/character-import-'));try{
  await mkdir(root+'/server/private/accounts',{recursive:true});const card={source:{sha256:'test'},world:{sourceText:'PRIVATE_WORLD'},characters:[{id:'one',no:'01',name:'Old'},{id:'other',no:'99',name:'Other'}]};await writeFile(root+'/server/private/extracted-pro.json',JSON.stringify(card));
  const store=createEditorStore(root,card),first=await store.read();first.data.map={main:'https://example.com/map.png',places:{}};await store.save(first.data,first.revision);await writeFile(root+'/server/private/accounts/sentinel','ACCOUNT_SENTINEL');
  const before=await store.read(),archive=root+'/characters.json';await writeFile(archive,JSON.stringify({type:'academy-character-archive',version:1,characters:[{id:'one',no:'01',name:'Updated',hiddenPrompt:'PRIVATE_ROLE'},{id:'two',no:'02',name:'New'}]}));
  assert.deepEqual(await importCharacters(root,archive,{dryRun:true}),{updated:1,added:1,retained:1,total:3});assert.equal((await store.read()).revision,before.revision);
  await importCharacters(root,archive);const saved=await store.read();assert.deepEqual(saved.data.characters.map(c=>c.name),['Updated','New','Other']);assert.equal(saved.data.characters[0].hiddenPrompt,'PRIVATE_ROLE');assert.deepEqual(saved.data.entries,before.data.entries);assert.deepEqual(saved.data.map,before.data.map);assert.equal(await readFile(root+'/server/private/accounts/sentinel','utf8'),'ACCOUNT_SENTINEL');
  await writeFile(archive,JSON.stringify({type:'academy-character-archive',version:1,characters:[{id:'bad',no:'03',name:''}]}));await assert.rejects(importCharacters(root,archive));assert.equal((await store.read()).revision,saved.revision);
 }finally{await rm(root,{recursive:true,force:true});}
});
