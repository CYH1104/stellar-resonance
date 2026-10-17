import {internalPrompt} from './internal-prompts.mjs';
import {applyStateProtocol} from './state-protocol.mjs';
import {parseStateJson} from './state-json.mjs';
import {compatibleState} from './state-compat.mjs';
import {featurePrompts,featureContext} from './feature-prompts.mjs';
import {theaterRequirementError} from '../src/domain/theaterRequirements.ts';
import {separateIdentityAbility} from '../src/domain/identityAbility.ts';
import {storyWorldInfo,applyWorldInfo} from './worldbooks.mjs';
import {conversationParticipants,identityRule,historyMessage} from './participants.mjs';
import {narrationRule,narrativeViewpoint,anchorNarration} from './narration.mjs';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
import {applyWorldEntries} from './editor-store.mjs';
import {applyMvu,dataFromState,parseMvuMessage,cleanJson,renderMvuMacros} from '../src/domain/mvu.ts';
import {readPersonaExtra} from '../src/domain/personaExtras.ts';
import {cleanSpecialEvent} from '../src/domain/randomEvents.ts';
import { validateOutcome } from '../src/domain/story.ts';
import { normalizePersona } from '../src/domain/persona.ts';
import {cleanTheaters,cleanTheaterScenes,determinePairing} from '../src/domain/theaters.ts';
import {applyPromptEntries} from './presets.mjs';
import {spiritAnimalOf,mentalPowerLevelOf,identityOf,abilityOf} from './card.mjs';
import {cleanDice,cleanDiceEvent,dicePlan} from '../src/domain/dice.ts';
import {ReasoningFilter,scrubModelData,stripReasoning} from '../src/domain/reasoning.ts';

export const STATE_OPEN = '<SR_STATE>';
export const STATE_CLOSE = '</SR_STATE>';
const MVU_OPEN='<UpdateVariable>';
export const RESPONSE_END = '<SR_DONE>';
export const modelError = (status, code) => Object.assign(new Error(code), { status, code });
const text = (value, max, required=false) => typeof value==='string' && value.length<=max && (!required||!!value.trim());

export function buildPersonaMessages(card,wish,draft){
  if(!text(wish,3000,true))throw modelError(400,'INVALID_PERSONA_WISH');
  let current;try{current=normalizePersona(draft,false);}catch{throw modelError(400,'INVALID_PERSONA');}
  return [{role:'system',content:internalPrompt("ai.1")},
    {role:'system',content:internalPrompt("ai.6")+JSON.stringify({world:card.world})},
    {role:'user',content:JSON.stringify({wish,current})}];
}
export function parsePersonaResult(content){
  try{let value=stripReasoning(content).trim();const wrapped=value.match(/^<USER_PERSONA>\s*([\s\S]*?)\s*<\/USER_PERSONA>$/i);if(wrapped)value=wrapped[1];if(value.startsWith('```'))value=value.replace(/^```(?:json)?\s*\n?/,'').replace(/\n?```\s*$/,'');let {value:parsed}=parseStateJson(value);if(parsed&&typeof parsed==='object'&&Object.keys(parsed).length===1&&parsed.persona)parsed=parsed.persona;return normalizePersona(scrubModelData(parsed));}
  catch{throw modelError(502,'INVALID_PERSONA_RESULT');}
}

export function endpoint(baseUrl) {
  let url;try{url=new URL(baseUrl);}catch{throw modelError(400,'INVALID_MODEL_URL');}
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&local)))throw modelError(400,'INVALID_MODEL_URL');
  url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'')+'/chat/completions';
  return url.href;
}

