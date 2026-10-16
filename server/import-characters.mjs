import {readFile,stat} from 'node:fs/promises';
import {loadCard} from './load-card.mjs';
import {createEditorStore,validateEditorData} from './editor-store.mjs';
export async function importCharacters(projectRoot,file,{dryRun=false}={}){
  if((await stat(file)).size>8*1024*1024)throw Error('角色文件不能超过 8MB。');
  const raw=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
  if(raw.type!=='academy-character-archive'||raw.version!==1||!Array.isArray(raw.characters)||!raw.characters.length)throw Error('不是有效的学院角色资料文件。');
  const store=createEditorStore(projectRoot,await loadCard(projectRoot)),current=await store.read();
  const incoming=validateEditorData({...current.data,characters:raw.characters}).characters;
  const ids=new Set(incoming.map(c=>c.id)),old=new Set(current.data.characters.map(c=>c.id));
  const characters=[...incoming,...current.data.characters.filter(c=>!ids.has(c.id))];
  const next=validateEditorData({...current.data,characters});
  const result={updated:incoming.filter(c=>old.has(c.id)).length,added:incoming.filter(c=>!old.has(c.id)).length,retained:current.data.characters.filter(c=>!ids.has(c.id)).length,total:characters.length};
  if(!dryRun)await store.save(next,current.revision);
  return result;
}
