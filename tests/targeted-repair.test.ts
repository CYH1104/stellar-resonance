import {it,expect} from 'vitest';
import {missingRepairPlan,repairNeedsState} from '../src/domain/repairPlan';
import {mergeRepairOutcome} from '../src/domain/stateRepair';
import {mergeRepairTheaters,reconcileRepairScenes} from '../src/domain/roundHealth';
import {newSession,finishVariant,stateAt,defaults} from '../src/domain/story';
import type {Variant} from '../src/domain/contracts';
it('second repair requests only the missing theater and cannot alter the already repaired affinity',()=>{
 const s=newSession('逐项补全',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial={player:{id:'player',name:'玩家',present:true},characters:[{id:'lin',name:'林',present:true,affinity:10}]};
 const settings=defaults().theaters!.map(t=>({...t,enabled:t.slot===2}));
 const v:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};s.turns.push({id:'t',input:'帮助',selected:0,variants:[v]});
 finishVariant(s,0,v,{event:'帮助',characters:[{id:'lin',affinity:12}],stateUpdate:{status:'updated',received:true,storyComplete:true,affinityReviewedIds:['lin'],codes:['STATE_SIDE_SCENE_RETAINED']}});
 const before=stateAt(s,0),effective=stateAt(s),previous=v.outcome!,plan=missingRepairPlan(previous,effective,settings,true,false);
 expect(repairNeedsState(plan)).toBe(false);expect(plan.theaterSlots).toEqual([2]);
 const incoming={event:'补全',characters:[{id:'lin',affinity:99}],theaters:[{slot:2,kind:'group' as const,title:'群聊',content:'',messages:[{speaker:'林',content:'收到'}]}],stateUpdate:{status:'disabled' as const,received:true,storyComplete:true,codes:['STATE_MVU_OUTPUT_MISSING','STATE_AFFINITY_RETAINED']}};
 const merged=mergeRepairOutcome(previous,incoming,before,effective,plan);merged.theaters=mergeRepairTheaters(previous.theaters,incoming.theaters,settings,effective);
 const reconciled=reconcileRepairScenes(merged,settings,effective);expect(reconciled.characters!.find(c=>c.id==='lin')!.affinity).toBe(12);expect(reconciled.stateUpdate!.codes).toEqual([]);expect(reconciled.stateUpdate!.affinityReviewedIds).toEqual(['lin']);expect(missingRepairPlan(reconciled,effective,settings,true,false).theaterSlots).toEqual([]);
});
it('only a missing spirit thought is repaired without changing accepted favor or other spirit fields',()=>{
 const before={player:{id:'player',name:'玩家',present:true},characters:[{id:'a',name:'甲',present:true,affinity:8,spiritAnimal:'猫'},{id:'b',name:'乙',present:true,affinity:4,spiritAnimal:'犬'}]};
 const previous={event:'交谈',characters:[{id:'a',affinity:8,spiritThought:'想休息'},{id:'b',affinity:4}],stateUpdate:{status:'partial' as const,received:true,storyComplete:true,codes:['STATE_SPIRIT_THOUGHT_RETAINED'],affinityReviewedIds:['a','b']}};
 const effective={...before,characters:before.characters.map(c=>({...c,...previous.characters.find(p=>p.id===c.id)}))};
 const plan=missingRepairPlan(previous,effective,[],true,false);expect(plan.spiritIds).toEqual(['b']);expect(plan.affinityIds).toEqual([]);
 const merged=mergeRepairOutcome(previous,{event:'补全',characters:[{id:'a',affinity:200,spiritThought:'不应覆盖'},{id:'b',spiritThought:'想散步'}],stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_ROSTER_RETAINED']}},before,effective,plan);
 expect(merged.characters!.find(c=>c.id==='a')).toMatchObject({affinity:8,spiritThought:'想休息'});expect(merged.characters!.find(c=>c.id==='b')!.spiritThought).toBe('想散步');expect(repairNeedsState(missingRepairPlan(merged,effective,[],true,false))).toBe(false);expect(merged.stateUpdate!.status).toBe('updated');
});
