import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {protectedRuntimePreset} from './preset-policy.mjs';
import {cleanNativeWorldSeed,cleanNativeEffects} from '../../src/domain/nativeWorldState.ts';
import {cleanNativePresetConfig} from '../../src/domain/nativePreset.ts';
import {cleanNativeWorldbookRequest,assertNativeWorldbooksRuntime} from '../../src/domain/nativeWorldbooks.ts';
import {completionChunks} from '../../server/ai.mjs';
const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
export function createAccountRuntime({directory,defaultPreset,createWorker,maxWorkers=2,onRequest=()=>{}}){
 const workers=new Map();
 const keyOf=account=>{if(!account?.id)throw fail('ACCOUNT_REQUIRED',401);return createHash('sha256').update(JSON.stringify([account.id,account.dataVersion||0])).digest('hex');};
 async function read(key){try{const value=JSON.parse(await readFile(resolve(directory,key+'.json'),'utf8'));if(value.version!==1||!value.preset)throw fail('NATIVE_CONFIG_UNAVAILABLE',503);return value;}catch(e){if(e.code==='ENOENT')return {version:1,preset:structuredClone(defaultPreset)};throw e;}}
 async function configure(account,data){
  const key=keyOf(account);
  if(!data||Object.keys(data).some(k=>!['action','changes'].includes(k))||!['read','save'].includes(data.action))throw fail('INVALID_NATIVE_CONFIG');
  if(data.action!=='read')throw fail('NATIVE_CONFIG_LOCAL_AUTHORITY',409);
  if(Object.keys(data).some(k=>k!=='action'))throw fail('INVALID_NATIVE_CONFIG');
  // Compatibility read for one-time browser migration. Legacy files are never overwritten or deleted.
  const saved=cleanNativePresetConfig(await read(key)),defaults=cleanNativePresetConfig({version:1,preset:defaultPreset});
  return {preset:saved.preset,defaultPreset:defaults.preset};
 }
 function fetchForAccount(account,{generationType='normal',nativePreset,nativeWorldbooks,nativeWorldState,worldActors,onProjection=()=>{}}={}){return async(url,init={})=>{
  const key=keyOf(account);
  if(!['normal','regenerate','continue'].includes(generationType))throw fail('INVALID_GENERATION_TYPE');
  if(String(url)!=='https://native-verification.invalid/v1/chat/completions'||init.method!=='POST')throw fail('NATIVE_EXPERIMENT_ENDPOINT_ONLY');
  init.signal?.throwIfAborted();if(!nativePreset)throw fail('NATIVE_PRESET_REQUIRED');
  let preset,worldbooks;const worldState=nativeWorldState===undefined?undefined:cleanNativeWorldSeed(nativeWorldState),actors=structuredClone(worldActors||[]);try{preset=protectedRuntimePreset(cleanNativePresetConfig(nativePreset).preset);worldbooks=cleanNativeWorldbookRequest(nativeWorldbooks);}catch{throw fail('INVALID_NATIVE_CONFIG');}const body=JSON.parse(init.body);
  assertNativeWorldbooksRuntime(worldbooks,{effects:!!worldState,scope:true});
  if(!workers.has(key)){if(workers.size>=maxWorkers)throw fail('NATIVE_WORKER_LIMIT',503);const promise=Promise.resolve().then(()=>createWorker(key));workers.set(key,promise);promise.catch(()=>workers.delete(key));}
  const worker=await workers.get(key);init.signal?.throwIfAborted();
  const compiled=await worker.compiler.compile({input:body.messages.at(-1)?.content||'继续',messages:body.messages,preset,worldbooks,worldState,worldActors:actors,generationType,signal:init.signal});
  if(worldState)onProjection(cleanNativeEffects(compiled.effects));
  onRequest({key,privateCard:JSON.stringify(compiled.messages).includes('PRIVATE_CARD_'),privateLore:JSON.stringify(compiled.messages).includes('PRIVATE_LORE_'),scriptsDisabled:compiled.scriptsDisabled},compiled.messages);
  const response=await worker.client.complete({...body,messages:compiled.messages,temperature:preset.temperature??body.temperature,max_tokens:preset.openai_max_tokens??body.max_tokens,include_reasoning:false},init.signal);
  if(!response.ok)return response;
  const encoder=new TextEncoder();let reason='';const iterator=completionChunks(response,{signal:init.signal,onProgress:stats=>{reason=stats.finishReason;}});
  return new Response(new ReadableStream({async pull(controller){try{const next=await iterator.next();if(!next.done){controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:next.value},finish_reason:null}]})+'\n\n'));return;}if(reason!=='stop')throw fail(reason==='length'?'MODEL_OUTPUT_LIMIT':reason==='content_filter'?'MODEL_REFUSAL':'MODEL_STREAM_INTERRUPTED',502);controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'));controller.close();}catch(e){controller.error(e);}},cancel:()=>iterator.return()}),{headers:{'Content-Type':'text/event-stream'}});
 };}
 return {configure,fetchForAccount,async close(){for(const worker of await Promise.allSettled([...workers.values()]))if(worker.status==='fulfilled')await worker.value.close();workers.clear();}};
}
