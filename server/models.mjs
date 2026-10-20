import {isEmbeddingModel} from './embedding-models.mjs';
import {endpoint,modelError} from './ai.mjs';

/** Metadata-only request: never sends card definitions, history, or a completion body. */
export async function fetchModelList({apiBaseUrl,key,signal,fetchImpl=fetch,kind}){
  if(kind!==undefined&&kind!=='embedding')throw modelError(400,'INVALID_MODEL_KIND');
  const url=endpoint(apiBaseUrl).replace(/chat\/completions$/,'models');
  if(typeof key!=='string'||!key.trim()||key.length>8192)throw modelError(400,'MODEL_KEY_REQUIRED');
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',signal,headers:{Accept:'application/json',Authorization:`Bearer ${key}`}});}
  catch(error){if(signal.aborted)throw error;throw modelError(502,'MODEL_UNREACHABLE');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw modelError(502,response.status===401||response.status===403?'UPSTREAM_AUTH':response.status===404||response.status===405?'MODEL_LIST_NOT_SUPPORTED':response.status===429?'UPSTREAM_RATE_LIMIT':'MODEL_LIST_FAILED');}
  if(!response.body)throw modelError(502,'INVALID_MODEL_LIST');
  const reader=response.body.getReader(),decoder=new TextDecoder();let content='',bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024)throw modelError(502,'MODEL_LIST_TOO_LARGE');content+=decoder.decode(value,{stream:true});}content+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  let json;try{json=JSON.parse(content);}catch{throw modelError(502,'INVALID_MODEL_LIST');}
  const rows=Array.isArray(json)?json:json?.data??json?.models;
  if(!Array.isArray(rows))throw modelError(502,'INVALID_MODEL_LIST');
  if(rows.length>5000)throw modelError(502,'MODEL_LIST_TOO_LARGE');
  const models=[...new Set(rows.filter(row=>kind!=='embedding'||isEmbeddingModel(row)).map(row=>typeof row==='string'?row:row?.id??row?.name).filter(id=>typeof id==='string'&&id.trim()&&id.length<=150).map(id=>id.trim()))].sort((a,b)=>a.localeCompare(b));
  return {models};
}
