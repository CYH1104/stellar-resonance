import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { IndexedDbRepository } from '../src/storage/repository';
import { defaults, newSession } from '../src/domain/story';
import {cleanLocalApiCredentials} from '../src/storage/apiCredentials';

it('IndexedDB 事务完成后，新实例可读取同一份存档', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const first = new IndexedDbRepository(name);
  expect(await first.read()).toBeUndefined();
  const value = { version: 2 as const, sessions: [newSession('本机存档', { name: '访客', appearance: '', personality: '', background: '' }, '')], preferences: defaults() };
  await first.write(value);
  expect(await new IndexedDbRepository(name).read()).toEqual(value);
  const invalid = structuredClone(value); invalid.preferences.profiles[0].maxTokens = 0;
  await expect(first.write(invalid)).rejects.toThrow('模型参数');
  expect(await new IndexedDbRepository(name).read()).toEqual(value);
});
it('本机 Key 单独存取，不进入存档；关闭记住后删除持久凭据',async()=>{
  const name=`credentials-${crypto.randomUUID()}`,first=new IndexedDbRepository(name),preferences=defaults();
  await first.write({version:1,sessions:[],preferences});
  const privateRecord={version:1 as const,remember:true,keys:{main:'synthetic-local-key'},confirmed:{main:{apiBaseUrl:'https://synthetic.example/v1',model:'test-model'}}};
  await first.writeApiCredentials(privateRecord);const reopened=new IndexedDbRepository(name);
  expect(await reopened.readApiCredentials()).toEqual(privateRecord);expect(JSON.stringify(await reopened.read())).not.toContain('synthetic-local-key');
  await reopened.writeApiCredentials({...privateRecord,remember:false});expect(await first.readApiCredentials()).toEqual({version:1,remember:false,keys:{},confirmed:{}});
  expect((await reopened.read())?.preferences).toEqual(preferences);
});
it('本机凭据白名单不保留额外字段，拒绝危险地址及原型字段',()=>{  const value={version:1 as const,remember:true,keys:{main:'synthetic-local-key'},confirmed:{main:{apiBaseUrl:'https://synthetic.example/v1',model:'test-model'}},extra:'drop'};
  expect(cleanLocalApiCredentials(value)).not.toHaveProperty('extra');
  expect(()=>cleanLocalApiCredentials({...value,confirmed:{main:{...value.confirmed.main,apiBaseUrl:'https://secret@synthetic.example/v1'}}})).toThrow();
  expect(()=>cleanLocalApiCredentials({...value,keys:JSON.parse('{"__proto__":"synthetic-key"}')})).toThrow();
});
it('另一个标签页先写入时，旧标签页的保存被拒绝而不是覆盖',async()=>{
  const name=`stale-${crypto.randomUUID()}`,first=new IndexedDbRepository(name),second=new IndexedDbRepository(name);
  const one={version:1 as const,sessions:[newSession('第一页',{name:'访客',appearance:'',personality:'',background:''},'')],preferences:defaults()};
  const two={version:1 as const,sessions:[newSession('第二页',{name:'访客',appearance:'',personality:'',background:''},'')],preferences:defaults()};
  await first.read();await second.read();
  await first.write(one);
  await expect(second.write(two)).rejects.toMatchObject({code:'STALE_WRITE'});
  await second.read();await second.write(two);
  expect((await first.read())?.sessions[0].name).toBe('第二页');
});
