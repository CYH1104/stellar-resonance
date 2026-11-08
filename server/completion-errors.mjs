/** Return only fixed diagnostic categories. Provider text may echo a private
 * prompt or credential and must never be forwarded, persisted or logged. */
export function classifyCompletionRejection(body){
 let value;try{value=JSON.parse(body);}catch{return /(?:tool|function)[ _-]?(?:call|calling)|工具调用|函数调用/i.test(body)&&/not supported|unsupported|not allowed|不支持|拒绝/i.test(body)?'UPSTREAM_TOOL_CALLS_UNSUPPORTED':undefined;}
 const error=value?.error??value,code=typeof error?.code==='string'?error.code.toLowerCase():'',param=typeof error?.param==='string'?error.param:'',message=typeof error==='string'?error:typeof error?.message==='string'?error.message:'';
 const text=param+' '+message,rejected=/invalid|unsupported|not supported|not allowed|unknown name|cannot|must|exceed|limit|too (?:large|long|many)|不支持|无效|超出|超过|拒绝|限制/i.test(text);
 if(/context_length_exceeded|context_window_exceeded/.test(code)||/context (?:length|window)|input.{0,24}too long|prompt.{0,24}too long|上下文.{0,12}(?:超|长)/i.test(text))return 'UPSTREAM_CONTEXT_LIMIT';
 if(/model_not_found|invalid_model/.test(code)||/model.{0,40}(?:not found|does not exist|not available)|模型.{0,16}(?:不存在|不可用)/i.test(text))return 'UPSTREAM_MODEL_UNAVAILABLE';
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
export async function completionRejectionReason(response){
 if(![400,422].includes(response.status)||!response.body){void response.body?.cancel().catch(()=>{});return undefined;}
 const reader=response.body.getReader();let timer;
 try{
  const read=async()=>{let size=0,text='';const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)return classifyCompletionRejection(text+decoder.decode());size+=value.byteLength;if(size>16384)return undefined;text+=decoder.decode(value,{stream:true});}};
  return await Promise.race([read().catch(()=>undefined),new Promise(resolve=>{timer=setTimeout(()=>resolve(undefined),750);})]);
 }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
}
export function textCompletionMessages(messages){
 if(!Array.isArray(messages)||messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))throw Object.assign(Error('INVALID_TEXT_MESSAGES'),{status:400,code:'INVALID_TEXT_MESSAGES'});
 return messages.map(({role,content})=>({role,content}));
}
