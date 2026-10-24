import type {Session,Preferences,Snapshot} from './contracts';
import {emptyTerminal} from './personalTerminal.ts';
import {backup,parseBackup,defaults,copy} from './story.ts';
export interface CloudSave {schema:'stellar-cloud-save-v1';savedAt:string;snapshot:{version:1;sessions:Session[];preferences:Preferences};nicknameImages:Record<string,string>}
/** Embedded image bytes never leave the device. Story text and remote image links remain intact. */
function withoutEmbeddedMedia(value:unknown):unknown{
 if(typeof value==='string')return value.replace(/data:image\/[a-z0-9.+-]+(?:;[^,\s"'<>]*)?,[^\s"'<>)]*/gi,'').replace(/blob:https?:\/\/[^\s"'<>)]*/gi,'');
 if(Array.isArray(value))return value.map(withoutEmbeddedMedia);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)).map(([k,v])=>[k,withoutEmbeddedMedia(v)]));
 return value;
}
export function remoteImage(value:unknown){if(typeof value!=='string'||value.length>8192)return '';try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?value:'';}catch{return '';}}
export function createCloudSave(source:Session|Snapshot,preferences:Preferences,nicknameImages:Record<string,string>={}):string{
 const sessions='sessions' in source?source.sessions:[source];
 const p=copy(preferences),apiDefaults=defaults();
 for(const key of ['profiles','auxiliaryProfiles','stateProfile','mainProfile','auxiliaryProfile','embeddingProfile','storyProfile','summaryProfile','suggestionsProfile','personaProfile','terminalProfile','randomEventProfile','forumReplyProfile'] as const)Object.assign(p,{[key]:apiDefaults[key]});
 p.characterImages=Object.fromEntries(Object.entries(preferences.characterImages||{}).filter(([,v])=>remoteImage(v.url)));
 const cleaned=withoutEmbeddedMedia(copy(sessions)) as Session[];
 for(const session of cleaned)if(session.terminal){session.terminal.avatar=remoteImage(session.terminal.avatar);if(!session.terminal.avatar)delete session.terminal.avatarView;}
 const snapshot=parseBackup(backup({version:1,sessions:cleaned,preferences:withoutEmbeddedMedia(p) as Preferences}));
 const value:CloudSave={schema:'stellar-cloud-save-v1',savedAt:new Date().toISOString(),snapshot,nicknameImages:Object.fromEntries(Object.entries(nicknameImages).filter(([name,url])=>name.trim()&&name.length<=80&&remoteImage(url)))};
 return JSON.stringify(value);
}
export function parseCloudSave(text:string):CloudSave{
 const value=JSON.parse(text);if(value?.schema!=='stellar-cloud-save-v1'||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw Error('不是兼容的云端存档备份。');
 const snapshot=parseBackup(JSON.stringify(value.snapshot));
 if(JSON.stringify(withoutEmbeddedMedia(value))!==JSON.stringify(value))throw Error('云端备份含本地图片数据，不支持直接恢复。');
 const nicknameImages:Record<string,string>={};if(value.nicknameImages!==undefined){if(!value.nicknameImages||typeof value.nicknameImages!=='object'||Array.isArray(value.nicknameImages))throw Error('昵称头像格式不正确。');for(const [name,url] of Object.entries(value.nicknameImages)){if(!name.trim()||name.length>80||['__proto__','constructor','prototype'].includes(name)||!remoteImage(url))throw Error('昵称头像链接不正确。');nicknameImages[name]=url as string;}}
 return {schema:'stellar-cloud-save-v1',savedAt:value.savedAt,snapshot,nicknameImages};
}
export function mergeCloudSession(current:Session,incoming:Session){const next=copy(incoming);next.id=current.id;
 // Imported uploads omit local terminal avatar bytes. Preserve the local display in that case.
 if(current.terminal?.avatar&&!next.terminal?.avatar){next.terminal||=emptyTerminal();next.terminal.avatar=current.terminal.avatar;next.terminal.avatarView=copy(current.terminal.avatarView);}
 next.updatedAt=new Date().toISOString();return next;
}
