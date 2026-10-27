import type {Session,Memory} from './contracts';
import {memoryReady} from './memories.ts';
import type {PersonalTerminal,TerminalMessage} from './personalTerminal';
import {factAudienceCovers,factLabel} from './knowledge.ts';

export interface TerminalAnchor {key:string;turnId:string;variantId:string;path:string[]}
/** Which user action produced a terminal artifact.
 *
 * The anchor is only the knowledge boundary: a terminal-first round is written before the
 * prose of its own turn exists, so it anchors the previously confirmed turn. That anchor
 * stays active after the producing turn is rewound, which used to leave its messages in the
 * current story. The origin binds the artifact to the turn that produced it (id plus a hash
 * of the input it answered), so rewinding, editing that input or dropping the turn hides the
 * round while older records without an origin keep working exactly as before. */
export interface TerminalOrigin {turnId:string;input:string}
export interface TerminalRoundMemory {anchor:TerminalAnchor;chats:{id:string;conversationId?:string;name:string;group:boolean;speakers:string[];summary?:string;topics:string[];changes:string[];knownBy?:string[];origin?:TerminalOrigin}[];games:{id:string;conversationId?:string;name:string;round:number;king:string;command:string;penalties:string;complete:boolean;endedAt?:string;interactions?:string;afterparty?:string;knownBy?:string[];origin?:TerminalOrigin}[]}
/** `turnId`/`variantId`/`mode` are the executed target of the stage. The anchor is only the
 * knowledge boundary (terminal-first anchors the previously confirmed turn), so a retry button
 * must never derive the turn from the anchor. Older jobs omit them and are resolved separately. */
export interface TerminalJob {repair?:import('./terminalFollowup').TerminalFollowupPlan;id:string;anchor:TerminalAnchor;kind:'groups'|'messages'|'schedule';target?:string;status:'running'|'ready'|'failed';error?:string;turnId?:string;variantId?:string;mode?:'story-first'|'terminal-first'|'social-review';/** Committed facts of a finished stage, replayed to a prose retry or reload. */facts?:string}
function hash(s:string){let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return (n>>>0).toString(16);}
/** Stable, short id for one terminal message. `source` still carries the full composite key
 * used for de-duplication; the id is only an opaque handle and must stay far below the
 * 128-character import limit, which a real terminal-first source exceeds. Two independent
 * 32-bit hashes keep collisions negligible for one save. */
export function terminalMessageId(source:string){return 'tm:'+hash(source)+hash(source.length+':'+source);}
/**
 * Per-turn segment hashes are memoised on the variant object. Branch checks run once per
 * terminal message on every render, and hashing the full prose each time made a long
 * save quadratic (200 turns rang up ~29 s for one conversation list render).
 * The cache compares by reference: a streamed or edited variant gets a new string, so the
 * value is recomputed instead of served stale. The result must stay bit-identical to
 * hash(input + '\n' + text) — a changed hash would invalidate every stored anchor, which
 * would hide existing messages and memory notes.
 */
const segmentHashes=new WeakMap<object,{input:string;text:string;value:string}>();
function segmentHash(turn:{input:string},variant:{text?:string}){
 const text=variant.text||'',cached=segmentHashes.get(variant);
 if(cached&&cached.input===turn.input&&cached.text===text)return cached.value;
 const value=hash(turn.input+'\n'+text);
 segmentHashes.set(variant,{input:turn.input,text,value});
 return value;
}
function pathFor(s:Session,before=s.turns.length){return s.turns.slice(0,before).map(t=>{const v=t.variants[t.selected];return t.id+':'+(v?.id||'')+':'+(v?segmentHash(t,v):hash(t.input+'\n'));});}
interface BranchMemo{variant:(object|undefined)[];input:string[];text:string[];digests:string[]}
const branchMemos=new WeakMap<object,BranchMemo>();
/**
 * Digests for every path prefix. One render asks "is this anchor on the current branch?"
 * once per message, and those messages nearly always share one branch, so rebuilding and
 * re-hashing the same path per message was pure waste. The memo validates by reference
 * (the turn's selected variant object, its input and its prose): a streamed delta or an
 * edit hands over a new string, which forces a rebuild instead of serving a stale digest.
 * Each entry must stay bit-identical to hash(segments.join('|')), because a changed value
 * would re-judge stored anchors and hide existing messages and memory notes.
 */
