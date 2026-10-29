import type {Persona} from './contracts';
import {normalizePersona,blankPersona} from './persona.ts';
import {cleanAvatarAppearance,type AvatarAppearance} from './avatarAppearance.ts';
import {cleanCharacterImages,imageUrl,type CharacterImage} from './characterImages.ts';
import {cleanNativePresetConfig,assertNativePresetDraftSafe,type NativePresetConfig} from './nativePreset.ts';

export interface BackupPersona {id:string;name:string;persona:Persona;updatedAt:string;memo?:string;remark?:string;sourceSessionIds?:string[];avatarAppearance?:AvatarAppearance;useAsHomeImage?:boolean;portrait?:string;avatar?:string}
export interface BackupArchive {
 version:1;
 nativeWorldInfoVersion?:1;
 terminalTaskVersion?:1;
 nativePreset?:NativePresetConfig|null;
 editorDrafts?:Record<string,string>;
 personas?:BackupPersona[];
 draft?:BackupPersona|null;
 masterPersona?:{name:string;department:string;spiritLevel:string;personaId?:string}|null;
 homeImageFileId?:string|null;
 hiddenPersonaSessionIds?:string[];
 nicknameImages?:Record<string,string>;
 characterImages?:Record<string,CharacterImage>;
 newGameDraft?:{title:string;opening:string;wish:string;persona:Persona};
}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function fail():never{throw Error('备份附加资料格式不正确或版本过新，请更新页面后再试。');}
const safeId=(v:unknown,empty=false):v is string=>typeof v==='string'&&(empty||!!v)&&v.length<=200&&!['__proto__','prototype','constructor'].includes(v);
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))fail();}
export function assertBackupSnapshotFields(v:object){if(Object.keys(v).some(k=>!['version','sessions','preferences','archive'].includes(k)))throw Error('存在尚未接入备份的数据字段，已停止导出以避免遗漏。');}
function personaText(v:unknown,requireName:boolean){normalizePersona(v,requireName);return {...blankPersona(),...Object.fromEntries(Object.entries(v as object).filter(([,text])=>typeof text==='string'))} as Persona;}
function ids(v:unknown):string[]{if(!Array.isArray(v)||v.some(id=>!safeId(id))||new Set(v).size!==v.length)fail();return [...v];}
export function cleanBackupPersona(v:unknown,draft=false):BackupPersona{
 if(!object(v))fail();keys(v,['id','name','persona','updatedAt','memo','remark','sourceSessionIds','avatarAppearance','useAsHomeImage','portrait','avatar']);
 if(!safeId(v.id,draft)||typeof v.name!=='string'||typeof v.updatedAt!=='string')fail();
 const result:BackupPersona={id:v.id,name:v.name,persona:personaText(v.persona,!draft),updatedAt:v.updatedAt};
 for(const k of ['memo','remark'] as const)if(v[k]!==undefined){if(typeof v[k]!=='string')fail();result[k]=v[k];}
 if(v.sourceSessionIds!==undefined)result.sourceSessionIds=ids(v.sourceSessionIds);
 if(v.avatarAppearance!==undefined)result.avatarAppearance=cleanAvatarAppearance(v.avatarAppearance);
 if(v.useAsHomeImage!==undefined){if(typeof v.useAsHomeImage!=='boolean')fail();result.useAsHomeImage=v.useAsHomeImage;}
 for(const k of ['portrait','avatar'] as const)if(v[k]!==undefined){if(typeof v[k]!=='string'||!/^data:(?:image\/[a-z0-9.+-]+|application\/octet-stream);base64,[A-Za-z0-9+/]*={0,2}$/i.test(v[k]))fail();result[k]=v[k];}
 return result;
}
export function cleanBackupArchive(v:unknown):BackupArchive{
 if(!object(v)||v.version!==1)fail();keys(v,['version','nativeWorldInfoVersion','terminalTaskVersion','nativePreset','editorDrafts','personas','draft','masterPersona','homeImageFileId','hiddenPersonaSessionIds','nicknameImages','characterImages','newGameDraft']);
 const result:BackupArchive={version:1};
 if(v.nativeWorldInfoVersion!==undefined){if(v.nativeWorldInfoVersion!==1)fail();result.nativeWorldInfoVersion=1;}
 if(v.terminalTaskVersion!==undefined){if(v.terminalTaskVersion!==1)fail();result.terminalTaskVersion=1;}
 if(v.nativePreset!==undefined)result.nativePreset=v.nativePreset===null?null:cleanNativePresetConfig(v.nativePreset);
 if(v.editorDrafts!==undefined)result.editorDrafts=cleanEditorDrafts(v.editorDrafts);
 if(v.personas!==undefined){if(!Array.isArray(v.personas))fail();result.personas=v.personas.map((p:unknown)=>cleanBackupPersona(p));if(new Set(result.personas.map(p=>p.id)).size!==result.personas.length)fail();}
 if(v.draft!==undefined)result.draft=v.draft===null?null:cleanBackupPersona(v.draft,true);
 if(v.masterPersona!==undefined){if(v.masterPersona===null)result.masterPersona=null;else{const m=v.masterPersona;if(!object(m))fail();keys(m,['name','department','spiritLevel','personaId']);if(['name','department','spiritLevel'].some(k=>typeof m[k]!=='string')||m.personaId!==undefined&&!safeId(m.personaId))fail();result.masterPersona={...m} as NonNullable<BackupArchive['masterPersona']>;}}
 if(v.hiddenPersonaSessionIds!==undefined)result.hiddenPersonaSessionIds=ids(v.hiddenPersonaSessionIds);
 if(v.homeImageFileId!==undefined){if(v.homeImageFileId!==null&&!safeId(v.homeImageFileId))fail();result.homeImageFileId=v.homeImageFileId;}
 if(v.nicknameImages!==undefined){if(!object(v.nicknameImages))fail();result.nicknameImages={};for(const [name,url] of Object.entries(v.nicknameImages)){if(!name.trim()||name.length>80||['__proto__','prototype','constructor'].includes(name)||typeof url!=='string')fail();try{result.nicknameImages[name]=imageUrl(url);}catch{fail();}}}
 if(v.characterImages!==undefined)result.characterImages=cleanCharacterImages(v.characterImages);
 if(v.newGameDraft!==undefined){const d=v.newGameDraft;if(!object(d))fail();keys(d,['title','opening','wish','persona']);if(['title','opening','wish'].some(k=>typeof d[k]!=='string'))fail();result.newGameDraft={title:d.title,opening:d.opening,wish:d.wish,persona:personaText(d.persona,false)};}
 return result;
}
/** Session IDs change on append-import; archive identities must follow the same mapping. */
export function remapBackupArchive(source:BackupArchive,sessionIds:Map<string,string>):BackupArchive{
 const next=cleanBackupArchive(source);
 if(next.nativePreset?.worldbooks){const books=next.nativePreset.worldbooks;books.sessionBooks=Object.fromEntries([...sessionIds].map(([old,id])=>[id,books.sessionBooks?.[old]??books.taskBooks?.story??books.defaultIds]));}
 if(next.editorDrafts)next.editorDrafts=Object.fromEntries(Object.entries(next.editorDrafts).flatMap(([key,text])=>{if(!key.startsWith('session-persona:'))return [[key,text]];const mapped=sessionIds.get(key.slice('session-persona:'.length));return mapped?[['session-persona:'+mapped,text]]:[];}));
 const remap=(p:BackupPersona)=>{if(p.sourceSessionIds)p.sourceSessionIds=p.sourceSessionIds.flatMap(id=>sessionIds.has(id)?[sessionIds.get(id)!]:[]);};
 next.personas?.forEach(remap);if(next.draft)remap(next.draft);
 if(next.hiddenPersonaSessionIds)next.hiddenPersonaSessionIds=next.hiddenPersonaSessionIds.flatMap(id=>sessionIds.has(id)?[sessionIds.get(id)!]:[]);
 const master=next.masterPersona;if(master?.personaId?.startsWith('session/')){const id=sessionIds.get(master.personaId.slice(8));if(id)master.personaId='session/'+id;else delete master.personaId;}
 return next;
}
/** Local legacy inspection may read shape-valid bytes; transfer validation remains stricter. */
export function cleanEditorDraftShape(raw:unknown):Record<string,string>{if(!object(raw)||Object.keys(raw).length>1000)fail();let size=0;const out:Record<string,string>={};for(const [key,text]of Object.entries(raw)){if(!/^(?:new-game|(?:session-persona|preset):[^\r\n]{1,200})$/.test(key)||typeof text!=='string'||text.length>600000)fail();size+=text.length;if(size>3000000)fail();out[key]=text;}return out;}
export function cleanEditorDrafts(raw:unknown):Record<string,string>{const out=cleanEditorDraftShape(raw);if(out['preset:native-runtime']!==undefined)assertNativePresetDraftSafe(out['preset:native-runtime']);return out;}
export function cloudBackupArchive(source:BackupArchive):BackupArchive{
 const next=cleanBackupArchive(source);
 if(next.nativePreset?.worldbooks&&/(?:data:image\/|blob:https?:)/i.test(JSON.stringify(next.nativePreset.worldbooks)))throw Error('原生世界书包含本机图片内容，请改为图片 URL 后上传；完整原文可先下载到本机。');
 for(const p of [...next.personas||[],...next.draft?[next.draft]:[]]){delete p.portrait;delete p.avatar;}
 if(next.nicknameImages)next.nicknameImages=Object.fromEntries(Object.entries(next.nicknameImages).filter(([,url])=>/^https?:\/\//i.test(url)));
 if(next.characterImages)next.characterImages=Object.fromEntries(Object.entries(next.characterImages).filter(([,v])=>/^https?:\/\//i.test(v.url)));
 return next;
}
