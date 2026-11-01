/** Player-owned raw preset only. Private author cards and credentials never belong here. */
import {nativePresetTasks,nativeTaskForRequest,type NativePresetTask} from './nativeTasks.ts';
import {nativeCredentialFields as credentials,cleanNativeJson as json} from './nativeJson.ts';
import {cleanNativeWorldbooks,type NativeWorldbooks} from './nativeWorldbooks.ts';
export {nativePresetTasks,type NativePresetTask} from './nativeTasks.ts';
export interface NativePresetItem {id:string;name:string;preset:Record<string,any>}
export interface NativePresetConfig {version:1;preset:Record<string,any>;id?:string;name?:string;presets?:NativePresetItem[];taskPresets?:Partial<Record<NativePresetTask,string>>;worldbooks?:NativeWorldbooks}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function unverifiedDraft():never{throw Object.assign(Error('预设草稿封装损坏或无法校验，请清理该草稿后再保存或备份。'),{code:'NATIVE_DRAFT_UNVERIFIED'});}
/** Tokens are scanned outside string values, so escaped JSON is never mistaken for decoded fields. */
function draftProperties(text:string){
 const fields:{key:string;after:number}[]=[];
 for(let i=0;i<text.length;i++)if(text[i]==='"'){
  const start=i;let closed=false;
  for(i++;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"'){closed=true;break;}}
  if(!closed)break;let after=i+1;while(/\s/.test(text[after]||'')&&after<text.length)after++;
  if(text[after]!==':')continue;try{fields.push({key:JSON.parse(text.slice(start,i+1)),after:after+1});}catch{}
 }
 return fields;
}
/** Ordinary unfinished raw JSON is recoverable; undecodable envelopes are never transferable. */
export function assertNativePresetDraftSafe(text:string,depth=0){
 if(typeof text!=='string'||depth>16)unverifiedDraft();
 let parsed:any,decoded=false;try{parsed=JSON.parse(text);decoded=true;}catch{}
 const fields=draftProperties(text);
 const envelope=fields.some(({key,after})=>key.toLowerCase()==='rawtext'||key==='schema'&&/^\s*"native-preset-draft/.test(text.slice(after)))||object(parsed)&&typeof parsed.schema==='string'&&parsed.schema.startsWith('native-preset-draft');
 if(!decoded&&envelope)unverifiedDraft();
 if(typeof parsed==='string')assertNativePresetDraftSafe(parsed,depth+1);
 // Read every original value, including duplicate properties JSON.parse would overwrite.
 for(const {key,after}of fields)if(key.toLowerCase()==='rawtext'){
  let start=after;while(start<text.length&&/\s/.test(text[start]))start++;
  if(text[start]!=='"')unverifiedDraft();let end=start+1;
  for(;end<text.length;end++){if(text[end]==='\\'){end++;continue;}if(text[end]==='"')break;}
  if(end>=text.length)unverifiedDraft();
  assertNativePresetDraftSafe(JSON.parse(text.slice(start,end+1)),depth+1);
 }
 // Serialized editor text is checked wherever it occurs, independent of its schema tag.
 const pending:unknown[]=decoded?[parsed]:[];
 while(pending.length){
  const node=pending.pop();if(!node||typeof node!=='object')continue;
  if(object(node)&&typeof node.schema==='string'&&node.schema.startsWith('native-preset-draft')&&(node.schema!=='native-preset-draft-v1'||Object.keys(node).some(k=>!['schema','config','rawText'].includes(k))||!object(node.config)||typeof node.rawText!=='string'))unverifiedDraft();
  for(const value of Object.values(node))if(value&&typeof value==='object')pending.push(value);
 }
 for(const {key,after}of fields)if((credentials.has(key.toLowerCase())||key.toLowerCase()==='key'&&!/^\s*\[/.test(text.slice(after)))&&!/^\s*(?:""|null|false)\s*(?:[,}]|$)/.test(text.slice(after)))throw Object.assign(Error('预设草稿含凭据字段，请移除后再保存或备份。'),{code:'NATIVE_DRAFT_CREDENTIALS'});
}
function invalid():never{throw Object.assign(Error('学院预设库的版本、身份或任务绑定不正确，原数据未修改。'),{code:'NATIVE_PRESET_BINDINGS_INVALID'});}
function cleanPreset(value:unknown):Record<string,any>{
 if(!object(value))throw Object.assign(Error('酒馆预设的 JSON 顶层必须是对象，原文件和已保存资料保留。'),{code:'NATIVE_PRESET_ROOT_INVALID'});
 // Native PresetManager/PromptManager owns defaults, migrations, identifiers,
 // prompt ordering and sampler semantics. Keep the import verbatim and apply
 // only the separate JSON, credentials and allocation guards here.
 return json(value);
}
export function parseNativePresetFile(text:string):Record<string,any>{
 let value:unknown;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Object.assign(Error('预设 JSON 无法解析，请检查括号、逗号和引号；原文件和已保存资料保留。'),{code:'NATIVE_PRESET_JSON_INVALID'});}
 return cleanPreset(value);
}
export function cleanNativePresetConfig(value:unknown):NativePresetConfig{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','preset','id','name','presets','taskPresets','worldbooks'].includes(k)))invalid();
 const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 const validName=(name:unknown):name is string=>typeof name==='string'&&!!name.trim()&&name.length<=255;
 if(value.id!==undefined&&!validId(value.id)||value.name!==undefined&&!validName(value.name))invalid();
 const result:NativePresetConfig={version:1,preset:cleanPreset(value.preset),...(value.id!==undefined?{id:value.id}:{}),...(value.name!==undefined?{name:value.name}:{})};
 const ids=new Set([value.id||'default']);
 if(value.presets!==undefined){if(!Array.isArray(value.presets))invalid();result.presets=value.presets.map((item:unknown)=>{if(!object(item)||Object.keys(item).some(k=>!['id','name','preset'].includes(k))||!validId(item.id)||!validName(item.name)||ids.has(item.id))invalid();ids.add(item.id);return {id:item.id,name:item.name,preset:cleanPreset(item.preset)};});}
 if(value.taskPresets!==undefined){if(!object(value.taskPresets))invalid();result.taskPresets={};for(const [task,id]of Object.entries(value.taskPresets)){if(!Object.hasOwn(nativePresetTasks,task)||typeof id!=='string'||!ids.has(id))invalid();result.taskPresets[task as NativePresetTask]=id;}}
 if(value.worldbooks!==undefined)result.worldbooks=cleanNativeWorldbooks(value.worldbooks);
 return result;
}
export function nativePresetList(value:NativePresetConfig):NativePresetItem[]{const safe=cleanNativePresetConfig(value);return [{id:safe.id||'default',name:safe.name||'默认预设',preset:safe.preset},...safe.presets||[]];}
export function selectNativePreset(value:NativePresetConfig,id:string):NativePresetConfig{
 const safe=cleanNativePresetConfig(value),items=nativePresetList(safe),chosen=items.find(item=>item.id===id);if(!chosen)invalid();
 return cleanNativePresetConfig({...safe,...chosen,presets:items.filter(item=>item.id!==id)});
}
export function addNativePreset(value:NativePresetConfig,preset:unknown,name:string,id:string=crypto.randomUUID()):NativePresetConfig{
 const safe=cleanNativePresetConfig(value);return cleanNativePresetConfig({...safe,id,name,preset,presets:nativePresetList(safe)});
}
export function removeNativePreset(value:NativePresetConfig,id:string):NativePresetConfig{
 const safe=cleanNativePresetConfig(value),items=nativePresetList(safe);if(items.length<2)throw Error('至少保留一个预设。');
 if(Object.values(safe.taskPresets||{}).includes(id))throw Error('此预设已绑定任务，请先调整任务绑定。');
 if(!items.some(item=>item.id===id))invalid();const next=(safe.id||'default')===id?selectNativePreset(safe,items.find(item=>item.id!==id)!.id):safe;
 next.presets=next.presets?.filter(item=>item.id!==id);return cleanNativePresetConfig(next);
}
/** Send only a snapshot of the chosen raw preset, never the entire library. */
export function nativePresetForRequest(value:NativePresetConfig,path:string,body:any):NativePresetConfig{
 const safe=cleanNativePresetConfig(value),task=nativeTaskForRequest(path,body);
 const id=task?safe.taskPresets?.[task]:undefined,preset=id?nativePresetList(safe).find(item=>item.id===id)!.preset:safe.preset;
 return {version:1,preset};
}
export function encodeNativePresetDraft(config:NativePresetConfig,rawText:string){const text=JSON.stringify({schema:'native-preset-draft-v1',config:cleanNativePresetConfig(config),rawText});assertNativePresetDraftSafe(text);return text;}
export function decodeNativePresetDraft(text:string,base:NativePresetConfig){
 assertNativePresetDraftSafe(text);let raw:any;try{raw=JSON.parse(text);}catch{return {config:cleanNativePresetConfig(base),rawText:text};}
 if(object(raw)&&raw.schema==='native-preset-draft-v1')return {config:cleanNativePresetConfig(raw.config),rawText:raw.rawText as string};
 try{return {config:cleanNativePresetConfig({...base,preset:raw}),rawText:JSON.stringify(raw,null,2)};}catch{return {config:cleanNativePresetConfig(base),rawText:text};}
}
/** Update the existing native identifiers; all untouched upstream/extension fields survive. */
export function editNativePreset(source:NativePresetConfig,changes:{temperature?:number;openai_max_tokens?:number;prompts?:{identifier:string;content?:string;enabled?:boolean}[]}):NativePresetConfig{
 const next=cleanNativePresetConfig(source);
 for(const name of ['temperature','openai_max_tokens'] as const)if(changes[name]!==undefined)next.preset[name]=changes[name];
 const seen=new Set();for(const edit of changes.prompts||[]){if(seen.has(edit.identifier))invalid();seen.add(edit.identifier);const entry=(Array.isArray(next.preset.prompts)?next.preset.prompts:[]).find((p:any)=>p?.identifier===edit.identifier);if(!entry)invalid();
  if(edit.content!==undefined)entry.content=edit.content;
  if(edit.enabled!==undefined){entry.enabled=edit.enabled;for(const group of Array.isArray(next.preset.prompt_order)?next.preset.prompt_order:[])for(const item of Array.isArray(group?.order)?group.order:[])if(item?.identifier===edit.identifier)item.enabled=edit.enabled;}
 }
 return cleanNativePresetConfig(next);
}
