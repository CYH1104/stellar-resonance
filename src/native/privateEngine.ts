import {NativePipeline,type NativePipelineInput} from './pipeline';
import {guardNativeWrites} from './runtimeGuard';
import {installNativeCsrf} from './csrf';
const host=window as Window&typeof globalThis;
const csrf=installNativeCsrf(host);
guardNativeWrites(host);
const original=host.fetch;
host.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:'href'in input?input.href:input.url,location.href);
 if(url.origin===location.origin&&/^\/api\/backends\//.test(url.pathname))return Promise.resolve(new Response(JSON.stringify({error:'PRIVATE_COMPILER_NO_TRANSPORT'}),{status:409,headers:{'Content-Type':'application/json'}}));
 return original.call(host,input,init);
};
const active=new Map<string,AbortController>();
let modules:Promise<Record<string,any>>|undefined;
const nativeImport=(path:string)=>import(/* @vite-ignore */ path);
const load=()=>modules??=(async()=>({core:await nativeImport('/script.js'),openai:await nativeImport('/scripts/openai.js'),wi:await nativeImport('/scripts/world-info.js'),authors:await nativeImport('/scripts/authors-note.js'),regex:await nativeImport('/scripts/extensions/regex/engine.js'),power:await nativeImport('/scripts/power-user.js'),utils:await nativeImport('/scripts/utils.js'),extensions:await nativeImport('/scripts/extensions.js'),window,context:()=>(window as any).SillyTavern.getContext()}))();
const pipeline=new NativePipeline(load);
export async function prepare(input:NativePipelineInput,id:string){const controller=new AbortController();active.set(id,controller);try{await csrf.refresh();controller.signal.throwIfAborted();return await pipeline.prepare(input,controller.signal);}finally{active.delete(id);}}
export function cancel(id:string){active.get(id)?.abort();}
