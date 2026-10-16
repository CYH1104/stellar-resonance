import {narrationRule} from './narration.mjs';
import {completionChunks,modelError,openCompletion,RESPONSE_END,STATE_CLOSE,STATE_OPEN,StoryDecoder} from './ai.mjs';
import {ReasoningFilter} from '../src/domain/reasoning.ts';

export const MAX_CONTINUATIONS=3;
const recoverable=new Set(['MODEL_RESPONSE_INCOMPLETE','MODEL_STREAM_INTERRUPTED','MODEL_TIMEOUT','MODEL_UNREACHABLE','UPSTREAM_FAILED','INVALID_MODEL_RESPONSE']);
const repairable=new Set(['MODEL_FANFIC_TOO_SHORT','MODEL_FANFIC_UNFINISHED','MODEL_DIARY_TOO_SHORT','CHARACTER_AFFINITY_MISSING','CHARACTER_SPIRIT_THOUGHT_MISSING','MODEL_THEATERS_MISSING','INVALID_MODEL_STATE','MODEL_STATE_JSON_INVALID','MODEL_STATE_FIELDS_INVALID','MODEL_STATE_ROSTER_INVALID','MODEL_STATE_EVENT_INVALID','MODEL_STATE_CHARACTERS_INVALID','MODEL_STATE_PLAYER_INVALID','MODEL_STATE_FORUM_INVALID','MODEL_STATE_THEATERS_INVALID','MODEL_STATE_DIARY_INVALID','PLAYER_SPIRIT_THOUGHT_MISSING','UNKNOWN_MODEL_CHARACTER','INVALID_COMPLETION_MARKER']);

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

export function continuedMessages(messages,partial,playerName){
  if(typeof partial!=='string'||partial.length>400000)throw modelError(400,'INVALID_CONTINUATION');
  return [...messages,{role:'assistant',content:partial||'（尚未收到正文）'},{role:'user',content:`[系统续写控制，不是新的玩家行动] 上一条助手回复被截断。只从其末尾接着输出，不重述、重演或改变玩家原行动，不重新掷骰，不开新一轮。正文未结束就继续正文；若已开始 ${STATE_OPEN}，从断点补齐 JSON（无法直接接续时可重发一个完整 ${STATE_OPEN} 状态块，但不要重发正文）；若状态块已完整，仅补 ${RESPONSE_END}。直到正文和状态全部完整后，才在 ${STATE_CLOSE} 后输出唯一 ${RESPONSE_END}。不要解释“我将继续”，不要复述已有文字。${narrationRule(playerName)}`}];
}

export function repairedMessages(messages,story,card,state,options={},code='INVALID_MODEL_STATE'){
  const rules={suggestions:'依据已保留正文结尾给出1～4条简短中文玩家可选行动，每条建议80字内；只是选择，不改变剧情事实，不输出推理',presentCharacterIds:'本轮主线实际在场的完整 ID 数组，只能取 knownCharacters 中的 id，允许空数组',characters:'ability独立保存异能，不写入identity；identity为院系／组织与年级／职位，多重身份用换行分开，只根据既有人设和固定正文补全或更新，不发明职务；mentalPowerLevel仅在已有规则支持且固定正文明确发生升降时更新；无规则沿用已有精神力等级，不能借补修创造升级。每个本轮在场char必须有 id、affinity（−100～100，首次按玩家人设关系和剧情判断；后续基于之前数值变化），已知精神体的在场char必须有符合精神体自身性格的非空内心独白spiritThought，不能写动作或旁白；可以有innerThought。不能用未提供等占位' ,player:state.player.spiritAnimal?'必须有 spiritThought：根据本轮剧情生成符合精神体自身性格设定的第一人称内心独白，不写外部动作或行为，非空中文，不用未提供占位；identity 仅明确变化时可更新；mentalPowerLevel同样只在已有规则支持且固定正文明确发生升降时更新，否则沿用原值':'可省略；不生成未设定精神体的 OS',event:'必填：本轮已经发生的事件摘要，1～500字',forum:'论坛开启时至少一帖，关闭才可省略。每帖必须有唯一id、authorName、content；评论使用id、authorName、content' ,theaters:'theaterPlans里每个开启的位置2～4都必须返回，不能省略。每项slot、kind、title、content；group至少一条messages:[{speaker,content}]，其他kind必须有非空content，fanfic必须有participantIds:[player,已知charID]，正文不少于800字且有合理结尾，确实完篇后加入complete:true，不可待续；成年自愿的亲密互动可按明确配对设定写，性情节含蓄转场。精神体日记必须按原theaterPlans的diaryOwners输出diary:{ownerId,title,date?,mood?,content}，content是任意已知精神体的第一人称完整日记，至少200字，写幽默见闻、搞笑小事或吐槽，有感想结尾，不是即时OS或动作列表；故事日期未知就省略。依据原instruction写独立番外，不当作主线事实' ,...(options.dice?{diceEvent:'仍须准确描述原正文已经发生的骰子后果，direction 必须与既定骰点一致；不得凭空追加事件或改写正负结果'}:{})};
  return [...messages,{role:'assistant',content:story},{role:'user',content:`[系统状态补修，不是新的玩家行动] 正文已经固定。只重新输出一个完整 ${STATE_OPEN} JSON ${STATE_CLOSE}${RESPONSE_END}，不要续写、复述或修改正文，不开新回合，不重新掷骰。只根据刚才正文与既有设定整理状态；不能借修复格式编造新事件。不要 Markdown 围栏、解释或其他字段。JSON字符串中的段落换行须转义为反斜杠加n，双引号须转义；不得输出原始换行或尾随逗号。上次失败原因代码：${repairable.has(code)?code:'INVALID_MODEL_STATE'}。字段要求：${JSON.stringify(rules)}。knownCharacters：${JSON.stringify(card.characters.map(c=>({id:c.id,name:c.name,identity:state.characters.find(a=>a.id===c.id)?.identity,spiritAnimal:state.characters.find(a=>a.id===c.id)?.spiritAnimal,mentalPowerLevel:state.characters.find(a=>a.id===c.id)?.mentalPowerLevel,affinity:state.characters.find(a=>a.id===c.id)?.affinity})))}。这是内部结构化状态输出，用户预设的正文排版不用于此 JSON。正文中的“你”始终是${JSON.stringify(state.player.name)}；只据此整理状态，不互换user与char身份。`}];
}

