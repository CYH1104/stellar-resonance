import test from 'node:test';import assert from 'node:assert/strict';import {PrivateNativeCompiler} from '../native/academy-plugin/privateCompiler.mjs';
test('native preset errors are 400 and do not poison the serialized compiler after a failed task',async()=>{
 const compiler=new PrivateNativeCompiler();compiler.ready=Promise.resolve();let fail=true;
 compiler.evaluate=async()=>fail?{__academyCompileError:'NATIVE_PRESET_CONTEXT_INSUFFICIENT'}:{messages:[{role:'user',content:'synthetic'}]};
 await assert.rejects(compiler.compile({},new AbortController().signal),{code:'NATIVE_PRESET_CONTEXT_INSUFFICIENT',status:400});assert.equal(compiler.waiting,0);fail=false;assert.equal((await compiler.compile({},new AbortController().signal)).messages.length,1);assert.equal(compiler.waiting,0);
});
test('unexpected private failures never echo an exception or arbitrary error text to the player',async()=>{
 const compiler=new PrivateNativeCompiler();compiler.ready=Promise.resolve();compiler.evaluate=async()=>({__academyCompileError:'PRIVATE_AUTHOR_CANARY_MUST_NOT_ECHO'});
 await assert.rejects(compiler.compile({},new AbortController().signal),error=>error.code==='PRIVATE_NATIVE_EXECUTION_FAILED'&&error.status===503&&!error.message.includes('AUTHOR_CANARY'));
});
test('cancellation ignores a late compiler result and releases its queued slot',async()=>{
 const compiler=new PrivateNativeCompiler();compiler.ready=Promise.resolve();let release;const result=new Promise(resolve=>release=resolve);compiler.evaluate=async expression=>expression.includes('.cancel(')?undefined:result;const controller=new AbortController(),pending=compiler.compile({},controller.signal);await new Promise(resolve=>setTimeout(resolve,0));controller.abort();release({messages:[{role:'user',content:'late'}]});await assert.rejects(pending,{name:'AbortError'});assert.equal(compiler.waiting,0);
});