function safeState(card, request) {
  if(!request.persona||!text(request.persona.name,80,true)||!request.state||!Array.isArray(request.state.characters))throw modelError(400,'INVALID_GAME_STATE');
  const player={id:'player',name:request.persona.name,present:true};
  const playerLevel=request.state.player?.mentalPowerLevel??request.persona.mentalPowerLevel;if(text(playerLevel,100,true))player.mentalPowerLevel=playerLevel;
  for(const field of ['primaryGender','secondaryGender'])if(text(request.persona[field],100))player[field]=request.persona[field];
  const identity=request.state.player?.identity??request.persona.identity;if(text(identity,200))player.identity=identity;
  if(request.persona.spiritAnimal)player.spiritAnimal=request.persona.spiritAnimal;
  const ability=request.state.player?.ability??request.persona.ability;if(text(ability,2000))player.ability=ability;
  if(text(request.state.player?.spiritThought,2000))player.spiritThought=request.state.player.spiritThought;
  const characters=card.characters.map(c=>{
    const previous=request.state.characters.find(a=>a.id===c.id);
    const mentalPowerLevel=previous?.mentalPowerLevel??mentalPowerLevelOf(c);
    const identity=text(previous?.identity,200,true)?previous.identity:identityOf(c);
    const ability=text(previous?.ability,2000,true)?previous.ability:abilityOf(c);
    return {id:c.id,name:c.name,present:previous?.present===true,...(ability?{ability}:{}),...(identity?{identity}:{}),...(mentalPowerLevel?{mentalPowerLevel}:{}),...(Number.isFinite(previous?.affinity)?{affinity:previous.affinity}:{}),...(c.sex?{secondaryGender:c.sex}:{}),...(c.primaryGender?{primaryGender:c.primaryGender}:{}),...(spiritAnimalOf(c)?{spiritAnimal:spiritAnimalOf(c)}:{}),...(text(previous?.innerThought,2000)?{innerThought:previous.innerThought}:{}),...(text(previous?.spiritThought,2000)?{spiritThought:previous.spiritThought}:{})};
  });
  const level=request.state.player?.mentalPowerLevel||request.persona.mentalPowerLevel||readPersonaExtra(request.persona.other,'\u7cbe\u795e\u529b\u7b49\u7ea7');if(text(level,100,true))player.mentalPowerLevel=level;
  for(const character of characters){const previous=request.state.characters.find(a=>a.id===character.id);const level=previous?.mentalPowerLevel||mentalPowerLevelOf(card.characters.find(c=>c.id===character.id));if(text(level,100))character.mentalPowerLevel=level;}
  let variables;try{variables=cleanJson(request.state.variables||{});}catch{throw modelError(400,'INVALID_GAME_STATE');}if(!variables||Array.isArray(variables)||typeof variables!=='object')throw modelError(400,'INVALID_GAME_STATE');
  return {player:separateIdentityAbility(player),characters:characters.map(separateIdentityAbility),variables};
}