function branchMemo(s:Session):BranchMemo{
 const turns=s.turns,previous=branchMemos.get(s);
 if(previous&&previous.variant.length===turns.length){
  let same=true;
  for(let i=0;i<turns.length;i++){
   const turn=turns[i],variant=turn.variants[turn.selected];
   if(previous.variant[i]!==variant||previous.input[i]!==turn.input||previous.text[i]!==(variant?.text||'')){same=false;break;}
  }
  if(same)return previous;
 }
 const segments=pathFor(s),variant:(object|undefined)[]=[],input:string[]=[],text:string[]=[];
 for(const turn of turns){const current=turn.variants[turn.selected];variant.push(current);input.push(turn.input);text.push(current?.text||'');}
 const digests:string[]=[];let state=2166136261;digests.push((state>>>0).toString(16));
 for(let i=0;i<segments.length;i++){
  const chunk=(i?'|':'')+segments[i];
  for(let k=0;k<chunk.length;k++)state=Math.imul(state^chunk.charCodeAt(k),16777619);
  digests.push((state>>>0).toString(16));
 }
 const memo={variant,input,text,digests};
 branchMemos.set(s,memo);
 return memo;
}
function pathDigest(s:Session,before=s.turns.length){
 const digests=branchMemo(s).digests;
 return digests[Math.max(0,Math.min(before,digests.length-1))];
}
export function terminalAnchor(s:Session,before=s.turns.length):TerminalAnchor {let index=before-1;while(index>=0&&s.turns[index].variants[s.turns[index].selected]?.status!=='complete')index--;const t=s.turns[index],v=t?.variants[t.selected],path=[pathDigest(s,index+1)];return {key:t?t.id+':'+v.id+':'+hash(path.join('|')):'opening:'+hash(s.opening),turnId:t?.id||'',variantId:v?.id||'',path};}
export function terminalAnchorActive(s:Session,a:TerminalAnchor,before=s.turns.length){if(!a.turnId)return a.key==='opening:'+hash(s.opening);const index=s.turns.slice(0,before).findIndex(t=>t.id===a.turnId);if(index<0)return false;const t=s.turns[index],v=t.variants[t.selected];return v?.status==='complete'&&v.id===a.variantId&&a.path.length===1&&a.path[0]===pathDigest(s,index+1);}
/** The origin of a round is the turn that triggered it plus a hash of the input it answered. */
export function terminalOrigin(s:Session,index:number):TerminalOrigin|undefined{
 const turn=s.turns[index];return turn?{turnId:turn.id,input:hash(turn.input)}:undefined;
}
/** True while the exact action that produced the artifact still exists on the current branch.
 * A missing turn, a rewound turn or an edited triggering input all make it false; artifacts
 * written before origins existed (undefined) stay visible exactly as before. */
export function terminalOriginActive(s:Session,origin:TerminalOrigin|undefined,before=s.turns.length){
 if(!origin)return true;
 if(typeof origin.turnId!=='string'||typeof origin.input!=='string')return false;
 const index=s.turns.findIndex(t=>t.id===origin.turnId);
 return index>=0&&index<before&&hash(s.turns[index].input)===origin.input;
}
/** Which turn a stored terminal job actually executed, so the UI can retry the right one.
 * Jobs written since the split carry their own turn; legacy jobs only have the boundary anchor,
 * where terminal-first names the previous confirmed turn and the next one is the target. */
