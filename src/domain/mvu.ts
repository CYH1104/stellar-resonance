import {validAffinity,affinityNumber,affinitySchema} from './affinity.ts';
import {fixedActorFields,restoreActorFacts} from './actorPolicy.ts';
import {newDynamicActor} from './dynamicActors.ts';
import type { WorldState } from './contracts';

export interface JsonObject { [key:string]:Json }
export interface JsonArray extends Array<Json> {}
export type Json = null | boolean | number | string | JsonArray | JsonObject;
export type MvuOperation = { op:'replace'|'add'|'insert'|'remove'|'delta'|'move'|'copy'|'test'; path:string; value?:Json; from?:string };
export interface MvuData { stat_data:Record<string,Json>; schema?:Record<string,Json>; initialized_lorebooks?:Record<string,Json>; display_data?:Record<string,Json>; delta_data?:Record<string,Json> }
const forbidden=new Set(['__proto__','prototype','constructor']);
const reservedDataKeys=new Set(['apikey','api_key','key','authorization','access_token','token','password','secret']);
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const object=(v:unknown):v is Record<string,Json>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function fail():never{throw new Error('MVU 变量更新格式、路径或数值不合法');}
export function cleanJson(value:unknown,depth=0):Json{
  if(depth>18)fail();
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){if(value.length>60000)fail();return value;}
  if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
  if(Array.isArray(value)){if(value.length>1000)fail();return value.map(v=>cleanJson(v,depth+1));}
  if(object(value)){if(Object.keys(value).length>1000)fail();const result:Record<string,Json>={};for(const [k,v] of Object.entries(value)){if(forbidden.has(k)||reservedDataKeys.has(k.toLowerCase()))fail();result[k]=cleanJson(v,depth+1);}return result;}
  return fail();
}
export function pointer(path:string):string[]{
  if(typeof path!=='string'||!path.startsWith('/')||path.length>2000||/~(?:[^01]|$)/.test(path))fail();
  const parts=path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
  if(parts.some(p=>!p||forbidden.has(p)))fail();return parts;
}
export function readPath(root:Json,path:string):Json{
  let current=root;for(const part of pointer(path)){if(!current||typeof current!=='object'||!Object.hasOwn(current,part))fail();current=(current as Record<string,Json>)[part];}return current;
}
export function cleanOperations(value:unknown):MvuOperation[]{
  if(!Array.isArray(value)||value.length>200)fail();
  return value.map(raw=>{if(!object(raw)||typeof raw.op!=='string'||!['replace','add','insert','remove','delta','move','copy','test'].includes(raw.op)||Object.keys(raw).some(k=>!['op','path','value','from','to'].includes(k)))fail();
    const path=raw.path??raw.to;if(typeof path!=='string')fail();if(pointer(path).some(p=>p.startsWith('_')))fail();
    const op=raw.op as MvuOperation['op'],out:MvuOperation={op,path};
    if(['move','copy'].includes(op)){if(typeof raw.from!=='string')fail();if(pointer(raw.from).some(p=>p.startsWith('_'))&&op==='move')fail();out.from=raw.from;}
    if(!['remove','move','copy'].includes(op)){if(!Object.hasOwn(raw,'value'))fail();const value=/^\/characters\/[^/]+\/affinity$/.test(path)&&['replace','add','insert','delta'].includes(op)?affinityNumber(raw.value):raw.value;out.value=cleanJson(value);if(op==='delta'&&typeof out.value!=='number')fail();}
    return out;
  });
}
/** Presence assignments remain explicit even if they equal the pre-turn value. */
export function explicitPresenceIds(updates:unknown):Set<string>{
  const ids=new Set<string>();
  for(const op of cleanOperations(updates)){
    if(op.op==='test'||op.op==='remove')continue;
    const path=pointer(op.path);if(path[0]!=='characters')continue;
    if(path.length===1)ids.add('*');
    else if(path.length===2||path.length===3&&path[2]==='present')ids.add(path[1]);
  }
  return ids;
}
export function patchData(data:Record<string,Json>,updates:unknown,lockActorFacts=false):Record<string,Json>{
  const root=cleanJson(data) as Record<string,Json>;
  const fixedPath=(path:string)=>{const p=pointer(path);return p[0]==='player'?fixedActorFields.includes(p[1] as typeof fixedActorFields[number]):p[0]==='characters'&&object(data.characters)&&Object.hasOwn(data.characters,p[1])&&fixedActorFields.includes(p[2] as typeof fixedActorFields[number]);};
  const restoreFacts=()=>{
    if(object(root.player)&&object(data.player))restoreActorFacts(data.player,root.player);
    if(object(root.characters)&&object(data.characters))for(const [id,actor]of Object.entries(data.characters))if(object(actor)&&object(root.characters[id]))restoreActorFacts(actor,root.characters[id]);
  };
  function change(path:string,value:Json|undefined,mode:string){const parts=pointer(path),key=parts.pop()!;let parent:Json=root;for(const part of parts){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,part))fail();parent=(parent as Record<string,Json>)[part];}if(!parent||typeof parent!=='object')fail();
    const exists=Object.hasOwn(parent,key);if(!['add','insert'].includes(mode)&&!exists)fail();
    if(Array.isArray(parent)){if(key==='-'&&['add','insert'].includes(mode)){parent.push(value!);return;}if(!/^(0|[1-9]\d*)$/.test(key))fail();const n=Number(key);if(n>parent.length||(!['add','insert'].includes(mode)&&n===parent.length))fail();if(mode==='remove')parent.splice(n,1);else if(['add','insert'].includes(mode))parent.splice(n,0,value!);else parent[n]=value!;}
    else if(mode==='remove')delete parent[key];else parent[key]=value!;
  }
  for(const op of cleanOperations(updates)){
    try{
    if(lockActorFacts&&op.op!=='test'&&fixedPath(op.path))continue;
    if(lockActorFacts&&op.op==='move'&&fixedPath(op.from!))fail();
    if(op.op==='test'){if(JSON.stringify(readPath(root,op.path))!==JSON.stringify(op.value))fail();continue;}
    if(op.op==='delta'){const old=readPath(root,op.path);if(typeof old!=='number'||!Number.isFinite(old+(op.value as number)))fail();change(op.path,old+(op.value as number),'replace');}
    else if(op.op==='move'||op.op==='copy'){if(op.path.startsWith(op.from!+'/'))fail();const v=clone(readPath(root,op.from!));if(op.op==='move')change(op.from!,undefined,'remove');change(op.path,v,'add');}
    else change(op.path,op.value,op.op);
    if(lockActorFacts)restoreFacts();
    }catch(error){if(error instanceof Error)Object.assign(error,{fieldPath:op.path});throw error;}
  }
  const result=cleanJson(root) as Record<string,Json>;if(JSON.stringify(result).length>100000)fail();return result;
}
export function dataFromState(state:WorldState):MvuData{
  const stat_data=cleanJson(clone({player:state.player,characters:Object.fromEntries(state.characters.map(c=>[c.id,c])),custom:state.variables||{}})) as Record<string,Json>;
  return {stat_data,schema:{type:'object',extensible:false,properties:{player:{type:'object'},characters:{type:'object',additionalProperties:{type:'object',properties:{affinity:{...affinitySchema}}}},custom:{type:'object',recursiveExtensible:true}}},initialized_lorebooks:{}};
}
/** Register explicit new identities before applying their field updates. Never infer a name from an ID. */
export function prepareMvuUpdates(state:WorldState,updates:unknown,candidates:unknown=[]):MvuOperation[]{
  const ops=cleanOperations(updates),known=new Set(state.characters.map(c=>c.id));
  const registrations:MvuOperation[]=[],registered=new Set<string>();
  const registrationOps=new Set<MvuOperation>();
  for(const op of ops){const p=pointer(op.path);if(p[0]==='characters'&&p.length===2&&['insert','add'].includes(op.op)&&!known.has(p[1])){const actor=newDynamicActor(op.value);if(actor.id!==p[1]||registered.has(actor.id))fail();registrations.push({...op,op:'insert',value:cleanJson({...actor,affinity:actor.affinity??0})});registrationOps.add(op);registered.add(actor.id);}}
  const rows=Array.isArray(candidates)?candidates:object(candidates)?Object.entries(candidates).map(([id,v])=>object(v)?{...v,id:v.id??id}:v):[];
  for(const row of rows){if(!object(row)||typeof row.id!=='string'||known.has(row.id)||registered.has(row.id))continue;let actor;try{actor=newDynamicActor(row);}catch{continue;}registrations.push({op:'insert',path:'/characters/'+actor.id.replace(/~/g,'~0').replace(/\//g,'~1'),value:cleanJson({...actor,affinity:actor.affinity??0})});registered.add(actor.id);}
  const pending=ops.filter(op=>!registrationOps.has(op)),initialized=new Set<string>(),initializers:MvuOperation[]=[];
  for(const op of pending){const p=pointer(op.path);if(p[0]!=='characters'||p.length!==3)continue;const before=state.characters.find(c=>c.id===p[1]);if(!before||Object.hasOwn(before,p[2])||initialized.has(op.path))continue;
    if(op.op==='delta'&&p[2]==='affinity'){initializers.push({op:'insert',path:op.path,value:0});initialized.add(op.path);}
  }
  return [...registrations,...initializers,...pending];
}
export function replacementOperations(data:unknown):MvuOperation[]{
  const clean=cleanJson(data);if(!object(clean)||!object(clean.player)||!object(clean.characters)||!object(clean.custom)||Object.keys(clean).sort().join(',')!=='characters,custom,player')fail();
  return ['player','characters','custom'].map(key=>({op:'replace',path:'/'+key,value:clean[key]}));
}
export function renderMvuMacros(text:string,data:MvuData):string{
  return text.replace(/\{\{(?:get_message_variable|getvar)::(stat_data(?:\.[^{}]+)?)\}\}/g,(_match,path:string)=>{
    const value=path==='stat_data'?data.stat_data:readPath(data.stat_data,'/'+path.slice(10).split('.').map(p=>p.replace(/~/g,'~0').replace(/\//g,'~1')).join('/'));
    return typeof value==='string'?value:JSON.stringify(value);
  });
}
const dynamic=new Set(['affinity','relationship','present','innerThought','spiritThought']);
export function applyMvu(state:WorldState,updates:unknown):WorldState{
  const original=dataFromState(state).stat_data,next=patchData(original,updates,true);
  if(Object.keys(next).sort().join(',')!=='characters,custom,player'||!object(next.player)||!object(next.characters)||!object(next.custom))fail();
  if(state.characters.some(c=>!Object.hasOwn(next.characters as object,c.id)))fail();
  function actor(before:Record<string,Json>,after:Json,player=false){if(!object(after))fail();
    for(const k of new Set([...Object.keys(before),...Object.keys(after)])){
      if(JSON.stringify(before[k])===JSON.stringify(after[k]))continue;
      if(!dynamic.has(k)||!Object.hasOwn(after,k)||(player&&['innerThought','affinity','present'].includes(k)))fail();
      const v=after[k];if(k==='affinity'){if(!validAffinity(v))fail();}
      else if(k==='present'){if(typeof v!=='boolean')fail();}
      else {if(typeof v!=='string'||v.length>(k==='mentalPowerLevel'?100:k==='identity'?200:2000))fail();if(k==='spiritThought'&&!before.spiritAnimal)fail();}
    }return clone(after);
  }
  const player=actor(original.player as Record<string,Json>,next.player,true),characters=state.characters.map(c=>actor((original.characters as Record<string,Json>)[c.id] as Record<string,Json>,(next.characters as Record<string,Json>)[c.id]));
  const additions=Object.entries(next.characters).filter(([id])=>!state.characters.some(c=>c.id===id)).map(([id,value])=>{if(!object(value)||value.id!==id)fail();return newDynamicActor(value);});
  return {...clone(state),player,characters:[...characters,...additions],variables:next.custom} as unknown as WorldState;
}

/** Parse literal MVU commands; model text is never evaluated as JavaScript. */
function literal(text:string):Json{
  const value=text.trim();if(value.startsWith("'")){if(!value.endsWith("'"))fail();return value.slice(1,-1).replace(/\\(['\\])/g,'$1').replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t');}
  try{return cleanJson(JSON.parse(value));}catch{return fail();}
}
function argsOf(text:string):string[]{const result:string[]=[];let start=0,quote='',escape=false,depth=0;for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}')depth--;else if(c===','&&!depth){result.push(text.slice(start,i));start=i+1;}}if(quote||depth)fail();result.push(text.slice(start));return result;}
function legacyPath(value:Json):string{if(typeof value!=='string')fail();if(value.startsWith('/'))return value;const parts=value.replace(/^stat_data\./,'').replace(/\[(\d+)\]/g,'.$1').split('.');const path='/'+parts.map(p=>p.replace(/~/g,'~0').replace(/\//g,'~1')).join('/');pointer(path);return path;}
export function parseMvuMessage(message:string):MvuOperation[]{
  if(message.length>100000)fail();if(/^\s*_\./.test(message))message='<UpdateVariable>'+message+'</UpdateVariable>';const blocks=[...message.matchAll(/<UpdateVariable\b[^>]*>([\s\S]*?)<\/UpdateVariable>/gi)];if(!blocks.length)return [];
  const result:MvuOperation[]=[];
  for(const block of blocks){const body=block[1].replace(/<Analysis>[\s\S]*?<\/Analysis>/gi,'').trim();const patches=[...body.matchAll(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/gi)];
    if(patches.length){if(body.replace(/<JSONPatch>[\s\S]*?<\/JSONPatch>/gi,'').trim())fail();for(const p of patches){let raw=p[1].trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');try{result.push(...cleanOperations(JSON.parse(raw)));}catch{fail();}}continue;}
    let rest=body.replace(/^```(?:javascript|js)?\s*/,'').replace(/\s*```$/,'');
    while(rest.trim()){
      rest=rest.trimStart();if(rest.startsWith('//')){const end=rest.indexOf('\n');rest=end<0?'':rest.slice(end+1);continue;}
      const head=/^_\.(set|add|insert|assign|remove|unset|delete)\s*\(/.exec(rest);if(!head)fail();let quote='',escaped=false,depth=1,i=head[0].length,start=i;
      for(;i<rest.length;i++){const c=rest[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='(')depth++;else if(c===')'&&!--depth)break;}if(depth)fail();
      const args=argsOf(rest.slice(start,i)).map(literal),path=legacyPath(args[0]),type=head[1];rest=rest.slice(i+1).replace(/^\s*;/,'');
      if(type==='set'){if(args.length<2||args.length>3)fail();result.push({op:'add',path,value:args.at(-1)!});}
      else if(type==='add'){if(args.length!==2||typeof args[1]!=='number')fail();result.push({op:'delta',path,value:args[1]});}
      else if(['remove','unset','delete'].includes(type)){if(args.length<1||args.length>2)fail();result.push({op:'remove',path:args.length===2?path+'/'+String(args[1]).replace(/~/g,'~0').replace(/\//g,'~1'):path});}
      else {if(args.length===3)result.push({op:'add',path:path+'/'+String(args[1]).replace(/~/g,'~0').replace(/\//g,'~1'),value:args[2]});else if(args.length===2&&object(args[1])){for(const [key,value] of Object.entries(args[1]))result.push({op:'add',path:path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),value});}else fail();}
    }
  }
  return cleanOperations(result);
}
