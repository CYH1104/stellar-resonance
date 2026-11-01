import type {Session,Variant} from './contracts.ts';
export interface NativeTimedEffect {hash:number;start:number;end:number;protected:boolean}
export interface NativeTimedEffects {sticky:Record<string,NativeTimedEffect>;cooldown:Record<string,NativeTimedEffect>}
export interface NativeVariableState {variables:Record<string,any>;globals:Record<string,any>}
export interface NativeWorldSeed {version:1;messageCount:number;effects:NativeTimedEffects;variables?:Record<string,any>;globals?:Record<string,any>}
export interface NativeWorldCheckpoint {version:1;path:string;effects:NativeTimedEffects;variables?:Record<string,any>;globals?:Record<string,any>}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function fail():never{throw Object.assign(Error('原生世界书跨轮状态格式不支持，原数据未修改。'),{code:'NATIVE_WORLD_STATE_INVALID',status:400});}
export const emptyNativeEffects=():NativeTimedEffects=>({sticky:{},cooldown:{}});
export function cleanNativeVariables(value:unknown):NativeVariableState{
 if(!object(value)||Object.keys(value).some(k=>!['variables','globals'].includes(k))||!object(value.variables)||!object(value.globals))fail();
 const validate=(v:any,depth=0):any=>{if(depth>30)fail();if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;if(Array.isArray(v))return v.map(i=>validate(i,depth+1));if(!object(v))fail();return Object.fromEntries(Object.entries(v).map(([k,item])=>{if(['__proto__','constructor','prototype'].includes(k))fail();return [k,validate(item,depth+1)];}));};
 const result=validate(value);if(JSON.stringify(result).length>1000000)fail();return result;
}
export function cleanNativeEffects(value:unknown):NativeTimedEffects{
 if(!object(value)||Object.keys(value).some(k=>!['sticky','cooldown'].includes(k)))fail();const out=emptyNativeEffects();let count=0;
 for(const kind of ['sticky','cooldown'] as const){if(!object(value[kind]))fail();for(const [key,v]of Object.entries(value[kind])){
  if(++count>4000||!/^PlayerRuntime-[a-zA-Z0-9_-]{1,100}\.(?:0|[1-9]\d{0,8})$/.test(key)||!object(v)||Object.keys(v).some(k=>!['hash','start','end','protected'].includes(k))||!Number.isSafeInteger(v.hash)||!Number.isSafeInteger(v.start)||!Number.isSafeInteger(v.end)||v.start<0||v.end<v.start||v.end>10000000||typeof v.protected!=='boolean')fail();
  out[kind][key]={hash:v.hash,start:v.start,end:v.end,protected:v.protected};
 }}return out;
}
export function cleanNativeWorldSeed(value:unknown):NativeWorldSeed{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','messageCount','effects','variables','globals'].includes(k))||!Number.isSafeInteger(value.messageCount)||value.messageCount<1||value.messageCount>10000000)fail();return {version:1,messageCount:value.messageCount,effects:cleanNativeEffects(value.effects),...(value.variables!==undefined||value.globals!==undefined?cleanNativeVariables({variables:value.variables||{},globals:value.globals||{}}):{})};
}
export function cleanNativeWorldCheckpoint(value:unknown):NativeWorldCheckpoint{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','path','effects','variables','globals'].includes(k))||typeof value.path!=='string'||!/^nwi1-[0-9a-f]{16}$/.test(value.path))fail();return {version:1,path:value.path,effects:cleanNativeEffects(value.effects),...(value.variables!==undefined||value.globals!==undefined?cleanNativeVariables({variables:value.variables||{},globals:value.globals||{}}):{})};
}
/** Anchor to the selected branch, including edits; no current-page or first-variant fallback. */
export function nativeWorldPath(session:Session,index:number){
 let a=2166136261,b=5381;const feed=(text:string)=>{for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}};
 feed(JSON.stringify([session.persona,session.opening]));for(const t of session.turns.slice(0,index+1)){const v=t.variants[t.selected];if(v?.status==='complete')feed(JSON.stringify([t.id,t.input,v.id,v.text,v.status]));}
 return 'nwi1-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function nativeWorldSeed(session:Session,index:number):NativeWorldSeed{
 const completed=session.turns.slice(0,index).map((t,i)=>({v:t.variants[t.selected],i})).filter(({v})=>v?.status==='complete'),last=completed.at(-1),checkpoint=last?.v.nativeWorldInfo;
 const valid=checkpoint&&checkpoint.path===nativeWorldPath(session,last!.i)?cleanNativeWorldCheckpoint(checkpoint):undefined;
 return {version:1,messageCount:2*completed.length+2,effects:valid?.effects||emptyNativeEffects(),...(valid?.variables!==undefined?{variables:valid.variables,globals:valid.globals||{}}:{})};
}
export function nativeWorldCheckpoint(session:Session,index:number,variant:Variant,effects:unknown,variables?:NativeVariableState):NativeWorldCheckpoint{
 if(variant.status!=='complete'||session.turns[index]?.variants[session.turns[index].selected]?.id!==variant.id)fail();return {version:1,path:nativeWorldPath(session,index),effects:cleanNativeEffects(effects),...(variables?cleanNativeVariables(variables):{})};
}
