import type {GenerateRequest,GenerateEvent,Persona,Profile,LocalService,Session} from '../domain/contracts';
import {nativePresetForRequest,nativePresetList,type NativePresetConfig} from '../domain/nativePreset';
import {nativeWorldbooksForRequest,projectNativeWorldScopes,type NativeWorldbook} from '../domain/nativeWorldbooks';
import {emptyNativeEffects,nativeWorldSeed} from '../domain/nativeWorldState';
import {terminalCodeBindings} from '../domain/terminalCodeVariables';
import {normalizePersona} from '../domain/persona';
import {dataFromState} from '../domain/mvu';
import {validateMemoryRecord,type MemoryRequest} from '../domain/memories';
import {NativeApi} from './api';
import {NativePresets} from './presets';
import {NativeWorkspaceRepository} from './repository';
import {NativeCompletions,type CompletionMessage} from './completions';
import {NativeCredentials} from './credentials';
import {NativePipeline} from './pipeline';
import {NativeTerminal} from './terminal';
import {NativeProtocolStream} from './protocolStream';
const prefix='/api/plugins/academy-compat/';
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const personaText=(value:any)=>value?.rawText||Object.entries(value||{}).filter(([,v])=>typeof v==='string'&&v).map(([k,v])=>`${k}: ${v}`).join('\n');
/** Complete adapter for the original academy pages; no legacy HTTP/model transport. */
export class NativeGateway {
  capabilities={continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'native',native:true};
  
