// Adapted from original SillyTavern src/vectors/openai-vectors.js (AGPL-3.0).
// Compatibility additions: explicit per-request secret ID, cancellation and result validation.
export async function nativeVectors(request,signal){
  const {readSecret,SECRET_KEYS}=await import('../SillyTavern/src/endpoints/secrets.js');
  const {default:fetch}=await import('../SillyTavern/node_modules/node-fetch/src/index.js');
  const {texts,profile,key,secret_id}=request.body||{};
  if(!Array.isArray(texts)||!texts.length||texts.length>64||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>100000)||typeof profile?.model!=='string'||!profile.model.trim())throw Object.assign(Error('INVALID_EMBEDDING_REQUEST'),{status:400,code:'INVALID_EMBEDDING_REQUEST'});
  const url=new URL(profile.apiBaseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Object.assign(Error('INVALID_MODEL_URL'),{status:400});
  const credential=secret_id?readSecret(request.user.directories,SECRET_KEYS.CUSTOM,secret_id):key;
  if(!credential)throw Object.assign(Error('MODEL_KEY_REQUIRED'),{status:400});
  url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/(?:chat\/completions|embeddings)$/,'')+'/embeddings';
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${credential}`},body:JSON.stringify({input:texts,model:profile.model}),signal});
  if(!response.ok)throw Object.assign(Error('NATIVE_EMBEDDING_FAILED'),{status:response.status,code:'NATIVE_EMBEDDING_FAILED'});
  const data=await response.json();if(!Array.isArray(data?.data)||data.data.length!==texts.length)throw Object.assign(Error('INVALID_EMBEDDING_RESPONSE'),{status:502});
  data.data.sort((a,b)=>a.index-b.index);
  const vectors=data.data.map(x=>x.embedding),dimension=vectors[0]?.length;
  if(!dimension||dimension>8192||data.data.some((x,i)=>x.index!==i)||vectors.some(v=>!Array.isArray(v)||v.length!==dimension||v.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw Object.assign(Error('INVALID_EMBEDDING_RESPONSE'),{status:502});
  return {vectors};
}