export function terminalJobTurnIndex(s:Session,job:TerminalJob):number{
 // A job that names its turn is bound to that turn only: after a rewind the turn is gone and
 // the orphaned stage must not be retried onto a different round through the anchor.
 if(job.turnId)return s.turns.findIndex(t=>t.id===job.turnId);
 const i=s.turns.findIndex(t=>t.id===job.anchor.turnId);
 if(!job.anchor.turnId)return 0;
 if(job.mode==='terminal-first')return i<0?-1:i+1<s.turns.length?i+1:-1;
 return i;
}
export function terminalMessageVisible(s:Session,m:TerminalMessage){return !m.archived&&(!m.anchor||terminalAnchorActive(s,m.anchor))&&terminalOriginActive(s,m.origin);}
/** A stored memory segment belongs to the round that wrote it; legacy segments without an
 * origin keep the old anchor-only rule. */
export function terminalSegmentVisible(s:Session,entry:{origin?:TerminalOrigin},before=s.turns.length){return !entry.origin||terminalOriginActive(s,entry.origin,before);}
/** A bucket may contain segments from several rounds, so its stored note text is only shown
 * when every segment is still on the current branch; partial buckets are rendered through
 * the filtered view below instead of leaking the hidden segments' summary. */
export function terminalBucketActive(s:Session,b:TerminalRoundMemory,before=s.turns.length){
 const entries=[...b.chats,...b.games];
 return terminalAnchorActive(s,b.anchor,before)&&entries.length>0&&entries.every(entry=>terminalSegmentVisible(s,entry,before));
}
export function visibleTerminalBucket(s:Session,b:TerminalRoundMemory,before=s.turns.length):TerminalRoundMemory{
 return {...b,chats:b.chats.filter(c=>terminalSegmentVisible(s,c,before)),games:b.games.filter(g=>terminalSegmentVisible(s,g,before))};
}
export interface TerminalPrivateChatMessage {sender:string;text:string;truncated?:boolean}
export interface TerminalPrivateChat {participantId:string;participantName:string;knownBy:string[];messages:TerminalPrivateChatMessage[];source:string;earlierTopic?:{text:string;source:string};truncated?:boolean}
export const terminalPrivateChatLimits={chats:8,messages:12,messageChars:800,totalChars:8000,topicChars:600};
const privateChatCut='…（已截断）';
const privateChatKey=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,'');
function cutPrivateText(value:string,max:number){const text=value.trim();return text.length>max?{text:text.slice(0,max)+privateChatCut,truncated:true}:{text,truncated:false};}
function earlierPrivateTopic(s:Session,chatId:string,before:number){for(const bucket of [...(s.terminal?.memories||[])].reverse()){if(!terminalAnchorActive(s,bucket.anchor,before))continue;const chat=bucket.chats.find(c=>!c.group&&(c.conversationId===chatId||!c.conversationId&&c.id===chatId));if(!chat||!terminalSegmentVisible(s,chat,before))continue;const saved=(chat.summary||'').trim()||chat.topics.filter(Boolean).join('；');if(!saved)continue;const text=cutPrivateText(saved,terminalPrivateChatLimits.topicChars).text;return {text,source:`terminal.memories/${bucket.anchor.key}/chats/${chatId}`};}return undefined;}
/**
 * Private one-to-one chats that the current prose model may know about.
 * Only player messages, the participating character's replies and main-model private messages
 * reach the result; archived or inactive-branch messages are dropped. Public notes never consume it.
 */
