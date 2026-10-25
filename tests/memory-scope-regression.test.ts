import {expect,it,vi} from 'vitest';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {cleanFacts,factAudienceCovers,factId,factLabel} from '../src/domain/knowledge';
import {normalizeMemoryResult} from '../src/domain/memories';
import {terminalAnchor,recordTerminalChat,audienceSnapshot,findChatSegment,formatTerminalMemory,formatTerminalSegment,syncTerminalMemoryNotes,terminalSegmentCandidates,terminalPrivateChats,isTerminalMemoryNote,type TerminalAnchor} from '../src/domain/terminalLedger';
import {projectScoped,labelNarratorFacts,derivedFacts,recallScoped} from '../src/memory/recall';
import {hybridRanks} from '../src/memory/hybrid';
import type {Memory,WorldState} from '../src/domain/contracts';

function session(){const s=newSession('范围验收',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.initial.characters=[{id:'a',name:'阿一',present:true},{id:'b',name:'阿二',present:true},{id:'c',name:'阿三',present:true},{id:'d',name:'阿四',present:true}];s.memoryEngine='candidate';return s;}
function eventMemory(s:ReturnType<typeof session>,facts:{text:string;knownBy?:string[]}[]):Memory{
 return {id:'m1',kind:'event',text:'父级全文',createdAt:'now',status:'ready',record:{version:1,participants:['阿一','阿二'],time:'第1轮',location:'后山',userActions:['玩家行动'],charActions:[{name:'阿一',actions:['阿一的私人行动']}],gains:[],losses:[],commitments:[{id:'cm1',participants:['阿一','阿二'],content:'约定内容',deadline:'未明确',status:'open'}],affinityChanges:[],stateChanges:[],facts}};
}
const vec=(n:number)=>Array.from({length:n},(_,i)=>i+1);

it('A: scoped fact projection carries a matching stored vector and drops stale or foreign-model ones',()=>{
 const s=session(),m=eventMemory(s,[{text:'夜袭计划定在凌晨三点的后山',knownBy:['a','b']}]);
 m.factVectors=[{id:factId('m1',0),text:'夜袭计划定在凌晨三点的后山',model:'mdl',values:vec(4)},{id:factId('m1',1),text:'过期文本',model:'mdl',values:vec(4)},{id:factId('m1',2),text:'夜袭计划定在凌晨三点的后山',model:'旧模型',values:vec(4)}];
 const scoped=projectScoped([m],['a'],undefined,undefined,'mdl');
 expect(scoped).toHaveLength(1);
 expect(scoped[0].id).toBe(factId('m1',0));
 expect(scoped[0].text).toBe('夜袭计划定在凌晨三点的后山');
 expect(scoped[0].vector).toEqual({model:'mdl',values:vec(4),text:'夜袭计划定在凌晨三点的后山'});
 // foreign model or changed text never borrows another entry's vector
 const stale=projectScoped([m],['a'],undefined,undefined,'新模型');
 expect(stale[0].vector).toBeUndefined();
});

it('A: semantic-only synonyms hit a scoped fact by vector while the parent prose stays excluded',()=>{
 const m=eventMemory(session(),[{text:'夜袭定在凌晨三点的后山',knownBy:['a','b']}]);
 m.factVectors=[{id:factId('m1',0),text:'夜袭定在凌晨三点的后山',model:'mdl',values:vec(8)}];
 const projected=projectScoped([m],['a'],undefined,undefined,'mdl');
 const query='今晚深夜的行动时刻和集合位置';// no shared words with the fact text
 const ranked=hybridRanks(projected.map(x=>({id:x.id,text:x.text,vector:x.vector?.values})),query,vec(8));
 expect(ranked).toContain(factId('m1',0));
 // without the stored vector the same query must fail (no lexical overlap, no recency fallback)
 const bare=projectScoped([eventMemory(session(),[{text:'夜袭定在凌晨三点的后山',knownBy:['a','b']}])],['a']);
 expect(hybridRanks(bare.map(x=>({id:x.id,text:x.text,vector:x.vector?.values})),query,vec(8))).toEqual([]);
 // dimension canary: mismatched vector length is ignored
 expect(hybridRanks(projected.map(x=>({id:x.id,text:x.text,vector:x.vector?.values})),query,vec(7))).toEqual([]);
});

it('B: membership changes segment history instead of intersecting it away',()=>{
 const s=session(),t=s.terminal=emptyTerminal(),a=terminalAnchor(s),conv={id:'g1',title:'群',group:true};
 recordTerminalChat(t,a,conv,['阿一','阿二','阿三'],'群发X',[],audienceSnapshot(['a','b','c']));
 recordTerminalChat(t,a,conv,['阿二','阿三'],'B/C发Y',[],audienceSnapshot(['b','c']));
 recordTerminalChat(t,a,conv,['阿二','阿三','阿四'],'D加入后发Z',[],audienceSnapshot(['b','c','d']));
 const b=t.memories![0];
 // three segments, each keeping its own snapshot and topics
 expect(b.chats).toHaveLength(3);
 expect(b.chats.map(c=>c.knownBy)).toEqual([['player','a','b','c'],['player','b','c'],['player','b','c','d']]);
 expect(b.chats[0].topics).toContain('群发X');
 expect(b.chats[2].topics).toContain('D加入后发Z');
 // A can recall X, not Y/Z; C all three; D only Z
 const seen=(audience:string[])=>b.chats.filter(c=>factAudienceCovers(c.knownBy,audience)).flatMap(c=>c.topics).join('|');
 expect(seen(['player','a'])).toBe('群发X');
 expect(seen(['player','c'])).toBe('群发X|B/C发Y|D加入后发Z');
 expect(seen(['player','d'])).toBe('D加入后发Z');
 // unknown legacy range is never guessed open
 expect(seen(['player','e'])).toBe('');
 // private-chat legacy entries adopt their deterministic snapshot
 recordTerminalChat(t,a,{id:'p1',title:'阿一',group:false},['玩家'],'私聊话',[],['player','a']);
 expect(b.chats.find(c=>c.conversationId==='p1')!.knownBy).toEqual(['player','a']);
});

it('B: prior topic lookup follows the current membership snapshot only',()=>{
 const s=session(),t=s.terminal=emptyTerminal(),a=terminalAnchor(s),conv={id:'g1',title:'群',group:true};
 recordTerminalChat(t,a,conv,['阿一','阿二'],'旧话题',[],audienceSnapshot(['a','b']));
 recordTerminalChat(t,a,conv,['阿二','阿三'],'新话题',[],audienceSnapshot(['b','c']));
 expect(findChatSegment(t,a,'g1',['b','c'])?.summary).toBe('新话题');
 expect(findChatSegment(t,a,'g1',['a','b'])?.summary).toBe('旧话题');
 expect(formatTerminalMemory(t.memories![0])).toContain('（知情：player、a、b）');
});

it('C: stable ids win, unique names resolve, same-name ambiguity degrades to unknown with a diagnostic',()=>{
 const s=session(),before=JSON.parse(JSON.stringify(s.initial)) as WorldState,after=JSON.parse(JSON.stringify(s.initial)) as WorldState;
 after.characters=after.characters.map(c=>c.id==='a'?{...c,affinity:c.affinity===undefined?5:c.affinity+5}:c);
 const request={turnId:'t1',variantId:'v1',input:'输入',story:'正文',before,after,priorCommitments:[]};
 const diagnostics:string[]=[];
 const result=normalizeMemoryResult({participants:['阿一'],time:'第1轮',location:'后山',userActions:['玩家行动'],charActions:[{name:'阿一',actions:['行动']}],gains:[],losses:[],commitments:[],affinityChanges:[{id:'a',reason:'互动'}],stateChanges:[],facts:[
  {text:'稳定ID直接接受',knownBy:['a']},
  {text:'唯一姓名解析',knownBy:['阿三']},
  {text:'同名无法确定',knownBy:['同名者']},
 ]},request,diagnostics);
 expect(result.facts![0].knownBy).toEqual(['a']);
 expect(result.facts![1].knownBy).toEqual(['c']);
 expect(result.facts![2].knownBy).toBeUndefined();// unknown, never the last duplicate
 expect(diagnostics.some(d=>d.includes('同名者'))).toBe(true);
});

it('C: cleanFacts rejects invalid, non-string and duplicate audience ids instead of relaxing them',()=>{
 expect(()=>cleanFacts([{text:'x',knownBy:['a','a']}])).toThrow('重复');
 expect(()=>cleanFacts([{text:'x',knownBy:[42]}])).toThrow('知情范围');
 expect(()=>cleanFacts([{text:'x',knownBy:['   ']}])).toThrow('知情范围');
 expect(cleanFacts([{text:'x',knownBy:['a','b']}])).toEqual([{text:'x',knownBy:['a','b']}]);
});

it('D: narrator hits label their fact audience and unknown facts never reach scoped requests',()=>{
 const s=session(),m=eventMemory(s,[{text:'耳语内容只有阿一听见',knownBy:['a']},{text:'没人知道来源',knownBy:[]}]);
 m.factVectors=[];
 const narrator=projectScoped([m],[]);
 expect(narrator.some(x=>x.id===factId('m1',0))).toBe(true);
 const labeled=labelNarratorFacts(narrator,[m]);
 expect(labeled.find(x=>x.id===factId('m1',0))!.text).toContain('（知情：a）');
 expect(labeled.find(x=>x.id===factId('m1',1))!.text).toContain('（知情：未知）');
 const scoped=projectScoped([m],['b']);
 expect(scoped).toEqual([]);// 阿二 gets nothing, not even the unknown fact
 expect(projectScoped([m],['a']).map(x=>x.text)).toEqual(['耳语内容只有阿一听见']);
});

it('E: legacy archives derive charAction and commitment candidates for uniquely resolvable ids only',()=>{
 const s=session(),m=eventMemory(s,[]);
 delete m.record!.facts;
 const resolve=(name:string)=>({阿一:'a',阿二:'b'}[name]??(name==='阿四'?'d':undefined));
 const derived=derivedFacts(m,resolve);
 expect(derived.map(d=>d.id).sort()).toEqual([factId('m1','legacy-ca-0'),factId('m1','legacy-cm-0')].sort());
 const ca=derived.find(d=>d.id===factId('m1','legacy-ca-0'))!;
 expect(ca).toEqual({id:factId('m1','legacy-ca-0'),text:'阿一的行动：阿一的私人行动',knownBy:['a']});
 const cm=derived.find(d=>d.id===factId('m1','legacy-cm-0'))!;
 expect(cm.knownBy).toEqual(['a','b']);
 // ambiguous name contributes nothing; scoped audience outside the action stays empty
 expect(derivedFacts(m,name=>undefined)).toEqual([]);
 expect(projectScoped([m],['c'],undefined,resolve)).toEqual([]);
 expect(projectScoped([m],['a'],undefined,resolve).map(x=>x.id)).toContain(factId('m1','legacy-ca-0'));
});

it('F: factVectors, segment ids and conversation ids roundtrip through the full backup',()=>{
 const s=session(),t=s.terminal=emptyTerminal(),a=terminalAnchor(s);
 recordTerminalChat(t,a,{id:'g1',title:'群',group:true},['阿一'],'话题',[],audienceSnapshot(['a']));
 const m=eventMemory(s,[{text:'事实',knownBy:['a']}]);
 m.factVectors=[{id:factId('m1',0),text:'事实',model:'mdl',values:vec(3)}];
 s.memories.push(m);
 const saved=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
 expect(saved.memories.find(x=>x.id==='m1')!.factVectors).toEqual(m.factVectors);
 expect(saved.terminal!.memories![0].chats[0].conversationId).toBe('g1');
 expect(saved.terminal!.memories![0].chats[0].knownBy).toEqual(['player','a']);
 // broken fact vectors are rejected before any data is written
 const bad=JSON.parse(backup({version:1,sessions:[s],preferences:defaults()}) as string);
 bad.sessions[0].memories[0].factVectors.push({id:'x',text:'t',model:'m',values:['NaN']});
 expect(()=>parseBackup(JSON.stringify(bad))).toThrow('分段向量');
 expect(formatTerminalSegment(t.memories![0].chats[0])).toContain('话题');
});

it('G: shared events recorded as facts reach co-witnesses but not outsiders; private facts coexist',()=>{
 const s=session();
 const m=eventMemory(s,[
  {text:'三人一起在钟楼放飞了灯笼',knownBy:['a','c']},
  {text:'阿一把家传玉佩交给了阿二保管',knownBy:['a']},
 ]);
 // (a) co-witness private chats recall the shared event; the outsider does not
 expect(projectScoped([m],['player','a']).map(x=>x.text)).toContain('三人一起在钟楼放飞了灯笼');
 expect(projectScoped([m],['player','c']).map(x=>x.text)).toContain('三人一起在钟楼放飞了灯笼');
 expect(projectScoped([m],['player','b'])).toEqual([]);
 // (b) the private fact coexists: A's chat carries both, C's only the shared one
 expect(projectScoped([m],['player','a']).map(x=>x.text)).toContain('阿一把家传玉佩交给了阿二保管');
 expect(projectScoped([m],['player','c']).map(x=>x.text)).not.toContain('阿一把家传玉佩交给了阿二保管');
});

it('H: legacy self-actions and open commitments stay derivable beside facts, and facts do not publicize them',()=>{
 const res=(n:string)=>({阿一:'a',阿二:'b'}[n]);
 // (c) no-facts record: A's own action reaches A's chat, not B's; the a/b commitment reaches both
 const legacy=eventMemory(session(),[]);delete legacy.record!.facts;
 expect(projectScoped([legacy],['player','a'],undefined,res).map(x=>x.text)).toContain('阿一的行动：阿一的私人行动');
 const bTexts=projectScoped([legacy],['player','b'],undefined,res).map(x=>x.text);
 expect(bTexts).not.toContain('阿一的行动：阿一的私人行动');
 expect(bTexts).toContain('约定（阿一、阿二）：约定内容；期限：未明确');
 // an uncovered self action is still derived when facts exist
 const withFacts=eventMemory(session(),[{text:'三人一起在钟楼放飞了灯笼',knownBy:['a','b','c']}]);
 expect(projectScoped([withFacts],['player','a'],undefined,res).map(x=>x.text)).toContain('阿一的行动：阿一的私人行动');
 // a commitment quoted verbatim by a fact is not derived twice
 const content='两人在钟楼顶交换信物约定来年再会';
 const m=eventMemory(session(),[{text:content,knownBy:['a','b']}]);
 m.record!.commitments=[{id:'cm1',participants:['阿一','阿二'],content,deadline:'未明确',status:'open'}];
 expect(projectScoped([m],['player','a','b'],undefined,res).filter(x=>x.id.includes('legacy-cm'))).toEqual([]);
 // (d) group: a fact all members know is talkable in the group; an A-only fact is not
 const g=eventMemory(session(),[{text:'全组都知道的集合时间',knownBy:['a','b','c']},{text:'只有阿一知道的小道消息',knownBy:['a']}]);
 expect(projectScoped([g],['player','a','c']).map(x=>x.text)).toContain('全组都知道的集合时间');
 expect(projectScoped([g],['player','a','c']).map(x=>x.text)).not.toContain('只有阿一知道的小道消息');
 expect(projectScoped([g],['player','a','b','c']).map(x=>x.text)).not.toContain('只有阿一知道的小道消息');
});

it('I: audience entries are typed before mapping; real same-name rosters stay ambiguous with diagnostics',()=>{
 const s=session(),before=JSON.parse(JSON.stringify(s.initial)) as WorldState,after=JSON.parse(JSON.stringify(s.initial)) as WorldState;
 after.characters=[...after.characters,{id:'x1',name:'同名者',present:true},{id:'x2',name:'同名者',present:true}];
 const request={turnId:'t1',variantId:'v1',input:'输入',story:'正文',before,after,priorCommitments:[]};
 const diagnostics:string[]=[];
 const result=normalizeMemoryResult({participants:['阿一'],time:'第1轮',location:'后山',userActions:['玩家行动'],charActions:[{name:'阿一',actions:['行动']}],gains:[],losses:[],commitments:[],affinityChanges:[],stateChanges:[],facts:[
  {text:'稳定ID直接接受',knownBy:['a']},
  {text:'唯一姓名解析',knownBy:['阿三']},
  {text:'同名歧义保守丢弃',knownBy:['同名者']},
  {text:'非法数字类型',knownBy:[42]},
  {text:'空白条目',knownBy:['  ']},
  {text:'同义映射后允许去重',knownBy:['阿一','a','阿一']},
 ]},request,diagnostics);
 const f=result.facts!;
 expect(f[0].knownBy).toEqual(['a']);
 expect(f[1].knownBy).toEqual(['c']);
 expect(f[2].knownBy).toBeUndefined();
 expect(f[3].knownBy).toBeUndefined();// 42 never becomes the id "42"
 expect(f[4].knownBy).toBeUndefined();
 expect(f[5].knownBy).toEqual(['a']);// synonym name and stable id merge to one entry
 expect(diagnostics.some(d=>d.includes('同名者')&&d.includes('无法识别'))).toBe(true);
 expect(diagnostics.some(d=>d.includes('类型不正确')&&d.includes('42'))).toBe(true);
 expect(diagnostics.some(d=>d.includes('为空'))).toBe(true);
});

it('J: scoped recall embeds the query at most once regardless of candidate count',async()=>{
 const m=eventMemory(session(),[{text:'夜袭定在凌晨三点的后山',knownBy:['a','b']}]);
 const embed=vi.fn(async()=>vec(8));
 await recallScoped({items:[m,m],query:'今晚深夜的行动时刻和集合位置',audience:['player','a'],model:'mdl',embed});
 expect(embed).toHaveBeenCalledTimes(1);
});

it('K: old private canary stays narrator-recallable via its own labeled segment candidate, outside the recent window and other audiences',()=>{
 const s=session(),t=s.terminal=emptyTerminal(),a=terminalAnchor(s);
 // (a) a far-past private canary (player + 阿一) and unrelated group activity share one bucket
 recordTerminalChat(t,a,{id:'canary',title:'阿一',group:false},['玩家','阿一'],'远期canary：青铜罗盘藏在天文台地下室',[],['player','a']);
 recordTerminalChat(t,a,{id:'g1',title:'群',group:true},['阿二'],'群聊公开话题',[],audienceSnapshot(['b','c']));
 // (b) a pure-private bucket keeps its own sibling note
 const alt:TerminalAnchor={...a,key:a.key+'#alt'};
 recordTerminalChat(t,alt,{id:'p2',title:'阿二',group:false},['玩家','阿二'],'纯私聊bucket：星核水晶在钟楼夹层',[],['player','b']);
 syncTerminalMemoryNotes(s);
 const notes=s.memories.filter(isTerminalMemoryNote);
 expect(notes.some(m=>m.id==='terminal:'+a.key&&!m.text.includes('canary'))).toBe(true);// public aggregate stays private-free
 expect(notes.some(m=>m.id==='terminal:'+a.key+'#private'&&m.text.includes('青铜罗盘'))).toBe(true);
 expect(notes.some(m=>m.id==='terminal:'+alt.key+'#private'&&m.text.includes('星核水晶'))).toBe(true);
 expect(notes.filter(m=>m.id==='terminal:'+alt.key&&!m.id.endsWith('#private'))).toEqual([]);// pure-private bucket has no public note
 // (c) narrator candidates include the private segment; a stored vector makes a
 // semantic-only query hit it, and the label is attached after the hit
 const model='mdl';
 const privateNote=notes.find(m=>m.id==='terminal:'+a.key+'#private')!;
 const canaryEntry=t.memories![0].chats.find(c=>c.conversationId==='canary')!;
 const canaryText=formatTerminalSegment(canaryEntry);
 privateNote.factVectors=[{id:privateNote.id+'#seg:'+canaryEntry.id,text:canaryText,model,values:vec(8)}];
 const candidates=(audience:string[])=>notes.flatMap(m=>terminalSegmentCandidates(s,m,audience,model));
 const narrator=candidates([]);
 expect(narrator.map(x=>x.text)).toContain(canaryText);
 const query='那件深藏地下室的信物到底是什么';// no lexical overlap with the canary text
 const ranked=hybridRanks(narrator.map(x=>({id:x.id,text:x.text,vector:x.vector?.values})),query,vec(8));
 expect(ranked).toContain(privateNote.id+'#seg:'+canaryEntry.id);
 const labeled=labelNarratorFacts(narrator,notes,hit=>{
  const at=hit.id.indexOf('#seg:');if(at<0)return undefined;
  const note=notes.find(x=>x.id===hit.id.slice(0,at));if(!note)return undefined;
  const bucket=t.memories!.find(b=>b.anchor.key===note.terminalKey);if(!bucket)return undefined;
  const entry=[...bucket.chats,...bucket.games].find(e=>e.id===hit.id.slice(at+5));
  return entry?factLabel(entry.knownBy):undefined;
 });
 expect(labeled.find(x=>x.id===privateNote.id+'#seg:'+canaryEntry.id)!.text).toContain('（知情：player、a）');
 // (d) scoped isolation: 阿二's chat gets neither canary nor the pure-private bucket; 阿一's does
 expect(candidates(['player','c']).map(x=>x.text)).not.toContain(canaryText);
 expect(candidates(['player','d'])).toEqual([]);
 expect(candidates(['player','a']).map(x=>x.text)).toContain(canaryText);
 // (e) earlierPrivateTopic follows conversationId, including hash-suffixed snapshot ids
 t.conversations=[{id:'canary',title:'阿一',group:false,members:['a'],announcement:'',unread:0,origin:'manual' as const,joined:true,messages:[{id:'cm',sender:'player',text:'最近一句。',at:'2026-01-01T00:00:00.000Z'}]}];
 expect(terminalPrivateChats(s)[0].earlierTopic?.text).toContain('青铜罗盘');
 expect(terminalPrivateChats(s)[0].earlierTopic?.source).toMatch(/^terminal\.memories\//);
});

it('M: 纯私聊bucket首次同步出的#private新note完整备份往返一致且再同步幂等',()=>{
 const s=session(),t=s.terminal=emptyTerminal(),a=terminalAnchor(s);
 // 旧存档状态：只有纯私聊记录，没有任何派生 note
 recordTerminalChat(t,a,{id:'p1',title:'阿一',group:false},['玩家','阿一'],'纯私聊：星核水晶在钟楼夹层',[],['player','a']);
 expect(s.memories.filter(isTerminalMemoryNote)).toEqual([]);
 syncTerminalMemoryNotes(s);
 const note=s.memories.find(m=>m.id==='terminal:'+a.key+'#private')!;
 expect(note.text).toContain('星核水晶');
 expect(note.terminalKey).toBe(a.key);
 // 纯私聊bucket没有公开聚合note
 expect(s.memories.some(m=>m.id==='terminal:'+a.key&&!m.id.endsWith('#private'))).toBe(false);
 // knownBy 原样保留（unknown 也保留未知）
 expect(t.memories![0].chats[0].knownBy).toEqual(['player','a']);
 // 完整备份往返
 const saved=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
 const back=saved.memories.find(m=>m.id===note.id)!;
 expect(back.text).toBe(note.text);
 expect(back.terminalKey).toBe(a.key);
 // 再同步幂等：文本未变时不清除已建立的向量
 back.vector={model:'mdl',values:[1,2,3],text:back.text};
 syncTerminalMemoryNotes(saved);
 expect(saved.memories.find(m=>m.id===note.id)!.vector).toEqual({model:'mdl',values:[1,2,3],text:back.text});
});

it('L: derived actions are judged per action; one covered action never hides the others and short facts match nothing',()=>{
 const res=(n:string)=>({阿一:'a',阿二:'b'}[n]);
 const m=eventMemory(session(),[{text:'阿一把家传玉佩交给了阿二保管',knownBy:['a','b']}]);
 m.record!.charActions=[{name:'阿一',actions:['阿一把家传玉佩交给了阿二保管','阿一偷偷写了一张字条压在钟楼第三块砖下']}];
 expect(derivedFacts(m,res).filter(d=>d.id.includes('legacy-ca')).map(d=>d.text)).toEqual(['阿一的行动：阿一偷偷写了一张字条压在钟楼第三块砖下']);
 // a one-character fact must not swallow a long action by substring accident
 const short=eventMemory(session(),[{text:'藏',knownBy:['a']}]);
 short.record!.charActions=[{name:'阿一',actions:['阿一偷偷把字条藏在了钟楼第三块砖下']}];
 expect(derivedFacts(short,res).filter(d=>d.id.includes('legacy-ca')).map(d=>d.text)).toEqual(['阿一的行动：阿一偷偷把字条藏在了钟楼第三块砖下']);
 // the uncovered action stays recallable in A's scoped request, absent from B's
 expect(projectScoped([m],['player','a'],undefined,res).map(x=>x.text)).toContain('阿一的行动：阿一偷偷写了一张字条压在钟楼第三块砖下');
 expect(projectScoped([m],['player','b'],undefined,res).map(x=>x.text)).not.toContain('阿一的行动');
});
