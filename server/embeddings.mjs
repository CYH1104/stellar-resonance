import {modelError} from './ai.mjs';
export async function requestEmbeddings({connection,profile,key,texts,signal,fetchImpl=fetch}){
  if(!Array.isArray(texts)||!texts.length||texts.length>32||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>16000))throw modelError(400,'INVALID_EMBEDDING_REQUEST');
  if(!profile||typeof profile.model!=='string'||!profile.model.trim()||profile.model.length>150)throw modelError(400,'INVALID_MODEL_PROFILE');
  if(typeof key!=='string'||!key.trim()||key.length>8192)throw modelError(400,'MODEL_KEY_REQUIRED');
  let response;try{response=await fetchImpl(connection.url.replace(/chat\/completions$/,'embeddings'),{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:profile.model,input:texts,encoding_format:'float'})});}catch(error){if(signal.aborted)throw error;throw modelError(502,'MODEL_UNREACHABLE');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw modelError(502,response.status===401||response.status===403?'UPSTREAM_AUTH':response.status===429?'UPSTREAM_RATE_LIMIT':response.status===404?'EMBEDDING_NOT_SUPPORTED':'UPSTREAM_REJECTED');}
  if(!response.body)throw modelError(502,'INVALID_EMBEDDING_RESPONSE');
  const reader=response.body.getReader(),decoder=new TextDecoder();let content='',bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8*1024*1024)throw modelError(502,'INVALID_EMBEDDING_RESPONSE');content+=decoder.decode(value,{stream:true});}content+=decoder.decode();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  let data;try{data=JSON.parse(content).data;}catch{throw modelError(502,'INVALID_EMBEDDING_RESPONSE');}
  if(!Array.isArray(data)||data.length!==texts.length)throw modelError(502,'INVALID_EMBEDDING_RESPONSE');
  const vectors=new Array(texts.length),indices=new Set();let dimension;
  for(const row of data){if(!row||!Number.isInteger(row.index)||row.index<0||row.index>=texts.length||indices.has(row.index)||!Array.isArray(row.embedding)||!row.embedding.length||row.embedding.length>8192||row.embedding.some(v=>typeof v!=='number'||!Number.isFinite(v))||dimension!==undefined&&dimension!==row.embedding.length)throw modelError(502,'INVALID_EMBEDDING_RESPONSE');indices.add(row.index);dimension=row.embedding.length;vectors[row.index]=row.embedding;}
  return {vectors};
}