  constructor(private api:NativeApi,private presets:NativePresets,private repository:NativeWorkspaceRepository,private credentials:NativeCredentials,private completions:NativeCompletions,private pipeline:NativePipeline){}
  async bootstrap():Promise<LocalService>{const result=await this.api.post(prefix+'catalog',{});this.capabilities=result.capabilities;return result;}
  async authorize(_invite:string,signal?:AbortSignal){await this.api.post('/api/settings/get',{},signal);}
  async readNativePreset(){const config=await this.presets.read();const defaults=await this.api.post('/api/presets/restore',{apiId:'openai',name:'Default'});if(!defaults?.preset)throw Error('原生默认预设未返回。');return {preset:config.preset,defaultPreset:defaults.preset};}
  async newGame(persona:Persona){return this.api.post(prefix+'new-game',{persona});}
  async place(id:string){return this.api.post(prefix+'place',{id});}
  async configure(profile:Profile,signal?:AbortSignal){const url=new URL(profile.apiBaseUrl!);if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw Error('请填写正确的接口地址。');return this.api.post(prefix+'model-service',{apiBaseUrl:profile.apiBaseUrl},signal);}
  async models(apiBaseUrl:string,key:string,signal:AbortSignal,_kind?:'embedding'):Promise<string[]>{
    const value=await this.api.post('/api/backends/chat-completions/status',{chat_completion_source:'custom',custom_url:apiBaseUrl.replace(/\/+$/,'').replace(/\/chat\/completions$/,''),...await this.credentials.payload(key)},signal);
    const rows=Array.isArray(value?.data)?value.data:Array.isArray(value)?value:[];const names=rows.map((v:any)=>typeof v==='string'?v:v.id).filter((v:any)=>typeof v==='string'&&v.trim());if(!names.length)throw Error('接口没有返回模型列表，请手动填写模型名。');return names;
  }
  async probe(profile:Profile,key:string,kind:'text'|'embedding',signal:AbortSignal){
    const started=Date.now();profile=clone(profile);if(kind==='embedding'){const vectors=await this.embed(['connection check'],profile,key,signal);return {kind,durationMs:Date.now()-started,dimensions:vectors[0].length};}
    try{const result=await this.completions.complete([{role:'user',content:'Reply OK.'}],{...profile,maxTokens:256,topP:undefined,frequencyPenalty:undefined,presencePenalty:undefined},key,signal);return {kind,durationMs:Date.now()-started,visibleChars:result.text.length};}
    catch(error){if((error as any)?.code==='MODEL_OUTPUT_LIMIT')return {kind,durationMs:Date.now()-started,visibleChars:String((error as any).raw||'').length};throw error;}
  }
  async terminalCode(data:any){const codes=terminalCodeBindings(data.state);if(data.self===true)return {code:codes.player||''};const id=Object.keys(codes).find(id=>id!=='player'&&codes[id]===data.code);const actor=data.state?.characters?.find((c:any)=>c.id===id);if(!actor)throw Error('未找到该终端码，请向角色确认。');return {id,name:actor.name,identity:actor.identity||'',code:data.code};}
  async createTheaterShare(template:unknown):Promise<{code:string}>{return this.api.post(prefix+'shares/create',{template});}
  async lookupTheaterShare(code:string):Promise<{template:unknown}>{return this.api.post(prefix+'shares/lookup',{code});}
  private async compose(path:string,input:any,token:string,profile:Profile,signal:AbortSignal,session?:Session,configuration?:NativePresetConfig){
    const started=performance.now();profile=clone(profile);
    const config=configuration||await this.presets.read(),taskPreset=nativePresetForRequest(config,path,input).preset;
    profile=await this.completions.profileForPreset(profile,taskPreset);
    const selected=nativePresetList(config).find(p=>JSON.stringify(p.preset)===JSON.stringify(taskPreset));if(!selected)throw Error('本次任务的原生预设未找到。');
    const id=session?.id||input.sessionId||input.rounds?.[0]?.sessionId;
    const seed=session?nativeWorldSeed(session,session.turns.findIndex(t=>t.id===input.turnId)):undefined;
    const books=nativeWorldbooksForRequest(config.worldbooks,path,{...input,...(seed?{nativeWorldState:seed}:{})},id);
    let history:{role:'user'|'assistant';content:string}[];
    if(session){const index=session.turns.findIndex(t=>t.id===input.turnId);if(index<0)throw Error('本次轮次与原生存档不符。');history=[];if(session.opening)history.push({role:'assistant',content:session.opening});for(const turn of session.turns.slice(0,index)){const variant=turn.variants[turn.selected];if(variant?.status==='complete')history.push({role:'user',content:turn.input},{role:'assistant',content:variant.text});}history.push({role:'user',content:input.input});if(input.continuation?.partial)history.push({role:'assistant',content:input.continuation.partial});
    }else history=[];
    const result=await this.api.post(prefix+'prepare',{family:path==='personal-terminal'?'terminal':'tasks',token,profile,pipeline:{history,preset:{name:selected.name,data:selected.preset},books,effects:seed?.effects||emptyNativeEffects(),variables:{...(seed?.variables||{}),...(input.state?dataFromState(input.state):{})},globals:seed?.globals||{}}},signal);
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('academy:native-transport',{detail:{phase:'prepare',model:profile.model,apiOrigin:new URL(profile.apiBaseUrl!).origin,elapsedMs:Math.round(performance.now()-started)}}));
    return {...result,preset:taskPreset,profile};
  }
  private async task(task:string,input:any,profile:Profile,key:string,signal:AbortSignal){
    input=clone(input);profile=clone(profile);const config=await this.presets.read(),plan=await this.api.post(prefix+'tasks/plan',{task,input},signal);
    try{const prepared=await this.compose(task,input,plan.token,profile,signal,undefined,config);const result=await this.completions.complete(prepared.messages,prepared.profile,key,signal,prepared.preset);return await this.api.post(prefix+'tasks/finish',{token:plan.token,text:result.text},signal);}finally{void this.api.post(prefix+'tasks/cancel',{token:plan.token}).catch(()=>{});}
  }
  async terminal(input:unknown,profile:Profile,key:string,signal:AbortSignal){profile=clone(profile);const value=clone(input);const config=await this.presets.read(),preset=nativePresetForRequest(config,'personal-terminal',value).preset;profile=await this.completions.profileForPreset(profile,preset);return new NativeTerminal(this.api,this.completions,undefined,async(token,s)=>(await this.compose('personal-terminal',value,token,profile,s,undefined,config)).messages).run(value,profile,key,signal,preset);}
  async assistPersona(wish:string,draft:Persona,profile:Profile,key:string,signal:AbortSignal){return normalizePersona((await this.task('persona',{wish,draft},profile,key,signal)).persona);}
  async randomEvent(input:any,profile:Profile,key:string,signal:AbortSignal){return this.task('random-event',input,profile,key,signal);}
  async forumReply(input:any,profile:Profile,key:string,signal:AbortSignal){const result=await this.task('forum-reply',input,profile,key,signal);return input.minReplies===5?result.replies:result;}
  async memoryBatch(rounds:MemoryRequest[],profile:Profile,key:string,signal:AbortSignal){if(rounds.some(r=>r.sessionId!==rounds[0]?.sessionId))throw Error('批量记忆不能跨存档。');const result=await this.task('memory',{rounds},profile,key,signal);if(!Array.isArray(result.records)||result.records.length!==rounds.length)throw Error('批量记忆返回不完整。');return result.records.map(validateMemoryRecord);}
  async memory(input:MemoryRequest,profile:Profile,key:string,signal:AbortSignal){return validateMemoryRecord((await this.task('memory',input,profile,key,signal)).record);}
  async utility(task:'summary'|'suggestions',texts:string[],profile:Profile,key:string,signal:AbortSignal,source?:any):Promise<string[]>{return (await this.task('utility',{...source,task,texts},profile,key,signal)).items;}
  async embed(texts:string[],profile:Profile,key:string,signal:AbortSignal):Promise<number[][]>{const credential=await this.credentials.payload(key);return (await this.api.post(prefix+'vectors',{texts,profile,...(credential.secret_id?{secret_id:credential.secret_id}:{key})},signal)).vectors;}
  async *generate(request:GenerateRequest,key:string,signal:AbortSignal):AsyncIterable<GenerateEvent>{
    request=clone(request);const {profile,...input}=request,session=this.repository.session(request.sessionId);
    const config=await this.presets.read(),plan=await this.api.post(prefix+'tasks/plan',{task:'story',input},signal),decoder=new NativeProtocolStream();
    try{yield {type:'progress',phase:'waiting'};const prepared=await this.compose('generate',input,plan.token,profile,signal,session,config);
      for await(const chunk of this.completions.stream(prepared.messages,prepared.profile,key,signal,prepared.preset)){const text=decoder.push(chunk);if(text)yield {type:'delta',text};}
      signal.throwIfAborted();const result=await this.api.post(prefix+'tasks/finish',{token:plan.token,text:decoder.raw},signal);signal.throwIfAborted();yield {type:'done',outcome:result.outcome,raw:decoder.raw,nativeWorldInfo:prepared.effects,nativeVariables:{variables:prepared.variables,globals:prepared.globals}};
    }catch(error){if(decoder.raw)yield {type:'format-error',raw:decoder.raw,code:(error as any)?.code||'NATIVE_GENERATION_FAILED'};throw error;}finally{void this.api.post(prefix+'tasks/cancel',{token:plan.token}).catch(()=>{});}
  }
}
