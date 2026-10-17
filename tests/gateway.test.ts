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
it('开发诊断的 SSE 只传入白名单元数据，不让原始文本或 Key 进入页面事件',async()=>{
 const diagnostic={kind:'state-json',stage:'rejected',attempt:1,format:'invalid',line:3,column:4,code:'MODEL_STATE_JSON_INVALID',raw:'private-response',key:'synthetic-secret',reasoning:'hidden-thought'};
 vi.stubGlobal('fetch',async()=>streamResponse('data: '+JSON.stringify({type:'diagnostic',diagnostic})+'\n\ndata: '+JSON.stringify({type:'done',outcome:{event:'完成'}})+'\n\n'));
 const events=await collect(new HttpGateway().generate(request(),'synthetic-key',new AbortController().signal));expect(events[0]).toMatchObject({type:'diagnostic',diagnostic:{line:3,column:4}});expect(JSON.stringify(events)).not.toMatch(/private-response|synthetic-secret|hidden-thought/);
});
it('安全进度信息传入页面，只有推理或未闭合标签会显示明确错误',async()=>{
  for(const code of ['MODEL_REASONING_ONLY','MODEL_REASONING_UNCLOSED','MODEL_EMPTY_RESPONSE']){
    vi.stubGlobal('fetch',async()=>streamResponse('data: {"type":"progress","phase":"hidden"}\n\ndata: '+JSON.stringify({type:'error',code})+'\n\n'));
    const events:GenerateEvent[]=[];
    await expect((async()=>{for await(const e of new HttpGateway().generate(request(),'synthetic-key',new AbortController().signal))events.push(e);})()).rejects.toThrow(/正文/);
    expect(events).toEqual([{type:'progress',phase:'hidden'}]);
  }
});
it('模型测活单独发送所选接口和类型，错误不泄露上游响应',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({kind:'text',durationMs:36,visibleChars:2})));vi.stubGlobal('fetch',fetcher);
  const profile=request().profile;expect(await new HttpGateway().probe(profile,'synthetic-key','text',new AbortController().signal)).toMatchObject({durationMs:36});
  expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].body as string)).toEqual({profile,key:'synthetic-key',kind:'text'});
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({code:'UPSTREAM_AUTH',detail:'synthetic-secret'}),{status:502}));
  await expect(new HttpGateway().probe(profile,'synthetic-key','text',new AbortController().signal)).rejects.toThrow('拒绝凭据');
});

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
it('状态补修进度展示可读原因，三次失败给出具体类别且不泄露未知代码',async()=>{
  vi.stubGlobal('fetch',async()=>streamResponse('data: {"type":"repair","attempt":1,"maxAttempts":3,"code":"MODEL_STATE_FORUM_INVALID"}\n\ndata: {"type":"repair","attempt":2,"maxAttempts":3,"code":"synthetic-private-error"}\n\ndata: {"type":"error","code":"STATE_REPAIR_LIMIT","reasonCode":"MODEL_STATE_FORUM_INVALID"}\n\n'));
  const events:GenerateEvent[]=[];await expect((async()=>{for await(const event of new HttpGateway().generate(request(),'',new AbortController().signal))events.push(event);})()).rejects.toThrow('论坛帖子');expect(events[0]).toMatchObject({type:'repair',attempt:1,reason:expect.stringContaining('论坛帖子')});expect(JSON.stringify(events)).not.toContain('synthetic-private-error');expect(events.some(e=>e.type==='done')).toBe(false);
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
