import {personaDescription} from './participants.mjs';
/** Resolve scoped-lore actor labels from this request, never from another open save. */
export function nativeTaskActors(data,fallback=[]){
 const rows=Array.isArray(data?.rounds)?data.rounds.flatMap(round=>[round?.before?.characters,round?.after?.characters]):[data?.before?.characters,data?.after?.characters,data?.state?.characters,data?.context?.state?.characters];
 const arrays=rows.filter(Array.isArray),actors=arrays.length?arrays.flat():fallback,byId=new Map();
 for(const actor of actors)if(actor&&typeof actor.id==='string'&&actor.id&&typeof actor.name==='string'&&actor.name)byId.set(actor.id,{id:actor.id,name:actor.name});
 return [...byId.values()];
}

/** Explicit user/persona projection for native macros; absent context clears prior state. */
export function nativeTaskProjection(data){
 const batch=Array.isArray(data?.rounds),item=batch?data.rounds.at(-1):data;
 const persona=batch?item?.persona:data?.persona??data?.draft??data?.context?.persona;
 const player=item?.after?.player??item?.before?.player??(batch?undefined:data?.state?.player??data?.context?.state?.player);
 const name=persona?.name||player?.name||(batch?undefined:data?.userName)||'User';
 return cleanNativeTaskProjection({userName:typeof name==='string'&&name.trim()?name:'User',persona:personaDescription(persona||player||{})});
}
export function cleanNativeTaskProjection(value){
 if(value===undefined)return {userName:'User',persona:''};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['userName','persona'].includes(k))||typeof value.userName!=='string'||!value.userName.trim()||typeof value.persona!=='string')throw Object.assign(Error('NATIVE_TASK_CONTEXT_INVALID'),{code:'NATIVE_TASK_CONTEXT_INVALID',status:400});
 return {userName:value.userName,persona:value.persona};
}
