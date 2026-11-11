import {expect,it} from 'vitest';
import {terminalJobNotice} from '../src/domain/terminalJobNotice';
import {terminalAnchor,type TerminalJob} from '../src/domain/terminalLedger';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
function fixture(){
 const s=newSession('提示验收',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.turns=Array.from({length:4},(_,i)=>({id:'t'+i,input:'行动'+i,selected:0,variants:[{id:'v'+i,status:'complete',text:'正文'+i,createdAt:''}]}));
 s.terminal=emptyTerminal();s.terminal.conversations=[{id:'g',title:'群',group:true,members:[],announcement:'',unread:1,messages:[{id:'m',sender:'player',text:'已保存的消息',at:''}]}];
 s.terminal.jobs=s.turns.map((turn,i):TerminalJob=>({id:'job'+i,target:'auto',kind:'messages',turnId:turn.id,variantId:'v'+i,mode:'story-first',anchor:terminalAnchor(s,i+1),status:'failed',error:'失败'+i}));return s;
}
it('several failed rounds have one latest notice; later success clears it while preserving archived failures and messages',()=>{
 const s=fixture();expect(terminalJobNotice(s)?.id).toBe('job3');
 const before=JSON.stringify(s.terminal);terminalJobNotice(s);expect(JSON.stringify(s.terminal)).toBe(before);
 s.terminal!.jobs![3].status='ready';expect(terminalJobNotice(s)).toBeUndefined();expect(s.terminal!.jobs!.filter(j=>j.status==='failed')).toHaveLength(3);expect(s.terminal!.conversations[0].messages[0].text).toBe('已保存的消息');
 const saved=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));expect(terminalJobNotice(saved.sessions[0])).toBeUndefined();expect(saved.sessions[0].terminal!.jobs!.filter(j=>j.status==='failed')).toHaveLength(3);
});
it('an old retry or reordered job list cannot bring old warnings back after a newer turn succeeded',()=>{
 const s=fixture(),jobs=s.terminal!.jobs!;jobs[3].status='ready';jobs.push(jobs.shift()!);expect(terminalJobNotice(s)).toBeUndefined();jobs.at(-1)!.status='running';expect(terminalJobNotice(s)).toBeUndefined();
 jobs.find(j=>j.id==='job3')!.status='failed';expect(terminalJobNotice(s)?.id).toBe('job3');
});
it('terminal-first uses its actual round; dropped turns and switched variants cannot override a current notice',()=>{
 const s=fixture(),jobs=s.terminal!.jobs!;jobs[3]={...jobs[3],mode:'terminal-first',anchor:terminalAnchor(s,3)};jobs[2].status='ready';expect(terminalJobNotice(s)?.id).toBe('job3');jobs[3].status='ready';expect(terminalJobNotice(s)).toBeUndefined();
 jobs.push({...jobs[3],id:'orphan',turnId:'missing',status:'failed'},{...jobs[3],id:'old-variant',variantId:'other',status:'failed'});expect(terminalJobNotice(s)).toBeUndefined();
 s.turns.pop();expect(terminalJobNotice(s)).toBeUndefined();
});
it('legacy jobs without stage metadata still clear when the later legacy round succeeds; same-round stages show only the latest one',()=>{
 const s=fixture();for(const j of s.terminal!.jobs!){delete j.turnId;delete j.variantId;delete j.mode;}s.terminal!.jobs![3].status='ready';expect(terminalJobNotice(s)).toBeUndefined();
 s.terminal!.jobs!.push({...s.terminal!.jobs![3],id:'social',mode:'social-review',status:'failed'});expect(terminalJobNotice(s)?.id).toBe('social');s.terminal!.jobs!.at(-1)!.status='ready';expect(terminalJobNotice(s)).toBeUndefined();
});
