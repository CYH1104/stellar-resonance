import {it,expect} from 'vitest';
import {newSession,defaults,backup,parseBackup,copy,editMessage} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor,terminalOrigin} from '../src/domain/terminalLedger';
import {terminalAutoJobId,terminalAutoStageJob,terminalCommittedFacts,carryTerminalFacts} from '../src/domain/terminalAuto';
import {rollbackTerminalMemories} from '../src/domain/terminalTransaction';
const session=()=>{const s=newSession('isolation',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();s.turns=[{id:'turn',input:'原行动',selected:0,variants:[{id:'v1',text:'第一稿',status:'complete',createdAt:'2026-10-28T00:00:00.000Z'},{id:'v2',text:'第二稿',status:'complete',createdAt:'2026-10-28T00:00:01.000Z'}]}];return s;};
it('reuses a verified legacy terminal-first cache only for its actual action',()=>{
 const s=session(),anchor=terminalAnchor(s,0),id=`auto:turn:terminal-first:${anchor.key}`;
 s.terminal!.jobs=[{id,kind:'messages',target:'auto',anchor,turnId:'turn',variantId:'v1',mode:'terminal-first',status:'ready',facts:'LEGACY_FACT'}];
 s.terminal!.conversations=[{id:'c',title:'测试群',group:true,members:['a'],announcement:'',unread:0,messages:[{id:'m',sender:'a',text:'LEGACY_FACT',at:'2026-10-28T00:00:00.000Z',source:'auto:'+id+':c:0',anchor,origin:terminalOrigin(s,0)}]}];
 expect(terminalAutoStageJob(s,0,'terminal-first')?.id).toBe(id);expect(terminalCommittedFacts(s,0)).toBe('LEGACY_FACT');
 s.turns[0].input='新行动';expect(terminalAutoStageJob(s,0,'terminal-first')).toBeUndefined();expect(terminalCommittedFacts(s,0)).toBe('');
 expect(s.terminal!.conversations[0].messages).toHaveLength(1);
});
it('does not trust an unverifiable legacy ready cache or a stale selected variant',()=>{
 const s=session(),anchor=terminalAnchor(s,0);s.terminal!.jobs=[{id:`auto:turn:terminal-first:${anchor.key}`,kind:'messages',target:'auto',anchor,status:'ready',turnId:'turn',facts:'UNPROVEN'}];
 expect(terminalCommittedFacts(s,0)).toBe('');
 s.terminal!.jobs=[{id:terminalAutoJobId(s,0,'story-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s),status:'ready',turnId:'turn',variantId:'v1',mode:'story-first',facts:'FIRST_ONLY'}];
 s.turns[0].selected=1;expect(terminalCommittedFacts(s,0)).toBe('');
});
it('prefers the selected variant stage when the terminal order changed between prose variants',()=>{
 const s=session();s.terminal!.jobs=[{id:terminalAutoJobId(s,0,'terminal-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s,0),status:'ready',turnId:'turn',variantId:'v1',mode:'terminal-first',facts:'OLDER_PRE_PROSE'}];
 s.turns[0].selected=1;s.terminal!.jobs.push({id:terminalAutoJobId(s,0,'story-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s),status:'ready',turnId:'turn',variantId:'v2',mode:'story-first',facts:'SELECTED_POST_PROSE'});
 expect(terminalCommittedFacts(s,0)).toBe('SELECTED_POST_PROSE');s.turns[0].selected=0;expect(terminalCommittedFacts(s,0)).toBe('OLDER_PRE_PROSE');
});
it('stores continuation context in existing job fields and preserves it through all backup codecs',async()=>{
 const s=session();s.turns[0].selected=1;s.terminal!.jobs=[{id:terminalAutoJobId(s,0,'story-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s),status:'ready',turnId:'turn',variantId:'v2',mode:'story-first',facts:'SECOND_FACT'}];
 s.turns[0].variants.push({...copy(s.turns[0].variants[1]),id:'v3',status:'incomplete'});s.turns[0].selected=2;carryTerminalFacts(s,0,'v2');s.turns[0].variants[2].text+=' 部分续写';
 const value={version:1 as const,sessions:[s],preferences:defaults()},local=parseBackup(backup(value));
 const {createCloudSave,parseCloudSave}=await import('../src/domain/cloudBackup');const cloud=parseCloudSave(createCloudSave(value,defaults())).snapshot;
 expect(local.archive?.terminalTaskVersion).toBe(1);expect(cloud.archive?.terminalTaskVersion).toBe(1);
 for(const restored of [local.sessions[0],cloud.sessions[0]]){expect(terminalCommittedFacts(restored,0)).toBe('SECOND_FACT');expect(restored.terminal!.jobs).toEqual(s.terminal!.jobs);restored.turns[0].input='已改行动';expect(terminalCommittedFacts(restored,0)).toBe('');}
});
it('rejects missing or future task markers before import or export, while legacy jobs remain readable',()=>{
 const s=session();s.terminal!.jobs=[{id:terminalAutoJobId(s,0,'story-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s),status:'ready',turnId:'turn',variantId:'v1',mode:'story-first'}];
 const value=JSON.parse(backup({version:1,sessions:[s],preferences:defaults()}));expect(value.archive.terminalTaskVersion).toBe(1);
 const missing=copy(value);delete missing.archive.terminalTaskVersion;expect(()=>parseBackup(JSON.stringify(missing))).toThrow('兼容标记');
 const future=copy(value);future.archive.terminalTaskVersion=2;expect(()=>parseBackup(JSON.stringify(future))).toThrow();expect(()=>backup(future)).toThrow();
 s.terminal!.jobs![0].id='legacy-stage';expect(parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0].terminal!.jobs![0].id).toBe('legacy-stage');
});
it('a changed preceding branch invalidates the continuation projection without removing history',()=>{
 const s=session();s.terminal!.jobs=[{id:terminalAutoJobId(s,0,'story-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s),status:'ready',turnId:'turn',variantId:'v1',mode:'story-first',facts:'FACT'}];
 s.turns[0].variants.push({...copy(s.turns[0].variants[0]),id:'v3',status:'incomplete'});s.turns[0].selected=2;carryTerminalFacts(s,0,'v1');expect(terminalCommittedFacts(s,0)).toBe('FACT');s.opening='不同开场';expect(terminalCommittedFacts(s,0)).toBe('');expect(s.terminal!.jobs).toHaveLength(2);
});
it('memory rollback preserves independent additions, edits and deletions',()=>{
 const s=session(),note=(id:string,text:string)=>({id,text,kind:'note' as const,createdAt:'2026-10-28T00:00:00.000Z'}),before=[note('a','old'),note('b','old-b')],applied=[note('a','old'),note('b','old-b'),note('derived','terminal result')];
 s.memories=[note('a','user edit'),note('derived','terminal result'),note('independent','user addition')];rollbackTerminalMemories(s,before,applied);
 expect(s.memories).toEqual([note('a','user edit'),note('independent','user addition')]);
});
it('memory rollback restores its own changed note but preserves a later edit to that same note',()=>{
 const s=session(),before=[{id:'derived',text:'previous',kind:'note' as const,createdAt:'2026-10-28T00:00:00.000Z'}],applied=[{...before[0],text:'terminal result'}];
 s.memories=copy(applied);rollbackTerminalMemories(s,before,applied);expect(s.memories).toEqual(before);
 s.memories=[{...applied[0],text:'later user edit'}];rollbackTerminalMemories(s,before,applied);expect(s.memories[0].text).toBe('later user edit');
});
function inheritedSession(){
 const s=session();s.turns[0].selected=1;s.terminal!.jobs=[{id:terminalAutoJobId(s,0,'story-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s),status:'ready',turnId:'turn',variantId:'v2',mode:'story-first',facts:'SECOND_FACT'}];
 s.turns[0].variants.push({...copy(s.turns[0].variants[1]),id:'v3',status:'incomplete'});s.turns[0].selected=2;carryTerminalFacts(s,0,'v2');s.turns[0].variants[2].text+=' 正常追加';s.turns[0].variants[2].status='complete';return s;
}
it('manual prose editing invalidates only that variant continuation context without deleting history',()=>{
 const s=inheritedSession(),original=copy(s.terminal!.jobs![0]);expect(terminalCommittedFacts(s,0)).toBe('SECOND_FACT');
 editMessage(s,0,'assistant','完全改写后的正文');expect(terminalCommittedFacts(s,0)).toBe('');
 expect(s.terminal!.jobs![0]).toEqual(original);expect(s.terminal!.jobs!.find(j=>j.target==='continuation-context')).toMatchObject({status:'failed',facts:'SECOND_FACT'});
 s.turns[0].selected=1;expect(terminalCommittedFacts(s,0)).toBe('SECOND_FACT');
});
it('normal appends and saving identical prose keep the inherited context reusable',()=>{
 const s=inheritedSession();editMessage(s,0,'assistant',s.turns[0].variants[2].text);expect(terminalCommittedFacts(s,0)).toBe('SECOND_FACT');
 s.turns[0].variants[2].text+=' 又一段正常续写';expect(terminalCommittedFacts(s,0)).toBe('SECOND_FACT');
});
it('manual edit invalidation survives local and cloud backup recovery',async()=>{
 const s=inheritedSession();editMessage(s,0,'assistant','已改写的正文');const value={version:1 as const,sessions:[s],preferences:defaults()},local=parseBackup(backup(value));
 const {createCloudSave,parseCloudSave}=await import('../src/domain/cloudBackup');const cloud=parseCloudSave(createCloudSave(value,defaults())).snapshot;
 for(const restored of [local.sessions[0],cloud.sessions[0]]){expect(terminalCommittedFacts(restored,0)).toBe('');expect(restored.terminal!.jobs!.find(j=>j.target==='continuation-context')).toMatchObject({status:'failed',facts:'SECOND_FACT'});}
});
it('editing a continued reply still permits independently confirmed pre-prose facts',()=>{
 const s=inheritedSession();s.terminal!.jobs!.push({id:terminalAutoJobId(s,0,'terminal-first'),kind:'messages',target:'auto',anchor:terminalAnchor(s,0),status:'ready',turnId:'turn',variantId:'v1',mode:'terminal-first',facts:'PRE_PROSE_FACT'});
 editMessage(s,0,'assistant','已改写的正文');expect(terminalCommittedFacts(s,0)).toBe('PRE_PROSE_FACT');
});
