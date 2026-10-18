import {newDynamicActor} from '../src/domain/dynamicActors.ts';
import {validAffinity} from '../src/domain/affinity.ts';
import {validateOutcome} from '../src/domain/story.ts';
import {applyMvu,cleanOperations,pointer} from '../src/domain/mvu.ts';
import {cleanTheaters,cleanTheaterScenes,determinePairing} from '../src/domain/theaters.ts';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
import {theaterRequirementError} from '../src/domain/theaterRequirements.ts';
import {displayText} from '../src/domain/storyMarkup.ts';

const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const dynamic=['ability','identity','mentalPowerLevel','affinity','relationship','innerThought','spiritThought'];
const aliases={好感度:'affinity',关系:'relationship',精神体OS:'spiritThought',精神体想法:'spiritThought',内心想法:'innerThought',身份:'identity',精神力等级:'mentalPowerLevel',能力:'ability'};
const numeric=v=>typeof v==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):v;
const boolean=v=>v===true||v==='true'||v===1?true:v===false||v==='false'||v===0?false:undefined;

/** Recover unambiguous model data, never invent actors or execute preset code.
 * Strict schema validation still applies to each accepted field/section. */
export function compatibleState(raw,card,state,options){
  if(!object(raw))return raw;
  if(options.stateEnabled===false)raw={...raw,presentCharacterIds:state.characters.filter(c=>c.present).map(c=>c.id),characters:[],player:undefined,mvu:undefined};
  const warn=code=>{if(!options.validationWarnings?.includes(code))options.validationWarnings?.push(code);};
  const known=new Map(state.characters.map(c=>[c.id,c]));
  const resolve=value=>{const key=typeof value==='string'?value:object(value)?value.id??value.name:undefined;if(known.has(key))return key;const matches=[...known.values()].filter(c=>c.name===key);return matches.length===1?matches[0].id:undefined;};
  const out={event:typeof raw.event==='string'&&raw.event.trim()?displayText(raw.event).slice(0,500):'本轮剧情已生成，状态按有效字段更新。'};
  if(out.event!==raw.event)warn('STATE_EVENT_RECOVERED');
  let mvuState=state,mvuAccepted=false;
  if(raw.mvu!==undefined){
    try{mvuState=applyMvu(state,raw.mvu);mvuAccepted=true;}catch{
      warn('STATE_MVU_REJECTED');
      raw={...raw,mvu:undefined,characters:[],player:undefined,presentCharacterIds:state.characters.filter(c=>c.present).map(c=>c.id)};
    }
    // Actor changes are flattened into the canonical snapshot once. Custom
    // variables remain an MVU update; no duplicate delta or immutable overwrite.
    if(JSON.stringify(mvuState.variables||{})!==JSON.stringify(state.variables||{}))out.mvu=[{op:'replace',path:'/custom',value:mvuState.variables||{}}];
  }
  for(const actor of mvuState.characters)if(!known.has(actor.id))known.set(actor.id,actor);
  const patches=new Map(mvuState.characters.filter(c=>!state.characters.some(a=>a.id===c.id)).map(c=>[c.id,{...c}]));
  const actorFields=(value,before,player=false)=>{
    const result={};if(!object(value))return result;
    for(const [key,original]of Object.entries(value)){
      const field=aliases[key]||key;
      if(!dynamic.includes(field)||player&&['affinity','innerThought'].includes(field)||field==='spiritThought'&&!before?.spiritAnimal)continue;
      let v=field==='affinity'?numeric(original):original;if(typeof v==='string')v=displayText(v);if(typeof v==='string'&&!v.trim()&&before?.[field]){warn('STATE_EMPTY_FIELD_RETAINED');continue;}
      try{
        const candidate=player?{player:{[field]:v}}:{characters:[{id:before.id,[field]:v}]};
        validateOutcome({event:out.event,...candidate},{...state,characters:[...known.values()]});
        if(field==='affinity'&&(!validAffinity(v)))throw Error();
        result[field]=v;if(v!==original||key!==field)warn('STATE_FIELD_NORMALIZED');
      }catch{warn('STATE_FIELD_SKIPPED');}
    }
    return result;
  };
  for(const before of state.characters){const after=mvuState.characters.find(c=>c.id===before.id);const changes=Object.fromEntries(dynamic.filter(k=>after?.[k]!==before[k]).map(k=>[k,after[k]]));patches.set(before.id,{id:before.id,...actorFields(changes,before)});}
  const entries=Array.isArray(raw.characters)?raw.characters:object(raw.characters)?Object.entries(raw.characters).map(([id,v])=>object(v)?{...v,id:v.id??id}:v):[];
  if(raw.characters!==undefined&&!Array.isArray(raw.characters))warn('STATE_CHARACTERS_NORMALIZED');
  let embeddedPlayer={};
  for(const value of entries){if(object(value)&&value.id==='player'){embeddedPlayer={...embeddedPlayer,...actorFields(value,state.player,true)};continue;}let id=resolve(value);if(!id){try{const actor=newDynamicActor(value);id=actor.id;known.set(id,actor);patches.set(id,{...actor});}catch{warn('STATE_UNKNOWN_CHARACTER_SKIPPED');continue;}}patches.set(id,{...patches.get(id),...actorFields(value,known.get(id))});}
  out.characters=[...patches.values()];
  const playerChanges=Object.fromEntries(dynamic.filter(k=>mvuState.player?.[k]!==state.player[k]).map(k=>[k,mvuState.player[k]]));
  const player={...actorFields(playerChanges,state.player,true),...embeddedPlayer,...actorFields(raw.player,state.player,true)};if(Object.keys(player).length)out.player=player;
  const roster=raw.presentCharacterIds;
  if(Array.isArray(roster)){
    const ids=roster.map(resolve);if(ids.some(id=>!id))warn('STATE_UNKNOWN_CHARACTER_SKIPPED');
    // An entirely unrecognized roster is not evidence that everybody left.
    out.presentCharacterIds=roster.length&&ids.every(id=>!id)?state.characters.filter(c=>c.present).map(c=>c.id):[...new Set(ids.filter(Boolean))];
  }else{
    warn('STATE_ROSTER_RETAINED');
    out.presentCharacterIds=[...known.values()].filter(c=>{const patch=entries.find(e=>resolve(e)===c.id);return boolean(patch?.present)??mvuState.characters.find(a=>a.id===c.id)?.present??c.present;}).map(c=>c.id);
  }
  if(raw.diceEvent!==undefined)out.diceEvent=raw.diceEvent;
  const suggestions=raw.suggestions??raw.quickReplies??raw.quick_replies??raw['快捷回复'];
  if(suggestions!==undefined)try{out.suggestions=validateOutcome({event:out.event,suggestions},state).suggestions;}catch{warn('STATE_SUGGESTIONS_SKIPPED');}
  if(Array.isArray(raw.forum)){
    out.forum=[];const ids=new Set();if(raw.forum.length>3)warn('STATE_FORUM_LIMIT_APPLIED');
    for(const [index,p]of raw.forum.slice(0,3).entries()){
      if(!object(p))continue;const id=typeof p.id==='string'&&p.id.trim()?p.id:'post-'+index;if(ids.has(id))continue;
      const content=p.content??p.text??p.body??p['内容'];
      const post={id,authorName:p.authorName??p.author??p.name??p['发布主体']??'匿名',content:typeof content==='string'?displayText(content):content};
      for(const [key,value,max]of [['type',p.type??p.postType??p['类型'],40],['time',p.time??p.timeLabel??p['时间'],80]]){
        if(value===undefined)continue;
        if(typeof value==='string'&&value.length<=max)post[key]=value.trim();else warn('STATE_FORUM_METADATA_SKIPPED');
      }
      const topic=p.topic??p['话题'];if(typeof topic==='string')post.topic=topic.replace(/^#+|#+$/g,'').trim();
      try{validateOutcome({event:out.event,forum:[post]},state);}catch{warn('STATE_FORUM_POST_SKIPPED');continue;}
      ids.add(id);post.comments=[];
      const comments=p.comments??p['评论'];if(Array.isArray(comments)&&comments.length>3)warn('STATE_FORUM_COMMENT_LIMIT_APPLIED');
      for(const [i,value]of (Array.isArray(comments)?comments:[]).slice(0,3).entries()){
        const match=typeof value==='string'?value.match(/^([^:：\n]{1,80})[:：]([\s\S]+)$/):undefined;
        const c=typeof value==='string'?{authorName:match?.[1]?.trim()||'匿名',content:match?.[2]?.trim()||value}:value;
        if(!object(c))continue;const content=c.content??c.text??c['内容'];
        const comment={id:typeof c.id==='string'?c.id:'comment-'+i,authorName:c.authorName??c.author??c.name??c['用户']??'匿名',content:typeof content==='string'?displayText(content):content};
        try{validateOutcome({event:out.event,forum:[{...post,comments:[...post.comments,comment]}]},state);post.comments.push(comment);}catch{warn('STATE_FORUM_COMMENT_SKIPPED');}
      }
      out.forum.push(post);
    }
  }
  const settings=cleanTheaters(options.theaterSettings),enabled=settings.filter(s=>s.enabled);
  if(raw.theaters!==undefined){
    out.theaters=[];const scenes=Array.isArray(raw.theaters)?raw.theaters:object(raw.theaters)?Object.entries(raw.theaters).map(([slot,v])=>object(v)?{...v,slot:v.slot??Number(slot)}:v):[];
    for(const value of scenes){
      if(!object(value))continue;const slot=numeric(value.slot),setting=enabled.find(s=>s.slot===slot);if(!setting||slot===1)continue;
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
      try{const clean=cleanTheaterScenes([scene])[0],hasSpirit=[state.player,...state.characters].some(a=>a.spiritAnimal?.trim());const usable=s=>!theaterRequirementError(s,isSpiritDiary(setting),hasSpirit)&&(s.kind==='group'?s.messages?.some(m=>m.speaker.trim()&&m.content.trim()):s.content.trim());const at=out.theaters.findIndex(s=>s.slot===slot);if(at<0)out.theaters.push(clean);else if(usable(clean)||!usable(out.theaters[at]))out.theaters[at]=clean;}catch{warn('STATE_THEATER_SKIPPED');}
    }
  }
  if(options.requireDynamicState){
    for(const scene of out.theaters||[]){const setting=enabled.find(s=>s.slot===scene.slot);const code=theaterRequirementError(scene,isSpiritDiary(setting),[state.player,...state.characters].some(a=>a.spiritAnimal?.trim()));if(code)warn(code);}
    if(options.stateEnabled!==false){for(const id of out.presentCharacterIds){const patch=patches.get(id),before=known.get(id);if(!mvuAccepted&&patch?.affinity===undefined)warn('STATE_AFFINITY_RETAINED');if(before?.spiritAnimal&&!patch?.spiritThought)warn('STATE_SPIRIT_THOUGHT_RETAINED');}
    if(state.player.spiritAnimal&&!out.player?.spiritThought)warn('STATE_PLAYER_THOUGHT_RETAINED');}
    if(enabled.some(s=>s.slot===1?!out.forum?.length:!out.theaters?.some(t=>t.slot===s.slot)))warn('STATE_SIDE_SCENE_RETAINED');
  }
  return out;
}
