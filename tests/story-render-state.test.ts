import {computed,reactive} from 'vue';
import {describe,it,expect} from 'vitest';
import {newSession,stateAt} from '../src/domain/story';
import {dataFromState} from '../src/domain/mvu';
import {storyRenderStates} from '../src/app/storyRenderState';

function fixture(){
 const session=reactive(newSession('渲染测试',{name:'玩家',appearance:'',personality:'',background:''},'开场'));
 session.turns.push({id:'t1',input:'第一轮',selected:0,variants:[{id:'v1',text:'正文',status:'complete',createdAt:'2026-10-27',outcome:{event:'第一轮'}}]});
 session.turns.push({id:'t2',input:'第二轮',selected:0,variants:[{id:'v2',text:'',status:'incomplete',createdAt:'2026-10-27'}]});
 const rows=computed(()=>storyRenderStates(session,session.turns.map((_,i)=>i)));
 return {session,rows};
}
describe('stable state for streaming story rendering',()=>{
 it('keeps every replay and iframe context cached across prose deltas',()=>{
  const {session,rows}=fixture(),before=rows.value;
  for(let i=0;i<100;i++){
   session.turns[1].variants[0].text+='流式文字';
   expect(rows.value).toBe(before);
  }
  expect(rows.value.get(1)!.context.variables).toEqual(dataFromState(stateAt(session,2)));
 });
 it('updates after a branch, an outcome, a persona or initial variables change',()=>{
  const {session,rows}=fixture();let before=rows.value;
  session.initial.player.name='更新后的玩家';expect(rows.value).not.toBe(before);before=rows.value;
  session.persona.name='新昵称';expect(rows.value.get(0)!.context.user).toBe('新昵称');expect(rows.value).not.toBe(before);before=rows.value;
  session.turns[1].variants[0].status='complete';session.turns[1].variants[0].outcome={event:'完成'};
  expect(rows.value).not.toBe(before);before=rows.value;
  session.turns[0].variants.push({...session.turns[0].variants[0],id:'branch',outcome:{event:'分支'}});
  session.turns[0].selected=1;expect(rows.value).not.toBe(before);
  expect(rows.value.get(1)!.context.variables).toEqual(dataFromState(stateAt(session,2)));
 });
});
