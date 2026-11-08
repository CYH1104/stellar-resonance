import {test} from 'node:test';import assert from 'node:assert/strict';
import {classifyCompletionRejection,completionRejectionReason,textCompletionMessages} from '../server/completion-errors.mjs';import {openCompletion} from '../server/ai.mjs';
test('only fixed safe upstream reasons are exposed, never raw messages or arbitrary parameter names',()=>{
 for(const [error,expected]of [[{message:'Tool calling is not supported'},'UPSTREAM_TOOL_CALLS_UNSUPPORTED'],[{param:'max_tokens',message:'must be less than 8192 PRIVATE_PROMPT'},'UPSTREAM_OUTPUT_BUDGET'],[{param:'top_p',message:'Unsupported parameter'},'UPSTREAM_TOP_P'],[{code:'context_length_exceeded',message:'PRIVATE_HISTORY'},'UPSTREAM_CONTEXT_LIMIT'],[{param:'private_prompt',message:'PRIVATE_KEY'},undefined]]){const result=classifyCompletionRejection(JSON.stringify({error}));assert.equal(result,expected);assert.ok(!String(result).includes('PRIVATE'));}
});
test('error reads are bounded and a non-terminating rejection cannot hold the request open',async()=>{
 assert.equal(await completionRejectionReason(new Response('x'.repeat(17000),{status:400})),undefined);
 let cancelled=false;const start=Date.now();const result=await completionRejectionReason(new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:400}));assert.equal(result,undefined);assert.equal(cancelled,true);assert.ok(Date.now()-start<2000);
});
test('text requests contain only roles and verbatim text, without tool/function metadata or silent text rewriting',async()=>{
 let sent;const content='工具调用 function_call tools 这些是用户自己的正文原文';
 await openCompletion({connection:{url:'https://synthetic.example/v1/chat/completions'},key:'synthetic-key',profile:{model:'synthetic',temperature:1,maxTokens:4096},messages:[{role:'user',content,name:'tool-name',tool_calls:[{secret:'unused'}],function_call:{name:'unused'}}],signal:new AbortController().signal,fetchImpl:async(_url,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[]});}});
 assert.deepEqual(sent.messages,[{role:'user',content}]);for(const field of ['tools','tool_choice','function_call','functions'])assert.equal(field in sent,false);
 assert.throws(()=>textCompletionMessages([{role:'tool',content:'result'}]),/INVALID_TEXT_MESSAGES/);
});
test('a tool refusal reaches the HTTP error as a safe category and keeps the original status',async()=>{
 await assert.rejects(()=>openCompletion({connection:{url:'https://synthetic.example/v1/chat/completions'},key:'synthetic-key',profile:{model:'synthetic',temperature:1,maxTokens:4096},messages:[{role:'user',content:'text'}],signal:new AbortController().signal,fetchImpl:async()=>Response.json({error:{message:'Tool calling is not supported PRIVATE_PROMPT PRIVATE_KEY'}},{status:400})}),e=>e.code==='UPSTREAM_REJECTED'&&e.upstreamStatus===400&&e.reason==='UPSTREAM_TOOL_CALLS_UNSUPPORTED'&&!JSON.stringify(e).includes('PRIVATE'));
});
