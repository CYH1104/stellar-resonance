import {newDynamicActor,resolveActorId} from '../src/domain/dynamicActors.ts';
import {applyMvu} from '../src/domain/mvu.ts';

/** The model describes attitude; only the server chooses the numerical increment. */
export function attitudeUpdates(value,state,warn=()=>{}){
 if(!value||!Array.isArray(value.changes)||value.changes.length>200)throw Error('Invalid attitude envelope');
 const roster=[...state.characters],ops=[],seen=new Set();
 for(const row of value.changes){
  try{
   if(!row||!['positive','neutral','negative'].includes(row.attitude)||!['small','large'].includes(row.strength??'small'))throw Error();
   let id=resolveActorId(roster,row),actor=roster.find(c=>c.id===id);
   const next=[];
   if(!actor){actor=newDynamicActor({id:row.id,name:row.name,affinity:0,present:row.present===true});id=actor.id;next.push({op:'insert',path:'/characters/'+id,value:actor});}
   if(seen.has(id))throw Error();
   const path='/characters/'+id,old=actor.affinity??0;
   if(actor.affinity===undefined)next.push({op:'insert',path:path+'/affinity',value:0});
   const amount=row.attitude==='neutral'?0:(row.attitude==='positive'?1:-1)*(row.strength==='large'?5:2);
   const delta=Math.max(-100,Math.min(200,old+amount))-old;
   if(delta)next.push({op:'delta',path:path+'/affinity',value:delta});
   if(row.relationship!==undefined){if(typeof row.relationship!=='string'||!row.relationship.trim()||row.relationship.length>200)throw Error();if(row.relationship!==actor.relationship)next.push({op:actor.relationship===undefined?'insert':'replace',path:path+'/relationship',value:row.relationship});}
   applyMvu(state,[...ops,...next]);ops.push(...next);seen.add(id);if(!roster.some(c=>c.id===id))roster.push(actor);
  }catch{warn('STATE_ATTITUDE_ITEM_SKIPPED');}
 }
 if(value.changes.length&&!seen.size)throw Error('No valid attitude judgments');
 return ops;
}

export const attitudeRules=`AFFINITY REVIEW: context.mvu.stat_data is the current authoritative state. Every turn, assess each interacting NPC against this turn's enacted prose. Output the following compact block FIRST, before narrative, so it is not lost if the response is cut short:
<attitudes>{"changes":[{"id":"existing-stable-id","attitude":"positive","strength":"small"}]}</attitudes>
attitude must be positive, neutral or negative; strength must be small or large (neutral may use small). Use neutral for routine encounters with no supported attitude change. Return {"changes":[]} only if no NPC interacted. Review every interacting NPC, not the entire inactive roster. Use an existing ID whenever available; match names and aliases before registering a new person. For a genuinely new NPC include a stable id, name and present (boolean). Example: <attitudes>{"changes":[{"id":"npc-new-clerk","name":"New clerk","present":true,"attitude":"neutral","strength":"small"}]}</attitudes>. Use actual Chinese names. The program registers new NPCs at neutral affinity 0, applies small changes of 2 or large changes of 5 with the appropriate sign, and clamps affinity to [-100,200]. Never output numerical affinity, absolute scores, variable paths or JSONPatch in this mode. Existing values are never reset.
Optionally include relationship as a short Chinese phrase only when an established relationship actually changes; omit it otherwise. Affinity alone does not establish romance or loyalty. Never invent variable systems, change author-controlled identity/mentalPowerLevel, or count summaries, memories, forum posts or side fiction as new enacted events. No private reasoning or Analysis block is required. Keep the ordinary status block for presence and supported in-character thoughts; do not repeat affinity/relationship in it. Preserve enabled story/side modules and their protocol. The attitude block goes before prose and {{p0}}; finish the complete response with {{p1}}. MVU legacy JSONPatch remains accepted only for compatibility with older saved prompts.`;