export function buildMessages(card, request, privateBooks=[]) {
  card={...card,characters:card.characters.filter(c=>request.state?.characters?.some(a=>a.id===c.id))};
  try{request={...request,persona:normalizePersona(request.persona)};}catch{throw modelError(400,'INVALID_PERSONA');}
  if(!text(request.input,16000,true)||!Array.isArray(request.history)||request.history.length>24||request.history.some(m=>!['user','assistant'].includes(m.role)||!text(m.content,100000))||!Array.isArray(request.memories)||request.memories.length>8||request.memories.some(m=>!text(m,6000))||!Array.isArray(request.presets)||request.presets.some(p=>!text(p,8000)))throw modelError(400,'INVALID_GENERATION_REQUEST');
  const state=safeState(card,request),participants=conversationParticipants(card,request.persona);
  let dice;try{dice=cleanDice(request.continuation||request.generationType==='continue'?undefined:request.dice);}catch{throw modelError(400,'INVALID_DICE');}
  const plan=dice?dicePlan(dice):undefined;let specialEvent;try{if(!request.continuation&&request.generationType!=='continue'&&request.specialEvent!==undefined)specialEvent=cleanSpecialEvent(request.specialEvent);}catch{throw modelError(400,'INVALID_RANDOM_EVENT');}if(specialEvent&&!dice)throw modelError(400,'SPECIAL_EVENT_ROLL_REQUIRED');
  let theaterSettings;try{theaterSettings=cleanTheaters(request.theaterSettings);}catch{throw modelError(400,'INVALID_THEATER_SETTINGS');}
  let previousTheaters;try{previousTheaters=request.previousTheaters===undefined?undefined:cleanTheaterScenes(request.previousTheaters);}catch{throw modelError(400,'INVALID_GENERATION_REQUEST');}
  const diaryOwners=[state.player,...state.characters].filter(c=>c.spiritAnimal?.trim()).map(c=>({ownerId:c.id,ownerName:c.name,...(c.id==='player'?{spiritAnimal:c.spiritAnimal}:{})}));
  const theaterPlans=theaterSettings.filter(t=>t.enabled).map(t=>{if(isSpiritDiary(t))return {...t,diaryOwners};if(t.kind!=='fanfic')return t;const char=t.charId?state.characters.find(c=>c.id===t.charId):state.characters.find(c=>c.present);return {...t,...(char?{participantIds:['player',char.id],pairing:determinePairing(request.persona,char)}:{})};});
  const rules=request.stateEnabled===false?internalPrompt('feature.story'):internalPrompt("ai.2", {p0:(STATE_OPEN),p1:(STATE_CLOSE),p2:(RESPONSE_END),p3:(STATE_CLOSE)});
  const dynamicRules=featurePrompts(theaterPlans,request.suggestionsEnabled!==false);
  const diceRules=dice?internalPrompt("ai.4", {p0:(dice.value),p1:(dice.grade),p2:(plan.direction),p3:(plan.requirement),p4:(plan.direction)}):'';
  const selectedEventRules=specialEvent?'\n本轮唯一随机事件已由玩家接受并掷骰：'+JSON.stringify(specialEvent)+internalPrompt("ai.8"):'';
  const diaryPlan=theaterPlans.find(t=>isSpiritDiary(t));
  const diaryExample=diaryPlan&&diaryOwners.length?internalPrompt("ai.9")+JSON.stringify({slot:diaryPlan.slot,kind:'custom',title:diaryPlan.title,content:'',diary:{ownerId:diaryOwners[0].ownerId,title:'这篇日记的小标题',mood:'心情',content:'今天我……\n\n我发现……'}})+internalPrompt("ai.10"):'';
  const privateCard={world:{},places:[],characters:[]};
  const promptState={...state,characters:state.characters.map(({id,name,present,affinity,innerThought,spiritThought})=>({id,name,present,affinity,innerThought,spiritThought}))};
  const context=featureContext({...(previousTheaters?{previousTheaters}:{}),participants,narrativeViewpoint:narrativeViewpoint(state.player),mvu:dataFromState(promptState),persona:request.persona,state:promptState,memories:request.memories.map(stripReasoning),presets:request.promptEntries?[]:request.presets,theaterPlans,forumContext:request.forumContext||[],dice,dicePlan:plan,specialEvent},theaterPlans,request);
  const mvuRules=request.stateEnabled===false?'':internalPrompt("ai.5", {p0:(STATE_OPEN),p1:(RESPONSE_END)});
  const messages=[{role:'system',content:identityRule(participants)+'\n'+rules+diceRules+dynamicRules+diaryExample+selectedEventRules+mvuRules+'\n'+narrationRule(state.player.name)},{role:'system',content:'服务器私有的角色与世界定义：\n'+JSON.stringify(privateCard)},{role:'system',content:internalPrompt("ai.12")+JSON.stringify(context)}];
  if(request.stateSeparate){messages[0].content=identityRule(participants)+'\n'+narrationRule(state.player.name)+internalPrompt("ai.13")+diceRules+selectedEventRules;messages[2].content=internalPrompt("ai.14")+JSON.stringify({participants,persona:request.persona,memories:request.memories.map(stripReasoning),...(dice?{dice}:{}),...(specialEvent?{specialEvent}:{})});}
  if((request.historyStart||0)===0&&text(request.opening,6000,true))messages.push({role:'assistant',content:request.opening});
  messages.push(...request.history.map(m=>historyMessage(m,participants,stripReasoning)),{role:'user',content:request.input});
  let entries;try{entries=request.promptEntries?.filter(entry=>!request.stateSeparate||!/<UpdateVariable|JSONPatch|SR_STATE|SR_DONE|状态输出|格式修复|正则/i.test(entry.content)).map(entry=>({...entry,content:renderMvuMacros(entry.content,dataFromState(promptState))}));}catch{throw modelError(400,'INVALID_GENERATION_REQUEST');}
  return {messages:anchorNarration((request.stateSeparate?((m)=>m):applyStateProtocol)(applyWorldInfo(applyWorldEntries(applyPromptEntries(messages,entries,request.persona,participants.char.name,request.generationType),card.world.entries,request),storyWorldInfo(privateBooks,request,participants.char.name)),request.input),state.player,request.input),state,theaterSettings,dice,card};
}