export function terminalPrivateChats(s:Session,before=s.turns.length,hint=''):TerminalPrivateChat[]{
 const conversations=s.terminal?.conversations;
 if(!Array.isArray(conversations))return [];
 const hintKey=privateChatKey(typeof hint==='string'?hint:'');
 const rows=conversations.flatMap((c,order)=>{
  if(c.group||c.members.length!==1||c.members[0]==='player'||!c.members[0])return [];
  const participantId=c.members[0];
  const messages=c.messages.filter(m=>typeof m.text==='string'&&!!m.text.trim()&&!m.archived&&(m.sender==='player'||m.sender===participantId)&&(!m.anchor||terminalAnchorActive(s,m.anchor,before))&&terminalOriginActive(s,m.origin,before));
  if(!messages.length)return [];
  const participantName=(c.title||'').trim()||participantId;
  const nameKey=privateChatKey(participantName);
  const last=Math.max(0,...messages.map(m=>{const time=Date.parse(m.at||'');return Number.isFinite(time)?time:0;}));
  return [{c,participantId,participantName,messages,order,relevant:!!hintKey&&!!nameKey&&hintKey.includes(nameKey),last}];
 });
 rows.sort((a,b)=>Number(b.relevant)-Number(a.relevant)||b.last-a.last||b.order-a.order);
 const prepared=rows.slice(0,terminalPrivateChatLimits.chats).map(row=>{
  const keep=row.messages.slice(-terminalPrivateChatLimits.messages);
  const trimmed=keep.map(m=>{const cut=cutPrivateText(m.text,terminalPrivateChatLimits.messageChars);return {sender:m.sender,text:cut.text,...(cut.truncated?{truncated:true}:{})};});
  return {row,trimmed,countDropped:row.messages.length>keep.length,perMessageTruncated:keep.some((m,i)=>!!trimmed[i].truncated)};
 });
 if(!prepared.length)return [];
 const share=Math.floor(terminalPrivateChatLimits.totalChars/prepared.length);
 const included=prepared.map(p=>{
  let from=p.trimmed.length,used=0;
  while(from>0&&used+p.trimmed[from-1].text.length<=share){from--;used+=p.trimmed[from].text.length;}
  return {p,from,used,budgetDropped:from>0};
 });
 let remaining=terminalPrivateChatLimits.totalChars-included.reduce((sum,item)=>sum+item.used,0);
 for(const item of included)while(remaining>0&&item.from>0){const size=item.p.trimmed[item.from-1].text.length;if(size>remaining)break;item.from--;item.used+=size;remaining-=size;item.budgetDropped=false;}
 return included.flatMap(item=>{
  const messages=item.p.trimmed.slice(item.from);
  if(!messages.length)return [];
  const earlierTopic=earlierPrivateTopic(s,item.p.row.c.id,before);
  return [{participantId:item.p.row.participantId,participantName:item.p.row.participantName,knownBy:['player',item.p.row.participantId],messages,source:`terminal.conversations/${item.p.row.c.id}`,...(earlierTopic?{earlierTopic}:{}),...(item.p.countDropped||item.p.perMessageTruncated||item.budgetDropped?{truncated:true}:{})}];
 });
}
export function terminalBucket(t:PersonalTerminal,a:TerminalAnchor){t.memories||=[];let b=t.memories.find(m=>m.anchor.key===a.key);if(!b){b={anchor:a,chats:[],games:[]};t.memories.push(b);}return b;}
/** Snapshot who knew a terminal exchange at write time; later members must not inherit it. */
export function audienceSnapshot(members:string[]){return ['player',...members.filter(id=>id&&id!=='player')];}
const memberKey=(knownBy:string[])=>[...knownBy].filter(Boolean).sort().join('|');
/** Same conversation, different membership snapshot = different segment; history is never merged away.
 * A round with an origin only merges with segments of the same origin, so a terminal-first round
 * that shares the knowledge boundary with the previous round keeps its own summary and can be
 * hidden independently. Writes without an origin (manual phone actions, legacy data) keep the old
 * merging behaviour. */
