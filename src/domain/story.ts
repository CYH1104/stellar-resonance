import {cleanPresetOutputParsing} from './outputParsing.ts';
import {cleanBackupArchive,assertBackupSnapshotFields} from './backupArchive.ts';
import {cleanSceneSnapshot} from './storyScene.ts';
import {cleanCharacterImages} from './characterImages.ts';
import {cleanTerminalBatch} from './terminalMain.ts';
import {terminalNoteVisible,isTerminalMemoryNote} from './terminalLedger.ts';
import {validateTerminal} from './personalTerminal.ts';
import {prepareForumLikes} from './forumLikes.ts';
import {validateRepairAudit} from './repairAudit.ts';
import {runtimeActorPatch} from './actorPolicy.ts';
import {projectCharacterFacts} from './characterFacts.ts';
import {recordReplayIssue,clearReplayIssues} from './stateReplay.ts';
import {sourceFor,taskFor,textHash,validateLedgerMetadata} from './memoryLedger.ts';
import {cleanRegexRules} from './regex.ts';
import {newDynamicActor,validActorId} from './dynamicActors.ts';
import {validAffinity} from './affinity.ts';
import {unwrapStoryTags} from './storyMarkup.ts';
import {separateIdentityAbility} from './identityAbility.ts';
import {cleanWorldbooks,cleanWorldbookIds} from './worldbooks.ts';
import {memorySignature,validateMemoryRecord,memoryText} from './memories.ts';
import {cleanSuggestions} from './suggestions.ts';
import {restoreKnownPromptGroups} from './promptGroups.ts';
import {cleanLayout,defaultLayout} from './layout.ts';
import {applyMvu,cleanOperations,cleanJson} from './mvu.ts';
import {readPersonaExtra} from './personaExtras.ts';
import type { ActorPatch, ActorState, Dice, ForumEntry, ForumPost, Memory, Outcome, Persona, Preferences, Session, Snapshot, Turn, Variant, WorldState } from './contracts';
import {cleanRandomEventGate} from './randomEvents.ts';
import { normalizePersona } from './persona.ts';
import { cleanPreset,cleanPresetParameters } from './presets.ts';
import { cleanTheaters,cleanTheaterScenes } from './theaters.ts';
import {migrateApiSettings} from './apis.ts';
import {scrubModelData,stripReasoning} from './reasoning.ts';
import {diceGrade,cleanDiceEvent,assertDiceEventBinding} from './dice.ts';
export {diceGrade} from './dice.ts';
export const uid = () => crypto.randomUUID();
export const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
export const now = () => new Date().toISOString();
export function defaults(): Preferences {
  const profile = (id: string, name: string, model: string) => ({ id, name, providerId: 'approved-provider', model, temperature: 0.7, maxTokens: 32000 });
  return { presetOutputParsing:{},showRelationGraph:false,preservePresetOutputs:false,regexRules:[],memorySummaryInterval:1,stateEnabled:true,randomEventProbability:30,randomEventInstruction:'',stateProfile:'main',worldbooks:[],defaultWorldbookIds:[],layout:defaultLayout(),suggestionsEnabled:true,randomEventProfile:'main',forumReplyEnabled:false,forumReplyProfile:'main',mode: 'demo', diceEnabled: false, vectorEnabled: false, profiles: [profile('main', '主 API', ''), profile('aux', '副 API 1', ''), profile('embed', '向量 API', '')], mainProfile: 'main', auxiliaryProfile: 'aux', embeddingProfile: 'embed',auxiliaryProfiles:['aux'],storyProfile:'main',summaryProfile:'main',suggestionsProfile:'main',personaProfile:'main',terminalEnabled:false,terminalOrder:'story-first' as const, presetParameters:{},presets: [{ id: 'default', name: '基础叙事', content: '使用清晰中文叙事，停在需要玩家选择的地方。', enabled: true }], shortcuts: [],activePreset:'legacy',theaters:cleanTheaters(undefined) };
}
export function initialState(name: string): WorldState {
  const actor = (id: string, label: string, affinity: number): ActorState => ({ id, name: label, energy: 80, focus: 70, affinity, present: true, primaryGender: '', secondaryGender: '', innerThought: '' });
  return { player: actor('player', name || '玩家', 0), characters: [actor('guide', '样例引导员', 30), actor('engineer', '样例巡检员', 20)] };
}
export function newSession(name: string, persona: Persona, opening: string): Session {
  persona=normalizePersona(persona);
  return { worldbookIds:[],id: uid(), name: name.trim() || '新的旅程', createdAt: now(), updatedAt: now(), persona: copy(persona), opening: opening.trim() || '你来到一处虚构的星际接待站。引导员向你招手，等待你开口。', initial: initialState(persona.name), turns: [], memories: [], suggestions: [], forumActivity: {} };
}