export function normalizeModelState(card, state, raw,options={}) {
  if(options.singleStateCall){raw=compatibleState(raw,card,state,options);options={...options,requireDynamicState:false,compatibilityPrepared:true};}
  const allowed=['mvu','presentCharacterIds','player','characters','event','diceEvent','forum','theaters','suggestions'];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw modelError(502,'INVALID_MODEL_STATE');
  if(Object.keys(raw).some(k=>!allowed.includes(k)))throw modelError(502,'MODEL_STATE_FIELDS_INVALID');
  if(!Array.isArray(raw.presentCharacterIds)||raw.presentCharacterIds.length>card.characters.length||new Set(raw.presentCharacterIds).size!==raw.presentCharacterIds.length)throw modelError(502,'MODEL_STATE_ROSTER_INVALID');
  if(!text(raw.event,500,true))throw modelError(502,'MODEL_STATE_EVENT_INVALID');
  let diceEvent;
  if(options.dice){try{if(raw.diceEvent===undefined)throw modelError(502,'DICE_EVENT_MISSING');diceEvent=cleanDiceEvent(raw.diceEvent);if(diceEvent.direction!==dicePlan(options.dice).direction)throw modelError(502,'DICE_EVENT_MISMATCH');}catch(error){if(!options.compatibilityPrepared)throw error.code?error:modelError(502,'DICE_EVENT_MISMATCH');diceEvent=undefined;options.validationWarnings?.push('STATE_DICE_METADATA_SKIPPED');}}
  // Ordinary prose and continuations do not consume a new dice event; ignore stale model metadata.

  let mvuState=state;if(raw.mvu!==undefined){try{mvuState=applyMvu(state,raw.mvu);}catch{throw modelError(502,'MODEL_STATE_CHARACTERS_INVALID');}}
  const known=new Map(card.characters.map(c=>[c.id,c]));
  if(raw.presentCharacterIds.some(id=>!known.has(id)))throw modelError(502,'UNKNOWN_MODEL_CHARACTER');
  let updates=raw.characters||[];
  if(!Array.isArray(updates)||updates.some(c=>!c||!known.has(c.id))||new Set(updates.map(c=>c.id)).size!==updates.length)throw modelError(502,'MODEL_STATE_CHARACTERS_INVALID');
  if(raw.mvu!==undefined){updates=state.characters.map(before=>{const after=mvuState.characters.find(c=>c.id===before.id),patch={...(updates.find(c=>c.id===before.id)||{id:before.id})};for(const field of ['affinity','innerThought','spiritThought','mentalPowerLevel'])if(after[field]!==before[field]){if(patch[field]!==undefined&&patch[field]!==after[field])throw modelError(502,'MODEL_STATE_CHARACTERS_INVALID');patch[field]=after[field];}return patch;});for(const c of state.characters){if(c.present!==mvuState.characters.find(a=>a.id===c.id).present&&raw.presentCharacterIds.includes(c.id)!==mvuState.characters.find(a=>a.id===c.id).present)throw modelError(502,'MODEL_STATE_ROSTER_INVALID');}}
  const present=new Set(raw.presentCharacterIds);
  if(!Array.isArray(updates)||updates.some(c=>!c||!known.has(c.id))||new Set(updates.map(c=>c.id)).size!==updates.length)throw modelError(502,'MODEL_STATE_CHARACTERS_INVALID');
  // The model's full scene roster is authoritative; no client-selected cast is used.
  const characters=card.characters.map(c=>{
    const patch=updates.find(a=>a.id===c.id)||{id:c.id};
    if(Object.keys(patch).some(k=>!['ability','identity','mentalPowerLevel','id','name','primaryGender','secondaryGender','innerThought','spiritAnimal','spiritThought','affinity','present'].includes(k)))throw modelError(502,'MODEL_STATE_CHARACTERS_INVALID');
    if(options.requireDynamicState&&patch.affinity!==undefined&&(!Number.isFinite(patch.affinity)||patch.affinity< -100||patch.affinity>100))throw modelError(502,'CHARACTER_AFFINITY_MISSING');
    if(options.requireDynamicState&&present.has(c.id)){
      if(!Number.isFinite(patch.affinity)||patch.affinity< -100||patch.affinity>100)throw modelError(502,'CHARACTER_AFFINITY_MISSING');
      if(spiritAnimalOf(c)&&(!text(patch.spiritThought,2000,true)||/^(?:未提供|未知|待生成|待更新|暂无)[。.!！]?$/u.test(patch.spiritThought.trim())))throw modelError(502,'CHARACTER_SPIRIT_THOUGHT_MISSING');
    }
    const identity=patch.identity??(present.has(c.id)?state.characters.find(a=>a.id===c.id)?.identity||identityOf(c):undefined);
    return {id:c.id,present:present.has(c.id),...(patch.ability!==undefined?{ability:patch.ability}:{}),...(identity!==undefined?{identity}:{}),...(patch.mentalPowerLevel!==undefined?{mentalPowerLevel:patch.mentalPowerLevel}:{}),...(patch.affinity!==undefined?{affinity:patch.affinity}:{}),...(spiritAnimalOf(c)?{spiritAnimal:spiritAnimalOf(c)}:{}),...(patch.innerThought!==undefined?{innerThought:patch.innerThought}:{}),...(spiritAnimalOf(c)&&patch.spiritThought!==undefined?{spiritThought:patch.spiritThought}:{})};
  });
  let player;
  if(raw.mvu!==undefined){const patch={...(raw.player||{})};for(const field of ['identity','spiritThought','mentalPowerLevel'])if(mvuState.player[field]!==state.player[field]){if(patch[field]!==undefined&&patch[field]!==mvuState.player[field])throw modelError(502,'MODEL_STATE_PLAYER_INVALID');patch[field]=mvuState.player[field];}raw={...raw,player:patch};}
  if(raw.player!==undefined){if(!raw.player||typeof raw.player!=='object'||Array.isArray(raw.player)||Object.keys(raw.player).some(k=>!['ability','mentalPowerLevel','name','identity','primaryGender','secondaryGender','innerThought','spiritAnimal','spiritThought','affinity'].includes(k)))throw modelError(502,'MODEL_STATE_PLAYER_INVALID');player={...(raw.player.ability!==undefined?{ability:raw.player.ability}:{}),...(raw.player.mentalPowerLevel!==undefined?{mentalPowerLevel:raw.player.mentalPowerLevel}:{}),...(raw.player.identity!==undefined?{identity:raw.player.identity}:{}),...(state.player.spiritAnimal&&raw.player.spiritThought!==undefined?{spiritThought:raw.player.spiritThought}:{})};}
  if(!options.compatibilityPrepared&&text(state.player.spiritAnimal,1500,true)&&(!text(raw.player?.spiritThought,2000,true)||/^(?:未提供|未知|待生成|待更新|暂无)[。.!！]?$/u.test(raw.player.spiritThought.trim())))throw modelError(502,'PLAYER_SPIRIT_THOUGHT_MISSING');
  let theaters;
  try{
    const settings=cleanTheaters(options.theaterSettings),enabled=settings.filter(t=>t.enabled);
    theaters=cleanTheaterScenes(raw.theaters||[]).filter(s=>enabled.some(t=>t.slot===s.slot)).map(scene=>{
      const setting=enabled.find(t=>t.slot===scene.slot);if(scene.kind!==setting.kind)throw Error();
      const result={...scene,title:setting.title};
      if(isSpiritDiary(setting)){
        const owners=[state.player,...state.characters].filter(c=>c.spiritAnimal?.trim());
        if(scene.diary){const owner=owners.find(c=>c.id===scene.diary.ownerId);if(!owner||!options.compatibilityPrepared&&!/我|咱/u.test(scene.diary.content))throw modelError(502,'MODEL_STATE_DIARY_INVALID');result.diary={...scene.diary,ownerName:owner.name,spiritAnimal:owner.spiritAnimal};result.content=scene.diary.content;}
        else if(options.requireDynamicState&&owners.length)throw modelError(502,'MODEL_STATE_DIARY_INVALID');
      }else if(scene.diary)throw modelError(502,'MODEL_STATE_DIARY_INVALID');
      if(scene.kind==='fanfic'){
        const char=setting.charId?state.characters.find(c=>c.id===setting.charId):state.characters.find(c=>present.has(c.id)&&c.id===scene.participantIds?.[1])||state.characters.find(c=>c.id===scene.participantIds?.[1]);
        if(!char||scene.participantIds?.[1]!==char.id)throw Error();
        result.pairing=determinePairing(options.persona||{},char);
      }
      if(options.requireDynamicState){const code=theaterRequirementError(result,isSpiritDiary(setting),[state.player,...state.characters].some(a=>a.spiritAnimal?.trim()));if(code){if(options.singleStateCall&&['MODEL_FANFIC_TOO_SHORT','MODEL_DIARY_TOO_SHORT'].includes(code)){options.validationWarnings?.push(code);}else throw modelError(502,code);}}
      return result;
    });
  }catch(error){if(['MODEL_STATE_DIARY_INVALID','MODEL_FANFIC_TOO_SHORT','MODEL_FANFIC_UNFINISHED','MODEL_DIARY_TOO_SHORT'].includes(error.code))throw error;throw modelError(502,'MODEL_STATE_THEATERS_INVALID');}
  if(options.requireDynamicState){
    const enabled=cleanTheaters(options.theaterSettings).filter(t=>t.enabled);
    for(const setting of enabled){
      if(setting.slot===1){if(!Array.isArray(raw.forum)||!raw.forum.length)throw modelError(502,'MODEL_THEATERS_MISSING');}
      else{const scene=theaters.find(s=>s.slot===setting.slot&&s.kind===setting.kind);if(!scene||(scene.kind==='group'?!scene.messages?.some(m=>m.speaker.trim()&&m.content.trim()):!scene.content.trim()))throw modelError(502,'MODEL_THEATERS_MISSING');}
    }
  }
  if(player)try{validateOutcome({event:raw.event,player},state);}catch{throw modelError(502,'MODEL_STATE_PLAYER_INVALID');}
  try{validateOutcome({event:raw.event,characters},state);}catch{throw modelError(502,'MODEL_STATE_CHARACTERS_INVALID');}
  const forum=cleanTheaters(options.theaterSettings).some(t=>t.slot===1&&t.enabled)?raw.forum:[];
  if(forum!==undefined)try{validateOutcome({event:raw.event,forum},state);}catch{throw modelError(502,'MODEL_STATE_FORUM_INVALID');}
  return validateOutcome({event:raw.event,suggestions:raw.suggestions??[],...(raw.mvu!==undefined?{mvu:raw.mvu}:{}),...(diceEvent?{diceEvent}:{}),characters,...(player?{player}:{}),...(raw.forum!==undefined?{forum}:{}),...(raw.theaters!==undefined?{theaters}:{})},state);
}

