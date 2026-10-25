import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {IndexedDbRepository} from '../src/storage/repository';
import {backup,defaults,newSession,parseBackup,saveFailureLocation,stateAt} from '../src/domain/story';
import type {Session} from '../src/domain/contracts';
import {ensureTerminalCodes} from '../src/app/terminalCodeRegistry';
import {terminalCodeBindings,validateTerminalCodeMap} from '../src/domain/terminalCodeVariables';
import {applyMvu} from '../src/domain/mvu';
import type {Json} from '../src/domain/mvu';

function sessionWith(custom:Json):Session{
 const session=newSession('历史快照',{name:'玩家',appearance:'',personality:'',background:''},'');
 ensureTerminalCodes(session);
 session.turns=[{id:'t1',input:'合成回合',selected:0,variants:[{id:'v1',text:'合成正文',status:'complete',createdAt:'now',outcome:{event:'合成事件',mvu:[{op:'replace',path:'/custom',value:custom}]}}]}];
 return session;
}
function write(sessions:Session[]){
 const repository=new IndexedDbRepository('legacy-custom-'+crypto.randomUUID());
 return repository.write({version:1,preferences:defaults(),sessions});
}
const codesOf=(session:Session)=>terminalCodeBindings(stateAt(session));

it('fills missing, empty and partial historical registries while keeping other variables',async()=>{
 const missing=sessionWith({门禁:'已开放'}),empty=sessionWith({终端码:{},门禁:'已开放'}),partial=sessionWith({门禁:'已开放'});
 const partialCodes=codesOf(partial);
 partial.turns[0].variants[0].outcome!.mvu=[{op:'replace',path:'/custom',value:{终端码:{player:partialCodes.player},门禁:'已开放'}}];
 await expect(write([missing,empty,partial])).resolves.toBeUndefined();
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[missing,empty,partial]})).sessions;
 for(const [index,session] of restored.entries()){
  const expected=[codesOf(missing),codesOf(empty),partialCodes][index];
  expect(terminalCodeBindings(stateAt(session))).toEqual(expected);
  expect(stateAt(session).variables?.门禁).toBe('已开放');
 }
});

it('keeps historic bindings for IDs outside the current roster when a snapshot omits them',async()=>{
 const session=sessionWith({终端码:{}});
 (session.initial.variables as Record<string,Record<string,string>>).终端码['future-npc']='12345678901';
 const custom={...stateAt(session).variables,终端码:{}};
 session.turns[0].variants[0].outcome!.mvu=[{op:'replace',path:'/custom',value:custom}];
 await expect(write([session])).resolves.toBeUndefined();
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[session]})).sessions[0];
 expect((stateAt(restored).variables as Record<string,Record<string,string>>).终端码['future-npc']).toBe('12345678901');
});

it('rejects explicit code changes, deletions, duplicates and unknown IDs',()=>{
 const session=sessionWith({});
 const state=stateAt(session),codes=codesOf(session),changed=codes.player==='00000000001'?'00000000002':'00000000001';
 for(const updates of [
  [{op:'replace',path:'/custom',value:{终端码:{...codes,player:changed}}}],
  [{op:'replace',path:'/custom',value:{终端码:{...codes,player:''}}}],
  [{op:'remove',path:'/custom/终端码'}],
  [{op:'remove',path:'/custom/终端码/player'}],
  [{op:'replace',path:'/custom/终端码',value:{}}],
  [{op:'replace',path:'/custom',value:{终端码:{...codes,ghost:'12345678901'}}}],
 ])expect(()=>applyMvu(state,updates)).toThrow();
 expect(()=>validateTerminalCodeMap({}, {player:'12345678901',guide:'12345678901'},['player','guide'])).toThrow('不重复');
 expect(()=>validateTerminalCodeMap({}, {ghost:'12345678901'},['player'])).toThrow('角色 ID');
});

it('unselected legacy variants and other sessions no longer block a normal save',async()=>{
 const unselected=sessionWith({终端码:{},门禁:'已开放'});
 unselected.turns[0].variants.push({id:'v2',text:'当前选中正文',status:'complete',createdAt:'now',outcome:{event:'当前选中事件'}});
 unselected.turns[0].selected=1;
 await expect(write([sessionWith({门禁:'已开放'}),unselected])).resolves.toBeUndefined();
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[unselected]})).sessions[0];
 expect(restored.turns[0].variants[1].text).toBe('当前选中正文');
 expect(terminalCodeBindings(stateAt(restored))).toEqual(codesOf(unselected));
});

it('still blocks an unselected variant that explicitly changes a bound code',async()=>{
 const session=sessionWith({}),codes=codesOf(session),changed=codes.player==='00000000001'?'00000000002':'00000000001';
 session.turns[0].variants.push({id:'v2',text:'当前选中正文',status:'complete',createdAt:'now',outcome:{event:'当前选中事件'}});
 session.turns[0].variants[0].outcome!.mvu=[{op:'replace',path:'/custom',value:{终端码:{...codes,player:changed}}}];
 session.turns[0].selected=1;
 await expect(write([session])).rejects.toThrow('已绑定的角色终端码不能随意变更');
});

it('locates the failing session, turn and variant instead of the active page',()=>{
 const active=sessionWith({门禁:'已开放'}),broken=sessionWith({门禁:'已开放'}),codes=codesOf(broken),changed=codes.player==='00000000001'?'00000000002':'00000000001';
 broken.turns.push({id:'t2',input:'第二回合',selected:1,variants:[
  {id:'v1',text:'未选中的旧稿',status:'complete',createdAt:'now',outcome:{event:'旧稿',mvu:[{op:'replace',path:'/custom',value:{终端码:{...codes,player:changed}}}]}},
  {id:'v2',text:'当前选中稿件',status:'complete',createdAt:'now',outcome:{event:'当前稿件'}},
 ]});
 let failure:unknown;
 try{parseBackup(backup({version:1,preferences:defaults(),sessions:[active,broken]}));}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(Error);
 expect(saveFailureLocation(failure)).toEqual({sessionId:broken.id,turnId:'t2',variantId:'v1',round:2});
 expect(saveFailureLocation(failure).sessionId).not.toBe(active.id);
});

it('failed validation leaves the persisted save intact and the raw export keeps unsaved text',async()=>{
 const name='legacy-failed-'+crypto.randomUUID(),repository=new IndexedDbRepository(name),original=sessionWith({门禁:'已开放'});
 await repository.write({version:1,preferences:defaults(),sessions:[original]});
 const current=structuredClone(original),codes=codesOf(current),changed=codes.player==='00000000001'?'00000000002':'00000000001';
 current.turns[0].variants[0].text='尚未落盘的合成正文';
 current.turns[0].variants[0].outcome!.mvu=[{op:'replace',path:'/custom',value:{终端码:{...codes,player:changed}}}];
 const snapshot={version:1 as const,preferences:defaults(),sessions:[current]};
 expect(backup(snapshot)).toContain('尚未落盘的合成正文');
 await expect(repository.write(snapshot)).rejects.toThrow('已绑定的角色终端码不能随意变更');
 const persisted=await new IndexedDbRepository(name).read();
 expect(persisted!.sessions[0].turns[0].variants[0].text).toBe('合成正文');
});
