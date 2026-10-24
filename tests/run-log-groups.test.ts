import {it,expect} from 'vitest';
import {runLogGroups,copyableRunLog,runLogCalls} from '../src/domain/runLogGroups';
import type {FormatErrorRecord} from '../src/storage/formatErrors';
const row=(id:string,sessionId:string,turnId:string,code:string,at:string,kind:FormatErrorRecord['kind']='runtime'):FormatErrorRecord=>({id,sessionId,turnId,code,at,kind,raw:id});
it('orders parseable instants, retains equal-time insertion order and tolerates invalid timestamps without mutation',()=>{
 const entries=[row('equal-new','s','t','error','2026-10-24T11:00:00Z'),row('equal-old','s','t','error','2026-10-24T19:00:00+08:00'),row('newest','s','old','error','2026-10-24T12:00:00Z'),row('bad','s','t','error','invalid'),row('empty','s','t','error',undefined as any)];
 const original=JSON.stringify(entries),groups=runLogGroups(entries,[]);
 expect(groups.map(g=>g.turnId)).toEqual(['old','t']);expect(groups[1].entries.map(e=>e.id)).toEqual(['equal-new','equal-old','bad','empty']);expect(JSON.stringify(entries)).toBe(original);
});
it('combines generation, compatibility and delayed errors across dates in the original round',()=>{
 const entries=[row('memory','s','t','后台记忆整理','2026-10-22T00:00:01Z'),row('done','s','t','GENERATION_COMPLETE','2026-10-21T23:59:59Z','generation'),row('format','s','t','STATE_COMPAT_RECOVERED','2026-10-21T23:59:58Z','format')];
 const groups=runLogGroups(entries,[{id:'s',name:'旅程',turns:[{id:'before'},{id:'t'}] as any}]);
 expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({name:'旅程',round:2,errors:1,generations:1});expect(groups[0].entries.map(e=>e.id)).toEqual(['memory','done','format']);expect(entries[0].id).toBe('memory');
});
it('keeps sessions and rounds separate while retaining retries',()=>{
 const entries=[row('a','s','t','GENERATION_INCOMPLETE','3','generation'),row('b','s','t','GENERATION_COMPLETE','4','generation'),row('c','other','t','error','2'),row('d','s','other','error','1')];
 const groups=runLogGroups(entries,[]);expect(groups).toHaveLength(3);expect(groups[0]).toMatchObject({generations:2,errors:1});expect(groups.flatMap(g=>g.entries)).toHaveLength(4);
});
it('retains deleted-turn metadata and never merges unidentified records',()=>{
 const groups=runLogGroups([{...row('a','removed','old','error','1'),round:9},row('b','','','error','2'),row('c','','','error','3')],[]);
 expect(groups).toHaveLength(3);expect(groups.find(g=>g.turnId==='old')?.round).toBe(9);
});
it('copies all records of one round including source identifiers and variable snapshots',()=>{
 const entries=[{...row('done','s','t','GENERATION_COMPLETE','2','generation'),round:2,variantId:'v',variables:{applied:true,total:0,changes:[],reviews:[],details:[],codes:[]}},row('error','s','t','后台记忆整理','3')];
 const text=copyableRunLog(runLogGroups(entries,[])[0]);
 for(const value of ['第 2 轮','会话 s','楼层 t','稿件 v','GENERATION_COMPLETE','后台记忆整理','变量变化','"applied": true'])expect(text).toContain(value);
 expect(text.indexOf('后台记忆整理')).toBeLessThan(text.indexOf('GENERATION_COMPLETE'));
});
it('merges same-call records and copies sections in error-first order',()=>{
 const entries=[
  {...row('gen','s','t','GENERATION_COMPLETE','3','generation'),callId:'call-1',sections:[{id:'prose',kind:'prose' as const,title:'生成正文',text:'本轮正文'},{id:'var',kind:'variables' as const,title:'MVU 变量与状态差异',text:'实际状态差异 1 项'}]},
  {...row('error','s','t','网络中断','4'),callId:'call-1'},
  {...row('terminal','s','t','终端API · chat','5','terminal'),callId:'call-2',sections:[{id:'act',kind:'terminalActivity' as const,title:'终端活动',text:'群聊消息'}]}
 ];
 const group=runLogGroups(entries,[])[0];const calls=runLogCalls(group);expect(calls).toHaveLength(2);expect(calls[0].callId).toBe('call-2');expect(calls[1].entries).toHaveLength(2);
 const text=copyableRunLog(group);expect(text).toContain('【生成正文】');expect(text).toContain('【终端活动】');expect(text).toContain('调用 call-1');expect(text.indexOf('网络中断')).toBeLessThan(text.indexOf('本轮正文'));
});