export function rollDice(): Dice {
  const bytes = new Uint32Array(1); const limit = Math.floor(0x100000000 / 100) * 100;
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  const value = bytes[0] % 100 + 1;
  return { value, grade: diceGrade(value), rulesVersion: 'd100-v1' };
}
function bounded(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100; }
function affinityValue(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER; }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function shortText(value: unknown, max: number, required = false): value is string { return typeof value === 'string' && value.length <= max && (!required || !!value.trim()); }
function actorPatch(value: unknown, character = false,legacy=false): ActorPatch {
  if (!record(value)) throw new Error('MVU 人物更新格式不正确');
  const allowed = ['ability','mentalPowerLevel','identity','name', 'primaryGender', 'secondaryGender', 'innerThought', 'spiritAnimal','spiritThought','affinity', 'relationship', 'present', 'energy', 'focus', ...(character ? ['id'] : [])];
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('MVU 人物更新包含未允许的字段');
  const patch: ActorPatch = {};
  for (const field of ['ability','mentalPowerLevel','identity','name', 'primaryGender', 'secondaryGender', 'innerThought','spiritAnimal','spiritThought','relationship'] as const) {
    if (value[field] === undefined) continue;
    const limit = ['ability','innerThought','spiritThought'].includes(field) ? 2000 : field==='spiritAnimal'?1500:field==='identity'&&!character?Infinity:field==='identity'?200:field==='relationship'?200:field === 'name' ? 80 : 100;
    if (!shortText(value[field], limit, field === 'name'||field==='mentalPowerLevel')) throw new Error(`MVU ${field} 字段不正确`);
    patch[field] = value[field];
  }
  if (value.affinity !== undefined) { if (!(validAffinity(value.affinity)||legacy&&typeof value.affinity==='number'&&value.affinity>=-100&&value.affinity<=200)) throw new Error('好感度必须在 -100 到 100 之间'); patch.affinity = value.affinity; }
  if (value.present !== undefined) { if (typeof value.present !== 'boolean') throw new Error('在场标记必须为布尔值'); patch.present = value.present; }
  for (const field of ['energy', 'focus'] as const) if (value[field] !== undefined) { if (!bounded(value[field])) throw new Error('旧版状态数值不合法'); patch[field] = value[field]; }
  return separateIdentityAbility(patch);
}
function forumPosts(value: unknown): ForumPost[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('论坛动态格式或数量不正确');
  const ids = new Set<string>();
  return value.map(post => {
    if (!record(post) || Object.keys(post).some(k => !['id', 'authorName', 'content', 'topic', 'comments', 'type', 'time'].includes(k)) || !shortText(post.id, 128, true) || ids.has(post.id) || !shortText(post.authorName, 80, true) || !shortText(post.content, 3000, true)) throw new Error('论坛动态不合法');
    ids.add(post.id);
    const item: ForumPost = { id: post.id, authorName: post.authorName, content: post.content };
    for(const field of ['type','time'] as const)if(post[field]!==undefined){if(!shortText(post[field],field==='type'?40:80))throw new Error('论坛类型或时间不正确');item[field]=post[field];}
    if (post.topic !== undefined) { if (!shortText(post.topic, 80)) throw new Error('论坛话题不正确'); item.topic = post.topic; }
    if (post.comments !== undefined) {
      if (!Array.isArray(post.comments) || post.comments.length > 16) throw new Error('论坛评论数量不正确');
      const commentIds = new Set<string>();
      item.comments = post.comments.map(comment => {
        if (!record(comment) || Object.keys(comment).some(k => !['id', 'authorName', 'content'].includes(k)) || !shortText(comment.id, 128, true) || commentIds.has(comment.id) || !shortText(comment.authorName, 80, true) || !shortText(comment.content, 1000, true)) throw new Error('论坛评论不合法');
        commentIds.add(comment.id); return { id: comment.id, authorName: comment.authorName, content: comment.content };
      });
    }
    return item;
  });
}
export function validateOutcome(value: unknown, state: WorldState,legacy=false,terminalActors:{id:string;name?:string}[]=[]): Outcome {
  if (!record(value)) throw new Error('状态更新格式不正确');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['openingScene','terminal','stateUpdate','mvu','player', 'characters', 'event', 'diceEvent', 'forum','theaters','suggestions'].includes(k))) throw new Error('状态更新包含未允许的字段');
  if (typeof v.event !== 'string' || !v.event.trim() || v.event.length > 500) throw new Error('事件说明不正确');
  const out: Outcome = { event: v.event };if(v.openingScene!==undefined)out.openingScene=cleanSceneSnapshot(v.openingScene);
  if(v.stateUpdate!==undefined){const update=v.stateUpdate;if(!record(update)||Object.keys(update).some(k=>!['requestId','affinityReviews','status','received','storyComplete','codes','retainedPresentIds','affinityReviewedIds'].includes(k))||!['updated','unchanged','partial','retained','disabled'].includes(String(update.status))||typeof update.received!=='boolean'||typeof update.storyComplete!=='boolean'||!Array.isArray(update.codes)||update.codes.length>100||update.codes.some(c=>typeof c!=='string'||!/^[-A-Z0-9_]{1,100}$/.test(c)))throw Error('变量更新结果格式不正确');if(update.retainedPresentIds!==undefined&&(!Array.isArray(update.retainedPresentIds)||update.retainedPresentIds.length>1000||update.retainedPresentIds.some(id=>!validActorId(id))))throw Error('保留名单格式不正确');if(update.affinityReviewedIds!==undefined&&(!Array.isArray(update.affinityReviewedIds)||update.affinityReviewedIds.length>1000||update.affinityReviewedIds.some(id=>!validActorId(id))))throw Error('Invalid affinity review roster');if(update.requestId!==undefined&&(!shortText(update.requestId,128,true)))throw Error('Invalid state request');if(update.affinityReviews!==undefined){if(!Array.isArray(update.affinityReviews)||update.affinityReviews.length>1000)throw Error('Invalid affinity audit');const ids=new Set();for(const a of update.affinityReviews){if(!record(a)||!validActorId(a.id)||ids.has(a.id)||Object.keys(a).some(k=>!['id','before','requestedDelta','appliedDelta','after','reason','bounded'].includes(k))||!['before','requestedDelta','appliedDelta','after'].every(k=>typeof a[k]==='number'&&Number.isFinite(a[k]))||!shortText(a.reason,300,true)||typeof a.bounded!=='boolean'||Math.abs(Number(a.after)-Number(a.before)-Number(a.appliedDelta))>1e-6)throw Error('Invalid affinity audit');ids.add(a.id);}}out.stateUpdate=copy(update) as unknown as Outcome['stateUpdate'];}
  const mvuState=v.mvu!==undefined?applyMvu(state,cleanOperations(v.mvu),legacy):state;
  if(v.mvu!==undefined)out.mvu=cleanOperations(v.mvu);
  if(v.suggestions!==undefined)out.suggestions=cleanSuggestions(v.suggestions);
  if(v.diceEvent!==undefined)out.diceEvent=cleanDiceEvent(v.diceEvent);
  if (v.player !== undefined) {
    out.player = actorPatch(record(v.player)?runtimeActorPatch(v.player):v.player,false,legacy);
  }
  if (v.characters !== undefined) {
    if (!Array.isArray(v.characters) || v.characters.length > 1000) throw new Error('人物更新格式不正确');
    const actorIds = new Set<string>();
    out.characters = v.characters.map(c => {
      try{
      if (!record(c) || !validActorId(c.id) || actorIds.has(c.id)) throw new Error('人物更新不合法');
      actorIds.add(c.id);const before=state.characters.find(a=>a.id===c.id),committed=mvuState.characters.find(a=>a.id===c.id);
      const patch=committed?{id:c.id,...actorPatch(runtimeActorPatch(c),true,legacy)}:newDynamicActor(c,legacy);
      for(const field of ['affinity','relationship'] as const)if(committed&&committed[field]!==before?.[field])delete patch[field];
      return patch;
      }catch(error){if(error instanceof Error&&record(c))Object.assign(error,{actorId:c.id});throw error;}
    });
  }
  if(v.terminal!==undefined)out.terminal=cleanTerminalBatch(v.terminal,[...mvuState.characters,...out.characters||[],...terminalActors]);
  if (v.forum !== undefined) out.forum = forumPosts(v.forum);
  if(v.theaters!==undefined){out.theaters=cleanTheaterScenes(v.theaters);const actorIds=new Set([...state.characters,...out.characters||[],...(out.mvu?applyMvu(state,out.mvu).characters:[])].map(c=>c.id));for(const scene of out.theaters)if(scene.diary&&scene.diary.ownerId!=='player'&&!actorIds.has(scene.diary.ownerId))throw Error('日记精神体主人不存在');}
  return out;
}
export function selected(turn: Turn): Variant | undefined { return turn.variants[turn.selected]; }
export function stateAt(session: Session, before = session.turns.length,legacy=false): WorldState {
  let state = copy(session.initial);
  Object.assign(state.player,separateIdentityAbility(state.player));for(const actor of state.characters)Object.assign(actor,separateIdentityAbility(actor));
  if(state.player.ability===undefined&&session.persona.ability)state.player.ability=session.persona.ability;
  if(state.player.mentalPowerLevel===undefined&&session.persona.mentalPowerLevel)state.player.mentalPowerLevel=session.persona.mentalPowerLevel;
  if(!state.player.mentalPowerLevel){const level=readPersonaExtra(session.persona.other,'\u7cbe\u795e\u529b\u7b49\u7ea7');if(level)state.player.mentalPowerLevel=level;}
  if(state.player.identity===undefined&&session.persona.identity)state.player.identity=session.persona.identity;
  if(state.player.spiritAnimal===undefined&&session.persona.spiritAnimal)state.player.spiritAnimal=session.persona.spiritAnimal;
  state=projectCharacterFacts(session,state);
  for (const turn of session.turns.slice(0, before)) {
    const v = selected(turn); if (v?.status !== 'complete' || !v.outcome) continue;
    let stage='状态校验';
    try {
      const outcome = validateOutcome(v.outcome, state,legacy,session.terminal?.contacts);
      stage='骰点绑定';assertDiceEventBinding(outcome.diceEvent,turn.dice);
      stage='变量应用';
      let candidate=outcome.mvu?applyMvu(state,outcome.mvu,legacy):copy(state);
      Object.assign(candidate.player, outcome.player);
      for (const change of outcome.characters || []) { const actor = candidate.characters.find(a => a.id === change.id); if (actor) { const { id: _id, ...patch } = change; Object.assign(actor, patch); } else candidate.characters.push(newDynamicActor(change,legacy)); }
      stage='手动变量应用';if(v.mvuOverride)candidate=applyMvu(candidate,v.mvuOverride,legacy);
      state=candidate;clearReplayIssues(session,turn.id,v.id);
    } catch(error) { recordReplayIssue(session,turn,v,stage,error); }
  }
  return state;
}
export function encounteredCharacters(session:Session,before=session.turns.length){
  const ids=new Set(session.initial.characters.filter(c=>c.present).map(c=>c.id));
  for(const [index,turn] of session.turns.slice(0,before).entries()){const v=selected(turn);if(v?.status!=='complete'||!v.outcome)continue;try{const prior=stateAt(session,index),out=validateOutcome(v.outcome,prior,false,session.terminal?.contacts);assertDiceEventBinding(out.diceEvent,turn.dice);for(const c of out.characters||[])if(c.present===true||c.affinity!==undefined||c.relationship)ids.add(c.id);for(const actor of stateAt(session,index+1).characters){const old=prior.characters.find(c=>c.id===actor.id);if(actor.present||actor.relationship||actor.affinity!==old?.affinity)ids.add(actor.id);}}catch(error){recordReplayIssue(session,turn,v,'已遇到角色',error);}}
  return stateAt(session,before).characters.filter(c=>ids.has(c.id)||!!c.relationship||!session.initial.characters.some(a=>a.id===c.id));
}
export function visibleMemories(session: Session, before = session.turns.length): Memory[] {
  const active = new Map(session.turns.slice(0, before).map(t => [t.id, selected(t)]));
  return session.memories.filter(m => {if(isTerminalMemoryNote(m))return terminalNoteVisible(session,m,before);if(!m.sourceTurn)return m.kind!=='event'||session.memoryEngine!=='candidate';const v=active.get(m.sourceTurn),index=session.turns.findIndex(t=>t.id===m.sourceTurn);if(v?.status!=='complete'||v.id!==m.sourceVariant)return false;if(session.memoryEngine!=='candidate')return true;if(!m.source||m.source.sessionId!==session.id||m.source.sourceTextHash!==textHash(JSON.stringify([session.turns[index].input,v.text])))return false;return m.source.sourceStateRevision===memorySignature({input:session.turns[index].input,story:v.text,before:stateAt(session,index),after:stateAt(session,index+1),event:v.outcome?.event,diceEvent:v.outcome?.diceEvent});});
}
/** Internal event summaries for long-term memory, not a chronicle UI. */
export function effectiveEvents(session: Session) {
  return session.turns.flatMap((turn, index) => { const v = selected(turn); return v?.status === 'complete' && v.outcome ? [{ turnId: turn.id, title: v.outcome.event, time: v.createdAt, index: index + 1 }] : []; });
}
export function visibleForum(session: Session, before = session.turns.length): ForumEntry[] {
  return session.turns.slice(0, before).flatMap((turn, index) => {
    const variant = selected(turn);
    if (variant?.status !== 'complete' || !variant.outcome) return [];
    try {
      const outcome = validateOutcome(variant.outcome, stateAt(session,index),false,session.terminal?.contacts);
      return (outcome.forum || []).map(post => ({ ...post, key: `forum/${variant.id}/${post.id}`, turnId: turn.id, variantId: variant.id, round: index + 1, createdAt: variant.createdAt }));
    } catch { return []; }
  }).reverse();
}
function pruneForum(session: Session): void {
  const keys = new Set(session.turns.flatMap(t => t.variants.flatMap(v => (v.outcome?.forum || []).map(p => `forum/${v.id}/${p.id}`))));
  for (const key of Object.keys(session.forumActivity || {})) if (!keys.has(key)) delete session.forumActivity![key];
}
export function likeForum(session: Session, key: string): void {
  if (!visibleForum(session).some(post => post.key === key)) throw new Error('该动态已不属于当前剧情');
  prepareForumLikes(session);
  const reactions = session.forumActivity ||= {};
  const activity = reactions[key] ||= { liked: false, replies: [] };
  activity.liked = !activity.liked; session.updatedAt = now();
}
export function replyForum(session: Session, key: string, text: string): string {
  if (!visibleForum(session).some(post => post.key === key)) throw new Error('该动态已不属于当前剧情');
  if (!shortText(text, 1000, true)) throw new Error('评论须为 1～1000 字');
  const activity = (session.forumActivity ||= {})[key] ||= { liked: false, replies: [] };
  if (activity.replies.length >= 100) throw new Error('单条动态的本机评论已达上限');
  activity.replies.push({ id: uid(), text: text.trim(), createdAt: now() }); session.updatedAt = now();return activity.replies.at(-1)!.id;
}
export function addForumAIReply(session:Session,key:string,replyTo:string,reply:{authorName:string;authorId:string;content:string}):void{
  if(!visibleForum(session).some(post=>post.key===key))throw new Error('该动态已不属于当前剧情');
  const activity=session.forumActivity?.[key];if(!activity||!activity.replies.some(r=>r.id===replyTo&&r.kind!=='ai'))throw new Error('原评论已不存在');
  if(activity.replies.some(r=>r.kind==='ai'&&r.replyTo===replyTo))return;
  const text=stripReasoning(reply.content).trim();if(!shortText(text,1000,true)||!shortText(reply.authorName,80,true)||!shortText(reply.authorId,128,true)||activity.replies.length>=100)throw new Error('论坛回复格式或数量不正确');
  activity.replies.push({id:uid(),text,createdAt:now(),kind:'ai',authorName:reply.authorName,authorId:reply.authorId,replyTo});session.updatedAt=now();
}
/** Validate the whole response before committing any comment; repeated delivery is idempotent. */
export function addForumAIReplies(session:Session,key:string,replyTo:string,replies:{authorName:string;authorId:string;content:string}[]):void{
  if(!visibleForum(session).some(post=>post.key===key))throw new Error('该动态已不属于当前剧情');
  const activity=session.forumActivity?.[key];if(!activity||!activity.replies.some(r=>r.id===replyTo&&r.kind!=='ai'))throw new Error('原评论已不存在');
  if(activity.replies.some(r=>r.kind==='ai'&&r.replyTo===replyTo))return;
  if(!Array.isArray(replies)||replies.length<5||replies.length>50||activity.replies.length+replies.length>100)throw new Error('论坛回复数量不正确或该动态评论容量不足，你的评论已保留。');
  const seen=new Set<string>(),createdAt=now();
  const staged=replies.map(reply=>{const text=stripReasoning(reply.content).trim();if(!shortText(text,1000,true)||!shortText(reply.authorName,80,true)||!shortText(reply.authorId,128,true))throw new Error('论坛回复格式不正确，你的评论已保留。');const normalized=text.replace(/\s+/gu,'');if(seen.has(normalized))throw new Error('论坛回复包含重复内容，你的评论已保留。');seen.add(normalized);return {id:uid(),text,createdAt,kind:'ai' as const,authorName:reply.authorName,authorId:reply.authorId,replyTo};});
  activity.replies.push(...staged);session.updatedAt=createdAt;
}
function restoreSuggestions(session:Session):void{
  const v=session.turns.length?selected(session.turns.at(-1)!):undefined;
  session.suggestions=v?.status==='complete'?cleanSuggestions(v.outcome?.suggestions):[];
}
export function truncate(session: Session, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > session.turns.length) throw new Error('回退位置不正确');
  session.turns = session.turns.slice(0, count);
  const ids = new Set(session.turns.map(t => t.id));
  const removed=session.memories.filter(m=>m.sourceTurn&&!ids.has(m.sourceTurn));
  if(removed.length)session.memoryArchive=[...(session.memoryArchive||[]),...removed];
  for(const task of session.memoryTasks||[])if(!ids.has(task.source.sourceTurnId))task.status='stale';
  session.memories = session.memories.filter(m => !m.sourceTurn || ids.has(m.sourceTurn));
  pruneForum(session); restoreSuggestions(session); session.updatedAt = now();
}
export function selectVariant(session: Session, index: number, variant: number): void {
  const turn = session.turns[index]; if (!turn?.variants[variant]) throw new Error('稿件不存在');
  truncate(session, index + 1); turn.selected = variant; restoreSuggestions(session);
}
export function editMessage(session: Session, index: number, role: 'user' | 'assistant', text: string): void {
  const turn = session.turns[index]; if (!turn || !text.trim()) throw new Error('消息不能为空');
  if(role==='user'){turn.input=text.trim();turn.inputEdited=true;for(const v of turn.variants)delete v.repairAudit;if(!turn.variants.length&&turn.randomEvent?.status==='pending')turn.randomEvent={status:'preparing',kind:turn.randomEvent.proposal.kind};}
  else {const variant=selected(turn);if(!variant)throw new Error('稿件不存在');const clean=stripReasoning(text.trim());if(!clean.trim())throw new Error('消息不能为空');variant.text=clean;variant.edited=true;delete variant.repairAudit;}
  for(const memory of session.memories)if(memory.kind==='event'&&memory.sourceTurn===turn.id){if(memory.record)session.memoryArchive=[...(session.memoryArchive||[]),copy(memory)];memory.status='pending';delete memory.record;delete memory.vector;delete memory.factVectors;delete memory.sourceFingerprint;}
  session.updatedAt=now();
}
export function finishVariant(session: Session, turnIndex: number, variant: Variant, outcome: unknown): void {
  variant.text=unwrapStoryTags(stripReasoning(variant.text));const validated=validateOutcome(scrubModelData(outcome),stateAt(session,turnIndex),false,session.terminal?.contacts);assertDiceEventBinding(validated.diceEvent,session.turns[turnIndex].dice);
  if(validated.characters?.some(actor=>actor.affinity!==undefined&&!validAffinity(actor.affinity)))throw new Error('NPC 好感度必须在 -100 到 100 之间');
  variant.outcome=validated;variant.status='complete';prepareForumLikes(session);restoreSuggestions(session);
  const turn=session.turns[turnIndex],before=stateAt(session,turnIndex),after=stateAt(session,turnIndex+1);
  const sourceFingerprint=memorySignature({input:turn.input,story:variant.text,before,after,event:validated.event,diceEvent:validated.diceEvent});
  const existing=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===turn.id&&m.sourceVariant===variant.id);
  if(!existing||existing.sourceFingerprint!==sourceFingerprint){
    if(existing?.record)session.memoryArchive=[...(session.memoryArchive||[]),copy(existing)];
    const request={turnId:turn.id,variantId:variant.id,input:turn.input,story:variant.text,before,after,event:validated.event,diceEvent:validated.diceEvent,priorCommitments:[]};
    taskFor(session,request);
    const memory:Memory={source:sourceFor(session,request),revision:existing?.revision||1,id:existing?.id||uid(),text:'待整理：'+validated.event+(validated.diceEvent?'；'+validated.diceEvent.description:''),kind:'event',createdAt:existing?.createdAt||now(),sourceTurn:turn.id,sourceVariant:variant.id,status:'pending',sourceFingerprint};
    if(existing)session.memories.splice(session.memories.indexOf(existing),1,memory);else session.memories.push(memory);
  }
  session.updatedAt = now();
}
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0; for (let i=0;i<a.length;i++) { dot += a[i]*b[i]; aa += a[i]*a[i]; bb += b[i]*b[i]; }
  return aa && bb ? dot / Math.sqrt(aa*bb) : 0;
}
export function keywordScore(text: string, query: string): number {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const chars = [...new Set(query.replace(/\s/g, '').toLowerCase())];
  return words.reduce((n,w) => n + (text.toLowerCase().includes(w) ? 3 : 0), 0) + chars.reduce((n,c) => n + (text.toLowerCase().includes(c) ? 0.1 : 0), 0);
}
export function backup(snapshot: Snapshot): string {
  assertBackupSnapshotFields(snapshot);
  return JSON.stringify({ version: snapshot.archive?2:1, sessions: sanitizeSessions(copy(snapshot.sessions)), preferences: cleanPreferences(snapshot.preferences),...(snapshot.archive?{archive:cleanBackupArchive(snapshot.archive)}:{}) }, null, 2);
}
/** Explicit one-time migration. Preserve original snapshots/patches for audit,
 * replay each old branch under its original range, then store bounded snapshots. */
