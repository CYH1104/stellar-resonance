import {newDynamicActor,resolveActorId} from '../src/domain/dynamicActors.ts';
import {applyMvu} from '../src/domain/mvu.ts';

export const attitudeRules=`AFFINITY REVIEW: Every turn, follow state-output-v1 in the final request manifest. Return ONE SR_STATE with per-character affinity:{delta:number,reason:string}, including zero and a concrete concise outcome explanation. Use each character’s actual perceptions, lore and relationship; ordinary politeness does not automatically earn points. Positive changes are usually 0.5 or 1, preferably within 0.5–3; +3 is a soft guideline. Negative changes have no per-turn magnitude cap. The server settles total affinity within [-100,100], records requested/applied deltas and keeps reasons out of status cards. New registered NPCs start at the explicit baseline 0. Return required text fields as action:set/value or action:keep; include fresh established spirit OS from first physical appearance and every turn thereafter. No absolute affinity, duplicate patches, private reasoning, or a second state block. Use Chinese values; finish companions before SR_DONE. New NPCs require a unique stable id and name. Legacy markers {{p0}} {{p1}} apply only to old histories, not the new output.`;

/** The model describes attitude; only the server chooses the numerical increment. */
export function attitudeUpdates(value,state,warn=()=>{},candidates=[],onReviewed=()=>{}){
 if(!value||!Array.isArray(value.changes)||value.changes.length>200)throw Error('Invalid attitude envelope');
 const roster=[...state.characters],ops=[],seen=new Set();
 for(const row of value.changes){
  try{
   if(!row||!['positive','neutral','negative'].includes(row.attitude)||!['small','large'].includes(row.strength??'small'))throw Error();
   const candidateId=resolveActorId(candidates.filter(c=>c?.name),row);
   const declared=candidates.find(c=>c?.id===row.id&&c.name)||candidates.find(c=>c?.id===candidateId&&c.name);
   let id=resolveActorId(roster,row)||resolveActorId(roster,declared),actor=roster.find(c=>c.id===id);
   const next=[];
   if(!actor){const {attitude,strength,...facts}=declared||{};actor=newDynamicActor({...facts,id:declared?.id||row.id,name:row.name||declared?.name,affinity:0,present:row.present===true||declared?.present===true});id=actor.id;next.push({op:'insert',path:'/characters/'+id,value:actor});}
   if(seen.has(id))throw Error();
   const path='/characters/'+id,old=actor.affinity??0;
   if(actor.affinity===undefined)next.push({op:'insert',path:path+'/affinity',value:0});
   const amount=row.attitude==='neutral'?0:(row.attitude==='positive'?1:-1)*(row.strength==='large'?5:2);
   const delta=Math.max(-100,Math.min(100,old+amount))-old;
   if(delta)next.push({op:'delta',path:path+'/affinity',value:delta});
   if(row.relationship!==undefined){if(typeof row.relationship!=='string'||!row.relationship.trim()||row.relationship.length>200)throw Error();if(row.relationship!==actor.relationship)next.push({op:actor.relationship===undefined?'insert':'replace',path:path+'/relationship',value:row.relationship});}
   applyMvu(state,[...ops,...next]);ops.push(...next);seen.add(id);onReviewed(id);if(!roster.some(c=>c.id===id))roster.push(actor);
  }catch{warn('STATE_ATTITUDE_ITEM_SKIPPED');}
 }
 if(value.changes.length&&!seen.size)throw Error('No valid attitude judgments');
 for(const actor of candidates){const declaration=candidates.find(c=>c?.id===actor?.id&&c.name);if(actor?.present&&typeof actor.id==='string'&&!seen.has(resolveActorId(roster,declaration||actor)||actor.id))warn('STATE_ATTITUDE_REVIEW_MISSING');}
 return ops;
}

