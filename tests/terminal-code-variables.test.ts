import {it,expect} from 'vitest';
import {applyMvu} from '../src/domain/mvu';
import {terminalCodeBindings,terminalCodePath} from '../src/domain/terminalCodeVariables';
import {initialState,backup,parseBackup,defaults,newSession,stateAt} from '../src/domain/story';
const fixture=()=>({...initialState('玩家'),characters:[{id:'teacher',name:'卫锋',present:true}]});
it('binds story codes to actor IDs, keeps player separate and isolates saves',()=>{
 const before=fixture(),after=applyMvu(before,[{op:'replace',path:terminalCodePath('teacher'),value:'12345678901'}]);
 expect(terminalCodeBindings(after)).toEqual({teacher:'12345678901'});expect(terminalCodeBindings(before)).toEqual({});expect(terminalCodeBindings(fixture())).toEqual({});
 const both=applyMvu(after,[{op:'add',path:terminalCodePath('player'),value:'98765432109'}]);expect(terminalCodeBindings(both).player).toBe('98765432109');
 expect(()=>applyMvu(after,[{op:'replace',path:terminalCodePath('teacher'),value:'12345678902'}])).toThrow();
 expect(()=>applyMvu(after,[{op:'add',path:terminalCodePath('player'),value:'12345678901'}])).toThrow();
 expect(()=>applyMvu(after,[{op:'remove',path:terminalCodePath('teacher')}])).toThrow();
 expect(()=>applyMvu(after,[{op:'add',path:terminalCodePath('invented'),value:'12345678902'}])).toThrow();
});
it('backup and branching derive terminal codes from the selected story variant',()=>{
 const session=newSession('号码',{name:'玩家',appearance:'',personality:'',background:''},'');session.initial=fixture();
 session.turns=[{id:'round',input:'问号码',selected:0,variants:[{id:'a',text:'卫锋的终端码是12345678901',status:'complete',createdAt:'',outcome:{event:'交换号码',mvu:[{op:'replace',path:terminalCodePath('teacher'),value:'12345678901'}]}},{id:'b',text:'卫锋没有告知号码',status:'complete',createdAt:'',outcome:{event:'没有告知号码'}}]}];
 const restored=parseBackup(backup({version:1,sessions:[session],preferences:defaults()})).sessions[0];
 expect(terminalCodeBindings(stateAt(restored))).toEqual({teacher:'12345678901'});restored.turns[0].selected=1;expect(terminalCodeBindings(stateAt(restored))).toEqual({});
});
