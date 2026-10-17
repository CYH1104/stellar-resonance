import {buildMessages,completionChunks,openCompletion,modelError,StoryDecoder} from './ai.mjs';
import {repairedMessages,streamStory} from './story-stream.mjs';
export async function* separatedState({source,data,privateBooks,firstResponse,firstSignal,signal,stateConnection,fetchImpl,onProgress}){
 const visible=new StoryDecoder();let story='';
 for await(const chunk of completionChunks(firstResponse,{signal:firstSignal||signal,onProgress})){signal.throwIfAborted();const prose=visible.push(chunk);if(prose){story+=prose;yield {type:'delta',text:prose};}}
 if(!story.trim())throw modelError(502,'MODEL_STORY_EMPTY');
 const storyForState=(data.continuation?.partial||'')+story,stateSignal=AbortSignal.any([signal,AbortSignal.timeout(180000)]);
 const built=buildMessages(source,{...data,promptEntries:[],presets:[],stateSeparate:false},privateBooks),options={stateEnabled:data.stateEnabled,suggestionsEnabled:data.suggestionsEnabled,theaterSettings:built.theaterSettings,persona:data.persona,dice:built.dice,requireDynamicState:true,captureFormatErrors:data.captureFormatErrors===true,singleStateCall:true};
 const messages=repairedMessages(built.messages,storyForState,built.card,built.state,options);
 const upstream=await openCompletion({connection:stateConnection,profile:data.stateApi.profile,key:data.stateApi.key,messages,signal:stateSignal,fetchImpl});
 for await(const event of streamStory({card:built.card,state:built.state,options,messages:built.messages,partial:storyForState,stateOnly:true,connection:stateConnection,profile:data.stateApi.profile,key:data.stateApi.key,firstResponse:upstream,signal:stateSignal,fetchImpl,onProgress}))if(event.type!=='delta')yield event;
}
