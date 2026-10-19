import {newDynamicActor,resolveActorId} from '../src/domain/dynamicActors.ts';
import {applyMvu} from '../src/domain/mvu.ts';

export const attitudeRules=`AFFINITY REVIEW: Every turn, use the Current state JSON system message before the player input as the authoritative current state. Return one ordinary <status> JSON block containing event, present, enter, exit and characters. present declares who is on stage; a previous actor omitted from present stays present and is reported as missing, so an actual departure must be listed in exit (or as present:false on its row). Each present or interacting NPC has ONE character row with id, name, attitude and strength, plus supported relationship and innerThought. Example:
<status>{"event":"Conversation ended","present":["npc-lin"],"enter":[],"exit":[],"characters":[{"id":"npc-lin","name":"Lin","attitude":"positive","strength":"small","relationship":"Getting acquainted","innerThought":"Their help mattered."}]}</status>
Reuse existing IDs exactly. New NPCs require a unique stable id and name in this same row. Include all present NPCs, including quiet bystanders. Assess each against the current enacted prose, worldbooks and persona. attitude is positive, neutral or negative; strength is small or large. Neutral is valid when no change is supported. Do not fabricate changes to fill a quota. The program computes small changes of 2 or large changes of 5, neutral 0, bounded to [-100,200]; never output affinity numbers, variable paths or JSONPatch. New NPCs start at 0. Omit unknown descriptive facts; preserve existing facts, including author-controlled identity/mentalPowerLevel. Do not infer romance from affinity. Memories, summaries, forum and side fiction are not new enacted events. Keep player state and all enabled side modules in their normal protocol. No separate attitudes or UpdateVariable block is needed for normal story generation. A dedicated reviewer explicitly asked for attitudes may instead return <attitudes>{"changes":[...]}</attitudes>. Do not output private reasoning. Use the configured status opening {{p0}}. All displayed values must be Chinese; examples are illustrative. Finish with {{p1}}.`;

/** The model describes attitude; only the server chooses the numerical increment. */
export function attitudeUpdates(value,state,warn=()=>{},candidates=[],onReviewed=()=>{},required){
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
   const delta=Math.max(-100,Math.min(200,old+amount))-old;
   if(delta)next.push({op:'delta',path:path+'/affinity',value:delta});
   if(row.relationship!==undefined){if(typeof row.relationship!=='string'||!row.relationship.trim()||row.relationship.length>200)throw Error();if(row.relationship!==actor.relationship)next.push({op:actor.relationship===undefined?'insert':'replace',path:path+'/relationship',value:row.relationship});}
   applyMvu(state,[...ops,...next]);ops.push(...next);seen.add(id);onReviewed(id);if(!roster.some(c=>c.id===id))roster.push(actor);
  }catch{warn('STATE_ATTITUDE_ITEM_SKIPPED');}
 }
 if(value.changes.length&&!seen.size)throw Error('No valid attitude judgments');
 const requiredIds=required instanceof Set?required:new Set(candidates.filter(c=>c?.present).map(c=>resolveActorId(roster,candidates.find(x=>x?.id===c.id&&x.name)||c)||c.id).filter(id=>typeof id==='string'));
 for(const id of requiredIds)if(!seen.has(id))warn('STATE_ATTITUDE_REVIEW_MISSING');
 return ops;
}

