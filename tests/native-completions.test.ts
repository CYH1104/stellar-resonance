import {it,expect,vi} from 'vitest';
import {NativeCompletions,NativeCompletionError} from '../src/native/completions';
import {NativeCredentials} from '../src/native/credentials';
import {NativeSettings} from '../src/native/settings';
import {NativeApi} from '../src/native/api';
import {NativePrompts,type NativePromptContext} from '../src/native/prompts';
import {NativeTerminal} from '../src/native/terminal';
const profile=(id:string)=>({id,name:id,providerId:'custom',model:id+'-model',apiBaseUrl:'https://'+id+'.example/v1',maxTokens:4000,temperature:.6});
const messages=[{role:'user',content:'独立任务'}];
const signal=()=>new AbortController().signal;
function fixture(){
  const requests:any[]=[],sdk={
    createRequestData:(data:any)=>Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)),
    presetToGeneratePayload:vi.fn(async(_preset:any,_settings:any,data:any)=>({tools:['inherited'],reverse_proxy:'https://wrong.example',secret_id:'global-secret',custom_include_headers:'global-canary',...data})),
    sendRequest:vi.fn(async(data:any,_extract:boolean,_signal:AbortSignal):Promise<any>=>{requests.push(data);return {choices:[{finish_reason:'stop',message:{content:'本次回复'}}]};}),
  };
  const credentials=new NativeCredentials(new NativeSettings(new NativeApi(()=>({}),async()=>{throw Error('No settings/secret write allowed during generation');})));
  const client=new NativeCompletions(()=>({ChatCompletionService:sdk,extractMessageFromData:(data:any)=>data.choices[0].message.content}),credentials);
  return {client,sdk,requests};
}
it('uses original SDK methods and explicit per-call route/key without changing native global settings',async()=>{
  const f=fixture();await Promise.all([f.client.complete(messages,profile('story'),'native-secret:main-id',signal(),{temperature:.2}),f.client.complete(messages,profile('phone'),'synthetic-phone',signal(),{temperature:.4})]);
  expect(f.sdk.presetToGeneratePayload).toHaveBeenCalledTimes(2);
  const main=f.requests.find(r=>r.model==='story-model'),phone=f.requests.find(r=>r.model==='phone-model');
  expect(main).toMatchObject({secret_id:'main-id',custom_url:'https://story.example/v1',chat_completion_source:'custom',custom_include_headers:'',reverse_proxy:'',proxy_password:''});
  expect(phone.secret_id).toBeUndefined();expect(phone.custom_url).toBe('https://phone.example/v1');expect(JSON.parse(phone.custom_include_headers)).toEqual({Authorization:'Bearer synthetic-phone'});
  expect(f.requests.every(r=>r.custom_include_body===''&&r.custom_exclude_headers==='')).toBe(true);
});
it('preserves native multimodal messages and extension fields without sharing mutable input objects',async()=>{
  const f=fixture(),input=[{role:'user',content:[{type:'image_url',image_url:{url:'https://image.example/a.png'}},{type:'text',text:'看看'}],name:'原生字段'}];
  const payload=await f.client.payload(input,profile('main'),'synthetic',{},false);payload.messages[0].content[0].image_url.url='changed';
  expect(input[0].content[0].image_url!.url).toBe('https://image.example/a.png');expect(payload.messages[0].name).toBe('原生字段');
});
it('preserves legacy base/full endpoint addresses without adding duplicate slashes or chat suffixes',async()=>{
  const f=fixture();for(const url of ['https://main.example/v1/','https://main.example/v1/chat/completions','https://main.example/v1/chat/completions/'])expect((await f.client.payload(messages,{...profile('main'),apiBaseUrl:url},'synthetic')).custom_url).toBe('https://main.example/v1');
  expect((await f.client.payload(messages,{...profile('main'),apiBaseUrl:'https://main.example/'},'synthetic')).custom_url).toBe('https://main.example');
});
it('does not accept a truncated structured reply as success and retains its returned text',async()=>{
  const f=fixture();f.sdk.sendRequest.mockResolvedValue({choices:[{finish_reason:'length',message:{content:'{"replies":['}}]});
  await expect(f.client.complete(messages,profile('phone'),'synthetic',signal())).rejects.toMatchObject({code:'MODEL_OUTPUT_LIMIT',finishReason:'length',raw:'{"replies":['});
});
it('does not show upstream error bodies or automatically retry a failed SDK call',async()=>{
  const f=fixture();f.sdk.sendRequest.mockRejectedValue(Error('Authorization Bearer upstream-must-not-show'));
  try{await f.client.complete(messages,profile('phone'),'synthetic',signal());throw Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(NativeCompletionError);expect(String(error)).not.toContain('upstream-must-not-show');}
  expect(f.sdk.sendRequest).toHaveBeenCalledOnce();
});
it('uses native stream extraction and aborts its request when the consumer stops reading',async()=>{
  const f=fixture();let nativeSignal:AbortSignal|undefined;
  f.sdk.sendRequest.mockImplementation(async(_data:any,_extract:boolean,input:AbortSignal)=>{nativeSignal=input;return async function*(){yield {text:'一'};yield {text:'一二'};yield {text:'一二三'};};});
  let text='';for await(const part of f.client.stream(messages,profile('main'),'synthetic',signal())){text+=part;if(text==='一二')break;}
  expect(text).toBe('一二');expect(nativeSignal!.aborted).toBe(true);
});
it('stops before sending when cancelled or configured with an incomplete role API',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();
  await expect(f.client.complete(messages,profile('phone'),'synthetic',controller.signal)).rejects.toThrow();
  await expect(f.client.complete(messages,{...profile('phone'),model:''},'synthetic',signal())).rejects.toMatchObject({code:'MODEL_NOT_CONFIGURED'});
  expect(f.sdk.sendRequest).not.toHaveBeenCalled();
});
it('binds browser fetch to its global receiver in JSON and file requests',async()=>{
  const api=new NativeApi(()=>({}),async function(this:any,path){expect(this).toBe(globalThis);return path==='/api/settings/get'?new Response('{}',{headers:{'Content-Type':'application/json'}}):new Response(new Blob(['image']));});
  await api.post('/api/settings/get',{});await api.blob('/img/user-default.png');
});
it('uses the same locked terminal plan for one correction and never changes the selected role API',async()=>{
  const calls:any[]=[],request=vi.fn(async(path,init)=>{const body=JSON.parse(String(init?.body));calls.push({path,body});return new Response(JSON.stringify(String(path).endsWith('/plan')?{token:'same-plan',messages}:String(path).endsWith('/finish')?calls.filter(c=>String(c.path).endsWith('/finish')).length===1?{ok:false,error:{reason:'MODEL_JSON_INVALID',retryable:true}}:{ok:true,result:{accepted:true,reply:'可以。'}}:{ok:true}),{headers:{'Content-Type':'application/json'}});});
  const completion=vi.fn(async()=>({text:'返回内容'})),terminal=new NativeTerminal(new NativeApi(()=>({}),request),{complete:completion} as unknown as NativeCompletions),input={task:'friend',actorIds:['npc-a']};
  expect(await terminal.run(input,profile('phone'),'synthetic-phone',signal())).toMatchObject({accepted:true,reply:'可以。'});
  expect(completion).toHaveBeenCalledTimes(2);expect(completion.mock.calls.every((call:any[])=>call[1].id==='phone'&&call[2]==='synthetic-phone')).toBe(true);
  expect(calls.filter(c=>String(c.path).endsWith('/finish')).map(c=>c.body.token)).toEqual(['same-plan','same-plan']);expect(input).toEqual({task:'friend',actorIds:['npc-a']});
});
it('does not enter an automatic terminal format retry loop',async()=>{
  const request=vi.fn(async(path)=>new Response(JSON.stringify(String(path).endsWith('/plan')?{token:'same-plan',messages}:{ok:false,error:{reason:'MODEL_JSON_INVALID',retryable:true}}),{headers:{'Content-Type':'application/json'}}));
  const completion=vi.fn(async()=>({text:'not JSON'})),terminal=new NativeTerminal(new NativeApi(()=>({}),request),{complete:completion} as unknown as NativeCompletions);
  await expect(terminal.run({task:'friend'},profile('phone'),'synthetic',signal())).rejects.toMatchObject({code:'INVALID_TERMINAL_RESULT',raw:'not JSON\n\nnot JSON'});expect(completion).toHaveBeenCalledTimes(2);
});

