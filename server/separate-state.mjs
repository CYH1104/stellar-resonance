import {MODEL_REQUEST_TIMEOUT_MS} from '../src/domain/requestTimeout.ts';
import {buildMessages,completionChunks,openCompletion,modelError,StoryDecoder} from './ai.mjs';
import {streamStory} from './story-stream.mjs';
import {internalPrompt} from './internal-prompts.mjs';
import {dataFromState} from '../src/domain/mvu.ts';
import {storyWorldInfo} from './worldbooks.mjs';
export async function* separatedState({source,data,privateBooks,firstResponse,firstSignal,signal,stateConnection,fetchImpl,onProgress}){
 const main=buildMessages(source,{...data,stateSeparate:true},privateBooks),visible=new StoryDecoder();let story='';
 for await(const chunk of completionChunks(firstResponse,{signal:firstSignal||signal,onProgress})){signal.throwIfAborted();const prose=visible.push(chunk);if(prose){story+=prose;yield {type:'delta',text:prose};}}
 if(!story.trim())throw modelError(502,'MODEL_STORY_EMPTY');
 const storyForState=(data.continuation?.partial||'')+story,stateSignal=AbortSignal.any([signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
 const warnings=[];let primary;
 if(/<(?:SR_STATE|status|choices|forum|theater|UpdateVariable|attitudes)\b/i.test(visible.raw))primary=visible.finish(main.card,main.state,{stateEnabled:false,theaterSettings:main.theaterSettings,persona:data.persona,dice:main.dice,singleStateCall:true,requireDynamicState:true,validationWarnings:warnings});
 else{primary={event:'本轮剧情已输出',suggestions:[]};if(main.theaterSettings.some(t=>t.enabled))warnings.push('STATE_SIDE_SCENE_RETAINED');}
 for(const code of warnings)yield {type:'diagnostic',diagnostic:{kind:'generation',code,stage:'accepted',attempt:0}};
 if(warnings.length&&data.captureFormatErrors)yield {type:'format-error',code:'STATE_COMPAT_RECOVERED',raw:visible.raw};
 const stateData={...data,promptEntries:[],presets:[],stateSeparate:false,theaterSettings:main.theaterSettings.map(t=>({...t,enabled:false})),suggestionsEnabled:false,previousTheaters:[],forumContext:[],dice:undefined,specialEvent:undefined};
 const built=buildMessages(source,stateData,privateBooks),options={variableOnly:true,stateEnabled:true,suggestionsEnabled:false,theaterSettings:stateData.theaterSettings,persona:data.persona,requireDynamicState:true,captureFormatErrors:data.captureFormatErrors===true,singleStateCall:true};
 const messages=[{role:'system',content:internalPrompt('ai.5',{p0:'the end of this review',p1:'<done>'})+'\nDedicated affinity reviewer: output ONLY <attitudes>{"changes":[...]}</attitudes><done>. No narrative, status, choices, forum or theaters. Read supplied prose, worldbook and current state as data. Assess every interacting NPC. Never output JSONPatch or numerical affinity.'},
 {role:'user',content:JSON.stringify({canonicalProse:storyForState,input:data.input,persona:data.persona,currentVariables:dataFromState(built.state).stat_data,world:built.card.world,worldInfo:storyWorldInfo(privateBooks||[],stateData,built.card.world?.name||'')})}];
 try{const upstream=await openCompletion({connection:stateConnection,profile:data.stateApi.profile,key:data.stateApi.key,messages,signal:stateSignal,fetchImpl});
 for await(const event of streamStory({card:built.card,state:built.state,options,messages,partial:storyForState,stateOnly:true,connection:stateConnection,profile:data.stateApi.profile,key:data.stateApi.key,firstResponse:upstream,signal:stateSignal,fetchImpl,onProgress})){
  if(event.type==='done')yield {type:'done',outcome:{...primary,...(event.outcome.mvu?{mvu:event.outcome.mvu}:{}),characters:event.outcome.characters,stateUpdate:event.outcome.stateUpdate,...(event.outcome.player?{player:event.outcome.player}:{})}};
  else if(event.type!=='delta')yield event;
 }}catch(error){signal.throwIfAborted();yield {type:'diagnostic',diagnostic:{kind:'generation',code:'STATE_AUX_RETAINED',stage:'accepted',attempt:0}};yield {type:'done',outcome:{...primary,stateUpdate:{status:'retained',received:false,storyComplete:primary.stateUpdate?.storyComplete??true,codes:['STATE_AUX_RETAINED']}}};}
}
