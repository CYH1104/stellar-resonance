import {validateOutcome} from '../src/domain/story.ts';
import {applyMvu,cleanOperations,pointer} from '../src/domain/mvu.ts';
import {cleanTheaters,cleanTheaterScenes,determinePairing} from '../src/domain/theaters.ts';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
import {theaterRequirementError} from '../src/domain/theaterRequirements.ts';
import {displayText} from '../src/domain/storyMarkup.ts';

const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const dynamic=['ability','identity','mentalPowerLevel','affinity','innerThought','spiritThought'];
const aliases={好感度:'affinity',精神体OS:'spiritThought',精神体想法:'spiritThought',内心想法:'innerThought',身份:'identity',精神力等级:'mentalPowerLevel',能力:'ability'};
const numeric=v=>typeof v==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):v;
const boolean=v=>v===true||v==='true'||v===1?true:v===false||v==='false'||v===0?false:undefined;

/** Recover unambiguous model data, never invent actors or execute preset code.
 * Strict schema validation still applies to each accepted field/section. */
export function compatibleState(raw,card,state,options){
  if(!object(raw))return raw;
  const warn=code=>{if(!options.validationWarnings?.includes(code))options.validationWarnings?.push(code);};
  const known=new Map(state.characters.filter(c=>card.characters.some(k=>k.id===c.id)).map(c=>[c.id,c]));
  const resolve=value=>{const key=typeof value==='string'?value:object(value)?value.id??value.name:undefined;if(known.has(key))return key;const matches=[...known.values()].filter(c=>c.name===key);return matches.length===1?matches[0].id:undefined;};
  const out={event:typeof raw.event==='string'&&raw.event.trim()?displayText(raw.event).slice(0,500):'本轮剧情已生成，状态按有效字段更新。'};
  if(out.event!==raw.event)warn('STATE_EVENT_RECOVERED');
  let mvuState=state;
  if(raw.mvu!==undefined){
    try{mvuState=applyMvu(state,raw.mvu);}catch{
      warn('STATE_MVU_PROJECTED');
      let operations=[];try{operations=cleanOperations(raw.mvu);}catch{warn('STATE_MVU_SKIPPED');}
      for(const op of operations){
        try{
          const parts=pointer(op.path),projected=[];
          const addActor=(base,value)=>{if(!object(value))return;for(const field of [...dynamic.filter(f=>f!=='ability'),'present'])if(Object.hasOwn(value,field))projected.push({op:'add',path:base+'/'+field,value:field==='affinity'?numeric(value[field]):value[field]});};
          if(['add','replace','insert'].includes(op.op)&&parts[0]==='characters'&&parts.length===2&&known.has(parts[1]))addActor('/characters/'+parts[1],op.value);
          else if(['add','replace'].includes(op.op)&&parts.length===1&&parts[0]==='characters'&&object(op.value)){for(const [id,value]of Object.entries(op.value))if(known.has(id))addActor('/characters/'+id,value);}
          else if(['add','replace'].includes(op.op)&&op.path==='/player')addActor('/player',op.value);
          else projected.push(op);
          for(const patch of projected)try{mvuState=applyMvu(mvuState,[patch]);}catch{warn('STATE_MVU_FIELD_SKIPPED');}
        }catch{warn('STATE_MVU_FIELD_SKIPPED');}
      }
    }
    // Actor changes are flattened into the canonical snapshot once. Custom
    // variables remain an MVU update; no duplicate delta or immutable overwrite.
    if(JSON.stringify(mvuState.variables||{})!==JSON.stringify(state.variables||{}))out.mvu=[{op:'replace',path:'/custom',value:mvuState.variables||{}}];
  }
  const patches=new Map();
  const actorFields=(value,before,player=false)=>{
    const result={};if(!object(value))return result;
    for(const [key,original]of Object.entries(value)){
      const field=aliases[key]||key;
      if(!dynamic.includes(field)||player&&['affinity','innerThought'].includes(field)||field==='spiritThought'&&!before?.spiritAnimal)continue;
      let v=field==='affinity'?numeric(original):original;if(typeof v==='string')v=displayText(v);if(typeof v==='string'&&!v.trim()&&before?.[field]){warn('STATE_EMPTY_FIELD_RETAINED');continue;}
      try{
        const candidate=player?{player:{[field]:v}}:{characters:[{id:before.id,[field]:v}]};
        validateOutcome({event:out.event,...candidate},state);
        if(field==='affinity'&&(v< -100||v>100))throw Error();
        result[field]=v;if(v!==original||key!==field)warn('STATE_FIELD_NORMALIZED');
      }catch{warn('STATE_FIELD_SKIPPED');}
    }
    return result;
  };
  for(const before of state.characters){const after=mvuState.characters.find(c=>c.id===before.id);const changes=Object.fromEntries(dynamic.filter(k=>after?.[k]!==before[k]).map(k=>[k,after[k]]));patches.set(before.id,{id:before.id,...actorFields(changes,before)});}
  const entries=Array.isArray(raw.characters)?raw.characters:object(raw.characters)?Object.entries(raw.characters).map(([id,v])=>object(v)?{...v,id:v.id??id}:v):[];
  if(raw.characters!==undefined&&!Array.isArray(raw.characters))warn('STATE_CHARACTERS_NORMALIZED');
  for(const value of entries){const id=resolve(value);if(!id){warn('STATE_UNKNOWN_CHARACTER_SKIPPED');continue;}patches.set(id,{...patches.get(id),...actorFields(value,known.get(id))});}
  out.characters=[...patches.values()];
  const playerChanges=Object.fromEntries(dynamic.filter(k=>mvuState.player?.[k]!==state.player[k]).map(k=>[k,mvuState.player[k]]));
  const player={...actorFields(playerChanges,state.player,true),...actorFields(raw.player,state.player,true)};if(Object.keys(player).length)out.player=player;
  const roster=raw.presentCharacterIds;
  if(Array.isArray(roster)){
    const ids=roster.map(resolve);if(ids.some(id=>!id))warn('STATE_UNKNOWN_CHARACTER_SKIPPED');
    // An entirely unrecognized roster is not evidence that everybody left.
    out.presentCharacterIds=roster.length&&ids.every(id=>!id)?state.characters.filter(c=>c.present).map(c=>c.id):[...new Set(ids.filter(Boolean))];
  }else{
    warn('STATE_ROSTER_RETAINED');
    out.presentCharacterIds=state.characters.filter(c=>{const patch=entries.find(e=>resolve(e)===c.id);return boolean(patch?.present)??mvuState.characters.find(a=>a.id===c.id)?.present??c.present;}).map(c=>c.id);
  }
  if(raw.diceEvent!==undefined)out.diceEvent=raw.diceEvent;
  if(raw.suggestions!==undefined)try{out.suggestions=validateOutcome({event:out.event,suggestions:raw.suggestions},state).suggestions;}catch{warn('STATE_SUGGESTIONS_SKIPPED');}
  if(Array.isArray(raw.forum)){
    out.forum=[];const ids=new Set();
    for(const [index,p]of raw.forum.slice(0,12).entries()){
      if(!object(p))continue;const id=typeof p.id==='string'&&p.id.trim()?p.id:'post-'+index;if(ids.has(id))continue;
      const post={id,authorName:p.authorName??p.author??p.name,content:typeof p.content==='string'?displayText(p.content):p.content};
      if(p.topic!==undefined)post.topic=p.topic;
      try{validateOutcome({event:out.event,forum:[post]},state);}catch{warn('STATE_FORUM_POST_SKIPPED');continue;}
      ids.add(id);post.comments=[];
      for(const [i,c]of (Array.isArray(p.comments)?p.comments:[]).slice(0,16).entries()){
        if(!object(c))continue;const comment={id:typeof c.id==='string'?c.id:'comment-'+i,authorName:c.authorName??c.author??c.name,content:typeof c.content==='string'?displayText(c.content):c.content};
        try{validateOutcome({event:out.event,forum:[{...post,comments:[...post.comments,comment]}]},state);post.comments.push(comment);}catch{warn('STATE_FORUM_COMMENT_SKIPPED');}
      }
      out.forum.push(post);
    }
  }
  const settings=cleanTheaters(options.theaterSettings),enabled=settings.filter(s=>s.enabled);
  if(raw.theaters!==undefined){
    out.theaters=[];const scenes=Array.isArray(raw.theaters)?raw.theaters:object(raw.theaters)?Object.entries(raw.theaters).map(([slot,v])=>object(v)?{...v,slot:v.slot??Number(slot)}:v):[];
    for(const value of scenes){
      if(!object(value))continue;const slot=numeric(value.slot),setting=enabled.find(s=>s.slot===slot);if(!setting||slot===1||out.theaters.some(s=>s.slot===slot))continue;
      const scene={slot,kind:setting.kind,title:setting.title,content:typeof value.content==='string'?displayText(value.content):''};
      if(scene.kind==='group'){
        const messages=value.messages??value.content;
        scene.messages=Array.isArray(messages)?messages.filter(object).map(m=>({speaker:m.speaker??m.name??m.authorName,content:typeof (m.content??m.text)==='string'?displayText(m.content??m.text):m.content})).filter(m=>typeof m.speaker==='string'&&m.speaker.length<=80&&typeof m.content==='string'&&m.content.length<=1000).slice(0,24):[];
        if(!scene.messages.length&&scene.content.trim())scene.messages=[{speaker:'群聊',content:scene.content.slice(0,1000)}];
      }
      if(scene.kind==='fanfic'){
        const participant=value.participantIds?.[1]??value.pairing?.charId??setting.charId;
        const id=resolve(participant);if(id){scene.participantIds=['player',id];scene.pairing=determinePairing(options.persona||{},known.get(id));}
        else{warn('STATE_FANFIC_PARTICIPANT_MISSING');continue;}
        if(typeof value.complete==='boolean')scene.complete=value.complete;
      }
      if(isSpiritDiary(setting)){
        const diary=object(value.diary)?value.diary:object(value.content)?value.content:undefined;
        if(diary){const owner=diary.ownerId==='player'?state.player:known.get(resolve(diary.ownerId??diary.ownerName));if(owner?.spiritAnimal){scene.diary={ownerId:owner.id,ownerName:owner.name,spiritAnimal:owner.spiritAnimal,title:typeof diary.title==='string'?diary.title:setting.title,content:typeof diary.content==='string'?displayText(diary.content):scene.content,...(typeof diary.mood==='string'?{mood:diary.mood}:{}),...(typeof diary.date==='string'?{date:diary.date}:{})};scene.content=scene.diary.content;}}
        // A plain diary still has readable text; keep it without inventing an owner.
      }
      try{const clean=cleanTheaterScenes([scene])[0];out.theaters.push(clean);if(options.requireDynamicState){const code=theaterRequirementError(clean,isSpiritDiary(setting),[state.player,...state.characters].some(a=>a.spiritAnimal?.trim()));if(code)warn(code);}}catch{warn('STATE_THEATER_SKIPPED');}
    }
  }
  if(options.requireDynamicState){
    for(const id of out.presentCharacterIds){const patch=patches.get(id),before=known.get(id);if(patch?.affinity===undefined)warn('STATE_AFFINITY_RETAINED');if(before?.spiritAnimal&&!patch?.spiritThought)warn('STATE_SPIRIT_THOUGHT_RETAINED');}
    if(state.player.spiritAnimal&&!out.player?.spiritThought)warn('STATE_PLAYER_THOUGHT_RETAINED');
    if(enabled.some(s=>s.slot===1?!out.forum?.length:!out.theaters?.some(t=>t.slot===s.slot)))warn('STATE_SIDE_SCENE_RETAINED');
  }
  return out;
}
