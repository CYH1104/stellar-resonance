import type {Profile} from '../domain/contracts';
import {apiFieldIssues} from '../domain/apis';
import {NativeCredentials} from './credentials';

export interface CompletionMessage {role:string;content:string|Record<string,unknown>[]|null;[key:string]:unknown}
export interface NativeCompletionService {
  createRequestData(data:Record<string,any>):Record<string,any>;
  presetToGeneratePayload(preset:Record<string,any>,overridePreset:Record<string,any>,overridePayload:Record<string,any>):Promise<Record<string,any>>;
  sendRequest(data:Record<string,any>,extractData:boolean,signal:AbortSignal):Promise<any>;
}
export interface NativeCompletionContext {
  ChatCompletionService:NativeCompletionService;
  extractMessageFromData(data:unknown,api:string):string;
}
export class NativeCompletionError extends Error {
  constructor(readonly code:string,message:string,readonly raw='',readonly finishReason='',readonly status?:number){super(message);}
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function nativeBase(value:string){const url=new URL(value);url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');return url.href.replace(/\/$/,'');}
function requestFailure(error:unknown,signal:AbortSignal):never{
  if(signal.aborted&&signal.reason?.name==='TimeoutError')throw new NativeCompletionError('MODEL_TIMEOUT','本次模型请求已超时，收到的内容已保留。');
  if(signal.aborted)throw signal.reason||new DOMException('请求已停止','AbortError');
  if(error instanceof NativeCompletionError)throw error;
  // The native SDK may include an upstream body in Error.message. Never echo it.
  const match=error instanceof Error&&/^Got response status (\d{3})$/.exec(error.message),status=match?Number(match[1]):undefined;
  throw new NativeCompletionError('NATIVE_MODEL_REQUEST_FAILED',status?`模型请求失败（${status}），当前记录已保留。`:'模型请求未完成，当前记录已保留，请检查运行日志或接口配置。','','',status);
}

/** Calls the actual native SDK. No global API switch, provider client or SSE parser. */
export class NativeCompletions {
  constructor(private context:()=>NativeCompletionContext,private credentials:NativeCredentials){}
  async payload(messages:CompletionMessage[],profile:Profile,key:string,preset?:Record<string,any>,stream=false){
    profile={...profile};
    if(apiFieldIssues(profile,key).length)throw new NativeCompletionError('MODEL_NOT_CONFIGURED','请先填写并确认本次任务的接口地址、模型和 Key。');
    if(!Array.isArray(messages)||!messages.length||messages.some(m=>!m||!['system','developer','user','assistant','tool','function'].includes(m.role)||typeof m.content!=='string'&&!Array.isArray(m.content)&&m.content!==null))throw new NativeCompletionError('NATIVE_PROMPT_INVALID','本次任务提示内容不完整，已停止请求。');
    messages=clone(messages);preset=preset?clone(preset):undefined;
    const sdk=this.context().ChatCompletionService,credential=await this.credentials.payload(key);
    const overrides={
      messages:clone(messages),stream,chat_completion_source:'custom',custom_url:nativeBase(profile.apiBaseUrl!),model:profile.model,
      temperature:profile.temperature,max_tokens:profile.maxTokens,
      include_reasoning:false,request_thoughts:false,show_thoughts:false,reasoning_effort:undefined,
      ...(profile.topP!==undefined?{top_p:profile.topP}:{}),
      ...(profile.frequencyPenalty!==undefined?{frequency_penalty:profile.frequencyPenalty}:{}),
      ...(profile.presencePenalty!==undefined?{presence_penalty:profile.presencePenalty}:{}),
      // Explicitly clear connection overrides inherited by the native SDK from its active UI.
      reverse_proxy:'',proxy_password:'',custom_include_body:'',custom_exclude_body:'',custom_include_headers:'',custom_exclude_headers:'',
      secret_id:undefined,tools:undefined,tool_choice:undefined,json_schema:undefined,...credential,
    };
    const value=preset?await sdk.presetToGeneratePayload(clone(preset),{},overrides):sdk.createRequestData(overrides);
    // Keep the per-call connection authoritative even if an SDK extension changed defaults.
    return sdk.createRequestData({...value,...overrides});
  }
  async complete(messages:CompletionMessage[],profile:Profile,key:string,signal:AbortSignal,preset?:Record<string,any>){
    const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(600000)]);
    try{
      combined.throwIfAborted();const data=await this.payload(messages,profile,key,preset,false);combined.throwIfAborted();
      const response=await this.context().ChatCompletionService.sendRequest(data,false,combined);combined.throwIfAborted();
      const raw=this.context().extractMessageFromData(response,'openai');
      if(typeof raw!=='string')throw new NativeCompletionError('INVALID_MODEL_RESPONSE','模型未返回可识别的文字，当前记录已保留。');
      const reason=response?.choices?.[0]?.finish_reason;
      if(reason==='length')throw new NativeCompletionError('MODEL_OUTPUT_LIMIT','模型达到输出上限，已保留返回内容，请调整输出长度后重试。',raw,'length');
      if(reason==='content_filter'||response?.choices?.[0]?.message?.refusal)throw new NativeCompletionError('MODEL_REFUSAL','模型未完成本次回复，已保留返回内容。',raw,'content_filter');
      if(!raw.trim())throw new NativeCompletionError('MODEL_EMPTY_RESPONSE','模型没有返回可展示的正文，当前记录已保留。','',''+(reason||''));
      return {text:raw,finishReason:typeof reason==='string'?reason:'',usage:response?.usage};
    }catch(error){requestFailure(error,combined);}finally{controller.abort();}
  }
  async *stream(messages:CompletionMessage[],profile:Profile,key:string,signal:AbortSignal,preset?:Record<string,any>):AsyncIterable<string>{
    const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(600000)]);
    let prior='';
    try{
      combined.throwIfAborted();const data=await this.payload(messages,profile,key,preset,true);combined.throwIfAborted();
      const factory=await this.context().ChatCompletionService.sendRequest(data,true,combined);
      if(typeof factory!=='function')throw new NativeCompletionError('INVALID_MODEL_RESPONSE','原生流式接口未返回可读取的回复。');
      for await(const chunk of factory()){
        combined.throwIfAborted();
        if(typeof chunk?.text!=='string'||!chunk.text.startsWith(prior))throw new NativeCompletionError('MODEL_STREAM_INTERRUPTED','回复流发生变化，已保留收到的内容。',prior);
        const delta=chunk.text.slice(prior.length);prior=chunk.text;if(delta)yield delta;
      }
      combined.throwIfAborted();if(!prior.trim())throw new NativeCompletionError('MODEL_EMPTY_RESPONSE','模型没有返回可展示的正文，当前记录已保留。');
    }catch(error){requestFailure(error,combined);}finally{controller.abort();}
  }
}
