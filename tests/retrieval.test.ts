import { afterEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { retrieve } from '../src/memory/retrieval';
import type { Memory } from '../src/domain/contracts';

afterEach(() => vi.unstubAllGlobals());
it('Vue 响应式记忆的向量能跨 Worker 传递，更换模型或原文时不用旧向量', async () => {
  let received: { items: { id: string; vector?: number[] }[] } | undefined;
  class TestWorker {
    onmessage?: (event: { data: string[] }) => void;
    terminate() {}
    postMessage(value: unknown) {
      received = structuredClone(value) as typeof received;
      queueMicrotask(() => this.onmessage?.({ data: received!.items.map(m => m.id) }));
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  const items = reactive<Memory[]>([
    { id: 'valid', text: '引导员', kind: 'note', createdAt: '', vector: { model: 'demo:provider:model', text: '引导员', values: [1, 2] } },
    { id: 'changed', text: '新文字', kind: 'note', createdAt: '', vector: { model: 'demo:provider:model', text: '旧文字', values: [3, 4] } },
    { id: 'other', text: '另模型', kind: 'note', createdAt: '', vector: { model: 'another-model', text: '另模型', values: [5, 6] } }
  ]);
  expect((await retrieve(items, '引导员', 'demo:provider:model', reactive([1, 2]))).map(m => m.id)).toEqual(['valid', 'changed', 'other']);
  expect(received!.items.map(m => m.vector)).toEqual([[1, 2], undefined, undefined]);
});
