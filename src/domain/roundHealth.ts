import type {Session,TheaterScene,TheaterSetting,WorldState} from './contracts';
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
/** Check the selected round itself; inherited values do not prove this round was updated. */
export function needsStateRepair(session:Session,index:number,settings?:TheaterSetting[],stateEnabled=true):boolean {
  const v=session.turns[index]&&selected(session.turns[index]);if(v?.status!=='complete')return false;
  try{
    if(!v.outcome)return true;
    validateOutcome(v.outcome,stateAt(session,index));
    const state=stateAt(session,index+1),out=v.outcome;
    if(stateEnabled&&state.player.spiritAnimal?.trim()&&!provided(out.player?.spiritThought))return true;
    for(const char of stateEnabled?state.characters.filter(a=>a.present):[]){
      const patch=out.characters?.find(a=>a.id===char.id);
      if(!Number.isFinite(patch?.affinity)||patch!.affinity!< -100||patch!.affinity!>100)return true;
      if(char.spiritAnimal?.trim()&&!provided(patch?.spiritThought))return true;
    }
    for(const setting of cleanTheaters(settings).filter(s=>s.enabled)){
      if(setting.slot===1){if(!out.forum?.length)return true;}
      else if(!completeTheater(out.theaters?.find(s=>s.slot===setting.slot),setting,state))return true;
    }
    return false;
  }catch{return true;}
}
