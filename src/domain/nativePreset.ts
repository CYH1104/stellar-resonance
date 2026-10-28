/** Player-owned raw preset only. Private author cards and credentials never belong here. */
export interface NativePresetConfig {version:1;preset:Record<string,any>}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const forbidden=new Set(['__proto__','prototype','constructor']);
const credentials=new Set(['api_key','apikey','authorization','access_token','accesstoken','github_token','gitee_token','password','proxy_password','secret','secret_key','custom_include_headers']);
/** Check even incomplete JSON drafts before persistence or backup transfer. */
export function assertNativePresetDraftSafe(text:string){
 for(const match of text.matchAll(/("(?:[^"\\]|\\.)*")\s*:/g)){
  let key:string;try{key=JSON.parse(match[1]);}catch{continue;}
  if(credentials.has(key.toLowerCase())&&!/^\s*(?:""|null|false)\s*(?:[,}]|$)/.test(text.slice(match.index!+match[0].length)))throw Error('预设草稿含凭据字段，请移除后再保存或备份。');
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
export function cleanNativePresetConfig(value:unknown):NativePresetConfig{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','preset'].includes(k))||!object(value.preset))invalid();
 const preset=json(value.preset);
 if(JSON.stringify(preset).length>500000||!Array.isArray(preset.prompts)||preset.prompts.length>1000||!Array.isArray(preset.prompt_order))invalid();
 const identifiers=new Set<string>();
 for(const entry of preset.prompts){
  if(!object(entry)||typeof entry.identifier!=='string'||!entry.identifier||entry.identifier.length>200||identifiers.has(entry.identifier)||entry.identifier==='academy-task-context')invalid();
  identifiers.add(entry.identifier);
  if(entry.content!==undefined&&typeof entry.content!=='string'||entry.role!==undefined&&!['system','user','assistant'].includes(entry.role)||entry.enabled!==undefined&&typeof entry.enabled!=='boolean')invalid();
 }
 for(const group of preset.prompt_order){if(!object(group)||!Array.isArray(group.order))invalid();const seen=new Set();for(const entry of group.order){if(!object(entry)||typeof entry.identifier!=='string'||seen.has(entry.identifier)||typeof entry.enabled!=='boolean')invalid();seen.add(entry.identifier);}}
 for(const [name,min,max,integer]of [['temperature',0,2,false],['openai_max_tokens',1,32000,true],['top_p',0,1,false],['frequency_penalty',-2,2,false],['presence_penalty',-2,2,false]] as const){const n=preset[name];if(n!==undefined&&(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n)))invalid();}
 return {version:1,preset};
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
