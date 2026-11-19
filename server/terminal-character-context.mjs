import {activeWorldEntries} from './editor-store.mjs';
import {resolveWorldbooks} from '../src/domain/worldbooks.ts';

const normalized=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,'').toLocaleLowerCase();
const string=value=>typeof value==='string'?value:'';
const cleanGender=value=>string(value).trim();
const genderRule='Authoritative character gender facts (server reference, not dialogue): primaryGender/第一性别 and secondaryGender/第二性别 are independent. 男/male remains male even when Omega; 女/female remains female even when Alpha. Never infer primary gender from ABO, name, appearance, voice, temperament or old pronouns. Unknown means unspecified, not permission to guess. Server-confirmed facts override contradictory old generated text. These references do not grant characters knowledge of private facts or permission to quote settings.';
function characters(card,state){
 const out=[...(card.characters||[])];for(const actor of state?.characters||[])if(actor&&typeof actor.id==='string'&&!out.some(c=>c.id===actor.id))out.push(actor);return out;
}
/** Deliberately contains identity/gender only: no display description, private prompts or thoughts. */
export function characterGenderContext(card,state,options={}){
 const selected=options.ids?new Set(options.ids):undefined;
 const rows=characters(card,state).filter(c=>!selected||selected.has(c.id)).map(c=>({id:c.id,...(!options.anonymous?{name:c.name}:{}),primaryGender:cleanGender(c.primaryGender)||'未明确',secondaryGender:cleanGender(c.sex)||cleanGender(c.secondaryGender)||'未明确'}));
 return {role:'system',content:genderRule+'\n'+JSON.stringify({authoritativeCharacters:rows})};
}
function namesIn(text,roster){const value=normalized(text);return roster.filter(c=>normalized(c.name)&&value.includes(normalized(c.name))).map(c=>c.id);}
function headingOwner(line,roster){
 const value=normalized(line).replace(/^[#*\-\s]+/u,'').replace(/^[【\[「『]+/u,'');
 const found=roster.filter(c=>{const name=normalized(c.name);return name&&(value===name||value.startsWith(name)&&/^[\]】」』:：\-(（|]/u.test(value.slice(name.length)));});
 return found.length===1?found[0].id:null;
}
function genericHeading(line){return /^\s*(?:#{1,6}\s|[「『【]|[-=]{3,})/.test(line);}
function generalWorldParagraph(text){
 // Only explicitly general constraints qualify for an unattributed block. Personal narrative is not global lore.
 return /世界|学院|学年|学制|星历|历法|信息素|第一性别|第二性别|Alpha|Beta|Omega|Enigma|规则|校规|制度|种族|星际|world|calendar|setting/iu.test(text)&&!/(?:秘密|私密|隐藏|隐瞒|暗恋|身世|家族|童年|经历|secret|private|hidden)/iu.test(text);
}
/** Segment monolithic server books by normalized character headings; never broadcast other owners' blocks.
 * A paragraph mentioning several named characters is ambiguous and is omitted, even if all are selected.
 */
export function selectTerminalLore(text,roster,targetIds,{hint,global=true}={}){
 if(typeof text!=='string'||!text.trim())return [];
 const targets=new Set(targetIds),result=[];let owner=hint||null,buffer=[];
 const flush=()=>{const block=buffer.join('\n');buffer=[];for(const paragraph of block.split(/\r?\n[\t ]*\r?\n/)){
  if(!paragraph.trim())continue;const mentioned=namesIn(paragraph,roster);
  if(owner){if(targets.has(owner)&&mentioned.every(id=>id===owner))result.push({owner,content:paragraph.trim()});}
  else if(global&&mentioned.length===0&&generalWorldParagraph(paragraph))result.push({owner:null,content:paragraph.trim()});
 }};
 for(const line of text.split(/\r?\n/)){
  const next=headingOwner(line,roster);
  if(next){flush();owner=next;buffer.push(line);continue;}
  if(genericHeading(line)){flush();owner=null;buffer.push(line);continue;}
  buffer.push(line);
 }
 flush();return result;
}
function relatedIds(plan,card,data){
 const selected=new Set(plan.ids||[]),roster=characters(card,data.context?.state);
 if(data.task==='command'||data.task==='divination'&&data.context?.divination?.kind==='npc')return [...selected];
 // Participants are already validated by partyPlan. Names in current input are used only to include public gender facts.
 for(const p of plan.party?.participants||[])if(roster.some(a=>a.id===p.id))selected.add(p.id);
 const contexts=[plan.repairContext,data.context?.conversation];
 for(const c of contexts){if(!c||typeof c!=='object')continue;for(const id of [...(c.members||[]),...(c.friendIds||[]),...(c.privateRecipientIds||[]),...(c.groups||[]).flatMap(g=>g.members||[])])if(roster.some(a=>a.id===id))selected.add(id);}
 for(const id of namesIn([data.input||'',JSON.stringify(data.context?.conversation?.messages||[])].join('\n'),roster))selected.add(id);
 return [...selected];
}
function loreHint(entry,roster){const hits=namesIn([entry.title||entry.comment||'',...(entry.keys||entry.key||[])].join('\n'),roster);return hits.length===1?hits[0]:undefined;}
function activeLore(card,data,privateBooks,roster,targets){
 const actorNames=roster.filter(c=>targets.includes(c.id)).map(c=>c.name);
 const query=[...actorNames,...actorNames.map(normalized),data.input||''].join('\n');
 const request={input:query,history:[],opening:'',persona:data.persona||{name:''}};
 const entries=activeWorldEntries(card.world?.entries||[],request).map(e=>({content:e.content,hint:loreHint(e,roster)}));
 if(privateBooks.length){
  const hints=new Map(privateBooks.flatMap(b=>b.entries.map(e=>[e.content,loreHint(e,roster)])));
  const resolved=resolveWorldbooks(privateBooks,{messages:[query],userName:data.persona?.name||'',charName:card.world?.name||'',persona:'',seed:data.sessionId||data.input||'',actors:roster});
  entries.push(...resolved.entries.map(e=>({content:e.content,hint:hints.get(e.content)})));
 }
 return entries;
}
/** Add target-owned acting references plus safe global rules. Never reads client worldInfo or arbitrary paths. */
export function appendTerminalCharacterContext(plan,card,data,privateBooks=[]){
 const roster=characters(card,data.context?.state),anonymous=data.task==='command',npcDivination=data.task==='divination'&&data.context?.divination?.kind==='npc',eleven=['party-eleven','party-eleven-talk','party-liar-turn','party-liar-reply'].includes(data.task);
 const ids=relatedIds(plan,card,data),targets=(plan.ids||[]).filter(id=>id!=='player');
 if(['main-auto','main-followup'].includes(data.task))for(const id of ids)if(id!=='player'&&!targets.includes(id))targets.push(id);
 const block=characterGenderContext(card,data.context?.state,{ids,anonymous});
 if(!anonymous&&!npcDivination){
  const player={id:'player',name:data.persona?.name||'',primaryGender:cleanGender(data.persona?.primaryGender)||'未明确',secondaryGender:cleanGender(data.persona?.secondaryGender)||'未明确'};
  block.content+='\nPlayer reference only (not automatically known to NPCs): '+JSON.stringify(player);
 }
 // Anonymous commands carry no names, lore or player profile; only the issuing actor's non-identifying gender facts.
 if(!anonymous){
  const references=[];
  for(const entry of activeLore(card,data,privateBooks,roster,targets))references.push(...selectTerminalLore(entry.content,roster,targets,{hint:entry.hint}));
  for(const actor of roster.filter(c=>targets.includes(c.id)))if(actor.hiddenPrompt)references.push(...selectTerminalLore(actor.hiddenPrompt,roster,[actor.id],{hint:actor.id,global:false}));
  // Exact server references only. In eleven, no caller profile rawText, state notes, memory or hidden card context enters here.
  const unique=[...new Map(references.map(r=>[r.owner+'\n'+r.content,r])).values()];let total=0;
  const bounded=unique.filter(r=>{if(r.content.length>16000||total+r.content.length>48000)return false;total+=r.content.length;return true;});
  if(bounded.length)block.content+='\nTerminal world/character acting references (narrator reference only; each owner block applies ONLY to that actor, not shared character knowledge; never quote another person\'s secrets):\n'+JSON.stringify(bounded);
 }
 if(eleven)block.content+='\nFor this card task these server references contain no live cards, score or choices. Never infer them from persona or public dialogue; public speech is potentially a bluff.';
 const messages=plan.messages.map(m=>({...m}));messages.splice(Math.max(1,messages.length-1),0,block);
 return {...plan,messages};
}