function findSegment(b:TerminalRoundMemory,c:{id:string;group:boolean},knownBy?:string[],origin?:TerminalOrigin):TerminalRoundMemory['chats'][number]|undefined{
 const sameConversation=(x:TerminalRoundMemory['chats'][number])=>x.conversationId===c.id||(!x.conversationId&&x.id===c.id);
 const sameOrigin=(x:TerminalRoundMemory['chats'][number])=>!origin||x.origin&&x.origin.turnId===origin.turnId&&x.origin.input===origin.input;
 const exact=knownBy&&knownBy.length?b.chats.find(x=>sameConversation(x)&&x.knownBy&&memberKey(x.knownBy)===memberKey(knownBy)&&sameOrigin(x)):undefined;
 if(exact)return exact;
 // Legacy private-chat entries were written before snapshots existed; their audience is deterministic.
 if(knownBy&&knownBy.length&&!c.group)return b.chats.find(x=>sameConversation(x)&&!x.knownBy&&sameOrigin(x));
 return undefined;
}
export function recordTerminalChat(t:PersonalTerminal,a:TerminalAnchor,c:{id:string;title:string;group:boolean},speakers:string[],topic:string,changes:string[]=[],knownBy?:string[],origin?:TerminalOrigin){const b=terminalBucket(t,a);let chat=knownBy&&knownBy.length?findSegment(b,c,knownBy,origin):b.chats.find(x=>x.conversationId===c.id&&!x.knownBy&&(!origin||x.origin&&x.origin.turnId===origin.turnId&&x.origin.input===origin.input));if(!chat){const suffix=knownBy&&knownBy.length?'#'+hash(memberKey(knownBy)):'';chat={id:c.id+suffix+(origin?'@'+hash(origin.turnId+'\n'+origin.input):''),conversationId:c.id,name:c.title,group:c.group,speakers:[],topics:[],changes:[],...(knownBy&&knownBy.length?{knownBy:[...knownBy]}:{}),...(origin?{origin:{...origin}}:{})};b.chats.push(chat);}if(knownBy&&knownBy.length){if(!chat.knownBy)chat.knownBy=[...knownBy];chat.conversationId=c.id;}chat.name=c.title;chat.speakers=[...new Set([...chat.speakers,...speakers])];if(topic.trim()&&!chat.topics.includes(topic.trim()))chat.topics.push(topic.trim());if(!topic.startsWith('用户发送：')||!chat.summary)chat.summary=topic.trim();chat.changes=[...new Set([...chat.changes,...changes])];}
/** The segment of a conversation matching the current membership snapshot, for prior-topic lookup.
 * Group conversations never fall back to a legacy untagged segment: its audience is unknown, so
 * its summary could leak pre-join topics to members who joined later. */
export function findChatSegment(t:PersonalTerminal,a:TerminalAnchor,conversationId:string,members:string[],group=false){const b=t.memories?.find(b=>b.anchor.key===a.key);if(!b)return undefined;const knownBy=audienceSnapshot(members);const exact=b.chats.find(x=>x.conversationId===conversationId&&x.knownBy&&memberKey(x.knownBy)===memberKey(knownBy));if(exact)return exact;return group?undefined:b.chats.find(x=>x.conversationId===conversationId&&!x.knownBy);}
const terminalNotePrefix='小手机记忆';
const terminalNoteBreak=String.fromCharCode(10);
const terminalNoteEmpty=terminalNotePrefix+terminalNoteBreak;
const terminalNoteText=(b:TerminalRoundMemory)=>terminalNotePrefix+terminalNoteBreak+formatTerminalMemory(b,true,false);
/** Safe narrator-side container for a bucket's private segments: the public aggregate note
 * never carries private text, so pure-private buckets keep their own labeled note instead. */
