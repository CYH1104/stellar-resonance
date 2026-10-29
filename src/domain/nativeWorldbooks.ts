import {cleanNativeJson} from './nativeJson.ts';
import {nativePresetTasks,nativeTaskForRequest,type NativePresetTask} from './nativeTasks.ts';
export interface NativeWorldbook {id:string;name:string;worldbook:Record<string,any>}
export interface NativeWorldbooks {version:1;books:NativeWorldbook[];defaultIds:string[];taskBooks?:Partial<Record<NativePresetTask,string[]>>;sessionBooks?:Record<string,string[]>}
/** File allocation guard in bytes, separate from the stored JSON character budget. */
export const NATIVE_WORLD_FILE_LIMIT_BYTES=5*1024*1024;
export async function readNativeWorldbookFile(file:{size:number;text:()=>Promise<string>}){
 if(!Number.isSafeInteger(file.size)||file.size<0)throw Error('世界书文件信息不正确。');
 if(file.size>NATIVE_WORLD_FILE_LIMIT_BYTES)throw Error('单份世界书文件不能超过 5 MB。');
 return cleanNativeWorldbook(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function invalid():never{throw Error('原生世界书格式、版本或绑定不受支持，原数据未修改。');}
export const emptyNativeWorldbooks=():NativeWorldbooks=>({version:1,books:[],defaultIds:[]});
export function nativeWorldScope(value:unknown):{mode:'global'|'characters';characterIds:string[]}|undefined{
 if(value===undefined||value===null)return undefined;
 if(!object(value)||Object.keys(value).some(k=>!['mode','characterIds'].includes(k))||!['global','characters'].includes(value.mode)||value.mode==='characters'&&!Array.isArray(value.characterIds)||value.characterIds!==undefined&&!Array.isArray(value.characterIds)||(value.characterIds||[]).length>1000||(value.characterIds||[]).some((id:unknown)=>typeof id!=='string'||!id||id.length>128||['player','__proto__','constructor','prototype'].includes(id))||new Set(value.characterIds||[]).size!==(value.characterIds||[]).length)invalid();
 return {mode:value.mode,characterIds:[...value.characterIds||[]]};
}
export function cleanNativeWorldbook(value:unknown){
 const raw=cleanNativeJson(value);if(!object(raw)||!object(raw.entries)||Object.keys(raw.entries).length>1000)invalid();
 function credentials(node:any,path=''){if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){if(['key','token'].includes(key.toLowerCase())&&!(key==='key'&&/^entries\/\d+$/.test(path)&&Array.isArray(value)&&value.every(s=>typeof s==='string')))throw Error('原生世界书含凭据字段；关键词 key 仅允许出现在条目关键词数组。');credentials(value,path?path+'/'+key:key);}}credentials(raw);
 for(const [id,entry]of Object.entries(raw.entries)){if(!/^(?:0|[1-9]\d{0,8})$/.test(id)||!object(entry)||entry.uid!==Number(id)||typeof entry.content!=='string'||entry.content.length>200000)invalid();
  for(const k of ['key','keysecondary','triggers'])if(entry[k]!==undefined&&(!Array.isArray(entry[k])||entry[k].some((s:unknown)=>typeof s!=='string')))invalid();
  for(const k of ['disable','constant','selective','useProbability','excludeRecursion','preventRecursion'])if(entry[k]!==undefined&&typeof entry[k]!=='boolean')invalid();
  for(const k of ['order','position','depth','probability','sticky','cooldown','delay'])if(entry[k]!==undefined&&entry[k]!==null&&(!Number.isFinite(entry[k])||Math.abs(entry[k])>100000))invalid();
 }if(JSON.stringify(raw).length>500000)invalid();return raw;
}

/** Stronger option checks apply to explicit editing/execution, not reads of older saved raw files. */
export function assertNativeWorldbookOptions(value:unknown,onlyEnabled=false){
 try{const raw=cleanNativeWorldbook(value);for(const entry of Object.values(raw.entries) as Record<string,any>[]){if(onlyEnabled&&entry.disable===true)continue;nativeWorldScope(entry.extensions?.academy_scope??raw.extensions?.academy_scope);
  for(const k of ['disable','constant','selective','useProbability','excludeRecursion','preventRecursion','ignoreBudget','groupOverride','matchPersonaDescription','matchCharacterDescription','matchCharacterPersonality','matchCharacterDepthPrompt','matchScenario','matchCreatorNotes'])if(entry[k]!==undefined&&typeof entry[k]!=='boolean')invalid();
  for(const k of ['caseSensitive','matchWholeWords','useGroupScoring'])if(entry[k]!=null&&typeof entry[k]!=='boolean')invalid();
  for(const k of ['group','outletName'])if(entry[k]!==undefined&&typeof entry[k]!=='string')invalid();
  for(const k of ['order','position','depth','probability','sticky','cooldown','delay'])if(entry[k]!==undefined&&entry[k]!==null&&(!Number.isFinite(entry[k])||Math.abs(entry[k])>100000))invalid();
  for(const k of ['depth','scanDepth','sticky','cooldown','delay','groupWeight'])if(entry[k]!=null&&(!Number.isInteger(entry[k])||entry[k]<0||entry[k]>100000))invalid();
  if(entry.role!=null&&![0,1,2].includes(entry.role)||entry.selectiveLogic!=null&&![0,1,2,3].includes(entry.selectiveLogic)||entry.position!=null&&(!Number.isInteger(entry.position)||entry.position<0||entry.position>7)||entry.probability!=null&&(entry.probability<0||entry.probability>100)||entry.delayUntilRecursion!=null&&typeof entry.delayUntilRecursion!=='boolean'&&(!Number.isInteger(entry.delayUntilRecursion)||entry.delayUntilRecursion<0||entry.delayUntilRecursion>100000))invalid();
 }}catch{throw Object.assign(Error('世界书高级设置或角色作用范围不正确，请调整后再保存或调用；原文件仍保留。'),{code:'NATIVE_WORLD_OPTIONS_INVALID',status:400});}
}
export function cleanNativeWorldbooks(value:unknown):NativeWorldbooks{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','books','defaultIds','taskBooks','sessionBooks'].includes(k))||!Array.isArray(value.books)||value.books.length>20)invalid();
 const seen=new Set<string>(),books=value.books.map((b:unknown)=>{if(!object(b)||Object.keys(b).some(k=>!['id','name','worldbook'].includes(k))||typeof b.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(b.id)||seen.has(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100)invalid();seen.add(b.id);return {id:b.id,name:b.name,worldbook:cleanNativeWorldbook(b.worldbook)};});
 const ids=(v:unknown):string[]=>{if(!Array.isArray(v)||v.some(id=>typeof id!=='string'||!seen.has(id))||new Set(v).size!==v.length)invalid();return [...v];};
 const result:NativeWorldbooks={version:1,books,defaultIds:ids(value.defaultIds)};
 if(value.taskBooks!==undefined){if(!object(value.taskBooks))invalid();result.taskBooks={};for(const [task,list]of Object.entries(value.taskBooks)){if(!Object.hasOwn(nativePresetTasks,task))invalid();result.taskBooks[task as NativePresetTask]=ids(list);}}
 if(value.sessionBooks!==undefined){if(!object(value.sessionBooks)||Object.keys(value.sessionBooks).length>1000)invalid();result.sessionBooks={};for(const [sid,list]of Object.entries(value.sessionBooks)){if(!sid||sid.length>200||['__proto__','constructor','prototype'].includes(sid))invalid();result.sessionBooks[sid]=ids(list);}}
 if(JSON.stringify(result).length>500000)invalid();return result;
}
export function nativeWorldbooksForRequest(value:NativeWorldbooks|undefined,path:string,body:any,sessionId?:string):NativeWorldbook[]{
 if(!value||path==='probe')return [];const safe=cleanNativeWorldbooks(value),task=nativeTaskForRequest(path,body),ids=sessionId&&safe.sessionBooks?.[sessionId]!==undefined?safe.sessionBooks[sessionId]:task&&safe.taskBooks?.[task]!==undefined?safe.taskBooks[task]!:safe.defaultIds;
 const books=ids.map(id=>safe.books.find(b=>b.id===id)!);assertNativeWorldbooksRuntime(books,{effects:path==='generate'&&!!body?.nativeWorldState,scope:true});return books;
}
export function assertNativeWorldbooksRuntime(books:NativeWorldbook[],support:{effects?:boolean;scope?:boolean}={}){for(const book of books){assertNativeWorldbookOptions(book.worldbook,true);for(const entry of Object.values(book.worldbook.entries) as Record<string,any>[]){if(entry.disable===true)continue;
 if(!support.effects&&['sticky','cooldown','delay'].some(k=>Number(entry[k])!==0&&entry[k]!=null))throw Object.assign(Error('此任务尚未接入跨轮效果（sticky/cooldown/delay）；目前仅正文任务支持，请调整任务绑定；原文件仍保留。'),{code:'NATIVE_WORLD_EFFECT_UNSUPPORTED',status:400});
 const scope=entry.extensions?.academy_scope??book.worldbook.extensions?.academy_scope;
 if(!support.scope&&scope&&scope.mode!=='global')throw Object.assign(Error('此世界书含旧版角色作用范围，当前执行环境不支持。'),{code:'NATIVE_WORLD_SCOPE_UNSUPPORTED',status:400});
}}}
/** Only the execution copy gains the same explicit NPC restriction as the old scope adapter. */
export function projectNativeWorldScopes(books:NativeWorldbook[],actors:{id:string;name:string}[]=[]){
 return cleanNativeWorldbookRequest(books).map(book=>{for(const entry of Object.values(book.worldbook.entries) as Record<string,any>[]){if(entry.disable===true)continue;const scope=nativeWorldScope(entry.extensions?.academy_scope??book.worldbook.extensions?.academy_scope);if(scope?.mode!=='characters')continue;
  const targets=scope.characterIds.map(id=>actors.find(a=>a.id===id));if(!targets.length||targets.some(a=>!a||!a.name))throw Object.assign(Error('世界书指定的作用角色未登记，请在作用范围中重新选择。'),{code:'NATIVE_WORLD_SCOPE_UNAVAILABLE',status:400});
  // Keep the leading decorator lines in place; the native parser still interprets them.
  const leading=entry.content.match(/^(?:@@[^\n]*(?:\n|$))*/)?.[0]||'',body=entry.content.slice(leading.length);
  entry.content=leading+(leading&&!leading.endsWith('\n')?'\n':'')+'Scope: apply the following lore only to these NPCs, never to other actors: '+JSON.stringify(targets.map(a=>({id:a!.id,name:a!.name})))+'\n'+body;
 }return book;});
}
export function cleanNativeWorldbookRequest(value:unknown):NativeWorldbook[]{if(value===undefined)return [];if(!Array.isArray(value))invalid();return cleanNativeWorldbooks({version:1,books:value,defaultIds:[]}).books;}
export function removeNativeWorldbook(value:NativeWorldbooks,id:string){const next=cleanNativeWorldbooks(value);if([next.defaultIds,...Object.values(next.taskBooks||{}),...Object.values(next.sessionBooks||{})].some(list=>list.includes(id)))throw Error('此世界书已绑定，请先解除绑定。');next.books=next.books.filter(b=>b.id!==id);return next;}
/** Appended sessions keep explicit bindings; conflicting imported book identities get fresh IDs. */
export function mergeNativeWorldbooks(current:NativeWorldbooks|undefined,incoming:NativeWorldbooks|undefined){
 if(!incoming)return current?cleanNativeWorldbooks(current):undefined;if(!current)return cleanNativeWorldbooks(incoming);
 const out=cleanNativeWorldbooks(current),source=cleanNativeWorldbooks(incoming),map=new Map<string,string>();
 for(const book of source.books){const same=out.books.find(b=>b.id===book.id);if(same&&JSON.stringify(same.worldbook)===JSON.stringify(book.worldbook)){map.set(book.id,same.id);continue;}const added={...book,id:same?crypto.randomUUID():book.id};out.books.push(added);map.set(book.id,added.id);}
 out.sessionBooks={...out.sessionBooks,...Object.fromEntries(Object.entries(source.sessionBooks||{}).map(([sid,list])=>[sid,list.map(id=>map.get(id)!)]))};return cleanNativeWorldbooks(out);
}
/** Native hashes include the book identity. Refuse this merge until a native rehash migration exists. */
export function assertNativeWorldStateMerge(current:NativeWorldbooks|undefined,incoming:NativeWorldbooks|undefined,sessions:{turns:{variants:{nativeWorldInfo?:unknown}[]}[]}[]){
 if(!current||!incoming||!sessions.some(s=>s.turns.some(t=>t.variants.some(v=>v.nativeWorldInfo!==undefined))))return;
 if(incoming.books.some(b=>current.books.some(a=>a.id===b.id&&JSON.stringify(a.worldbook)!==JSON.stringify(b.worldbook))))throw Error('导入备份含跨轮状态，且世界书 ID 与本机不同内容冲突。请使用覆盖恢复或在独立工作区导入；本机数据未修改。');
}
