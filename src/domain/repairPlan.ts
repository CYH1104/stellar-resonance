import type {Outcome,TheaterSetting,WorldState} from './contracts.ts';
import {completeTheater} from './roundHealth.ts';
import {validAffinity} from './affinity.ts';
import {validActorId} from './dynamicActors.ts';
export interface RepairPlan {roster:boolean;affinityIds:string[];spiritIds:string[];theaterSlots:number[];suggestions:boolean}
const supplied=(v:unknown)=>typeof v==='string'&&!!v.trim()&&!/^(?:未知|未提供|待生成|待更新|暂无)[。.!！]?$/.test(v.trim());
export function missingRepairPlan(out:Outcome|undefined,state:WorldState,settings:TheaterSetting[]=[],stateEnabled=true,suggestionsEnabled=true):RepairPlan {
 const codes=out?.stateUpdate?.codes||[],present=state.characters.filter(c=>c.present),reviewed=new Set(out?.stateUpdate?.affinityReviewedIds||[]);
 const affinityIds=stateEnabled?present.filter(c=>!reviewed.has(c.id)&&!(validAffinity(out?.characters?.find(p=>p.id===c.id)?.affinity)&&!codes.includes('STATE_AFFINITY_RETAINED'))).map(c=>c.id):[];
 const spiritIds=stateEnabled?[state.player,...present].filter(c=>c.spiritAnimal?.trim()&&!supplied(c.id==='player'?out?.player?.spiritThought:out?.characters?.find(p=>p.id===c.id)?.spiritThought)).map(c=>c.id):[];
 return {roster:stateEnabled&&(!out?.stateUpdate?.received||codes.includes('STATE_ROSTER_RETAINED')),affinityIds,spiritIds,theaterSlots:settings.filter(s=>s.enabled&&(s.slot===1?!out?.forum?.length:!completeTheater(out?.theaters?.find(t=>t.slot===s.slot),s,state))).map(s=>s.slot),suggestions:suggestionsEnabled&&!out?.suggestions?.length};
}
export const repairNeedsState=(plan:RepairPlan)=>plan.roster||!!plan.affinityIds.length||!!plan.spiritIds.length;
export function validateRepairPlan(value:unknown):RepairPlan{
 const v=value as RepairPlan;if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['roster','affinityIds','spiritIds','theaterSlots','suggestions'].includes(k))||typeof v.roster!=='boolean'||typeof v.suggestions!=='boolean')throw Error('Invalid repair plan');
 for(const key of ['affinityIds','spiritIds'] as const)if(!Array.isArray(v[key])||v[key].length>1000||v[key].some(id=>!(key==='spiritIds'&&id==='player')&&!validActorId(id)))throw Error('Invalid repair actors');
 if(!Array.isArray(v.theaterSlots)||v.theaterSlots.length>1000||v.theaterSlots.some(slot=>!Number.isSafeInteger(slot)||slot<1))throw Error('Invalid repair slots');return v;
}
export function repairCodeApplies(code:string,plan:RepairPlan){
 if(/AFFINITY|MVU|ATTITUDE/.test(code))return !!plan.affinityIds.length;
 if(/PLAYER_THOUGHT/.test(code))return plan.spiritIds.includes('player');
 if(/SPIRIT/.test(code))return !!plan.spiritIds.length;
 if(/ROSTER|UNKNOWN_CHARACTER/.test(code))return plan.roster;
 if(/SIDE_SCENE|THEATER|FANFIC|DIARY|FORUM/.test(code))return !!plan.theaterSlots.length;
 return repairNeedsState(plan)&&/STATE_(?:UPDATE|STATUS|AUX|FIELD|EMPTY)/.test(code);
}
/** Keep only requested fields even if the model returns a full replacement snapshot. */
export function scopeRepairOutcome(incoming:Outcome,plan:RepairPlan):Outcome{
 const out:Outcome={event:incoming.event,stateUpdate:incoming.stateUpdate};
 if(plan.spiritIds.includes('player')&&incoming.player?.spiritThought)out.player={spiritThought:incoming.player.spiritThought};
 out.characters=(incoming.characters||[]).map(c=>{if(plan.roster)return c;const patch:NonNullable<Outcome['characters']>[number]={id:c.id};if(plan.affinityIds.includes(c.id)){if(c.affinity!==undefined)patch.affinity=c.affinity;if(c.relationship!==undefined)patch.relationship=c.relationship;}if(plan.spiritIds.includes(c.id)&&c.spiritThought)patch.spiritThought=c.spiritThought;return patch;}).filter(c=>Object.keys(c).length>1);
 if(incoming.mvu)out.mvu=incoming.mvu.filter(op=>{const p=op.path.split('/');return p[1]==='characters'&&(plan.roster||plan.affinityIds.includes(p[2])&&['affinity','relationship'].includes(p[3])||plan.spiritIds.includes(p[2])&&p[3]==='spiritThought')||p[1]==='player'&&plan.spiritIds.includes('player')&&p[2]==='spiritThought';});
 if(plan.theaterSlots.includes(1))out.forum=incoming.forum;
 if(plan.theaterSlots.length)out.theaters=incoming.theaters?.filter(s=>plan.theaterSlots.includes(s.slot));
 if(plan.suggestions)out.suggestions=incoming.suggestions;
 return out;
}