/** Streaming protocol decoder. Reserved control text never becomes a public delta. */
export class StoryDecoder {
  mvuControl='';pending='';control='';inState=false;emitted=0;raw='';story='';
  beginStateRepair(){this.mvuControl='';this.pending='';this.control='';this.inState=true;this.raw=this.story;}
  push(chunk){
    if(typeof chunk!=='string')throw modelError(502,'INVALID_MODEL_RESPONSE');
    this.raw+=chunk;if(this.raw.length>400000)throw modelError(502,'MODEL_RESPONSE_TOO_LARGE');
    const visible=this.decode(chunk);this.story+=visible;this.emitted+=visible.length;if(this.emitted>200000)throw modelError(502,'MODEL_RESPONSE_TOO_LARGE');return visible;
  }
  decode(chunk){
    if(this.inState){this.control+=chunk;const rest=this.cleanControl();return rest?this.decode(rest):'';}
    if(this.pending&&[STATE_OPEN,RESPONSE_END,MVU_OPEN].some(token=>token.startsWith(this.pending))){
      const combined=this.pending+chunk;
      if(chunk.startsWith('<')||this.pending.length>=3&&![STATE_OPEN,RESPONSE_END,MVU_OPEN].some(token=>token.startsWith(combined)||combined.startsWith(token)))this.pending='';
    }
    this.pending+=chunk;let visible='';
    while(this.pending){
      const sr=this.pending.indexOf(STATE_OPEN),mvu=this.pending.indexOf(MVU_OPEN),open=sr<0?mvu:mvu<0?sr:Math.min(sr,mvu),done=this.pending.indexOf(RESPONSE_END);
      const marker=open<0?done:done<0?open:Math.min(open,done);
      if(marker>=0){
        let prose=this.pending.slice(0,marker);
        // A continuation may restart a marker that the previous response cut in half.
        for(const token of [STATE_OPEN,RESPONSE_END,MVU_OPEN])for(let n=token.length-1;n>=3;n--)if(prose.endsWith(token.slice(0,n))){prose=prose.slice(0,-n);break;}
        visible+=prose;
        if(marker===open){this.control=this.pending.slice(marker+(marker===mvu?0:STATE_OPEN.length));this.pending='';this.inState=true;const rest=this.cleanControl();if(rest)visible+=this.decode(rest);break;}
        this.pending=this.pending.slice(marker+RESPONSE_END.length);continue;
      }
      let keep=0;for(const token of [STATE_OPEN,RESPONSE_END,MVU_OPEN])for(let n=1;n<token.length;n++)if(this.pending.endsWith(token.slice(0,n)))keep=Math.max(keep,n);
      visible+=keep?this.pending.slice(0,-keep):this.pending;this.pending=keep?this.pending.slice(-keep):'';break;
    }
    return visible;
  }
  cleanControl(){
    if(this.control.startsWith(MVU_OPEN)){const close=this.control.indexOf('</UpdateVariable>');if(close<0){if(this.control.length>100000)throw modelError(502,'MODEL_STATE_TOO_LARGE');return;}const end=close+'</UpdateVariable>'.length,rest=this.control.slice(end);this.mvuControl+=this.control.slice(0,end);this.control='';this.inState=false;return rest;}
    // If a model restarts a truncated JSON block, only its final complete block is used.
    const restart=this.control.lastIndexOf(STATE_OPEN);if(restart>=0){const prefix=this.control.slice(0,restart);if(prefix.includes(MVU_OPEN))this.mvuControl+=prefix;this.control=this.control.slice(restart+STATE_OPEN.length);}
    const close=this.control.indexOf(STATE_CLOSE);
    if(close>=0){const offset=close+STATE_CLOSE.length,tail=this.control.slice(offset),done=tail.indexOf(RESPONSE_END);if(done>0&&RESPONSE_END.startsWith(tail.slice(0,done).trim()))this.control=this.control.slice(0,offset)+tail.slice(done);}
    if(this.control.length>100000)throw modelError(502,'MODEL_STATE_TOO_LARGE');
  }
  hasCompletionMarker(){const close=this.control.indexOf(STATE_CLOSE);return this.inState&&close>=0&&this.control.slice(close+STATE_CLOSE.length).replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g,'').trim()===RESPONSE_END;}
  finish(card,state,options){
    if(!this.inState)throw modelError(502,'MODEL_RESPONSE_INCOMPLETE');
    const end=this.control.indexOf(STATE_CLOSE);if(end<0)throw modelError(502,'MODEL_RESPONSE_INCOMPLETE');
    let {value:raw,info}=parseStateJson(this.control.slice(0,end));this.jsonInfo=info;
    let tailText=this.control.slice(end+STATE_CLOSE.length);
    try{const markup=this.mvuControl+tailText;const ops=parseMvuMessage(markup);if(ops.length)raw={...raw,mvu:ops};if((markup.match(/<UpdateVariable>/g)||[]).length!==(markup.match(/<\/UpdateVariable>/g)||[]).length)throw Error();}catch{if(!options?.singleStateCall)throw modelError(502,'MODEL_STATE_JSON_INVALID');options.validationWarnings?.push('STATE_MVU_SKIPPED');}
    const outcome=normalizeModelState(card,state,scrubModelData(raw),options);
    const tail=tailText.replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g,'').trim();
    if(tail!==RESPONSE_END){if(options?.singleStateCall&&tail==='')options.validationWarnings?.push('STATE_END_MARKER_RECOVERED');else{if(RESPONSE_END.startsWith(tail))throw modelError(502,'MODEL_RESPONSE_INCOMPLETE');throw modelError(502,'INVALID_COMPLETION_MARKER');}}
    if(!this.story.trim()){if(options?.singleStateCall)options.validationWarnings?.push('STATE_STORY_MISSING');else throw modelError(502,'MODEL_STORY_EMPTY');}return outcome;
  }
}

