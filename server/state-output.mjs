import {newDynamicActor,resolveActorId} from '../src/domain/dynamicActors.ts';
import {dataFromState,applyMvu,readPath,pointer} from '../src/domain/mvu.ts';
import {scenePaths,storyScene,validSceneValue} from '../src/domain/storyScene.ts';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const round=v=>Math.round(v*1e6)/1e6;
const reason=v=>typeof v==='string'&&v.trim().length>=4&&v.length<=300&&!/^(?:略|按剧情|已更新|无|未知|待生成)[。.!！]?$/u.test(v.trim());
const textFields=['relationship','innerThought','spiritThought'];
const aliases={好感度:'affinity',关系:'relationship',内心想法:'innerThought',精神体OS:'spiritThought',精神体想法:'spiritThought'};
export function normalizeStateFields(value,warn){
 if(!object(value))return value;
 const grouped=new Map();for(const [key,v]of Object.entries(value)){const normalized=aliases[key.trim()]||key.trim();if(grouped.has(normalized)&&JSON.stringify(grouped.get(normalized))!==JSON.stringify(v)){grouped.set(normalized,undefined);warn('STATE_FIELD_CONFLICT');}else if(!grouped.has(normalized))grouped.set(normalized,v);if(normalized!==key)warn('STATE_FIELD_NORMALIZED');}
 return Object.fromEntries([...grouped].filter(([,v])=>v!==undefined));
}
export function outputManifest(state,options={}){
 const sceneSchema=Object.fromEntries(Object.values(scenePaths).map(path=>[path,{type:'string',clearable:false}]));
 const schema={};const visit=(v,path)=>{if(object(v)){for(const [k,x]of Object.entries(v))if(!k.startsWith('_'))visit(x,path+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1'));}else schema[path]={type:Array.isArray(v)?'array':typeof v,clearable:false};};visit(state?.variables||{},'/custom');
 return {schemaVersion:'state-output-v1',requestId:options.requestId||'local-test',registeredCharacters:(state?.characters||[]).map(c=>({id:c.id,name:c.name,present:c.present,spiritAnimal:c.spiritAnimal})),requiredPlayerFields:state?.player?.spiritAnimal?['spiritThought']:[],requiredCharacterFields:['affinity','relationship','innerThought'],spiritRequiredIds:(state?.characters||[]).filter(c=>c.present&&c.spiritAnimal).map(c=>c.id),affinityRange:{min:-100,max:100},newCharacterAffinity:0,affinityIncreaseGuidance:{usualDeltas:[0.5,1],preferredMax:3,hardPerTurnCap:false},affinityDecreaseGuidance:{hardPerTurnCap:false},enabledTheaterSlots:(options.theaterSettings||[]).filter(t=>t.enabled!==false).map(t=>t.slot),customVariableSchema:{...schema,...sceneSchema},...(options.repairPlan?{repairOnly:options.repairPlan}:{})};
}
/** V1 is converted once to existing absolute snapshots. No second affinity patch. */
export function adaptStateOutput(raw,state,options,warn){
 if(raw?.schemaVersion===undefined)return {raw,records:[],reviewed:[]};
 const records=[],reviewed=[];
 const empty=()=>({raw:{event:raw.event},records,reviewed});
 if(raw.schemaVersion!=='state-output-v1'||raw.requestId!==(options.requestId||'local-test')){warn('STATE_REQUEST_MISMATCH');return empty();}
 if(Object.keys(raw).some(k=>!['schemaVersion','requestId','event','presentCharacterIds','characters','player','customUpdates','suggestions','diceEvent'].includes(k))){warn('STATE_PROTOCOL_CONFLICT');return empty();}
 const out={event:raw.event,...(raw.suggestions!==undefined?{suggestions:raw.suggestions}:{}),...(raw.diceEvent?{diceEvent:raw.diceEvent}:{}),characters:[]};
 const roster=[...state.characters],seen=new Set(),blocked=new Set();
 const rows=Array.isArray(raw.characters)?raw.characters:[];
 for(const row of rows){const id=resolveActorId(roster,row)||row?.id?.trim();if(seen.has(id))blocked.add(id);seen.add(id);}
 const field=(value,old,key)=>{
  if(!object(value)||Object.keys(value).some(k=>!['action','value','reason'].includes(k))){warn('STATE_FIELD_SKIPPED');return;}
  if(value.action==='set'&&Object.keys(value).every(k=>['action','value'].includes(k))&&typeof value.value==='string'&&value.value.trim()&&value.value.length<=(key==='relationship'?200:2000))return value.value;
  if(value.action==='keep'&&Object.keys(value).length===1&&typeof old==='string'&&old.trim()&&!/^(未知|未提供|待生成|待更新|暂无)$/.test(old.trim()))return old;
  // None of the current actor fields is a clearable temporary field.
  warn('STATE_FIELD_SKIPPED');
 };
 for(const value of rows){
  if(!object(value)){warn('STATE_FIELD_SKIPPED');continue;}
  const normalized=normalizeStateFields(value,warn),row={...normalized,id:typeof normalized.id==='string'?normalized.id.trim():normalized.id};
  let id=resolveActorId(state.characters,row),actor=state.characters.find(a=>a.id===id),fresh=false;
  if(blocked.has(id||row.id)){warn('STATE_DUPLICATE_CHARACTER');continue;}
  if(id&&row.id!==id)warn('STATE_CHARACTER_ID_NORMALIZED');
  if(!actor){try{const facts=Object.fromEntries(Object.entries(row).filter(([key])=>!['affinity',...textFields].includes(key)));actor=newDynamicActor({...facts,affinity:0});id=actor.id;roster.push(actor);fresh=true;}catch{warn('STATE_UNKNOWN_CHARACTER_SKIPPED');continue;}}
  const allowed=['id','name','affinity',...textFields,...(fresh?['present','spiritAnimal','identity','mentalPowerLevel','primaryGender','secondaryGender','ability']:[])];
  for(const key of Object.keys(row))if(!allowed.includes(key)){warn('STATE_FIELD_SKIPPED');delete row[key];}
  const patch=fresh?{...actor}:{id};
  if(options.repairPlan&&!options.repairPlan.roster&&!options.repairPlan.affinityIds.includes(id)&&!options.repairPlan.spiritIds.includes(id)&&!options.repairPlan.textFields?.[id])continue;
  if(!options.repairPlan||options.repairPlan.affinityIds.includes(id)){
   const a=row.affinity,delta=typeof a?.delta==='string'&&/^-?\d+(?:\.\d+)?$/.test(a.delta.trim())?Number(a.delta):a?.delta;
   if(object(a)&&Object.keys(a).every(k=>['delta','reason'].includes(k))&&typeof delta==='number'&&Number.isFinite(delta)&&Math.abs(delta)<=Number.MAX_SAFE_INTEGER&&reason(a.reason)&&typeof actor.affinity==='number'&&actor.affinity>=-100&&actor.affinity<=100){
    const after=round(Math.min(100,Math.max(-100,actor.affinity+delta))),appliedDelta=round(after-actor.affinity);
    patch.affinity=after;reviewed.push(id);records.push({id,before:actor.affinity,requestedDelta:delta,appliedDelta,after,reason:a.reason.trim(),bounded:appliedDelta!==delta});
    if(delta>3)warn('STATE_AFFINITY_LARGE_INCREASE');
   }else warn('STATE_ATTITUDE_REVIEW_MISSING');
  }
  for(const key of textFields){
   if(key==='spiritThought'&&!actor.spiritAnimal)continue;
   if(options.repairPlan&&!(key==='spiritThought'?options.repairPlan.spiritIds.includes(id):options.repairPlan.textFields?.[id]?.includes(key)||key==='relationship'&&options.repairPlan.affinityIds.includes(id)))continue;
   const v=field(row[key],actor[key],key);if(v!==undefined)patch[key]=v;
  }
  out.characters.push(patch);
 }
 if(Array.isArray(raw.presentCharacterIds)){
  const ids=raw.presentCharacterIds.map(v=>resolveActorId(roster,typeof v==='string'?v.trim():v));
  if(ids.some(id=>!id)||new Set(ids).size!==ids.length)warn('STATE_ROSTER_RETAINED');else {
   // A missing row is not evidence of departure and must remain repairable.
   const omitted=state.characters.filter(c=>c.present&&!ids.includes(c.id)&&!out.characters.some(p=>p.id===c.id)).map(c=>c.id);
   if(omitted.length)warn('STATE_ROSTER_RETAINED');
   out.presentCharacterIds=[...ids,...omitted];
  }
 }else warn('STATE_ROSTER_RETAINED');
 const required=new Set([...(state.characters.filter(c=>c.present).map(c=>c.id)),...(out.presentCharacterIds||[])]);
 if(!options.repairPlan)for(const id of required){if(!reviewed.includes(id))warn('STATE_ATTITUDE_REVIEW_MISSING');}
 if(state.player.spiritAnimal&&(!options.repairPlan||options.repairPlan.spiritIds.includes('player'))){const v=field(raw.player?.spiritThought,state.player.spiritThought,'spiritThought');if(v!==undefined)out.player={spiritThought:v};}
 if(raw.player&&Object.keys(raw.player).some(k=>k!=='spiritThought'))warn('STATE_FIELD_SKIPPED');
 const custom=raw.customUpdates;
 if(custom!==undefined){
  try{
   if(!Array.isArray(custom)||options.repairPlan&&custom.some(u=>!options.repairPlan.customPaths?.includes(u?.path)))throw Error();const ops=[],manifest=outputManifest(state,options);
   for(const u of custom){
    if(!object(u)||!manifest.customVariableSchema[u.path]||pointer(u.path).some(k=>k.startsWith('_'))||!reason(u.reason)||Object.keys(u).some(k=>!['path','action','value','delta','reason'].includes(k)))throw Error();
    const sceneKey=Object.keys(scenePaths).find(key=>scenePaths[key]===u.path);
    const current=sceneKey?storyScene(state)[sceneKey]:readPath(dataFromState(state).stat_data,u.path);
    if(sceneKey&&u.action==='set'&&!validSceneValue(u.path,u.value))throw Error();
    if(u.action==='keep'){if('value'in u||'delta'in u)throw Error();continue;}
    if(u.action==='set'&&!('delta'in u)&&typeof current===typeof u.value&&Array.isArray(current)===Array.isArray(u.value))ops.push({op:'replace',path:u.path,value:u.value});
    else if(u.action==='delta'&&!('value'in u)&&typeof current==='number'&&typeof u.delta==='number'&&Number.isFinite(u.delta))ops.push({op:'delta',path:u.path,value:u.delta});
    else throw Error();
   }
   if(ops.length){applyMvu(state,ops);out.mvu=ops;}
  }catch{warn('STATE_CUSTOM_REJECTED');}
 }
 return {raw:out,records,reviewed};
}