const terminalPrivateNoteText=(b:TerminalRoundMemory)=>terminalNotePrefix+terminalNoteBreak+formatTerminalMemory({...b,chats:b.chats.filter(c=>!c.group),games:[]},true,true);
/** Only notes written by this module: fixed id prefix, fixed text prefix, and an existing terminalKey or legacy terminal id. */
export function isTerminalMemoryNote(m:Memory){return m.kind==='note'&&typeof m.text==='string'&&m.text.startsWith(terminalNotePrefix)&&(typeof m.terminalKey==='string'&&m.id==='terminal:'+m.terminalKey||typeof m.id==='string'&&m.id.startsWith('terminal:'));}
export function terminalNoteKey(m:Memory){return typeof m.terminalKey==='string'?m.terminalKey:m.id.slice('terminal:'.length);}
/** Rewrites legacy program notes so private chats never remain in public story memory or its vectors. */
export function rebuildTerminalMemoryNotes(s:Session){
 const remove=new Set<Memory>();
 for(const m of s.memories){
  if(!isTerminalMemoryNote(m))continue;
  const key=terminalNoteKey(m),b=s.terminal?.memories?.find(b=>b.anchor.key===key);
  if(!b)continue;
  const text=m.id.endsWith('#private')?terminalPrivateNoteText(b):terminalNoteText(b);
  if(text===terminalNoteEmpty){remove.add(m);continue;}
  m.terminalKey=key;
  if(m.text!==text){m.text=text;delete m.vector;delete m.indexError;}
 }
 if(remove.size)s.memories=s.memories.filter(m=>!remove.has(m));
}
function syncTerminalNote(s:Session,id:string,terminalKey:string,text:string){
 let m=s.memories.find(m=>m.id===id);if(m&&!isTerminalMemoryNote(m))return;
 if(text===terminalNoteEmpty){if(m)s.memories=s.memories.filter(item=>item!==m);return;}
 if(!m){m={id,kind:'note',text:'',createdAt:new Date().toISOString(),terminalKey};s.memories.push(m);}
 if(m.text!==text){m.text=text;delete m.vector;delete m.indexError;}
}
export function syncTerminalMemoryNotes(s:Session){for(const b of s.terminal?.memories||[]){syncTerminalNote(s,'terminal:'+b.anchor.key,b.anchor.key,terminalNoteText(b));syncTerminalNote(s,'terminal:'+b.anchor.key+'#private',b.anchor.key,terminalPrivateNoteText(b));}rebuildTerminalMemoryNotes(s);}
/** One stable audience-independent line per segment: the vector text for a terminal candidate. */
export function formatTerminalSegment(c:TerminalRoundMemory['chats'][number]|TerminalRoundMemory['games'][number]){if(!('group' in c))return `游戏-国王游戏：${c.name}第${c.round}轮${c.complete?'（已完成）':'（进行中）'}，国王：${c.king}；要求：${c.command||'尚未出令'}；惩罚：${c.penalties||'无'}${c.afterparty?'；复盘：'+c.afterparty:''}`;return c.group?`群聊-${c.name}：说话人：${c.speakers.join('、')}；聊天话题为：${c.summary||c.topics.at(-1)||'尚无消息'}；变化：${c.changes.join('；')||'无'}`:`私聊-${c.name}：聊天话题为：${c.summary||c.topics.at(-1)||'尚无消息'}`;}
const knownLabel=(knownBy?:string[])=>factLabel(knownBy);
export function formatTerminalMemory(b:TerminalRoundMemory,compact=false,includePrivate=true){let group=0;return [...(includePrivate?b.chats:b.chats.filter(c=>c.group)).map(c=>c.group?`群聊${++group}-${c.name}${knownLabel(c.knownBy)}：说话人：${c.speakers.join('、')}；聊天话题为：${(compact?c.summary||c.topics.at(-1):c.topics.join('；'))||'尚无消息'}；变化：${c.changes.join('；')||'无'}`:`私聊-${c.name}${knownLabel(c.knownBy)}：聊天话题为：${(compact?c.summary||c.topics.at(-1):c.topics.join('；'))||'尚无消息'}`),...(b.games.length?[`游戏-国王游戏：玩${b.games.filter(g=>g.complete).length}轮（已完成）；`+b.games.map(g=>`${g.name}第${g.round}轮${g.complete?(g.endedAt?'（本轮完成，游戏已结束）':''):g.endedAt?'（未完成，游戏已结束）':'（进行中）'}，国王：${g.king}；要求：${g.command||'尚未出令'}；惩罚：${g.penalties||'无'}${g.interactions?'；后续互动：'+g.interactions:''}${g.afterparty?'；复盘：'+g.afterparty:''}${knownLabel(g.knownBy)}`).join('\n')]:[])].join('\n');}
export function terminalNoteVisible(s:Session,m:Memory,before=s.turns.length){const b=s.terminal?.memories?.find(b=>b.anchor.key===terminalNoteKey(m));return !!b&&terminalBucketActive(s,b,before);}
export function terminalMemoryForTurn(s:Session,turnId:string,variantId:string){return (s.terminal?.memories||[]).filter(b=>b.anchor.turnId===turnId&&b.anchor.variantId===variantId&&terminalAnchorActive(s,b.anchor)).map(b=>formatTerminalMemory(visibleTerminalBucket(s,b),true)).filter(Boolean).join('\n');}
export function terminalRecall(s:Session,before=s.turns.length){const b=[...(s.terminal?.memories||[])].reverse().map(b=>visibleTerminalBucket(s,b,before)).find(b=>terminalAnchorActive(s,b.anchor,before)&&(b.chats.length>0||b.games.length>0));if(!b)return [];const text='小手机记忆（已发生的终端活动）'+terminalNoteBreak+formatTerminalMemory(b,true,false);if(text==='小手机记忆（已发生的终端活动）'+terminalNoteBreak)return [];const chunks=[];for(let i=0;i<text.length;i+=6000)chunks.push(text.slice(i,i+6000));return chunks;}
export function terminalLatestBucket(s:Session,before=s.turns.length){return [...(s.terminal?.memories||[])].reverse().map(b=>visibleTerminalBucket(s,b,before)).find(b=>terminalAnchorActive(s,b.anchor,before)&&(b.chats.length>0||b.games.length>0));}
/**
 * Scoped candidates for one terminal note: each conversation membership segment and game
 * segment becomes its own retrievable entry with its own vector. The audience filter runs
 * before ranking; segments recorded as unknown are never exposed. The narrator (empty
 * audience) receives per-segment candidates too — including private segments, whose old
 * topics must stay recallable without the recent-message window — with the plain segment
 * text so stored vectors keep matching; audience labels are attached after a hit.
 * The public note contributes group/game segments, its #private sibling the private ones.
 */