export async function* completionChunks(response,{reasoningFilter=new ReasoningFilter(),onProgress=()=>{},signal}={}) {
  if(!response.body)throw modelError(502,'INVALID_MODEL_RESPONSE');
  const stats={contentChars:0,visibleChars:0,reasoningChars:0,finishReason:''};
  let hasVisible=false;
  const contentText=content=>typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p&&p.thought!==true&&['text','output_text',undefined].includes(p.type)&&typeof p.text==='string').map(p=>p.text).join(''):undefined;
  const accept=choice=>{
    const part=choice?.delta||choice?.message||{};
    const hidden=part.reasoning_content??part.reasoning??part.thinking;
    if(typeof hidden==='string')stats.reasoningChars+=hidden.length;
    const content=contentText(part.content);
    if(typeof content==='string')stats.contentChars+=content.length;
    if(typeof choice?.finish_reason==='string')stats.finishReason=choice.finish_reason;
    const visible=content===undefined?'':reasoningFilter.push(content);stats.visibleChars+=visible.length;hasVisible||=!!visible.trim();
    onProgress({...stats});return visible;
  };
  const finish=()=>{
    const tail=reasoningFilter.finish();stats.visibleChars+=tail.length;hasVisible||=!!tail.trim();
    onProgress({...stats});
    if(!hasVisible)throw modelError(502,reasoningFilter.unclosed?'MODEL_REASONING_UNCLOSED':stats.reasoningChars?'MODEL_REASONING_ONLY':stats.contentChars?'MODEL_NO_VISIBLE_CONTENT':'MODEL_EMPTY_RESPONSE');
    return tail;
  };
  // An abort must also interrupt a stalled response body, not only the initial fetch.
  const reader=response.body.getReader(),decoder=new TextDecoder();let received=0,buffer='';
  const abort=()=>{void reader.cancel().catch(()=>{});};signal?.throwIfAborted();signal?.addEventListener('abort',abort,{once:true});
  async function read(){const next=await reader.read();signal?.throwIfAborted();received+=next.value?.byteLength||0;if(received>2000000)throw modelError(502,'MODEL_RESPONSE_TOO_LARGE');return next;}
  try{
    if(response.headers.get('content-type')?.includes('application/json')){
      while(true){const next=await read();buffer+=decoder.decode(next.value,{stream:!next.done});if(next.done)break;}
      let value;try{value=JSON.parse(buffer);}catch{throw modelError(502,'INVALID_MODEL_RESPONSE');}
      if(value?.error)throw modelError(502,'UPSTREAM_FAILED');
      if(!Array.isArray(value?.choices)||!value.choices.length)throw modelError(502,'INVALID_MODEL_RESPONSE');
      const visible=accept(value.choices[0]);if(visible)yield visible;const tail=finish();if(tail)yield tail;return;
    }
    if(!response.headers.get('content-type')?.includes('text/event-stream'))throw modelError(502,'INVALID_MODEL_RESPONSE');
    const parse=block=>{
      const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(!data)return {visible:'',end:false};if(data==='[DONE]')return {visible:'',end:true};
      let event;try{event=JSON.parse(data);}catch{throw modelError(502,'INVALID_MODEL_RESPONSE');}
      if(event?.error)throw modelError(502,'UPSTREAM_FAILED');
      const choice=event?.choices?.[0];return {visible:accept(choice),end:!!choice?.finish_reason};
    };
    while(true){
      const next=await read();buffer+=decoder.decode(next.value,{stream:!next.done});buffer=buffer.replace(/\r\n/g,'\n');let end;
      while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=parse(block);if(event.visible)yield event.visible;if(event.end){const tail=finish();if(tail)yield tail;return;}}
      if(buffer.length>100000)throw modelError(502,'MODEL_RESPONSE_TOO_LARGE');
      if(next.done){if(buffer.trim()){const event=parse(buffer);if(event.visible)yield event.visible;}const tail=finish();if(tail)yield tail;return;}
    }
  }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function openCompletion({connection,key,profile,messages,signal,fetchImpl=fetch}){
  if(!text(key,8192,true))throw modelError(400,'MODEL_KEY_REQUIRED');
  if(!profile||!text(profile.model,150,true)||!Number.isFinite(profile.temperature)||profile.temperature<0||profile.temperature>2||!Number.isInteger(profile.maxTokens)||profile.maxTokens<1||profile.maxTokens>32000)throw modelError(400,'INVALID_MODEL_PROFILE');
  const sampling={};for(const [key,target,min,max] of [['topP','top_p',0,1],['frequencyPenalty','frequency_penalty',-2,2],['presencePenalty','presence_penalty',-2,2]])if(profile[key]!==undefined){if(!Number.isFinite(profile[key])||profile[key]<min||profile[key]>max)throw modelError(400,'INVALID_MODEL_PROFILE');sampling[target]=profile[key];}
  let response;
  try{response=await fetchImpl(connection.url,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:profile.model,messages,temperature:profile.temperature,max_tokens:profile.maxTokens,...sampling,stream:true})});}
  catch(error){if(signal.reason?.name==='TimeoutError')throw modelError(504,'MODEL_TIMEOUT');if(signal.aborted)throw error;throw modelError(502,'MODEL_UNREACHABLE');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw modelError(502,response.status===401||response.status===403?'UPSTREAM_AUTH':response.status===429?'UPSTREAM_RATE_LIMIT':'UPSTREAM_REJECTED');}
  return response;
}
