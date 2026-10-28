import {cleanNativeJson} from './nativeJson.ts';
import {nativePresetTasks,nativeTaskForRequest,type NativePresetTask} from './nativeTasks.ts';
export interface NativeWorldbook {id:string;name:string;worldbook:Record<string,any>}
export interface NativeWorldbooks {version:1;books:NativeWorldbook[];defaultIds:string[];taskBooks?:Partial<Record<NativePresetTask,string[]>>;sessionBooks?:Record<string,string[]>}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function invalid():never{throw Error('原生世界书格式、版本或绑定不受支持，原数据未修改。');}
export const emptyNativeWorldbooks=():NativeWorldbooks=>({version:1,books:[],defaultIds:[]});
export function cleanNativeWorldbook(value:unknown){
 const raw=cleanNativeJson(value);if(!object(raw)||!object(raw.entries)||Object.keys(raw.entries).length>1000)invalid();
 function credentials(node:any,path=''){if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){if(['key','token'].includes(key.toLowerCase())&&!(key==='key'&&/^entries\/\d+$/.test(path)&&Array.isArray(value)&&value.every(s=>typeof s==='string')))throw Error('原生世界书含凭据字段；关键词 key 仅允许出现在条目关键词数组。');credentials(value,path?path+'/'+key:key);}}credentials(raw);
 for(const [id,entry]of Object.entries(raw.entries)){if(!/^(?:0|[1-9]\d{0,8})$/.test(id)||!object(entry)||entry.uid!==Number(id)||typeof entry.content!=='string'||entry.content.length>200000)invalid();
  for(const k of ['key','keysecondary','triggers'])if(entry[k]!==undefined&&(!Array.isArray(entry[k])||entry[k].some((s:unknown)=>typeof s!=='string')))invalid();
  for(const k of ['disable','constant','selective','useProbability','excludeRecursion','preventRecursion'])if(entry[k]!==undefined&&typeof entry[k]!=='boolean')invalid();
  for(const k of ['order','position','depth','probability','sticky','cooldown','delay'])if(entry[k]!==undefined&&entry[k]!==null&&(!Number.isFinite(entry[k])||Math.abs(entry[k])>100000))invalid();
 }if(JSON.stringify(raw).length>500000)invalid();return raw;
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
 const books=ids.map(id=>safe.books.find(b=>b.id===id)!);assertNativeWorldbooksRuntime(books);return books;
}
export function assertNativeWorldbooksRuntime(books:NativeWorldbook[]){for(const book of books)for(const entry of Object.values(book.worldbook.entries) as Record<string,any>[]){if(entry.disable===true)continue;
 if(['sticky','cooldown','delay'].some(k=>Number(entry[k])!==0&&entry[k]!=null))throw Object.assign(Error('此世界书含尚未接入的跨轮效果（sticky/cooldown/delay），请关闭相应条目后调用；原文件仍保留。'),{code:'NATIVE_WORLD_EFFECT_UNSUPPORTED',status:400});
 const scope=entry.extensions?.academy_scope??book.worldbook.extensions?.academy_scope;
 if(scope&&scope.mode!=='global')throw Object.assign(Error('此世界书含旧版角色作用范围，尚未接入原生调用；请先关闭相应条目或继续保留在旧版资料中。'),{code:'NATIVE_WORLD_SCOPE_UNSUPPORTED',status:400});
}}
export function cleanNativeWorldbookRequest(value:unknown):NativeWorldbook[]{if(value===undefined)return [];if(!Array.isArray(value))invalid();return cleanNativeWorldbooks({version:1,books:value,defaultIds:[]}).books;}
export function removeNativeWorldbook(value:NativeWorldbooks,id:string){const next=cleanNativeWorldbooks(value);if([next.defaultIds,...Object.values(next.taskBooks||{}),...Object.values(next.sessionBooks||{})].some(list=>list.includes(id)))throw Error('此世界书已绑定，请先解除绑定。');next.books=next.books.filter(b=>b.id!==id);return next;}
/** Appended sessions keep explicit bindings; conflicting imported book identities get fresh IDs. */
export function mergeNativeWorldbooks(current:NativeWorldbooks|undefined,incoming:NativeWorldbooks|undefined){
 if(!incoming)return current?cleanNativeWorldbooks(current):undefined;if(!current)return cleanNativeWorldbooks(incoming);
 const out=cleanNativeWorldbooks(current),source=cleanNativeWorldbooks(incoming),map=new Map<string,string>();
 for(const book of source.books){const same=out.books.find(b=>b.id===book.id);if(same&&JSON.stringify(same.worldbook)===JSON.stringify(book.worldbook)){map.set(book.id,same.id);continue;}const added={...book,id:same?crypto.randomUUID():book.id};out.books.push(added);map.set(book.id,added.id);}
 out.sessionBooks={...out.sessionBooks,...Object.fromEntries(Object.entries(source.sessionBooks||{}).map(([sid,list])=>[sid,list.map(id=>map.get(id)!)]))};return cleanNativeWorldbooks(out);
}
