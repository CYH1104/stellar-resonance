import {it,expect} from 'vitest';
import {stateUpdateLabel} from '../src/domain/stateUpdate';
import {newSession,finishVariant,stateAt,backup,parseBackup,defaults} from '../src/domain/story';
import type {Outcome,Variant} from '../src/domain/contracts';

it('records validation independently from prose completion and preserves it through backup',()=>{
  const session=newSession('校验',{name:'玩家',appearance:'',personality:'',background:''},'开场');
  const variant:Variant={id:'v',text:'保留下来的正文',status:'incomplete',createdAt:''};
  session.turns.push({id:'t',input:'观察',selected:0,variants:[variant]});
  const outcome:Outcome={event:'观察',stateUpdate:{status:'retained',received:true,storyComplete:false,codes:['STATE_MVU_REJECTED']}};
  finishVariant(session,0,variant,outcome);
  const restored=parseBackup(backup({version:1,sessions:[session],preferences:defaults()}));
  expect(restored.sessions[0].turns[0].variants[0].outcome?.stateUpdate).toEqual(outcome.stateUpdate);
  expect(stateUpdateLabel(outcome)).toContain('正文尚未完整');
  expect(stateUpdateLabel(outcome)).toContain('沿用旧值');
  expect(restored.sessions[0].turns[0].variants[0].text).toBe('保留下来的正文');
});

it('repeated completion of the same variant does not apply an affinity delta twice',()=>{
  const session=newSession('校验',{name:'玩家',appearance:'',personality:'',background:''},'开场');
  const variant:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};
  session.turns.push({id:'t',input:'观察',selected:0,variants:[variant]});
  const outcome:Outcome={event:'交谈',mvu:[{op:'delta',path:'/characters/guide/affinity',value:2}],stateUpdate:{status:'updated',received:true,storyComplete:true,codes:[]}};
  finishVariant(session,0,variant,outcome);finishVariant(session,0,variant,outcome);
  expect(stateAt(session).characters[0].affinity).toBe(32);
  expect(stateUpdateLabel(outcome)).toBe('正文已输出，有效变量已更新');
  expect(stateUpdateLabel({...outcome,stateUpdate:{...outcome.stateUpdate!,status:'unchanged'}})).toContain('无变化');
  expect(stateUpdateLabel(outcome,true)).toContain('小剧场待补全');
});
