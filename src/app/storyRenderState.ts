import type {Session,TheaterSetting} from '../domain/contracts';
import {selected,stateAt} from '../domain/story.ts';
import {dataFromState} from '../domain/mvu.ts';
import {storyScene,sceneSnapshotLabel} from '../domain/storyScene.ts';
import {needsStateRepair} from '../domain/roundHealth.ts';
import {stateUpdateLabel} from '../domain/stateUpdate.ts';
import type {HtmlRenderContext} from '../domain/htmlRendering';

export interface StoryRenderState {context:HtmlRenderContext;opening:string;openingTime:string;openingLocation:string;openingPeople:string;openingPeopleSource:string;completion:string}
/** Called inside a computed: replay depends on state/outcomes, never on streamed prose.
 * Keeping these objects stable also avoids posting every old iframe its unchanged context.
 */
export function storyRenderStates(session:Session|undefined,indices:number[],settings?:TheaterSetting[],stateEnabled=true){
 const rows=new Map<number,StoryRenderState>();if(!session)return rows;
 for(const index of indices){
  const turn=session.turns[index];if(!turn)continue;const variant=selected(turn),before=stateAt(session,index);
   const scene=variant?.outcome?.openingScene||storyScene(before),time=[scene.日期,'星期' in scene?scene.星期:'',scene.时间].filter(Boolean).join(' · ');
   const snapshotPeople=variant?.outcome?.openingScene?.人物;
   const people=snapshotPeople??[before.player,...before.characters].filter(actor=>actor.present).map(actor=>actor.name).filter(Boolean);
  rows.set(index,{
   context:{variables:dataFromState(stateAt(session,index+1)),messageId:(index+1)*2,user:session.persona.name,char:'星穹学院'},
   opening:sceneSnapshotLabel(scene),
   openingTime:time||'时间待明确',
   openingLocation:scene.地点||'地点待明确',
   openingPeople:people.join('、')||(snapshotPeople?'无在场人物':'人物待明确'),
   openingPeopleSource:snapshotPeople?'本轮开场实际在场人物':'旧记录未保存开场名单，按本轮开始前在场状态显示',
   completion:variant?.status==='complete'?stateUpdateLabel(variant.outcome,needsStateRepair(session,index,settings,stateEnabled)):'本轮尚未完整输出，可继续续写',
  });
 }
 return rows;
}
