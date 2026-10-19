import {it,expect} from 'vitest';
import {stateUpdateLabel} from '../src/domain/stateUpdate';
import {newSession,finishVariant,stateAt,backup,parseBackup,defaults} from '../src/domain/story';
import {missingRepairPlan} from '../src/domain/repairPlan';
import type {Outcome,Variant} from '../src/domain/contracts';
it('partial updates remain valid through backup and clearly report saved fields',()=>{
 const session=newSession('部分更新',{name:'玩家',appearance:'',personality:'',background:''},'');const v:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};session.turns.push({id:'t',input:'观察',selected:0,variants:[v]});
 const outcome:Outcome={event:'观察',stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_FIELD_SKIPPED']}};finishVariant(session,0,v,outcome);
 expect(stateUpdateLabel(outcome)).toContain('有效字段已保存');expect(parseBackup(backup({version:1,sessions:[session],preferences:defaults()})).sessions[0].turns[0].variants[0].outcome?.stateUpdate?.status).toBe('partial');
});

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

it('repeated completion of the same variant does not apply an affinity delta twice',()=>{  const session=newSession('校验',{name:'玩家',appearance:'',personality:'',background:''},'开场');
  const variant:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};
  session.turns.push({id:'t',input:'观察',selected:0,variants:[variant]});
  const outcome:Outcome={event:'交谈',mvu:[{op:'delta',path:'/characters/guide/affinity',value:2}],stateUpdate:{status:'updated',received:true,storyComplete:true,codes:[]}};
  finishVariant(session,0,variant,outcome);finishVariant(session,0,variant,outcome);
  expect(stateAt(session).characters[0].affinity).toBe(32);
  expect(stateUpdateLabel(outcome)).toBe('正文已输出，有效变量已更新');
  expect(stateUpdateLabel({...outcome,stateUpdate:{...outcome.stateUpdate!,status:'unchanged'}})).toContain('无变化');
  expect(stateUpdateLabel(outcome,true)).toContain('小剧场待补全');
});

it('review survives backup and a missing actor drives targeted repair',()=>{
  const session=newSession('判断',{name:'玩家',appearance:'',personality:'',background:''},'开场');
  const variant:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};
  session.turns.push({id:'t',input:'交谈',selected:0,variants:[variant]});
  const outcome:Outcome={event:'交谈',characters:[{id:'guide',affinity:12}],stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_ATTITUDE_REVIEW_MISSING'],review:{guide:'missing'}}};
  finishVariant(session,0,variant,outcome);
  const restored=parseBackup(backup({version:1,sessions:[session],preferences:defaults()}));
  expect(restored.sessions[0].turns[0].variants[0].outcome?.stateUpdate?.review).toEqual({guide:'missing'});
  expect(missingRepairPlan(restored.sessions[0].turns[0].variants[0].outcome,stateAt(restored.sessions[0]),[],true,false).affinityIds).toContain('guide');
});

it('accepts version 1 backups while new exports use version 2',()=>{
  const legacy=JSON.stringify({version:1,sessions:[],preferences:defaults()});
  expect(parseBackup(legacy).version).toBe(1);
  expect(JSON.parse(backup(parseBackup(legacy))).version).toBe(2);
  expect(()=>parseBackup(JSON.stringify({version:3,sessions:[],preferences:defaults()}))).toThrow('不是支持的备份格式');
});
it('legacy out-of-range affinity is clamped on read instead of skipping the turn',()=>{
  const session=newSession('旧档',{name:'玩家',appearance:'',personality:'',background:''},'开场');
  session.initial.characters[0].affinity=250;
  const variant:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};
  session.turns.push({id:'t',input:'交谈',selected:0,variants:[variant]});
  finishVariant(session,0,variant,{event:'交谈',characters:[{id:'guide',affinity:150}]});
  session.turns[0].variants[0].outcome!.characters![0].affinity=999;
  const restored=parseBackup(backup({version:1,sessions:[session],preferences:defaults()}));
  expect(restored.sessions[0].initial.characters[0].affinity).toBe(200);
  expect(restored.sessions[0].turns[0].variants[0].outcome?.characters?.[0].affinity).toBe(200);
  expect(stateAt(restored.sessions[0]).characters[0].affinity).toBe(200);
});