function promptFixture(){
  const listeners=new Set<(...args:any[])=>void>();
  const context:NativePromptContext={mainApi:'openai',chatId:'original',characterId:0,name1:'玩家',name2:'叙事',chat:[{mes:'已有消息',extra:{foreign:'keep'}}],chatMetadata:{integrity:'keep'},extensionPrompts:{foreign:{value:'keep',filter:()=>true}},eventTypes:{GENERATE_AFTER_DATA:'after'},eventSource:{on:(_e,l)=>{listeners.add(l);},removeListener:(_e,l)=>{listeners.delete(l);}},setExtensionPrompt:(key,value,position,depth,scan,role)=>{context.extensionPrompts[key]={value,position,depth,scan,role};},generate:vi.fn(async(_type,options,dryRun)=>{expect(dryRun).toBe(true);expect(options.signal).toBeInstanceOf(AbortSignal);const prompt=context.chat.map(m=>({role:m.is_user?'user':'assistant',content:m.mes}));for(const listener of listeners)listener({prompt},true);})};
  return {context,listeners,builder:new NativePrompts(()=>context)};
}
it('calls the original dry-run prompt builder and restores native chat/metadata/injections afterwards',async()=>{
  const f=promptFixture(),before=structuredClone(f.context.chat),foreign=f.context.extensionPrompts.foreign;
  const result=await f.builder.build([{role:'user',content:'本轮输入'}],'学院输出协议',signal());
  expect(result).toEqual([{role:'user',content:'本轮输入'}]);expect(f.context.generate).toHaveBeenCalledWith('normal',{signal:expect.any(AbortSignal)},true);
  expect(f.context.chat).toEqual(before);expect(f.context.chatMetadata).toEqual({integrity:'keep'});expect(f.context.extensionPrompts).toEqual({foreign});expect(f.listeners.size).toBe(0);
});
it('restores temporary state after a native builder failure and permits an explicit later retry',async()=>{
  const f=promptFixture(),native=f.context.generate;f.context.generate=async()=>{throw Error('Native failure');};
  await expect(f.builder.build([{role:'user',content:'失败输入'}],'规则',signal())).rejects.toThrow('Native failure');
  expect(f.context.chat[0].mes).toBe('已有消息');expect(f.listeners.size).toBe(0);f.context.generate=native;
  expect(await f.builder.build([{role:'user',content:'重试'}],'规则',signal())).toEqual([{role:'user',content:'重试'}]);
});
it('does not overwrite a different native session selected during prompt assembly',async()=>{
  const f=promptFixture();f.context.generate=async()=>{f.context.chatId='different';f.context.chat=[{mes:'另一个存档'}];};
  await expect(f.builder.build([{role:'user',content:'输入'}],'规则',signal())).rejects.toThrow('会话在组装期间改变');
  expect(f.context.chat).toEqual([{mes:'另一个存档'}]);expect(Object.keys(f.context.extensionPrompts)).toEqual(['foreign']);
});
it('serializes prompt assembly on the same native context without serializing independent model calls',async()=>{
  const f=promptFixture();const results=await Promise.all([f.builder.build([{role:'user',content:'甲'}],'规则',signal()),new NativePrompts(()=>f.context).build([{role:'user',content:'乙'}],'规则',signal())]);
  expect(results).toEqual([[{role:'user',content:'甲'}],[{role:'user',content:'乙'}]]);expect(f.context.chat[0].mes).toBe('已有消息');
});
it('does not silently drop sticky/cooldown state by treating native preview as completed generation',async()=>{
  const f=promptFixture(),events=new Map<string,((...args:any[])=>void)[]>();f.context.eventTypes.WORLDINFO_ENTRIES_LOADED='lore';
  f.context.eventSource={on:(event,listener)=>events.set(event,[...events.get(event)||[],listener]),removeListener:(event,listener)=>events.set(event,(events.get(event)||[]).filter(l=>l!==listener))};
  f.context.generate=async()=>{for(const listener of events.get('lore')||[])listener({globalLore:[{uid:0,sticky:2,disable:false}]});for(const listener of events.get('after')||[])listener({prompt:[{role:'user',content:'输入'}]},true);};
  await expect(f.builder.build([{role:'user',content:'输入'}],'规则',signal())).rejects.toThrow('跨轮状态');
  expect(f.context.chat[0].mes).toBe('已有消息');expect([...events.values()].flat()).toHaveLength(0);
});