/** Initial response plus at most three continuation requests; state is committed once. */
export async function* streamStory({card,state,options,messages,partial='',stateOnly=false,connection,profile,key,firstResponse,firstSignal,signal,fetchImpl=fetch,attemptTimeoutMs=180000,onProgress}){
  const decoder=new StoryDecoder();if(partial)decoder.push(partial);
  let reasoningFilter=new ReasoningFilter();
  let response=firstResponse,attemptSignal=firstSignal||signal,repairing=stateOnly,repairReason='INVALID_MODEL_STATE';
  if(repairing)decoder.beginStateRepair();
  for(let attempt=0;attempt<=MAX_CONTINUATIONS;attempt++){
    signal.throwIfAborted();let readError,lastStats;
    const diagnosticStats=()=>lastStats?{contentChars:lastStats.contentChars,visibleChars:lastStats.visibleChars,reasoningChars:lastStats.reasoningChars,finishReason:['','stop','length','tool_calls','content_filter'].includes(lastStats.finishReason)?lastStats.finishReason:'other'}:{};
    const joiner=!repairing&&(attempt>0||partial)?new ContinuationJoiner(decoder.raw):undefined;
    if(attempt>0){
      yield repairing?{type:'repair',attempt,maxAttempts:MAX_CONTINUATIONS,code:repairReason}:{type:'continuation',attempt,maxAttempts:MAX_CONTINUATIONS};signal.throwIfAborted();
      attemptSignal=AbortSignal.any([signal,AbortSignal.timeout(attemptTimeoutMs)]);
      const nextMessages=repairing?repairedMessages(messages,decoder.story,card,state,options,repairReason):continuedMessages(messages,decoder.raw,state.player.name);
      if(repairing){decoder.beginStateRepair();reasoningFilter=new ReasoningFilter();}
      else reasoningFilter.beginResponse();
      try{response=await openCompletion({connection,profile,key,messages:nextMessages,signal:attemptSignal,fetchImpl});}
      catch(error){signal.throwIfAborted();readError=error;response=undefined;}
    }
    if(response){
      try{
        for await(const chunk of completionChunks(response,{reasoningFilter,onProgress:stats=>{lastStats=stats;onProgress?.(stats);},signal:attemptSignal})){
          signal.throwIfAborted();attemptSignal.throwIfAborted();
          const visible=decoder.push(joiner?joiner.push(chunk):chunk);if(visible)yield {type:'delta',text:visible};
          if(decoder.hasCompletionMarker())break;
        }
      }catch(error){signal.throwIfAborted();readError=attemptSignal.reason?.name==='TimeoutError'?modelError(504,'MODEL_TIMEOUT'):error;}
      finally{const tail=joiner?.finish();if(tail&&!signal.aborted){const visible=decoder.push(tail);if(visible)yield {type:'delta',text:visible};}}
    }
    signal.throwIfAborted();
    if(['MODEL_RESPONSE_TOO_LARGE','MODEL_STATE_TOO_LARGE','INVALID_MODEL_PROFILE','MODEL_KEY_REQUIRED','MODEL_REASONING_UNCLOSED','MODEL_REASONING_ONLY','MODEL_NO_VISIBLE_CONTENT','MODEL_EMPTY_RESPONSE'].includes(readError?.code))throw readError;
    if(readError&&!decoder.raw.trim())throw readError;
    try{const outcome=decoder.finish(card,state,options);if(decoder.jsonInfo)yield {type:'diagnostic',diagnostic:{...decoder.jsonInfo,...diagnosticStats(),attempt,stage:'accepted'}};yield {type:'done',outcome};return;}
    catch(error){
      yield {type:'diagnostic',diagnostic:{...(error.diagnostic||{kind:'generation'}),...diagnosticStats(),code:error.code,attempt,stage:'rejected'}};
      if(repairable.has(error.code)&&decoder.story.trim()){repairing=true;repairReason=error.code;}
      else if(error.code!=='MODEL_RESPONSE_INCOMPLETE')throw error;
      if(readError?.code&&!recoverable.has(readError.code))throw readError;
      if(attempt===MAX_CONTINUATIONS){if(repairing)throw Object.assign(modelError(502,'STATE_REPAIR_LIMIT'),{reasonCode:repairReason});throw modelError(502,'AUTO_CONTINUE_LIMIT');}
    }
  }
}
