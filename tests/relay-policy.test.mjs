import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createRelayPolicy,allowedOrigin,officialApiOrigins} from '../server/relay-policy.mjs';
test('relay allowlist is fail-closed, persistent, exact by scheme host port and rechecked per fetch',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'relay-policy-')),file=resolve(directory,'policy.json');
 try{const policy=createRelayPolicy(file);await assert.rejects(policy.assert('https://relay.example/v1'),{code:'API_ORIGIN_NOT_ALLOWED'});
 await policy.save(['https://relay.example:8443','https://relay.example:8443/']);assert.equal((await policy.read()).origins.length,1);
 await createRelayPolicy(file).assert('https://relay.example:8443/v1/chat/completions');
 for(const url of ['https://relay.example/v1','https://relay.example.attacker:8443','http://relay.example:8443'])await assert.rejects(policy.assert(url),{code:'API_ORIGIN_NOT_ALLOWED'});
 let calls=0;const guarded=policy.guard(async(url,options)=>{calls++;assert.equal(options.redirect,'error');return {ok:true};});await guarded('https://relay.example:8443/v1',{});
 await policy.save([]);await assert.rejects(guarded('https://relay.example:8443/v1',{}),{code:'API_ORIGIN_NOT_ALLOWED'});assert.equal(calls,1);
 for(const url of ['https://user:secret@relay.example','https://relay.example?key=secret','file:///x',null,{},'relay.example','https://relay.example/#x'])assert.throws(()=>allowedOrigin(url));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('full API URLs normalize to exact origins and official defaults coexist with custom policies',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'official-policy-'));
 try{const policy=createRelayPolicy(resolve(directory,'policy.json'));
 for(const origin of officialApiOrigins){await policy.assert(origin+'/v1/chat/completions');await assert.rejects(policy.assert(origin+':8443/v1'),{code:'API_ORIGIN_NOT_ALLOWED'});await assert.rejects(policy.assert(origin+'.attacker.example/v1'),{code:'API_ORIGIN_NOT_ALLOWED'});}
 const saved=await policy.save([' https://relay.example:8443/v1/chat/completions ','https://relay.example:8443/v1']);assert.deepEqual(saved.origins,['https://relay.example:8443']);assert.deepEqual(saved.officialOrigins,[...officialApiOrigins]);
 await policy.assert('https://relay.example:8443/v2/models');await policy.save([]);await policy.assert('https://api.deepseek.com/v1');await assert.rejects(policy.assert('https://relay.example:8443/v1'),{code:'API_ORIGIN_NOT_ALLOWED'});
 await assert.rejects(policy.save(['https://bad.example?key=hidden']),{code:'INVALID_API_ORIGIN'});assert.deepEqual((await policy.read()).origins,[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
