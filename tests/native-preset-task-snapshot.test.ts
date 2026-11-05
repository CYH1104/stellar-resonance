import {it,expect,vi} from 'vitest';
import {NativeGateway} from '../src/native/gateway';
import type {NativeApi} from '../src/native/api';
import type {NativePresets} from '../src/native/presets';
import type {NativeCompletions} from '../src/native/completions';

it('keeps an already planned utility task on its original preset when the editor saves a new one',async()=>{
 let release!:()=>void,planned!:()=>void;const waiting=new Promise<void>(r=>release=r),started=new Promise<void>(r=>planned=r);
 let preset={version:1 as const,id:'a',name:'Original',preset:{temperature:.2,openai_max_tokens:512}},prepared:any;
 const read=vi.fn(async()=>structuredClone(preset));
 const api={post:vi.fn(async(path:string,body:any)=>{if(path.endsWith('/tasks/plan')){planned();await waiting;return {token:'planned'};}if(path.endsWith('/prepare')){prepared=body;return {messages:[{role:'user',content:'synthetic'}]};}if(path.endsWith('/tasks/finish'))return {items:['done']};return {ok:true};})} as unknown as NativeApi;
 const complete=vi.fn(async(_messages:any,_profile:any,_key:any,_signal:any,_preset?:any)=>({text:'synthetic'}));
 const gateway=new NativeGateway(api,{read} as unknown as NativePresets,{} as any,{} as any,{profileForPreset:async(p:any)=>p,complete} as unknown as NativeCompletions,{} as any);
 const profile={id:'chosen',name:'chosen',providerId:'custom',apiBaseUrl:'https://chosen.example/v1',model:'chosen',temperature:.7,maxTokens:32000};
 const pending=gateway.utility('summary',['synthetic'],profile,'synthetic-key',new AbortController().signal);
 await started;preset={...preset,name:'Changed',preset:{temperature:1.5,openai_max_tokens:4000}};profile.model='changed';release();
 await expect(pending).resolves.toEqual(['done']);expect(read).toHaveBeenCalledOnce();expect(prepared.pipeline.preset).toMatchObject({name:'Original',data:{temperature:.2}});expect(complete.mock.calls[0][1]).toMatchObject({model:'chosen'});
});

it('tests the chosen API with a small independent request instead of allocating the story token budget',async()=>{
 const complete=vi.fn(async(_messages:any,_profile:any,_key:any,_signal:any)=>({text:'OK'}));const gateway=new NativeGateway({} as any,{} as any,{} as any,{} as any,{complete} as unknown as NativeCompletions,{} as any);
 const profile={id:'chosen',name:'chosen',providerId:'custom',apiBaseUrl:'https://chosen.example/v1',model:'chosen',temperature:1.7,maxTokens:32000};
 await gateway.probe(profile,'synthetic-key','text',new AbortController().signal);
 expect(complete.mock.calls[0][1]).toMatchObject({apiBaseUrl:profile.apiBaseUrl,model:'chosen',maxTokens:256,temperature:1.7});expect(profile.maxTokens).toBe(32000);expect(complete).toHaveBeenCalledOnce();
});
it('recognizes a successful limited probe response without retrying a reasoning model or allocating more tokens',async()=>{
 const complete=vi.fn(async()=>{throw Object.assign(Error('limited'),{code:'MODEL_OUTPUT_LIMIT',raw:''});}),gateway=new NativeGateway({} as any,{} as any,{} as any,{} as any,{complete} as unknown as NativeCompletions,{} as any);
 await expect(gateway.probe({id:'a',name:'a',providerId:'custom',apiBaseUrl:'https://chosen.example/v1',model:'a',temperature:1,maxTokens:32000},'synthetic','text',new AbortController().signal)).resolves.toMatchObject({kind:'text',visibleChars:0});expect(complete).toHaveBeenCalledOnce();
});