export function stateAfterOutcome(before:WorldState,outcome:Outcome,override?:Variant['mvuOverride'],legacy=false):WorldState{
 let next=outcome.mvu?applyMvu(before,outcome.mvu,legacy):copy(before);
 Object.assign(next.player,outcome.player);
 for(const change of outcome.characters||[]){const actor=next.characters.find(a=>a.id===change.id);if(actor){const {id,...patch}=change;Object.assign(actor,patch);}else next.characters.push(newDynamicActor(change,legacy));}
 return override?applyMvu(next,override,legacy):next;
}
export function migrateAffinitySession(session:Session):void{
 if(session?.affinityMigration?.version===1||!session?.initial?.characters||!Array.isArray(session.turns))return;
 const source=copy(session),states=new Map<string,WorldState>();let needed=source.initial.characters.some(c=>typeof c.affinity==='number'&&c.affinity>100&&c.affinity<=200);
 let prior=stateAt(source,0,true);
 for(let i=0;i<source.turns.length;i++){
  const turn=source.turns[i];let selectedState=prior;
  for(let j=0;j<turn.variants.length;j++){
   const variant=turn.variants[j];if(variant.status!=='complete'||!variant.outcome)continue;
   let state=prior;try{const out=validateOutcome(variant.outcome,prior,true,session.terminal?.contacts);assertDiceEventBinding(out.diceEvent,turn.dice);state=stateAfterOutcome(prior,out,variant.mvuOverride,true);}catch{}
   states.set(i+':'+j,state);if(state.characters.some(c=>(c.affinity??0)>100&&(c.affinity??0)<=200))needed=true;
   if(j===turn.selected)selectedState=state;
  }
  prior=selectedState;
 }
 const records:{source:string;value:unknown}[]=[];
 if(needed){
  records.push({source:'initial',value:copy(session.initial)});
  for(const c of session.initial.characters)if(typeof c.affinity==='number'&&c.affinity>100&&c.affinity<=200)c.affinity=100;
  for(let i=0;i<session.turns.length;i++)for(let j=0;j<session.turns[i].variants.length;j++){
   const v=session.turns[i].variants[j],state=states.get(i+':'+j);if(!state||!v.outcome)continue;
   records.push({source:'turns/'+i+'/variants/'+j,value:{outcome:copy(v.outcome),...(v.mvuOverride?{mvuOverride:copy(v.mvuOverride)}:{})}});
   v.outcome={...v.outcome,player:runtimeActorPatch(state.player),characters:state.characters.map(c=>({...c,...(c.affinity!==undefined?{affinity:Math.min(100,c.affinity)}:{})}))};
   delete v.outcome.mvu;delete v.mvuOverride;
   if(state.variables)v.outcome.mvu=[{op:'replace',path:'/custom',value:state.variables}];
  }
  if(session.memories.length)records.push({source:'memories',value:copy(session.memories)});
  for(const memory of session.memories)if(memory.kind!=='note'){memory.status='pending';delete memory.vector;delete memory.factVectors;delete memory.sourceFingerprint;}
 }
 if(needed)session.affinityMigration={version:1,at:new Date().toISOString(),records};
}
function sanitizeSessions(sessions:Session[]):Session[]{
  if(!Array.isArray(sessions))return sessions;
  for(const s of sessions){if(!s||typeof s!=='object')continue;migrateAffinitySession(s);if(s.initial)s.initial=scrubModelData(s.initial);
    for(const turn of Array.isArray(s.turns)?s.turns:[])for(const v of Array.isArray(turn?.variants)?turn.variants:[]){if(!v||typeof v!=='object')continue;const clean=scrubModelData(v);for(const key of Object.keys(v))delete (v as any)[key];Object.assign(v,clean);}
    for(const m of Array.isArray(s.memories)?s.memories:[])if(m){if(typeof m.vector?.text==='string'&&stripReasoning(m.vector.text)!==m.vector.text)delete m.vector;if(m.kind!=='note'&&typeof m.text==='string'){const text=stripReasoning(m.text);if(text!==m.text)delete m.vector;m.text=text;}}
    for(const activity of Object.values(s.forumActivity||{}))for(const r of activity.replies||[])if(r.kind==='ai')r.text=stripReasoning(r.text);
    if(Array.isArray(s.suggestions)){s.suggestions=cleanSuggestions(s.suggestions);const latest=s.turns?.at(-1);const v=latest&&selected(latest);if(v?.outcome?.suggestions!==undefined)restoreSuggestions(s);}
  }return sessions;
}
export function cleanPreferences(p: Preferences): Preferences {
  return migrateApiSettings({ presetOutputParsing:cleanPresetOutputParsing(p.presetOutputParsing),showRelationGraph:p.showRelationGraph===true,...(p.characterImages!==undefined?{characterImages:cleanCharacterImages(p.characterImages)}:{}),preservePresetOutputs:p.preservePresetOutputs===true,regexRules:cleanRegexRules(p.regexRules),memorySummaryInterval:1,stateEnabled:p.stateEnabled!==false,randomEventProbability:p.randomEventProbability??30,randomEventInstruction:typeof p.randomEventInstruction==='string'?p.randomEventInstruction.slice(0,4000):'',stateProfile:p.stateProfile,worldbooks:cleanWorldbooks(p.worldbooks),defaultWorldbookIds:cleanWorldbookIds(p.defaultWorldbookIds),layout:cleanLayout(p.layout),suggestionsEnabled:p.suggestionsEnabled!==false,randomEventProfile:p.randomEventProfile,forumReplyEnabled:p.forumReplyEnabled===true,forumReplyProfile:p.forumReplyProfile,mode: p.mode, diceEnabled: !!p.diceEnabled, vectorEnabled: !!p.vectorEnabled, mainProfile: p.mainProfile, auxiliaryProfile: p.auxiliaryProfile, embeddingProfile: p.embeddingProfile,auxiliaryProfiles:p.auxiliaryProfiles,storyProfile:p.storyProfile,summaryProfile:p.summaryProfile,suggestionsProfile:p.suggestionsProfile,personaProfile:p.personaProfile,terminalProfile:p.terminalProfile,...(typeof p.terminalEnabled==='boolean'?{terminalEnabled:p.terminalEnabled}:{}),...(p.terminalOrder!==undefined?{terminalOrder:p.terminalOrder==='terminal-first'?'terminal-first' as const:'story-first' as const}:{}), profiles: p.profiles.map(x => ({ id:x.id, name:x.name, providerId:x.providerId, model:x.model, temperature:x.temperature, maxTokens:x.maxTokens,...(cleanApiUrl(x.apiBaseUrl)?{apiBaseUrl:cleanApiUrl(x.apiBaseUrl)}:{}),...(x.topP!==undefined?{topP:x.topP}:{}),...(x.frequencyPenalty!==undefined?{frequencyPenalty:x.frequencyPenalty}:{}),...(x.presencePenalty!==undefined?{presencePenalty:x.presencePenalty}:{}) })), presetParameters:cleanPresetParameters(p.presetParameters),presets: restoreKnownPromptGroups(p.presets.map(cleanPreset)), shortcuts:p.shortcuts.length===2&&p.shortcuts[0]==='观察周围的情况。'&&p.shortcuts[1]==='询问眼前的人发生了什么。'?[]:[...p.shortcuts],activePreset:p.activePreset||'legacy',theaters:cleanTheaters(p.theaters) });
}
function cleanApiUrl(value:unknown):string|undefined{if(typeof value!=='string'||value.length>2000||!value.trim())return;try{const u=new URL(value.trim());if(u.username||u.password||u.search||u.hash||!['http:','https:'].includes(u.protocol))return;return u.href;}catch{return;}}
const secretNames = new Set(['apikey', 'api_key', 'key', 'authorization', 'access_token', 'token', 'password', 'secret', '__proto__', 'prototype', 'constructor']);
function inspect(value: unknown, depth = 0, path = ''): void {
  if (depth > 18) throw new Error('备份结构过深');
  if (!value || typeof value !== 'object') return;
  const anchor=record(value)&&/^sessions\/\d+\/terminal\/(?:conversations\/\d+(?:\/messages\/\d+)?|rooms\/\d+\/rounds\/\d+(?:\/interactions\/\d+)?|partyRooms\/\d+\/rounds\/\d+|werewolfGames\/\d+|groupInvitations\/\d+|friends\/\d+|jobs\/\d+|memories\/\d+)\/anchor$/.test(path)&&Object.keys(value).every(k=>['key','turnId','variantId','path'].includes(k))&&typeof value.key==='string'&&value.key.length<=500&&/^(?:opening:[0-9a-f]{1,8}|[^\r\n]{1,128}:[^\r\n]{1,128}:[0-9a-f]{1,8})$/.test(value.key)&&typeof value.turnId==='string'&&typeof value.variantId==='string'&&Array.isArray(value.path);
  for (const [k,v] of Object.entries(value)) { if (secretNames.has(k.toLowerCase())&&!(k==='key'&&anchor)) throw new Error('备份含凭据或不允许的字段'); inspect(v, depth+1,path?path+'/'+k:k); }
}
export interface SaveFailureLocation{sessionId?:string;turnId?:string;variantId?:string;round?:number}
function locateFailure(error:unknown,context:SaveFailureLocation):never{
 if(error instanceof Error)for(const [key,value] of Object.entries(context))if(value!==undefined&&(error as unknown as Record<string,unknown>)[key]===undefined)(error as unknown as Record<string,unknown>)[key]=value;
 throw error;
}
export function saveFailureLocation(error:unknown):SaveFailureLocation{
 const value=record(error)?error:{};
 const text=(key:string)=>typeof value[key]==='string'&&value[key]?value[key] as string:undefined;
 const round=typeof value.round==='number'&&Number.isInteger(value.round)&&value.round>0?value.round:undefined;
 return {sessionId:text('sessionId'),turnId:text('turnId'),variantId:text('variantId'),round};
}
export function parseBackup(text: string): Snapshot {
  const value = JSON.parse(text.replace(/^\uFEFF/,'')) as Snapshot; inspect(value);
  const version=(value as any)?.version;if(version!==1&&version!==2)throw Error('备份版本不支持，请更新页面后再试。');
  if(version===2)assertBackupSnapshotFields(value);
  if(version===2&&!value.archive)throw Error('完整备份缺少人设档案资料，已停止导入。');
  if(value.archive!==undefined)value.archive=cleanBackupArchive(value.archive);value.version=1;
  if (!value || value.version !== 1 || !Array.isArray(value.sessions) || !value.preferences || !Array.isArray(value.preferences.profiles) || !Array.isArray(value.preferences.presets) || !Array.isArray(value.preferences.shortcuts)) throw new Error('不是支持的备份格式');
  value.sessions=sanitizeSessions(value.sessions);
  if (value.sessions.length > 100 || !value.preferences.profiles.length || value.preferences.profiles.length > 30) throw new Error('存档最多 100 份，接口档案必须为 1～30 份');
  const ids = new Set<string>();
  for (const s of value.sessions) {try{
    if (!s || typeof s.id !== 'string' || ids.has(s.id) || typeof s.name !== 'string' || typeof s.opening !== 'string' || !s.persona || typeof s.persona.name !== 'string' || !Array.isArray(s.turns) || !Array.isArray(s.memories) || !Array.isArray(s.suggestions) || !s.initial || !Array.isArray(s.initial.characters)) throw new Error('存档内容不完整');
    if(s.terminal!==undefined)validateTerminal(s.terminal);
    ids.add(s.id);
    s.persona=normalizePersona(s.persona,false);
    if(s.worldbookIds!==undefined)s.worldbookIds=cleanWorldbookIds(s.worldbookIds);
    for (const a of [s.initial.player, ...s.initial.characters]) {
      if (!a || typeof a.id !== 'string' || typeof a.name !== 'string' || (a.energy!==undefined&&!bounded(a.energy)) || (a.focus!==undefined&&!bounded(a.focus)) || (a.affinity!==undefined&&!affinityValue(a.affinity)) || typeof a.present !== 'boolean') throw new Error('初始状态不合法');
      actorPatch({ mentalPowerLevel:a.mentalPowerLevel,name: a.name, primaryGender: a.primaryGender, secondaryGender: a.secondaryGender,identity:a.identity,ability:a.ability, innerThought: a.innerThought,spiritAnimal:a.spiritAnimal,spiritThought:a.spiritThought, affinity: a.affinity, present: a.present });
    }
    if(s.initial.variables!==undefined)cleanJson(s.initial.variables);
    let rollingState=stateAt(s,0);
    const turnIds = new Set<string>();
    for (const [index,t] of s.turns.entries()) {
      if (!t || typeof t.id !== 'string' || turnIds.has(t.id) || typeof t.input !== 'string' || !Array.isArray(t.variants) || !Number.isInteger(t.selected) || t.selected < 0 || (t.variants.length && t.selected >= t.variants.length)) throw new Error('消息版本不合法');
      turnIds.add(t.id);
      t.randomEvent=cleanRandomEventGate(t.randomEvent,t.dice);
      if(t.randomEvent&&['preparing','failed','pending'].includes(t.randomEvent.status)&&(t.variants.length||t!==s.turns.at(-1)))throw new Error('待决定的随机事件不能有正文或后续回合');
      if (t.dice) { if (t.dice.rulesVersion !== 'd100-v1' || diceGrade(t.dice.value) !== t.dice.grade) throw new Error('骰子记录不合法'); }
      for(const v of t.variants)if(v?.generationRequirements!==undefined){const requirements=v.generationRequirements;if(!record(requirements)||Object.keys(requirements).some(k=>!['stateEnabled','theaters'].includes(k))||typeof requirements.stateEnabled!=='boolean')throw Error('本轮生成配置不正确');v.generationRequirements={stateEnabled:requirements.stateEnabled,theaters:cleanTheaters(requirements.theaters)};}
      let nextState=rollingState;
      for (const v of t.variants) {try{ if (!v || typeof v.id !== 'string' || typeof v.text !== 'string' || !['complete','incomplete'].includes(v.status)) throw new Error('回复格式不正确'); if(v.repairAudit!==undefined)validateRepairAudit(v.repairAudit,v.id); if (v.outcome) {const out=validateOutcome(v.outcome,rollingState,false,s.terminal?.contacts);assertDiceEventBinding(out.diceEvent,t.dice);if(v.status==='complete'&&v===t.variants[t.selected])nextState=stateAfterOutcome(rollingState,out,v.mvuOverride);} if(v.mvuOverride){if(v.status!=='complete'||!v.outcome)throw new Error('Invalid MVU override');stateAfterOutcome(rollingState,validateOutcome(v.outcome,rollingState,false,s.terminal?.contacts),v.mvuOverride);} }catch(error){locateFailure(error,{sessionId:s.id,turnId:t.id,variantId:v?.id,round:index+1});} }
      rollingState=nextState;
    }
    validateLedgerMetadata(s);
    if(s.hiddenActorCardIds!==undefined&&(!Array.isArray(s.hiddenActorCardIds)||s.hiddenActorCardIds.length>1000||s.hiddenActorCardIds.some(id=>!validActorId(id))))throw new Error('Invalid hidden actor cards');
    if(s.draftInput!==undefined&&(typeof s.draftInput!=='string'||s.draftInput.length>16000))throw new Error('Invalid input draft');
    for (const m of s.memories) {
      if(!m||typeof m!=='object')throw new Error('记忆格式不正确');
      if(m.terminalKey!==undefined&&(typeof m.terminalKey!=='string'||m.terminalKey.length>500))throw Error('终端记忆来源不正确');if(m.record!==undefined){m.record=validateMemoryRecord(m.record);if(m.status!=='ready')throw new Error('结构化记忆状态不正确');m.text=memoryText(m);}
      if(m.status!==undefined&&!['pending','ready','failed'].includes(m.status)||m.sourceFingerprint!==undefined&&typeof m.sourceFingerprint!=='string'||m.annotation!==undefined&&(typeof m.annotation!=='string'||m.annotation.length>3000)||m.error!==undefined&&typeof m.error!=='string'||m.indexError!==undefined&&typeof m.indexError!=='string')throw new Error('记忆任务状态不正确');
      if (!m || typeof m.id !== 'string' || typeof m.text !== 'string' || !['note','event','chapter'].includes(m.kind)) throw new Error('记忆格式不正确');
      if (m.sourceTurn && (!turnIds.has(m.sourceTurn) || !s.turns.find(t=>t.id===m.sourceTurn)?.variants.some(v=>v.id===m.sourceVariant))) throw new Error('记忆来源不存在');
      if (m.vector && (typeof m.vector.model !== 'string' || !Array.isArray(m.vector.values) || m.vector.values.length > 8192 || m.vector.values.some(n=>typeof n!=='number'||!Number.isFinite(n)))) throw new Error('记忆向量不正确');
      if (m.factVectors !== undefined && (!Array.isArray(m.factVectors) || m.factVectors.length > 400 || m.factVectors.some(v => !v || typeof v.id !== 'string' || !v.id || v.id.length > 300 || typeof v.text !== 'string' || !v.text || v.text.length > 8000 || typeof v.model !== 'string' || !v.model || v.model.length > 200 || !Array.isArray(v.values) || v.values.length > 8192 || v.values.some(n => typeof n !== 'number' || !Number.isFinite(n))))) throw new Error('记忆分段向量不正确');
    }
    if (s.forumActivity !== undefined) {
      if (!record(s.forumActivity) || Object.keys(s.forumActivity).length > 10000) throw new Error('论坛互动记录不合法');
      for (const activity of Object.values(s.forumActivity)) {
        if (!record(activity) || (activity.baseLikes!==undefined&&(!Number.isSafeInteger(activity.baseLikes)||Number(activity.baseLikes)<0||Number(activity.baseLikes)>1e9)) || typeof activity.liked !== 'boolean' || !Array.isArray(activity.replies) || activity.replies.length > 100 || activity.replies.some(r => !record(r) || !shortText(r.id,128,true) || !shortText(r.text,1000,true) || !shortText(r.createdAt,100,true)||(r.kind!==undefined&&r.kind!=='ai')||(r.kind==='ai'&&(!shortText(r.authorName,80,true)||!shortText(r.authorId,128,true)||!shortText(r.replyTo,128,true))))) throw new Error('论坛评论记录不合法');
      }
    }}catch(error){locateFailure(error,{sessionId:s?.id});}
  }
  for (const p of value.preferences.profiles) if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.providerId !== 'string' || typeof p.model !== 'string' || !Number.isFinite(p.temperature) || p.temperature < 0 || p.temperature > 2 || !Number.isInteger(p.maxTokens) || p.maxTokens < 1 || p.maxTokens > 32000) throw new Error('模型参数不正确');
  for(const p of value.preferences.profiles)for(const [key,min,max] of [['topP',0,1],['frequencyPenalty',-2,2],['presencePenalty',-2,2]] as const)if(p[key]!==undefined&&(!Number.isFinite(p[key])||p[key]!<min||p[key]!>max))throw new Error('采样参数不正确');
  for(const p of value.preferences.profiles)if(p.apiBaseUrl!==undefined&&!cleanApiUrl(p.apiBaseUrl))throw new Error('接口地址不能包含凭据、查询参数或片段');
  const profileIds=new Set(value.preferences.profiles.map(p=>p.id));
  if(profileIds.size!==value.preferences.profiles.length||[value.preferences.mainProfile,value.preferences.auxiliaryProfile,value.preferences.embeddingProfile].some(id=>!profileIds.has(id)))throw new Error('模型档案引用不正确');
  value.preferences.presets.forEach(cleanPreset);
  if(value.preferences.activePreset!==undefined&&typeof value.preferences.activePreset!=='string')throw new Error('预设引用不正确');
  if (value.preferences.shortcuts.some(x=>typeof x!=='string') || !['demo','server'].includes(value.preferences.mode)) throw new Error('偏好格式不正确');
  value.preferences = cleanPreferences(value.preferences);for(const session of value.sessions)prepareForumLikes(session);return value;
}
