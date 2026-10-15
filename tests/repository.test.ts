import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { IndexedDbRepository } from '../src/storage/repository';
import { defaults, newSession } from '../src/domain/story';

it('IndexedDB 事务完成后，新实例可读取同一份存档', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const first = new IndexedDbRepository(name);
  expect(await first.read()).toBeUndefined();
  const value = { version: 1 as const, sessions: [newSession('本机存档', { name: '访客', appearance: '', personality: '', background: '' }, '')], preferences: defaults() };
  await first.write(value);
  expect(await new IndexedDbRepository(name).read()).toEqual(value);
  const invalid = structuredClone(value); invalid.preferences.profiles[0].maxTokens = 0;
  await expect(first.write(invalid)).rejects.toThrow('模型参数');
  expect(await new IndexedDbRepository(name).read()).toEqual(value);
});
