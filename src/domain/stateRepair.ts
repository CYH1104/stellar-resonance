import type {Outcome,WorldState} from './contracts';
import {applyMvu,explicitPresenceIds} from './mvu.ts';
import {runtimeActorPatch} from './actorPolicy.ts';
import {copy,validateOutcome} from './story.ts';
import {validAffinity} from './affinity.ts';
import {scopeRepairOutcome,repairCodeApplies,repairNeedsState,missingRepairPlan,type RepairPlan} from './repairPlan.ts';

/** Repair deltas are relative to the start of the turn, not applied twice to its result. */
export function mergeRepairOutcome(previous:Outcome,incoming:Outcome,before:WorldState,effective:WorldState,plan?:RepairPlan):Outcome{
  if(plan?.roster&&incoming.characters)incoming={...incoming,characters:incoming.characters.map(c=>{if(!effective.characters.some(a=>a.id===c.id))return c;const patch:typeof c={id:c.id,...(c.present!==undefined?{present:c.present}:{})};if(plan.affinityIds.includes(c.id)){if(c.affinity!==undefined)patch.affinity=c.affinity;if(c.relationship!==undefined)patch.relationship=c.relationship;}for(const key of plan.textFields?.[c.id]||[])if(c[key]!==undefined)patch[key]=c[key];if(plan.spiritIds.includes(c.id)&&c.spiritThought)patch.spiritThought=c.spiritThought;return patch;})};
  if(plan)incoming=scopeRepairOutcome(incoming,plan);
  if(plan&&incoming.characters)incoming={...incoming,characters:incoming.characters.map(c=>before.characters.some(a=>a.id===c.id)?c:{...effective.characters.find(a=>a.id===c.id),...c})};
  const clean=validateOutcome(incoming,before),target=copy(effective);
  const update=clean.stateUpdate;
  const legacyFallback=update?.codes.some(c=>['STATE_ROSTER_RETAINED','STATE_MVU_REJECTED','STATE_AUX_RETAINED','STATE_STATUS_INVALID','STATE_UPDATE_MISSING'].includes(c));
  const retained=new Set(update?.retainedPresentIds??(legacyFallback||update?.status==='disabled'?effective.characters.map(c=>c.id):[]));
  let variables=target.variables;
  if(clean.mvu){
    const applied=applyMvu(before,clean.mvu);
    const explicit=explicitPresenceIds(clean.mvu);
    for(const after of [applied.player,...applied.characters]){
      const old=[before.player,...before.characters].find(a=>a.id===after.id);
      let actor=[target.player,...target.characters].find(a=>a.id===after.id);
      if(!actor){target.characters.push(copy(after));continue;}
      for(const [field,value]of Object.entries(runtimeActorPatch(after))){
        if(field==='id'||field==='present'&&retained.has(after.id))continue;
        if(JSON.stringify(value)!==JSON.stringify(old?.[field as keyof typeof old])||field==='present'&&(explicit.has(after.id)||explicit.has('*')))Object.assign(actor,{[field]:value});
      }
    }
    if(JSON.stringify(applied.variables||{})!==JSON.stringify(before.variables||{}))variables=applied.variables;
  }
  Object.assign(target.player,runtimeActorPatch(clean.player||{}));
  for(const patch of clean.characters||[]){
    const actor=target.characters.find(a=>a.id===patch.id),fields=runtimeActorPatch({...patch});
    if(retained.has(patch.id))delete fields.present;
    if(actor)Object.assign(actor,fields);else target.characters.push({...patch,present:patch.present??false,name:patch.name||patch.id});
  }
  // Absolute snapshots preserve previous valid fields without replaying any numeric delta.
  const {id:_playerId,...player}=runtimeActorPatch(target.player);
  const result:Outcome={...clean,...(previous.openingScene?{openingScene:copy(previous.openingScene)}:{}),event:previous.event,player,characters:target.characters.map(actor=>before.characters.some(a=>a.id===actor.id)?runtimeActorPatch(actor):actor),
    suggestions:clean.suggestions?.length?clean.suggestions:previous.suggestions,
    ...(previous.diceEvent?{diceEvent:previous.diceEvent}:{}),forum:previous.forum?.length?previous.forum:clean.forum};
  delete result.mvu;
  if(JSON.stringify(variables||{})!==JSON.stringify(before.variables||{}))result.mvu=[{op:'replace',path:'/custom',value:variables||{}}];
  if(plan){
    const prior=previous.stateUpdate,next=clean.stateUpdate;
    const meta=repairNeedsState(plan)?next||prior:prior||next;
    if(meta)result.stateUpdate={...meta,status:repairNeedsState(plan)?meta.status:prior?.status||'unchanged',received:!!prior?.received||!!next?.received,storyComplete:prior?.storyComplete??meta.storyComplete,codes:[...new Set([...(prior?.codes||[]).filter(c=>!repairCodeApplies(c,plan)),...(next?.codes||[]).filter(c=>repairCodeApplies(c,plan))])],affinityReviewedIds:[...new Set([...(prior?.affinityReviewedIds||[]),...(next?.affinityReviewedIds||[]).filter(id=>plan.affinityIds.includes(id))])]};
    if(result.stateUpdate)result.stateUpdate.affinityReviews=[...(prior?.affinityReviews||[]).filter(r=>!plan.affinityIds.includes(r.id)),...(next?.affinityReviews||[]).filter(r=>plan.affinityIds.includes(r.id))];
    if(result.stateUpdate&&plan.affinityIds.length&&plan.affinityIds.every(id=>result.stateUpdate?.affinityReviewedIds?.includes(id)||validAffinity(clean.characters?.find(c=>c.id===id)?.affinity)&&!clean.stateUpdate?.codes.includes('STATE_AFFINITY_RETAINED')))result.stateUpdate.codes=result.stateUpdate.codes.filter(code=>!/AFFINITY|MVU|ATTITUDE/.test(code));
    if(result.stateUpdate&&repairNeedsState(plan))result.stateUpdate.status=repairNeedsState(missingRepairPlan(result,target,[],true,false))?'partial':'updated';
  }
  return result;
}

export interface RepairComparison {id:string;name:string;beforePresent?:boolean;afterPresent?:boolean;beforeAffinity?:number;afterAffinity?:number}
export function compareRepair(before:WorldState,after:WorldState):RepairComparison[]{
  return [...new Set([...before.characters,...after.characters].map(a=>a.id))].map(id=>{
    const old=before.characters.find(a=>a.id===id),next=after.characters.find(a=>a.id===id);
    return{id,name:next?.name||old?.name||id,beforePresent:old?.present,afterPresent:next?.present,beforeAffinity:old?.affinity,afterAffinity:next?.affinity};
  }).filter(row=>row.beforePresent||row.afterPresent||row.beforeAffinity!==row.afterAffinity);
}
