import { afterEach, expect, it, vi } from 'vitest';
import { HttpGateway } from '../src/gateway/http';
import { MockGateway } from '../src/gateway/mock';
import type { GenerateEvent, GenerateRequest } from '../src/domain/contracts';
import { defaults, initialState } from '../src/domain/story';

const request = (): GenerateRequest => ({ sessionId: 's', turnId: 't', persona: { name: '访客', appearance: '', personality: '', background: '' }, opening: '虚构开局', input: '询问', history: [], memories: [], state: initialState('访客'), profile: defaults().profiles[0], presets: [] });
async function collect(stream: AsyncIterable<GenerateEvent>) { const events: GenerateEvent[] = []; for await (const event of stream) events.push(event); return events; }
function streamResponse(text: string, end = true) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); if (end) c.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('SSE 支持中文 UTF-8 和 CRLF 在任意字节处分片，done 后结束', async () => {
  const spy = vi.fn(async () => streamResponse('data: {"type":"delta","text":"你好"}\r\n\r\ndata: {"type":"done","outcome":{"event":"见面"}}\r\n\r\n', false));
  vi.stubGlobal('fetch', spy);
  const events = await collect(new HttpGateway().generate(request(), 'synthetic-key', new AbortController().signal));
  expect(events).toEqual([{ type: 'delta', text: '你好' }, { type: 'done', outcome: { event: '见面' } }]);
  expect(spy.mock.calls[0]).toBeDefined();
});
it('流中断保留已收到分片，并明确报告缺少完整结束', async () => {
  vi.stubGlobal('fetch', async () => streamResponse('data: {"type":"delta","text":"半句"}\n\n'));
  const events: GenerateEvent[] = [];
  await expect((async () => { for await (const e of new HttpGateway().generate(request(), '', new AbortController().signal)) events.push(e); })()).rejects.toThrow('回复流已中断');
  expect(events).toEqual([{ type: 'delta', text: '半句' }]);
});
it('服务器错误正文和内部信息不直接显示在页面', async () => {
  vi.stubGlobal('fetch', async () => new Response('synthetic-secret-internal-prompt', { status: 500 }));
  await expect(collect(new HttpGateway().generate(request(), '', new AbortController().signal))).rejects.toThrow('接口请求失败（500）');
});
it('自动续写进度不会被当作完成；三次失败显示可继续提示并保留正文分片',async()=>{
  vi.stubGlobal('fetch',async()=>streamResponse('data: {"type":"delta","text":"已有正文"}\n\ndata: {"type":"continuation","attempt":1,"maxAttempts":3}\n\ndata: {"type":"continuation","attempt":3,"maxAttempts":3}\n\ndata: {"type":"error","code":"AUTO_CONTINUE_LIMIT"}\n\n'));
  const events:GenerateEvent[]=[];
  await expect((async()=>{for await(const event of new HttpGateway().generate(request(),'',new AbortController().signal))events.push(event);})()).rejects.toThrow('3次');
  expect(events).toEqual([{type:'delta',text:'已有正文'},{type:'continuation',attempt:1,maxAttempts:3},{type:'continuation',attempt:3,maxAttempts:3}]);
});
it('模型列表通过本机接口读取，不需要预先指定模型名',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({models:['synthetic-model-a','synthetic-model-b']}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
  expect(await new HttpGateway().models('https://synthetic.example/v1','synthetic-key',new AbortController().signal)).toEqual(['synthetic-model-a','synthetic-model-b']);
  expect(fetcher.mock.calls[0]).toBeDefined();
});
it('模拟续写只追加剩余文字，最终回复与原稿一致', async () => {
  vi.useFakeTimers(); const gateway = new MockGateway();
  const fullTask = collect(gateway.generate(request(), '', new AbortController().signal));
  await vi.runAllTimersAsync(); const events = await fullTask;
  const full = events.filter(e => e.type === 'delta').map(e => e.text).join('');
  const partial = full.slice(0, 24); const input = request(); input.continuation = { partial };
  const restTask = collect(gateway.generate(input, '', new AbortController().signal));
  await vi.runAllTimersAsync(); const rest = await restTask;
  expect(partial + rest.filter(e => e.type === 'delta').map(e => e.text).join('')).toBe(full);
  expect(rest.at(-1)?.type).toBe('done');
  const done = rest.at(-1);
  if (done?.type === 'done') {
    expect(done.outcome.player?.innerThought).toContain('【演示】');
    expect(done.outcome.characters?.find(a => a.id === 'guide')?.affinity).toBe(30);
    expect(done.outcome.forum).toHaveLength(2);
  }
});
