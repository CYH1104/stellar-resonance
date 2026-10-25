import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {IndexedDbRepository} from '../src/storage/repository';
import {newSession,defaults,stateAt,backup,parseBackup} from '../src/domain/story';
import {ensureTerminalCodes} from '../src/app/terminalCodeRegistry';
import {terminalCodeBindings,validateTerminalCodeMap} from '../src/domain/terminalCodeVariables';
import {applyMvu} from '../src/domain/mvu';
function fixture(){const s=newSession('动态角色',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial.characters=[{id:'a',name:'甲',present:true,affinity:0}];s.turns=[{id:'t1',input:'问好',selected:0,variants:[{id:'v1',text:'甲点头。',status:'complete',createdAt:'now',outcome:{event:'问好',mvu:[{op:'replace',path:'/characters/a/affinity',value:1}]}}]},{id:'t2',input:'遇见新同学',selected:0,variants:[{id:'v2',text:'新同学到来。',status:'complete',createdAt:'now',outcome:{event:'结识新同学',characters:[{id:'npc-new',name:'新同学',present:true}]}}]}];return s;}
it('can save and reload after allocating a code for a character introduced after an older MVU turn',()=>{const s=fixture();expect(stateAt(s).characters.some(c=>c.id==='npc-new')).toBe(true);ensureTerminalCodes(s);expect(()=>parseBackup(backup({version:1,preferences:defaults(),sessions:[s]}))).not.toThrow();const after=stateAt(s);expect(after.characters.some(c=>c.id==='npc-new')).toBe(true);expect(after.characters.find(c=>c.id==='a')!.affinity).toBe(1);expect(terminalCodeBindings(after)['npc-new']).toMatch(/^\d{11}$/);expect(terminalCodeBindings(stateAt(s,0))['npc-new']).toBeUndefined();const code=terminalCodeBindings(after)['npc-new'];s.turns[1].selected=1;s.turns[1].variants.push({id:'alternate',text:'未遇到新同学。',status:'complete',createdAt:'now',outcome:{event:'离开'}});expect(()=>parseBackup(backup({version:1,preferences:defaults(),sessions:[s]}))).not.toThrow();expect(terminalCodeBindings(stateAt(s))['npc-new']).toBeUndefined();s.turns[1].selected=0;expect(terminalCodeBindings(stateAt(s))['npc-new']).toBe(code);});
it('preserves unchanged historic unknown codes but still rejects creating, changing or deleting unknown bindings',()=>{const before={'future-npc':'12345678901'};expect(()=>validateTerminalCodeMap(before,{...before},['player','a'])).not.toThrow();expect(()=>validateTerminalCodeMap({},before,['player','a'])).toThrow();expect(()=>validateTerminalCodeMap(before,{'future-npc':'12345678902'},['player','a'])).toThrow();expect(()=>validateTerminalCodeMap(before,{},['player','a'])).toThrow();});
it('saves full historical custom snapshots after terminal codes were allocated without dropping story progress',()=>{
 const s=fixture();s.turns[0].variants[0].outcome!.mvu=[{op:'replace',path:'/custom',value:{门禁:'已开放'}}];
 ensureTerminalCodes(s);const codes=terminalCodeBindings(stateAt(s));
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0];
 expect(restored.turns).toHaveLength(2);expect(restored.turns[1].variants[0].text).toBe('新同学到来。');
 expect(stateAt(restored).variables?.门禁).toBe('已开放');expect(terminalCodeBindings(stateAt(restored))).toEqual(codes);
 expect(stateAt(restored).characters.some(c=>c.id==='npc-new')).toBe(true);
});
it('still rejects explicit registry deletion, unknown bindings and conflicting codes in full snapshots',()=>{
 const s=fixture();ensureTerminalCodes(s);const state=stateAt(s),codes=terminalCodeBindings(state);
 for(const updates of [
  [{op:'remove',path:'/custom/终端码'}],
  [{op:'replace',path:'/custom/终端码',value:{}}],
  [{op:'replace',path:'/custom',value:{终端码:{...codes,ghost:'12345678901'}}}],
  [{op:'replace',path:'/custom',value:{终端码:{...codes,player:'12345678901'}}}],
  [{op:'replace',path:'/custom',value:{}},{op:'add',path:'/custom/终端码',value:{ghost:'12345678901'}}],
 ])expect(()=>applyMvu(state,updates)).toThrow();
});
it('persists the latest text and codes through a real IndexedDB write and reopened repository',async()=>{
 const s=fixture();s.turns[0].variants[0].outcome!.mvu=[{op:'replace',path:'/custom',value:{门禁:'已开放'}}];ensureTerminalCodes(s);
 const name='terminal-full-custom-'+crypto.randomUUID(),repository=new IndexedDbRepository(name);
 await repository.write({version:1,preferences:defaults(),sessions:[s]});
 const reopened=await new IndexedDbRepository(name).read(),restored=reopened!.sessions[0];
 expect(restored.turns[1].variants[0].text).toBe(s.turns[1].variants[0].text);expect(stateAt(restored).variables?.门禁).toBe('已开放');
 expect(restored.initial.variables?.终端码).toEqual(s.initial.variables?.终端码);
 expect(s.turns[0].variants[0].outcome!.mvu[0].value).toEqual({门禁:'已开放'});
});
