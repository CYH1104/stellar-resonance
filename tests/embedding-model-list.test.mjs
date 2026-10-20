import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchModelList} from '../server/models.mjs';
import {isEmbeddingModel} from '../server/embedding-models.mjs';
test('embedding discovery excludes chat, rerank and unknown names',()=>{
 for(const id of ['BAAI/bge-m3','Pro/BAAI/bge-m3','text-embedding-3-small','models/gemini-embedding-001','Qwen/Qwen3-Embedding-8B','embed-multilingual-v3.0','intfloat/multilingual-e5-large'])assert.equal(isEmbeddingModel(id),true,id);
 for(const id of ['gpt-4o','deepseek-chat','agnes-3.0-flash','BAAI/bge-reranker-v2-m3','Qwen3-Reranker-8B','unknown-private-model','embedding-chat','embedding-reranker'])assert.equal(isEmbeddingModel(id),false,id);
 assert.equal(isEmbeddingModel({id:'private-vector-a',capabilities:{embeddings:true}}),true);
 assert.equal(isEmbeddingModel({name:'custom-vector-b',supportedGenerationMethods:['embedContent']}),true);
 assert.equal(isEmbeddingModel({id:'text-embedding-3',task:'text-generation'}),false);
});
test('only embedding requests are filtered, preserving metadata until classification',async()=>{
 const rows=[{id:'gpt-4o'},{id:'BAAI/bge-m3'},{id:'BAAI/bge-reranker-v2-m3'},{id:'private-model',task:'embedding'},{id:'unknown'}];let calls=0;
 const options={apiBaseUrl:'https://synthetic.example/v1',key:'synthetic-key',signal:new AbortController().signal,fetchImpl:async()=>{calls++;return Response.json({data:rows});}};
 assert.deepEqual((await fetchModelList({...options,kind:'embedding'})).models,['BAAI/bge-m3','private-model']);
 assert.equal((await fetchModelList(options)).models.length,5);assert.equal(calls,2);
 assert.deepEqual((await fetchModelList({...options,kind:'embedding',fetchImpl:async()=>Response.json({data:[{id:'gpt-4o'}]})})).models,[]);
 await assert.rejects(fetchModelList({...options,kind:'invalid'}),{code:'INVALID_MODEL_KIND'});assert.equal(calls,2);
});
