// Fail closed for unknown list entries. Discovery does not send an embedding probe.
export function isEmbeddingModel(row){
 const id=typeof row==='string'?row:row?.id??row?.name??row?.model;if(typeof id!=='string')return false;
 if(/(?:^|[\W_])(?:rerank(?:er)?|chat|reasoning|image-generation|tts|whisper)(?:$|[\W_])/i.test(id))return false;
 if(row&&typeof row==='object'){
  const labels=[row.task,row.type,row.model_type,...(Array.isArray(row.tasks)?row.tasks:[]),...(Array.isArray(row.supported_endpoints)?row.supported_endpoints:[]),...(Array.isArray(row.supported_generation_methods)?row.supported_generation_methods:[]),...(Array.isArray(row.supportedGenerationMethods)?row.supportedGenerationMethods:[]),...(Array.isArray(row.capabilities)?row.capabilities:[])].filter(v=>typeof v==='string').map(v=>v.toLowerCase().replace(/[^a-z]/g,''));
  const capabilities=row.capabilities;
  if(labels.some(v=>['embedding','embeddings','textembedding','textembeddings','embedcontent','batchembedcontents','featureextraction'].includes(v))||capabilities&&typeof capabilities==='object'&&(capabilities.embedding===true||capabilities.embeddings===true))return true;
  if(labels.some(v=>['chat','chatcompletion','chatcompletions','rerank','reranker','textgeneration','imagegeneration','speech'].includes(v)))return false;
 }
 return /(?:向量|嵌入)/.test(id)||/(?:^|[\W_])(?:embeddings?|embed)(?:$|[\W_])/i.test(id)||/(?:^|\/)(?:bge-(?:m3|large|base|small)(?:[-_]|$)|(?:multilingual-)?e5-(?:large|base|small)(?:[-_]|$)|gte-(?:large|base|small|multilingual)(?:[-_]|$)|text2vec(?:[-_]|$))/i.test(id);
}
