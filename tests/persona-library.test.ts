import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {PersonaLibrary,validatePersonaTextFile} from '../src/storage/personaLibrary';
import {blankPersona,normalizePersona} from '../src/domain/persona';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
it('only TXT and MD files within the import limit are accepted',()=>{
  expect(()=>validatePersonaTextFile('人设.TXT',1024)).not.toThrow();
  expect(()=>validatePersonaTextFile('人设.md',1024)).not.toThrow();
  for(const file of ['人设.json','人设.html','人设.txt.exe','人设.pdf'])expect(()=>validatePersonaTextFile(file,10)).toThrow();
  expect(()=>validatePersonaTextFile('人设.txt',256*1024+1)).toThrow();
});
it('raw persona text survives independent archive updates and game backup round trips',async()=>{
  const library=new PersonaLibrary();
  const persona=normalizePersona({...blankPersona(),name:'林星',rawText:'# 人设\n'+('完整设定。'.repeat(1000))});
  const record={id:'persona-test',name:persona.name,persona,updatedAt:'2026-10-16T00:00:00.000Z'};
  await library.save(record);expect((await new PersonaLibrary().list()).find(p=>p.id===record.id)?.persona.rawText).toBe(persona.rawText);
  await library.save({...record,persona:{...persona,rawText:'更新人设'}});expect((await library.list()).filter(p=>p.id===record.id)).toHaveLength(1);
  const session=newSession('档案旅程',persona,'开场');
  expect(parseBackup(backup({version:1,sessions:[session],preferences:defaults()})).sessions[0].persona.rawText).toBe(persona.rawText);
  await library.remove(record.id);expect((await library.list()).some(p=>p.id===record.id)).toBe(false);
});

it('preserves the original image independently from its cropped avatar',async()=>{
const library=new PersonaLibrary(),portrait=new Blob(['full original'],{type:'image/png'}),avatar=new Blob(['cropped'],{type:'image/png'});
await library.save({id:'media-test',name:'User',persona:normalizePersona({...blankPersona(),name:'User'}),updatedAt:new Date().toISOString(),portrait,avatar,useAsHomeImage:true});
const stored=(await library.list()).find(p=>p.id==='media-test')!;
expect(await stored.portrait!.text()).toBe('full original');expect(await stored.avatar!.text()).toBe('cropped');expect(stored.useAsHomeImage).toBe(true);await library.remove('media-test');
});

it('stores private memo separately from model persona and rejects oversized notes',async()=>{
 const library=new PersonaLibrary(),persona=normalizePersona({...blankPersona(),name:'Memo'}),record={id:'memo-test',name:'Memo',persona,updatedAt:new Date().toISOString(),memo:'仅供玩家阅读'};
 await library.save(record);const saved=(await library.list()).find(p=>p.id===record.id)!;
 expect(saved.memo).toBe(record.memo);expect(saved.persona).not.toHaveProperty('memo');
 await expect(library.save({...record,memo:'x'.repeat(20001)})).rejects.toThrow();await library.remove(record.id);
});
