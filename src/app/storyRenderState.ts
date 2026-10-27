import type {Session,TheaterSetting} from '../domain/contracts';
import {selected,stateAt} from '../domain/story.ts';
import {dataFromState} from '../domain/mvu.ts';
import {storyScene,sceneSnapshotLabel} from '../domain/storyScene.ts';
import {needsStateRepair} from '../domain/roundHealth.ts';
import {stateUpdateLabel} from '../domain/stateUpdate.ts';
import type {HtmlRenderContext} from '../domain/htmlRendering';

export interface StoryRenderState {context:HtmlRenderContext;opening:string;completion:string}
/** Called inside a computed: replay depends on state/outcomes, never on streamed prose.
 * Keeping these objects stable also avoids posting every old iframe its unchanged context.
 */
export function storyRenderStates(session:Session|undefined,indices:number[],settings?:TheaterSetting[],stateEnabled=true){
 const rows=new Map<number,StoryRenderState>();if(!session)return rows;
 for(const index of indices){
  const turn=session.turns[index];if(!turn)continue;const variant=selected(turn);
  rows.set(index,{
   context:{variables:dataFromState(stateAt(session,index+1)),messageId:(index+1)*2,user:session.persona.name,char:'星穹学院'},
   opening:sceneSnapshotLabel(variant?.outcome?.openingScene||storyScene(stateAt(session,index))),
   completion:variant?.status==='complete'?stateUpdateLabel(variant.outcome,needsStateRepair(session,index,settings,stateEnabled)):'本轮尚未完整输出，可继续续写',
  });
 }
 return rows;
}
