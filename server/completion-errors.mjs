import {upstreamErrorDetail} from './upstream-error-detail.mjs';
/** Return only fixed diagnostic categories. Provider text may echo a private
 * prompt or credential and must never be forwarded, persisted or logged. */
function classifySingleRejection(body){
 let value;try{value=JSON.parse(body);}catch{value={message:body};}
 const error=value?.error??value,code=typeof error?.code==='string'?error.code.toLowerCase():'',param=typeof error?.param==='string'?error.param:'',message=typeof error==='string'?error:typeof error?.message==='string'?error.message:'';
 const text=param+' '+message,rejected=/invalid|unsupported|not supported|not allowed|unknown name|cannot|must|exceed|limit|too (?:large|long|many)|不支持|无效|超出|超过|拒绝|限制/i.test(text);
 if(/context_length_exceeded|context_window_exceeded/.test(code)||/context (?:length|window)|input.{0,24}too long|prompt.{0,24}too long|上下文.{0,12}(?:超|长)/i.test(text))return 'UPSTREAM_CONTEXT_LIMIT';
 if(/model_not_found|invalid_model|no_available_channel/.test(code)||/model.{0,40}(?:not found|does not exist|not available)|no available channels?|no endpoints found|模型.{0,16}(?:不存在|不可用)|无可用(?:的)?渠道|未找到可用渠道/i.test(text))return 'UPSTREAM_MODEL_UNAVAILABLE';
 if(/insufficient_quota|insufficient_balance/.test(code)||/insufficient (?:quota|balance|credit)|余额不足|额度不足/i.test(text))return 'UPSTREAM_QUOTA';
 if(/invalid_api_key/.test(code)||/invalid (?:api[ _-]?)?key|incorrect api key|令牌无效|密钥无效/i.test(text))return 'UPSTREAM_CREDENTIAL_REJECTED';
 if(/location is not supported|region.{0,20}(?:unsupported|not supported)|地区.{0,16}不支持/i.test(text))return 'UPSTREAM_LOCATION_REJECTED';
 if(!rejected)return undefined;
 if(/\btools?\b|tool_choice|function_call|function calling|工具调用|函数调用/i.test(text))return 'UPSTREAM_TOOL_CALLS_UNSUPPORTED';
 if(/max_tokens|max_output_tokens|max_completion_tokens|thinking_budget|输出.{0,12}(?:预算|上限|长度)/i.test(text))return 'UPSTREAM_OUTPUT_BUDGET';
 if(/temperature|温度/i.test(text))return 'UPSTREAM_TEMPERATURE';
 if(/top_p|topP/.test(text))return 'UPSTREAM_TOP_P';
 if(/frequency_penalty|presence_penalty/.test(text))return 'UPSTREAM_PENALTY';
 if(/\bstream\b|流式/i.test(text))return 'UPSTREAM_STREAM_UNSUPPORTED';
 if(/\brole\b|system message|assistant prefill|角色顺序/i.test(text))return 'UPSTREAM_MESSAGE_ROLES';
 if(/\bmessages\b|\bcontent\b/.test(text))return 'UPSTREAM_MESSAGE_FORMAT';
 return undefined;
}
export function classifyCompletionRejection(body){
 const direct=classifySingleRejection(body);if(direct)return direct;
 let root;try{root=JSON.parse(body);}catch{return undefined;}
 // Relays sometimes nest the real error as JSON in message/details/cause.
 // Inspect only error containers, with a bounded depth and node count.
 const queue=[{value:root,depth:0}];let visited=0;
 while(queue.length&&visited++<64){const {value,depth}=queue.shift();if(depth>6)continue;
  if(typeof value==='string'){const found=classifySingleRejection(value);if(found)return found;try{queue.push({value:JSON.parse(value),depth:depth+1});}catch{}continue;}
  if(!value||typeof value!=='object')continue;
  const found=classifySingleRejection(JSON.stringify(value));if(found)return found;
  if(Array.isArray(value))queue.push(...value.slice(0,16).map(value=>({value,depth:depth+1})));
  else for(const key of ['error','message','details','cause','response','data'])if(Object.hasOwn(value,key))queue.push({value:value[key],depth:depth+1});
 }
 return undefined;
}
export async function completionRejectionDetails(response,context={}){
 if(response.status<400||!response.body){void response.body?.cancel().catch(()=>{});return {};}
 const reader=response.body.getReader();let timer;
 try{const read=async()=>{let size=0,body='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done){body+=decoder.decode();const reason=classifyCompletionRejection(body);return {...(reason?{reason}:{}),...upstreamErrorDetail(body,context)};}size+=part.value.byteLength;if(size>16384)return {};body+=decoder.decode(part.value,{stream:true});}};return await Promise.race([read().catch(()=>({})),new Promise(resolve=>{timer=setTimeout(()=>resolve({}),750);})]);}
 finally{clearTimeout(timer);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
}
export async function completionRejectionReason(response){return (await completionRejectionDetails(response)).reason;}
/** Metadata about the serialized request only; never include message text, URLs,
 * model names, credentials or provider strings in this object. */
export function completionRequestShape(body){
 const messages=body.messages,counts={system:0,user:0,assistant:0};let characters=0,empty=0,systemAfterConversation=false,conversation=false;
 for(const message of messages){counts[message.role]++;characters+=message.content.length;if(!message.content.trim())empty++;if(message.role==='system'){if(conversation)systemAfterConversation=true;}else conversation=true;}
 return {messages:messages.length,...counts,characters,empty,lastRole:messages.at(-1)?.role||'none',systemAfterConversation,stream:body.stream===true,toolFields:['tools','tool_choice','functions','function_call'].filter(field=>Object.hasOwn(body,field)).length};
}
export function completionHttpCode(status){
 return status===401||status===403?'UPSTREAM_AUTH':status===429?'UPSTREAM_RATE_LIMIT':status>=500?'UPSTREAM_SERVER_ERROR':'UPSTREAM_REJECTED';
}
export function textCompletionMessages(messages){
 if(!Array.isArray(messages)||messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))throw Object.assign(Error('INVALID_TEXT_MESSAGES'),{status:400,code:'INVALID_TEXT_MESSAGES'});
 return messages.map(({role,content})=>({role,content}));
}
