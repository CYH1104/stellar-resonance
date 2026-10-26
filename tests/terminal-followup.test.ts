import {it,expect} from 'vitest';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalMainContext,applyTerminalBatch} from '../src/domain/terminalMain';
import {prepareTerminalFollowup,applyTerminalFollowup} from '../src/domain/terminalFollowup';
function fixture(){const s=newSession('补齐',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.initial.characters=[{id:'a',name:'甲',present:true}];s.terminal=emptyTerminal();s.terminal.groupsReady=true;for(const id of ['g1','g2'])s.terminal.conversations.push({id,title:id,members:['a'],group:true,ownerId:'a',adminIds:[],announcement:'',messages:[],unread:0,origin:'default',joined:true,managementReady:true});const ctx=terminalMainContext(s);s.turns.push({id:'t1',input:'本轮行动',selected:0,variants:[{id:'v1',text:'正文保持不变。',status:'complete',createdAt:'now',outcome:{event:'结束'}}]});return {s,ctx};}
it('repairs only missing group slots, preserves legitimate repeated text, and counts actual inserts per group',()=>{
 const {s,ctx}=fixture(),batch={protocolVersion:2 as const,groups:ctx.groups.map(g=>({...g,messages:Array.from({length:3},()=>({id:'a',text:'合法的重复话语'})),topic:'话题'})),privateMessages:[],friendRequests:[]};s.turns[0].variants[0].outcome!.terminal=batch;applyTerminalBatch(s,batch,0);const job=prepareTerminalFollowup(s,0,ctx)!;expect(job.repair!.groups.map(g=>g.slots)).toEqual([[3],[3]]);job.repair!.autoAttempted=true;
 const raw={protocolVersion:2 as const,groups:ctx.groups.map(g=>({...g,messages:[{id:'a',text:'合法的重复话语'}],topic:'补齐'})),privateMessages:[],friendRequests:[]};
 expect(applyTerminalFollowup(s,0,job.id,raw)).toMatchObject({added:2,status:'ready'});expect(s.terminal!.conversations.map(c=>c.messages.length)).toEqual([4,4]);expect(applyTerminalFollowup(s,0,job.id,raw).added).toBe(0);expect(s.turns[0].variants[0].text).toBe('正文保持不变。');expect(s.turns[0].variants[0].outcome!.terminal!.report!.perGroup!.map(g=>g.messages)).toEqual([4,4]);
 expect(parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0].terminal!.jobs!.find(j=>j.id===job.id)!.repair!.autoAttempted).toBe(true);
});
it('retains successfully inserted groups on partial follow-up and refuses late responses after a branch change',()=>{
 const {s,ctx}=fixture(),job=prepareTerminalFollowup(s,0,ctx)!;
 const raw={protocolVersion:2 as const,groups:[{...ctx.groups[0],messages:Array.from({length:4},(_,i)=>({id:'a',text:'新增'+i})),topic:'补齐'}],privateMessages:[],friendRequests:[]};
 expect(applyTerminalFollowup(s,0,job.id,raw).status).toBe('failed');expect(s.terminal!.conversations.map(c=>c.messages.length)).toEqual([4,0]);const pending=prepareTerminalFollowup(s,0,ctx)!;expect(pending.repair!.groups.map(g=>g.id)).toEqual(['g2']);
 s.turns[0].variants.push({...s.turns[0].variants[0],id:'other'});s.turns[0].selected=1;const before=JSON.stringify(s.terminal);expect(()=>applyTerminalFollowup(s,0,job.id,raw)).toThrow('分支');expect(JSON.stringify(s.terminal)).toBe(before);
});
