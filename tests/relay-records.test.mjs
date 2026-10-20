import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createAccounts} from '../server/accounts.mjs';
import {readRelayRecords,relayOrigin} from '../server/relay-records.mjs';

test('relay origins omit all URL secrets, handle ports and reject invalid schemes',()=>{
  assert.equal(relayOrigin('https://user:password@relay.example:8443/private-secret/v1?key=hidden#token'),'https://relay.example:8443');
  assert.equal(relayOrigin('https://relay.example:443/v1'),'https://relay.example');
  assert.equal(relayOrigin('http://[::1]:8807/v1'),'http://[::1]:8807');
  assert.equal(relayOrigin('file:///private'),null);assert.equal(relayOrigin('invalid'),null);
});
test('account-bound relay history persists, filters, stays bounded and is erased on account deletion',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'academy-relays-'));let clock=Date.now(),store;
  try{
    store=await createAccounts({directory,now:()=>clock});
    const a=await store.enter('register',{email:'relay@qq.com',password:'synthetic-password'},'one');
    const b=await store.enter('register',{email:'other@qq.com',password:'synthetic-password'},'two');
    store.recordRelay(a.user.id,'https://name:url-secret@relay.example:8443/private-key?key=query-secret','configured');
    clock+=1000;store.recordRelay(a.user.id,'https://relay.example:8443/other','request');
    store.recordRelay(b.user.id,'https://other.example/v1','probe');
    store.recordRelay('unknown','https://bad.example','request');
    store.recordRelay(a.user.id,'https://bad.example','user-controlled-kind');
    let rows=store.relayRecords({email:' RELAY@QQ.COM '});
    assert.equal(rows.length,1);assert.equal(rows[0].observations,2);assert.equal(rows[0].lastKind,'request');assert.equal(rows[0].port,'8443');
    assert.equal(store.relayRecords().length,2);
    assert.throws(()=>store.relayRecords({limit:1001}));
    store.close();store=null;
    const file=resolve(directory,'accounts.sqlite');
    assert.equal((await readRelayRecords(file)).length,2);
    const bytes=await readFile(file);for(const secret of ['url-secret','private-key','query-secret'])assert.ok(!bytes.includes(Buffer.from(secret)));
    store=await createAccounts({directory,now:()=>clock});
    for(let i=0;i<105;i++){clock++;store.recordRelay(a.user.id,`https://relay-${i}.example`,'request');}
    assert.equal(store.relayRecords({email:a.user.email}).length,100);
    await store.maintain(a.token,{password:'synthetic-password',confirmation:'删除账号'},'delete','one');
    assert.equal(store.relayRecords({email:a.user.email}).length,0);assert.equal(store.relayRecords().length,1);
  }finally{store?.close();await rm(directory,{recursive:true,force:true});}
});
