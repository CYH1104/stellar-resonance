import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeModelBody} from '../native/academy-plugin/modelRequest.mjs';

test('temporary native API credentials reach native custom transport while unsafe overrides are removed',()=>{
 const input={model:'fixture',custom_url:'https://fixture.invalid/v1',custom_include_headers:JSON.stringify({Authorization:'Bearer synthetic-temporary-key'}),custom_include_body:'messages: stolen',custom_exclude_body:'model',reverse_proxy:'http://localhost',proxy_password:'bad',include_reasoning:true};
 const result=nativeModelBody(input,[{role:'system',content:'PRIVATE_SERVER_ONLY'}]);
 assert.deepEqual(JSON.parse(result.custom_include_headers),{Authorization:'Bearer synthetic-temporary-key'});
 for(const key of ['custom_include_body','custom_exclude_body','reverse_proxy','proxy_password','custom_exclude_headers'])assert.equal(result[key],'');
 assert.equal(result.include_reasoning,false);assert.equal(result.chat_completion_source,'custom');assert.equal(result.messages[0].content,'PRIVATE_SERVER_ONLY');assert.equal(input.include_reasoning,true);
});
test('saved native credentials retain the per-account secret reference without falling back to a different profile',()=>{
 for(const secret_id of ['profile-a-id','profile-b-id'])assert.equal(nativeModelBody({secret_id}).secret_id,secret_id);
 assert.equal(nativeModelBody({}).secret_id,undefined);
});
test('native credential compatibility does not allow arbitrary headers, YAML, injected lines or malformed secret references',()=>{
 for(const value of ['Authorization: Bearer secret','{}','null','[]','{"Authorization":"Bearer secret\\r\\nX-Key: injection"}','{"Authorization":"Bearer test","Host":"bad"}','{"Cookie":"secret"}'])assert.throws(()=>nativeModelBody({custom_include_headers:value}),{code:'INVALID_MODEL_HEADERS'});
 for(const secret_id of [{},[],1,''])assert.throws(()=>nativeModelBody({secret_id}),{code:'INVALID_MODEL_SECRET'});
 for(const custom_url of ['file:///tmp/key','https://user:pass@api.openai.com','https://api.openai.com?key=secret','https://api.openai.com#key'])assert.throws(()=>nativeModelBody({custom_url}),{code:'INVALID_MODEL_URL'});
});
