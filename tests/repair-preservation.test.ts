import {it,expect} from 'vitest';
import {mergeRepairOutcome} from '../src/domain/stateRepair';
import type {SceneSnapshot} from '../src/domain/storyScene';
import {mergeRepairTheaters,needsStateRepair,reconcileRepairScenes} from '../src/domain/roundHealth';
import {defaultTheaters} from '../src/domain/theaters';
import {newSession,finishVariant,defaults,backup,parseBackup} from '../src/domain/story';
import {stateUpdateLabel} from '../src/domain/stateUpdate';
import type {TheaterScene} from '../src/domain/contracts';
const settings=defaultTheaters().map(t=>({...t,enabled:t.slot===2||t.slot===4}));
const state={player:{id:'player',name:'玩家',present:true},characters:[]};
it('repair preserves the accepted opening snapshot and people even if omitted or contradicted',()=>{
 const snapshots:SceneSnapshot[]=[{日期:'星历578年09月01日',时间:'08:30',地点:'教室',人物:['玩家','甲']},{日期:'',时间:'',地点:'',人物:[]},{日期:'旧历日期',时间:'09:00',地点:'旧地点'}];
 const plan={roster:false,affinityIds:[],spiritIds:[],theaterSlots:[4],suggestions:false};
 for(const openingScene of snapshots)for(const scope of [undefined,plan])for(const incoming of [{event:'补修'},{event:'补修',openingScene:{日期:'结尾日期',时间:'18:00',地点:'图书馆',人物:['乙']}}]){
  const result=mergeRepairOutcome({event:'原事件',openingScene},incoming,state,state,scope);
  expect(result.openingScene).toEqual(openingScene);expect(result.openingScene).not.toBe(openingScene);
  const s=newSession('开场保护',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial=state;s.turns.push({id:'t',input:'继续',selected:0,variants:[{id:'v',status:'complete',text:'正文',createdAt:'',outcome:result}]});
  expect(parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0].turns[0].variants[0].outcome?.openingScene).toEqual(openingScene);
 }
});
const group:TheaterScene={slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'同学',content:'晚上好'}]};
const custom:TheaterScene={slot:4,kind:'custom',title:'片段',content:'独立片段'};
it('repair preserves omitted and complete slots, and fills only missing results',()=>{
 expect(mergeRepairTheaters([group],[custom],settings,state)).toEqual([group,custom]);
 expect(mergeRepairTheaters([group],undefined,settings,state)).toEqual([group]);
 expect(mergeRepairTheaters([group],[{...group,messages:[]}],settings,state)).toEqual([group]);
 expect(mergeRepairTheaters(undefined,undefined,settings,state)).toBeUndefined();
});
it('round requirements persist in backup; toggling current modules does not rewrite past health',()=>{
 const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial=state;
 const v={id:'v',text:'正文',createdAt:'',status:'incomplete' as const,generationRequirements:{stateEnabled:false,theaters:settings.map(t=>({...t,enabled:false}))}};
 s.turns.push({id:'t',input:'观察',selected:0,variants:[v]});finishVariant(s,0,v,{event:'观察',stateUpdate:{status:'disabled',received:true,storyComplete:true,codes:[]}});
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));
 expect(needsStateRepair(restored.sessions[0],0,settings,true)).toBe(false);
});
it('accepted partial data is not described as full variable validation',()=>{
 const out={event:'观察',stateUpdate:{status:'updated' as const,received:true,storyComplete:true,codes:['STATE_AFFINITY_RETAINED']}};
 expect(stateUpdateLabel(out)).toContain('待补全');expect(stateUpdateLabel(out)).not.toContain('校验通过');
});
it('repair health uses merged scenes without suppressing unrelated state warnings',()=>{
 const out={event:'补全',theaters:[group,custom],stateUpdate:{status:'updated' as const,received:true,storyComplete:true,codes:['STATE_SIDE_SCENE_RETAINED','STATE_PLAYER_THOUGHT_RETAINED']}};
 expect(reconcileRepairScenes(out,settings,state).stateUpdate?.codes).toEqual(['STATE_PLAYER_THOUGHT_RETAINED']);
 expect(reconcileRepairScenes({...out,theaters:[group]},settings,state).stateUpdate?.codes).toContain('STATE_SIDE_SCENE_RETAINED');
});