it('native sampling and defaults come from the original SDK instead of the academy profile limits',async()=>{
 const f=fixture();f.sdk.presetToGeneratePayload.mockImplementation(async(preset:any,_settings:any,overrides:any)=>({temperature:preset.temperature??.3,max_tokens:preset.openai_max_tokens??300,include_reasoning:preset.include_reasoning,reasoning_effort:preset.reasoning_effort,...overrides}));
 const raw={temperature:3.2,openai_max_tokens:64000,include_reasoning:true,reasoning_effort:'high'};const effective=await f.client.profileForPreset(profile('story'),raw);expect(effective).toMatchObject({maxTokens:64000,temperature:3.2});
 await f.client.complete(messages,effective,'synthetic',signal(),raw);expect(f.requests[0]).toMatchObject({temperature:3.2,max_tokens:64000,model:'story-model',custom_url:'https://story.example/v1',include_reasoning:true,reasoning_effort:'high'});
 expect(await f.client.profileForPreset(profile('story'),{})).toMatchObject({maxTokens:300,temperature:.3});
});
it('honors the native non-streaming preset while keeping one request and the explicit API binding',async()=>{
 const f=fixture(),chunks=[];for await(const text of f.client.stream(messages,profile('story'),'synthetic',signal(),{stream_openai:false}))chunks.push(text);
 expect(chunks).toEqual(['本次回复']);expect(f.sdk.sendRequest).toHaveBeenCalledOnce();expect(f.requests[0]).toMatchObject({stream:false,model:'story-model',custom_url:'https://story.example/v1'});
});
it('freezes the selected connection before awaiting native preset application',async()=>{
 const f=fixture(),selected=profile('chosen');let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);
 f.sdk.presetToGeneratePayload.mockImplementation(async(_preset:any,_settings:any,overrides:any)=>{await wait;return {max_tokens:256,temperature:.7,...overrides};});
 const preparing=f.client.profileForPreset(selected,{});selected.apiBaseUrl='https://changed.example/v1';selected.model='changed-model';release();
 expect(await preparing).toMatchObject({apiBaseUrl:'https://chosen.example/v1',model:'chosen-model'});
});
