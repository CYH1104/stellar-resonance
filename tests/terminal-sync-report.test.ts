import {it,expect} from 'vitest';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {terminalMainContext,cleanTerminalBatch,applyTerminalBatch} from '../src/domain/terminalMain';
import {cleanSyncReport,terminalSyncSummary} from '../src/domain/terminalSyncReport';
it('ignores set order but reports real management drift, message refusal, missing topics and exact inserted counts',()=>{
 const s=newSession('报告',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial.characters=[{id:'a',name:'甲',present:false},{id:'b',name:'乙',present:false}];s.turns=[{id:'t',input:'继续',selected:0,variants:[{id:'v',text:'继续',status:'complete',createdAt:'now',outcome:{event:'继续'}}]}];
 const ctx=terminalMainContext(s);const b={groups:ctx.newGroupIds.slice(0,2).map(id=>({id,title:'群',members:['a','b'],ownerId:'a',adminIds:[],announcement:'',messages:[{id:'b',text:'好'}],topic:'集合'})),privateMessages:[{id:'a',text:'你好',topic:'问候'}],friendRequests:[]};applyTerminalBatch(s,b,0);
 const context=terminalMainContext(s),warnings:string[]=[];
 const ordered=cleanTerminalBatch({...b,groups:b.groups.map(g=>({...g,members:['b','a']}))},s.initial.characters,context,c=>warnings.push(c));expect(ordered.report?.issues).toHaveLength(0);expect(warnings).not.toContain('STATE_TERMINAL_GROUP_METADATA_RETAINED');
 const result=cleanTerminalBatch({...b,groups:b.groups.map((g,i)=>({...g,ownerId:'player',topic:i?'':'集合',messages:[...g.messages,{id:'player',text:'冒充'}]}))},s.initial.characters,context,()=>{});
 expect(result.report?.issues.some(i=>i.reason==='群话题缺失')).toBe(true);expect(result.report?.issues.some(i=>i.category==='groupMessages'&&i.count===1)).toBe(true);
 s.turns.push({id:'t2',input:'继续',selected:0,variants:[{id:'v2',text:'继续',status:'complete',createdAt:'now',outcome:{event:'继续',terminal:result}}]});applyTerminalBatch(s,result,1);const report=s.turns[1].variants[0].outcome!.terminal!.report!;expect(report.applied).toEqual({groupMessages:1,privateMessages:1,duplicates:0,ignored:0});expect(terminalSyncSummary([],report)).toContain('实际新增1条群消息、1条私聊');
 expect(parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0].turns[1].variants[0].outcome!.terminal!.report).toEqual(report);
 expect(()=>cleanSyncReport({...report,issues:[{...report.issues[0],path:'private full text'}]})).toThrow();
 expect(terminalSyncSummary(['STATE_TERMINAL_PRIVATE_SKIPPED'])).toContain('具体处理数量未记录');
});
