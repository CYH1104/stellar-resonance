import {completionChunks,modelError,openCompletion,RESPONSE_END,STATE_CLOSE,STATE_OPEN,StoryDecoder} from './ai.mjs';

export const MAX_CONTINUATIONS=3;
const recoverable=new Set(['MODEL_RESPONSE_INCOMPLETE','MODEL_STREAM_INTERRUPTED','MODEL_TIMEOUT','MODEL_UNREACHABLE','UPSTREAM_FAILED','INVALID_MODEL_RESPONSE']);

/** Strip only an exact repeated boundary, never guess at paraphrases or short repeated words. */
export class ContinuationJoiner {
  constructor(previous){this.tail=previous.slice(-8192);this.pending='';this.best=0;this.resolved=false;this.candidates=Array.from({length:Math.max(0,this.tail.length-7)},(_,i)=>i+8);}
  push(chunk){
    if(this.resolved)return chunk;this.pending+=chunk;
    this.candidates=this.candidates.filter(length=>{
      if(this.pending.length>=length){if(this.pending.startsWith(this.tail.slice(-length)))this.best=Math.max(this.best,length);return false;}
      return this.tail.startsWith(this.pending,this.tail.length-length);
    });
    return this.candidates.length?'':this.finish();
  }
  finish(){if(this.resolved)return '';this.resolved=true;const result=this.pending.slice(this.best);this.pending='';return result;}
}

export function continuedMessages(messages,partial){
  if(typeof partial!=='string'||partial.length>400000)throw modelError(400,'INVALID_CONTINUATION');
  return [...messages,{role:'assistant',content:partial||'（尚未收到正文）'},{role:'user',content:`[系统续写控制，不是新的玩家行动] 上一条助手回复被截断。只从其末尾接着输出，不重述、重演或改变玩家原行动，不重新掷骰，不开新一轮。正文未结束就继续正文；若已开始 ${STATE_OPEN}，从断点补齐 JSON（无法直接接续时可重发一个完整 ${STATE_OPEN} 状态块，但不要重发正文）；若状态块已完整，仅补 ${RESPONSE_END}。直到正文和状态全部完整后，才在 ${STATE_CLOSE} 后输出唯一 ${RESPONSE_END}。不要解释“我将继续”，不要复述已有文字。`}];
}

/** Initial response plus at most three continuation requests; state is committed once. */
export async function* streamStory({card,state,options,messages,partial='',connection,profile,key,firstResponse,firstSignal,signal,fetchImpl=fetch,attemptTimeoutMs=180000}){
  const decoder=new StoryDecoder();if(partial)decoder.push(partial);
  let response=firstResponse,attemptSignal=firstSignal||signal;
  for(let attempt=0;attempt<=MAX_CONTINUATIONS;attempt++){
    signal.throwIfAborted();let readError;
    const joiner=attempt>0||partial?new ContinuationJoiner(decoder.raw):undefined;
    if(attempt>0){
      yield {type:'continuation',attempt,maxAttempts:MAX_CONTINUATIONS};signal.throwIfAborted();
      attemptSignal=AbortSignal.any([signal,AbortSignal.timeout(attemptTimeoutMs)]);
      try{response=await openCompletion({connection,profile,key,messages:continuedMessages(messages,decoder.raw),signal:attemptSignal,fetchImpl});}
      catch(error){signal.throwIfAborted();readError=error;response=undefined;}
    }
    if(response){
      try{
        for await(const chunk of completionChunks(response)){
          signal.throwIfAborted();attemptSignal.throwIfAborted();
          const visible=decoder.push(joiner?joiner.push(chunk):chunk);if(visible)yield {type:'delta',text:visible};
          if(decoder.hasCompletionMarker())break;
        }
      }catch(error){signal.throwIfAborted();readError=attemptSignal.reason?.name==='TimeoutError'?modelError(504,'MODEL_TIMEOUT'):error;}
      finally{const tail=joiner?.finish();if(tail&&!signal.aborted){const visible=decoder.push(tail);if(visible)yield {type:'delta',text:visible};}}
    }
    signal.throwIfAborted();
    if(['MODEL_RESPONSE_TOO_LARGE','MODEL_STATE_TOO_LARGE','INVALID_MODEL_PROFILE','MODEL_KEY_REQUIRED'].includes(readError?.code))throw readError;
    try{const outcome=decoder.finish(card,state,options);yield {type:'done',outcome};return;}
    catch(error){
      // Validly terminated but invalid game data cannot be fixed by appending text.
      if(error.code!=='MODEL_RESPONSE_INCOMPLETE')throw error;
      if(readError?.code&&!recoverable.has(readError.code)&&attempt===0)throw readError;
      if(attempt===MAX_CONTINUATIONS)throw modelError(502,'AUTO_CONTINUE_LIMIT');
    }
  }
}
