/** Player-owned raw preset only. Private author cards and credentials never belong here. */
export const nativePresetTasks={story:'正文',memory:'记忆',terminal:'终端',persona:'人设辅助','random-event':'随机事件',forum:'论坛',summary:'总结',suggestions:'建议'} as const;
export type NativePresetTask=keyof typeof nativePresetTasks;
export interface NativePresetItem {id:string;name:string;preset:Record<string,any>}
export interface NativePresetConfig {version:1;preset:Record<string,any>;id?:string;name?:string;presets?:NativePresetItem[];taskPresets?:Partial<Record<NativePresetTask,string>>}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const forbidden=new Set(['__proto__','prototype','constructor']);
const credentials=new Set(['api_key','apikey','authorization','access_token','accesstoken','github_token','gitee_token','password','proxy_password','secret','secret_key','custom_include_headers']);
/** Check even incomplete JSON drafts before persistence or backup transfer. */
export function assertNativePresetDraftSafe(text:string){
 let parsed:any;try{parsed=JSON.parse(text);}catch{}
 if(object(parsed)&&typeof parsed.schema==='string'&&parsed.schema.startsWith('native-preset-draft')){
  if(parsed.schema!=='native-preset-draft-v1'||Object.keys(parsed).some(k=>!['schema','config','rawText'].includes(k))||typeof parsed.rawText!=='string')invalid();
  assertNativePresetDraftSafe(JSON.stringify(parsed.config));assertNativePresetDraftSafe(parsed.rawText);
 }
 for(const match of text.matchAll(/("(?:[^"\\]|\\.)*")\s*:/g)){
  let key:string;try{key=JSON.parse(match[1]);}catch{continue;}
  if(credentials.has(key.toLowerCase())&&!/^\s*(?:""|null|false)\s*(?:[,}]|$)/.test(text.slice(match.index!+match[0].length)))throw Object.assign(Error('预设草稿含凭据字段，请移除后再保存或备份。'),{code:'NATIVE_DRAFT_CREDENTIALS'});
 }
}
function invalid():never{throw Error('原生预设格式不支持或版本过新，原数据未修改。');}
function json(value:unknown,depth=0):any{
 if(depth>24)invalid();
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value;}
 if(typeof value==='string'){if(value.length>600000)invalid();return value;}
 if(Array.isArray(value)){if(value.length>5000)invalid();return value.map(v=>json(v,depth+1));}
 if(!object(value)||Object.keys(value).length>2000)invalid();
 const result:Record<string,any>={};
 for(const [key,item]of Object.entries(value)){
  if(forbidden.has(key))invalid();
  if(credentials.has(key.toLowerCase())&&item!==''&&item!==null&&item!==false)throw Error('预设含接口凭据或自定义请求头，请移除后导入；密钥请保留在 API 设置中。');
  result[key]=json(item,depth+1);
 }
 return result;
}
function cleanPreset(value:unknown):Record<string,any>{
 if(!object(value))invalid();const preset=json(value);
 if(JSON.stringify(preset).length>500000||!Array.isArray(preset.prompts)||preset.prompts.length>1000||!Array.isArray(preset.prompt_order))invalid();
 const identifiers=new Set<string>();
 for(const entry of preset.prompts){
  if(!object(entry)||typeof entry.identifier!=='string'||!entry.identifier||entry.identifier.length>200||identifiers.has(entry.identifier)||entry.identifier==='academy-task-context')invalid();
  identifiers.add(entry.identifier);
  if(entry.content!==undefined&&typeof entry.content!=='string'||entry.role!==undefined&&!['system','user','assistant'].includes(entry.role)||entry.enabled!==undefined&&typeof entry.enabled!=='boolean')invalid();
 }
 for(const group of preset.prompt_order){if(!object(group)||!Array.isArray(group.order))invalid();const seen=new Set();for(const entry of group.order){if(!object(entry)||typeof entry.identifier!=='string'||seen.has(entry.identifier)||typeof entry.enabled!=='boolean')invalid();seen.add(entry.identifier);}}
 for(const [name,min,max,integer]of [['temperature',0,2,false],['openai_max_tokens',1,32000,true],['top_p',0,1,false],['frequency_penalty',-2,2,false],['presence_penalty',-2,2,false]] as const){const n=preset[name];if(n!==undefined&&(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n)))invalid();}
 return preset;
}
export function cleanNativePresetConfig(value:unknown):NativePresetConfig{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','preset','id','name','presets','taskPresets'].includes(k)))invalid();
 const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 const validName=(name:unknown):name is string=>typeof name==='string'&&!!name.trim()&&name.length<=100;
 if(value.id!==undefined&&!validId(value.id)||value.name!==undefined&&!validName(value.name))invalid();
 const result:NativePresetConfig={version:1,preset:cleanPreset(value.preset),...(value.id!==undefined?{id:value.id}:{}),...(value.name!==undefined?{name:value.name}:{})};
 const ids=new Set([value.id||'default']);
 if(value.presets!==undefined){if(!Array.isArray(value.presets)||value.presets.length>19)invalid();result.presets=value.presets.map((item:unknown)=>{if(!object(item)||Object.keys(item).some(k=>!['id','name','preset'].includes(k))||!validId(item.id)||!validName(item.name)||ids.has(item.id))invalid();ids.add(item.id);return {id:item.id,name:item.name,preset:cleanPreset(item.preset)};});}
 if(value.taskPresets!==undefined){if(!object(value.taskPresets))invalid();result.taskPresets={};for(const [task,id]of Object.entries(value.taskPresets)){if(!Object.hasOwn(nativePresetTasks,task)||typeof id!=='string'||!ids.has(id))invalid();result.taskPresets[task as NativePresetTask]=id;}}
 if(JSON.stringify(result).length>500000)invalid();return result;
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
 const safe=cleanNativePresetConfig(value),task=({'generate':'story','personal-terminal':'terminal','memory':'memory','persona':'persona','random-event':'random-event','forum-reply':'forum','utility':body?.task} as Record<string,string>)[path] as NativePresetTask|undefined;
 const id=task?safe.taskPresets?.[task]:undefined,preset=id?nativePresetList(safe).find(item=>item.id===id)!.preset:safe.preset;
 return {version:1,preset};
}
export function encodeNativePresetDraft(config:NativePresetConfig,rawText:string){const text=JSON.stringify({schema:'native-preset-draft-v1',config:cleanNativePresetConfig(config),rawText});assertNativePresetDraftSafe(text);return text;}
export function decodeNativePresetDraft(text:string,base:NativePresetConfig){
 assertNativePresetDraftSafe(text);const raw=JSON.parse(text);
 if(object(raw)&&raw.schema==='native-preset-draft-v1')return {config:cleanNativePresetConfig(raw.config),rawText:raw.rawText as string};
 return {config:cleanNativePresetConfig({...base,preset:raw}),rawText:JSON.stringify(raw,null,2)};
}
/** Update the existing native identifiers; all untouched upstream/extension fields survive. */
export function editNativePreset(source:NativePresetConfig,changes:{temperature?:number;openai_max_tokens?:number;prompts?:{identifier:string;content?:string;enabled?:boolean}[]}):NativePresetConfig{
 const next=cleanNativePresetConfig(source);
 for(const name of ['temperature','openai_max_tokens'] as const)if(changes[name]!==undefined)next.preset[name]=changes[name];
 const seen=new Set();for(const edit of changes.prompts||[]){if(seen.has(edit.identifier))invalid();seen.add(edit.identifier);const entry=next.preset.prompts.find((p:any)=>p.identifier===edit.identifier);if(!entry)invalid();
  if(edit.content!==undefined)entry.content=edit.content;
  if(edit.enabled!==undefined){entry.enabled=edit.enabled;for(const group of next.preset.prompt_order)for(const item of group.order)if(item.identifier===edit.identifier)item.enabled=edit.enabled;}
 }
 return cleanNativePresetConfig(next);
}