export function terminalSegmentCandidates(s:Session,m:Memory,audience:string[],model?:string):Memory[]{
 const b=s.terminal?.memories?.find(b=>b.anchor.key===terminalNoteKey(m));
 if(!b||!terminalAnchorActive(s,b.anchor))return audience.length?[]:memoryReady(m)?[m]:[];
 const priv=m.id.endsWith('#private');
 const out:Memory[]=[];
 for(const entry of [...b.chats,...b.games]){
  if(('group' in entry&&!entry.group)!==priv)continue;
  if(!terminalSegmentVisible(s,entry))continue;
  if(audience.length&&!factAudienceCovers(entry.knownBy,audience))continue;
  const text=formatTerminalSegment(entry),id=m.id+'#seg:'+entry.id;
  const v=m.factVectors?.find(v=>v.id===id&&v.text===text&&v.model===model&&v.values.length&&v.values.every(Number.isFinite));
  out.push({id,text,kind:'note',createdAt:m.createdAt,source:m.source,revision:m.revision,revisions:m.revisions,terminalKey:m.terminalKey,...(v?{vector:{model:v.model,values:v.values,text:v.text}}:{})});
 }
 return out;
}
/** True for the private sibling note of a bucket (id suffix #private). */
export function terminalNoteIsPrivate(m:Memory){return m.id.endsWith('#private');}
export function memoryChunks(text:string,size=6000){const chunks=[];for(let i=0;i<text.length;i+=size)chunks.push(text.slice(i,i+size));return chunks;}
export function messagePage<T>(messages:T[],page=0){return messages.slice(Math.max(0,messages.length-(page+1)*20),Math.max(0,messages.length-page*20));}
