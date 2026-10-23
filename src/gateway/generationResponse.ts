/** Safe transport diagnostics: never expose response bodies, redirect locations or header parameters. */
export function responseMetadata(response:Response){const raw=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();const known=['text/event-stream','application/json','text/html','text/plain','application/octet-stream'];return `HTTP ${response.status}；响应类型：${known.includes(raw)?raw:raw?'其他类型':'未提供'}`;}
export async function openGenerationStream(response:Response,messageForCode:(code:string)=>string|undefined){
 const meta=responseMetadata(response),mime=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
 if(!response.body)throw Error(`生成接口返回空响应，未收到正文。${meta}`);
 const reader=response.body.getReader(),decoder=new TextDecoder();
 if(mime==='text/event-stream')return {reader,prefix:'',decoder};
 let prefix='';
 try{
  while(prefix.length<8192){
   const part=await reader.read();prefix+=decoder.decode(part.value,{stream:!part.done});const text=prefix.trimStart();
   // Accept real SSE bytes despite an incorrect MIME; the existing application-event parser still validates them.
   if(text.startsWith('data:')||text.startsWith(':'))return {reader,prefix:text,decoder};
   if(mime==='text/html'||text.startsWith('<'))throw Error(`生成接口返回了网页，可能是登录页或代理错误页，请检查会话和服务器路由。${meta}`);
   if(prefix.length>8192)throw Error(`生成接口的非流式响应超过诊断读取上限。${meta}`);
   if(text.startsWith('{')){
    try{const data=JSON.parse(text);const message=typeof data?.code==='string'?messageForCode(data.code):undefined;throw Object.assign(Error(`${message||'生成接口返回了非流式 JSON，未收到应用剧情数据流，请检查后台接口或代理配置。'} ${meta}`),{transportClassified:true});}
    catch(error){if(error instanceof Error&&'transportClassified'in error)throw error;}
   }else if(text&&!['data:'].some(token=>token.startsWith(text)))throw Error(`生成接口未返回可识别的剧情数据流，请检查后台接口或代理配置。${meta}`);
   if(part.done)break;
  }
  throw Error(`${prefix.trim()?'生成接口响应不是有效的剧情数据流，请检查后台接口或代理配置。':'生成接口返回空响应，未收到正文。'} ${meta}`);
 }catch(error){await reader.cancel().catch(()=>{});reader.releaseLock();throw error;}
}
