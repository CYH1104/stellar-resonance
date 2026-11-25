import {afterEach,expect,it,vi} from 'vitest';
import {createSSRApp,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {planTerminalAuto,terminalAutoJobId,terminalCommittedFacts} from '../src/domain/terminalAuto';
import {terminalStoryExcerpt,terminalStoryFacts} from '../src/domain/terminalStoryContext';
import {terminalMainContext,cleanTerminalMainContext} from '../src/domain/terminalMain';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import {terminalAnchor,terminalBucket} from '../src/domain/terminalLedger';
import type {Memory} from '../src/domain/contracts';
import type {ViewModel} from '../src/app/useWorkspace';

function fixture(){
 const s=newSession('正文记忆',{name:'玩家',appearance:'',personality:'',background:''},'开场');
 s.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
 s.turns.push({id:'t1',input:'之前行动',selected:0,variants:[{id:'v1',text:'NARRATOR_SECRET',status:'complete',outcome:{event:'事件'},createdAt:'now'}]});
 s.terminal=emptyTerminal();
 return s;
}
function memory(id:string,facts:{text:string;knownBy?:string[]}[],sourceTurn='t1',sourceVariant='v1'):Memory{
 return {id,kind:'event',status:'ready',text:'不应直接发送的完整记忆',createdAt:'now',sourceTurn,sourceVariant,record:{version:1,participants:['甲'],time:'午后',location:'教室',userActions:['见面'],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[],stateChanges:[],facts}};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('edited terminal-first stage ids and facts roundtrip without reusing another action or duplicating a retry',()=>{
 const s=fixture(),old=planTerminalAuto(s,0,'terminal-first')!;
 const first=s.terminal!.jobs!.find(j=>j.id===old.plan.jobId)!;first.status='ready';first.facts='原行动事实';
 expect(terminalAutoJobId(JSON.parse(JSON.stringify(s)),0,'terminal-first')).toBe(first.id);
 s.turns[0].inputEdited=true;s.turns[0].input='改变后的行动';
 expect(terminalCommittedFacts(s,0)).toBe('');const next=planTerminalAuto(s,0,'terminal-first')!;
 expect(next.plan.jobId).not.toBe(first.id);const current=s.terminal!.jobs!.find(j=>j.id===next.plan.jobId)!;current.status='ready';current.facts='新行动事实';
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
 expect(terminalAutoJobId(restored,0,'terminal-first')).toBe(next.plan.jobId);expect(terminalCommittedFacts(restored,0)).toBe('新行动事实');expect(planTerminalAuto(restored,0,'terminal-first')).toBeUndefined();
});

it('recent story facts survive generic input without exposing another actor, unknown scope or a discarded branch',()=>{
 const s=fixture();
 s.memories=[memory('old',[{text:'旧事实',knownBy:['a','b']}]),memory('scope',[{text:'甲的私事',knownBy:['a']},{text:'共同约定',knownBy:['a','b']},{text:'未知秘密'}]),memory('other',[{text:'废弃分支秘密',knownBy:['a']}],'t1','discarded')];
 expect(terminalStoryFacts(s,1,['player','a']).map(f=>f.text)).toContain('甲的私事');
 const group=JSON.stringify(terminalStoryFacts(s,1,['player','a','b']));
 expect(group).toContain('共同约定');expect(group).not.toContain('甲的私事');expect(group).not.toContain('未知秘密');expect(group).not.toContain('废弃分支秘密');expect(group).not.toContain('NARRATOR_SECRET');
 expect(terminalStoryFacts(s,0,['player','a'])).toEqual([]);
 s.memories[0].status='pending';expect(terminalStoryFacts(s,1,['player','b']).some(f=>f.text==='旧事实')).toBe(false);
});

it('terminal memory budget prioritizes newest committed turns even when older summaries finish later',()=>{
 const s=fixture();s.turns.push({id:'t2',input:'新行动',selected:0,variants:[{id:'v2',text:'新正文',status:'complete',createdAt:'now'}]});
 s.memories=[memory('new',[{text:'最新约定',knownBy:['a']}],'t2','v2'),memory('old',Array.from({length:10},(_,i)=>({text:'旧事实'+i,knownBy:['a']})))];
 const facts=terminalMainContext(s).memories!;expect(facts[0].text).toBe('最新约定');expect(facts.length).toBeLessThanOrEqual(8);
 expect(()=>cleanTerminalMainContext(terminalMainContext(s),s.initial.characters)).not.toThrow();
});

it('long confirmed prose retains its ending and never includes an unfinished future turn',()=>{
 const s=fixture();s.turns[0].variants[0].text='开始'+ '中'.repeat(20000)+'结尾的重要新约定';
 s.turns.push({id:'t2',input:'未确认',selected:0,variants:[{id:'v2',text:'FUTURE_SECRET',status:'incomplete',createdAt:'now'}]});
 const history=terminalMainContext(s).history!;expect(history.at(-1)!.content).toContain('结尾的重要新约定');expect(history.at(-1)!.content.length).toBeLessThanOrEqual(2400);expect(JSON.stringify(history)).not.toContain('FUTURE_SECRET');
 expect(terminalStoryExcerpt(s.turns[0].variants[0].text,16000)).toContain('结尾的重要新约定');
});

for(const fails of [false,true])it(`real private chat sends recent scoped story facts when retrieval ${fails?'fails':'returns no match'}`,async()=>{
 const s=fixture();s.memories=[memory('recent',[{text:'甲已经答应明天带书',knownBy:['a']},{text:'乙的秘密',knownBy:['b']}])];
 s.terminal!.conversations=[{id:'p1',title:'甲',group:false,members:['a'],messages:[],announcement:'',unread:0,joined:true}];
 const preferences=defaults();preferences.terminalProfile=preferences.profiles[0].id;
 s.initial.variables||={};s.initial.variables.时间地点={日期:'星历578年09月01日',时间:'14:20',地点:'宿舍'};
 const b=terminalBucket(s.terminal!,terminalAnchor(s));
 b.games.push({id:'table:1',kind:'landlord',name:'午后牌局',round:1,king:'甲',command:'农民胜，玩家 +2分，甲 -4分',penalties:'',complete:true,knownBy:['player','a']});
 b.games.push({id:'secret:1',kind:'mahjong',name:'乙的私局',round:1,king:'乙',command:'乙自摸的私密结果',penalties:'',complete:true,knownBy:['player','b']});
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_path,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json({messages:[{id:'a',text:'记得，我们约好了。'}],topic:'带书'});}));
 const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,workingMemory:true,terminalBusy:false,terminalEpoch:0,storageStatus:'saved',theaters:[],save:async()=>{},connectionReady:()=>true,scopedRecall:vi.fn(async()=>{if(fails)throw Error('模拟检索超时');return [];}),indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 u.conversationId.value='p1';u.draft.value='继续';await u.sendChat();
 const sent=calls.find(c=>c.task==='chat');expect(sent.context.memories).toContain('甲已经答应明天带书');expect(JSON.stringify(sent.context.memories)).toContain('农民胜');expect(JSON.stringify(sent.context.memories)).toContain('14:20');expect(JSON.stringify(sent.context.memories)).toContain('578年09月01日');expect(JSON.stringify(sent)).not.toContain('乙自摸的私密结果');expect(JSON.stringify(sent)).not.toContain('乙的秘密');expect(JSON.stringify(sent)).not.toContain('NARRATOR_SECRET');expect(u.error.value).toBe('');expect(u.working.value).toBe(false);
});

it('a session switch while recall is slow prevents sending the late request and releases the task',async()=>{
 const s=fixture();s.terminal!.conversations=[{id:'p1',title:'甲',group:false,members:['a'],messages:[],announcement:'',unread:0,joined:true}];
 let release!:(v:Memory[])=>void;const deferred=new Promise<Memory[]>(r=>release=r),recall=vi.fn(()=>deferred),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const preferences=defaults();preferences.terminalProfile=preferences.profiles[0].id;
 const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,workingMemory:true,terminalBusy:false,terminalEpoch:0,storageStatus:'saved',theaters:[],save:async()=>{},connectionReady:()=>true,scopedRecall:recall,indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 u.conversationId.value='p1';u.draft.value='继续';const running=u.sendChat();await vi.waitFor(()=>expect(recall).toHaveBeenCalled());
 (w as any).active=fixture();release([]);await running;
 expect(fetcher).not.toHaveBeenCalled();expect(u.working.value).toBe(false);expect(w.terminalBusy).toBe(false);expect(s.terminal!.conversations[0].messages.filter(m=>m.sender==='a')).toHaveLength(0);
});
