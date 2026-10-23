import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {blankPersona} from '../src/domain/persona';
import {PersonaLibrary,personaArchiveEntries,resolvePersonaArchiveFile,personaSourceSessionIds,type PersonaFile} from '../src/storage/personaLibrary';
const original={...blankPersona(),name:'玩家',background:'原设定'};
const session={id:'archive-source',persona:original,updatedAt:'2026-10-22T00:00:00Z'};
it('removed session entries remain hidden without deleting historical personas or explicit archives',()=>{
 const archived={id:'independent',name:original.name,persona:original,updatedAt:session.updatedAt};
 expect(personaArchiveEntries([],[session],[session.id])).toEqual([]);
 expect(personaArchiveEntries([archived],[session],[session.id])).toEqual([archived]);
 expect(session.persona).toEqual(original);
 const different={...session,id:'other',persona:{...original,background:'不同版本'}};
 expect(personaArchiveEntries([],[session,different],[session.id]).map(f=>f.id)).toEqual(['session/other']);
});
it('editing a session fallback keeps one archive after autosaves and reopening',async()=>{
 const repo=new PersonaLibrary();
 const fallback=personaArchiveEntries([],[session])[0];
 const file:PersonaFile={id:'archive-regression',name:'新名字',persona:{...original,name:'新名字',background:'新设定'},updatedAt:session.updatedAt,sourceSessionIds:[session.id]};
 try{
  await repo.save(file);
  await repo.save({...file,memo:'继续编辑'});
  const files=(await new PersonaLibrary().list()).filter(f=>f.id===file.id);
  expect(files).toHaveLength(1);
  expect(personaArchiveEntries(files,[session])).toHaveLength(1);
  expect(resolvePersonaArchiveFile(fallback,files).id).toBe(file.id);
  expect(session.persona.background).toBe('原设定');
 }finally{await repo.remove(file.id);}
});
it('legacy personas compare by normalized fields, not property insertion order',()=>{
 const file:PersonaFile={id:'old',name:original.name,persona:original,updatedAt:session.updatedAt};
 const legacy={id:'legacy',persona:{background:'原设定',name:'玩家'} as typeof original,updatedAt:session.updatedAt};
 expect(personaArchiveEntries([file],[legacy])).toHaveLength(1);
 expect(resolvePersonaArchiveFile({...file,id:'session/legacy',persona:legacy.persona},[file]).id).toBe('old');
});
it('different personas with the same name and explicitly saved copies remain distinct',()=>{
 const file:PersonaFile={id:'first',name:original.name,persona:original,updatedAt:session.updatedAt};
 const other={...session,id:'other',persona:{...original,background:'另一人设'}};
 expect(personaArchiveEntries([file],[other])).toHaveLength(2);
 expect(personaArchiveEntries([file,{...file,id:'explicit-copy'}],[session])).toHaveLength(2);
});
it('captures newly bound or newly created sessions against the previous saved persona before editing',()=>{
 const file:PersonaFile={id:'master',name:original.name,persona:original,updatedAt:session.updatedAt,sourceSessionIds:['old-source']};
 const same={...session,id:'new-session'},other={...session,id:'different',persona:{...original,background:'不同设定'}};
 const ids=personaSourceSessionIds(file,[same,other],['explicit-target']);
 expect(ids).toEqual(['old-source','explicit-target','new-session']);expect(file.sourceSessionIds).toEqual(['old-source']);
 expect(personaArchiveEntries([{...file,sourceSessionIds:ids,persona:{...original,name:'改名'}}],[same])).toHaveLength(1);
});
