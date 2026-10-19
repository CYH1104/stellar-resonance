import {validAffinity} from './affinity.ts';
import type {Outcome,Session,TheaterScene,TheaterSetting,WorldState} from './contracts';
import {selected,stateAt,validateOutcome} from './story';
import {cleanTheaters,cleanTheaterScenes} from './theaters';
import {isSpiritDiary,cleanSpiritDiary} from './spiritDiary';
import {theaterRequirementError} from './theaterRequirements';
const provided=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&!/^(?:未提供|未知|待生成|待更新|暂无)[。.!！]?$/u.test(value.trim());
export function completeTheater(scene:TheaterScene|undefined,setting:TheaterSetting,state:WorldState):boolean {
  if(!scene||scene.kind!==setting.kind||scene.slot!==setting.slot)return false;
  try{cleanTheaterScenes([scene]);}catch{return false;}
  if(theaterRequirementError(scene,isSpiritDiary(setting),[state.player,...state.characters].some(a=>a.spiritAnimal?.trim())))return false;
  if(scene.kind==='group')return !!scene.messages?.some(m=>provided(m.speaker)&&provided(m.content));
  if(isSpiritDiary(setting)&&[state.player,...state.characters].some(a=>a.spiritAnimal?.trim())){
    try{const diary=cleanSpiritDiary(scene.diary);const owner=[state.player,...state.characters].find(a=>a.id===diary.ownerId&&a.spiritAnimal?.trim());return !!owner&&/我|咱/u.test(diary.content);}catch{return false;}
  }
  if(scene.kind==='fanfic'&&(!state.characters.some(c=>c.id===scene.participantIds?.[1])||setting.charId&&scene.participantIds?.[1]!==setting.charId))return false;
  return provided(scene.content);
}
/** A repair fills gaps in this round; it never deletes an omitted, already valid slot. */
export function mergeRepairTheaters(previous:TheaterScene[]|undefined,incoming:TheaterScene[]|undefined,settings:TheaterSetting[]|undefined,state:WorldState):TheaterScene[]|undefined{
 if(previous===undefined&&incoming===undefined)return;
 const merged=new Map<number,TheaterScene>();
 for(const scene of previous||[])merged.set(scene.slot,scene);
 for(const scene of incoming||[]){
  try{cleanTheaterScenes([scene]);}catch{continue;}
  const old=merged.get(scene.slot),setting=settings?.find(s=>s.slot===scene.slot);
  if(old&&setting&&completeTheater(old,setting,state))continue;
  merged.set(scene.slot,scene);
 }
 return [...merged.values()].sort((a,b)=>a.slot-b.slot);
}
export function reconcileRepairScenes(outcome:Outcome,settings:TheaterSetting[]|undefined,state:WorldState):Outcome{
 if(!outcome.stateUpdate)return outcome;
 const enabled=cleanTheaters(settings).filter(s=>s.enabled);
 const complete=enabled.every(s=>s.slot===1?!!outcome.forum?.length:completeTheater(outcome.theaters?.find(t=>t.slot===s.slot),s,state));
 if(!complete)return outcome;
 return {...outcome,stateUpdate:{...outcome.stateUpdate,codes:outcome.stateUpdate.codes.filter(code=>!['STATE_SIDE_SCENE_RETAINED','MODEL_FANFIC_TOO_SHORT','MODEL_FANFIC_UNFINISHED','MODEL_DIARY_TOO_SHORT','MODEL_DIARY_UNFINISHED'].includes(code))}};
}
/** Check the selected round itself; inherited values do not prove this round was updated. */
export function needsStateRepair(session:Session,index:number,settings?:TheaterSetting[],stateEnabled=true):boolean {
  const v=session.turns[index]&&selected(session.turns[index]);if(v?.status!=='complete')return false;
  if(v.generationRequirements){settings=v.generationRequirements.theaters;stateEnabled=v.generationRequirements.stateEnabled;}
  try{
    if(!v.outcome)return true;
    validateOutcome(v.outcome,stateAt(session,index));
    const state=stateAt(session,index+1),out=v.outcome;
    if(stateEnabled&&['retained','partial'].includes(out.stateUpdate?.status||''))return true;
    if(out.stateUpdate?.codes.some(code=>['STATE_SIDE_SCENE_RETAINED','STATE_STORY_MISSING',...(stateEnabled?['STATE_AFFINITY_RETAINED','STATE_MVU_OUTPUT_MISSING','STATE_ATTITUDE_INVALID','STATE_ATTITUDE_REVIEW_MISSING','STATE_ATTITUDE_ITEM_SKIPPED','STATE_SPIRIT_THOUGHT_RETAINED','STATE_PLAYER_THOUGHT_RETAINED','STATE_AUX_RETAINED']:[])].includes(code)))return true;
    if(stateEnabled&&state.player.spiritAnimal?.trim()&&!provided(out.player?.spiritThought))return true;
    for(const char of stateEnabled?state.characters.filter(a=>a.present):[]){
      const patch=out.characters?.find(a=>a.id===char.id);
      if(!out.stateUpdate&& !validAffinity(patch?.affinity))return true;
      if(char.spiritAnimal?.trim()&&!provided(patch?.spiritThought))return true;
    }
    for(const setting of cleanTheaters(settings).filter(s=>s.enabled)){
      if(setting.slot===1){if(!out.forum?.length)return true;}
      else if(!completeTheater(out.theaters?.find(s=>s.slot===setting.slot),setting,state))return true;
    }
    return false;
  }catch{return true;}
}
