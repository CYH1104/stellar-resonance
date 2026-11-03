import test from 'node:test';
import assert from 'node:assert/strict';
import {academyAccounts} from '../native/academy-plugin/accounts.mjs';
function setup(create){const data=new Map(),created=[];const store={getItem:async key=>structuredClone(data.get(key)),setItem:async(key,value)=>data.set(key,structuredClone(value)),values:async filter=>[...data].filter(([key,value])=>filter({key,value})).map(([,value])=>structuredClone(value))};const service=academyAccounts({store,create:async body=>{created.push(body);if(create)return create(body);data.set('user:'+body.handle,{...body});return {handle:body.handle};}});return {data,created,service};}
const form=code=>({handle:'new-student',name:'学员',password:'Synthetic-test-only-123',inviteCode:code});
test('native invite administration retains old records and revokes only unused codes without disclosing them',async()=>{const {service,data}=setup(),admin={handle:'owner',admin:true};const {code}=await service.invite(admin,{batch:'合成批次',note:'备注'});assert.equal((await service.list(admin)).invites[0].batch,'合成批次');assert.ok(!JSON.stringify(await service.list(admin)).includes(code));assert.deepEqual(await service.revoke(admin,code),{revoked:true});await assert.rejects(service.register(form(code)),{code:'NATIVE_INVITE_INVALID'});assert.deepEqual(await service.revoke(admin,code),{revoked:false});await assert.rejects(service.list({admin:false}),{code:'NATIVE_ADMIN_REQUIRED'});assert.equal(data.size,1);});
test('native registration requires a single-use invite and forcibly creates a non-admin',async()=>{
  const {service,data,created}=setup();await assert.rejects(service.invite({handle:'regular',admin:false}),{code:'NATIVE_ADMIN_REQUIRED'});
  const {code}=await service.invite({handle:'admin',admin:true});assert.equal(code.length,24);assert.ok(!JSON.stringify([...data]).includes(code));
  assert.deepEqual(await service.register({...form(code),admin:true,enabled:false,directory:'/other-user'}),{handle:'new-student'});
  assert.deepEqual(created,[{handle:'new-student',name:'学员',password:'Synthetic-test-only-123',admin:false}]);
  await assert.rejects(service.register({...form(code),handle:'second-user'}),{code:'NATIVE_INVITE_INVALID'});
});
test('concurrent requests cannot consume the same invite twice or overwrite an existing user',async()=>{
  const {service,created,data}=setup();const {code}=await service.invite({handle:'admin',admin:true});
  const results=await Promise.allSettled([service.register(form(code)),service.register({...form(code),handle:'second-user'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(created.length,1);
  const invite=await service.invite({handle:'admin',admin:true});const before=structuredClone(data.get('user:new-student'));
  await assert.rejects(service.register(form(invite.code)),{code:'NATIVE_ACCOUNT_EXISTS'});assert.deepEqual(data.get('user:new-student'),before);
});
test('invalid fields do not consume an invite and an uncertain create never silently reopens it',async()=>{
  const {service,created}=setup();const {code}=await service.invite({handle:'admin',admin:true});
  for(const patch of [{handle:'../other'},{handle:'default-user'},{password:''},{name:''}])await assert.rejects(service.register({...form(code),...patch}));
  assert.equal(created.length,0);await service.register(form(code));
  const broken=setup(async()=>{throw Error('uncertain native write');});const token=await broken.service.invite({handle:'admin',admin:true});await assert.rejects(broken.service.register(form(token.code)),/uncertain/);
  await assert.rejects(broken.service.register(form(token.code)),{code:'NATIVE_INVITE_INVALID'});assert.equal(broken.created.length,1);
});
