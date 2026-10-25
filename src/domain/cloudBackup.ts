import {cloudBackupArchive,assertBackupSnapshotFields} from './backupArchive.ts';
import type {Session,Preferences,Snapshot} from './contracts';
import {emptyTerminal} from './personalTerminal.ts';
import {backup,parseBackup,defaults,copy} from './story.ts';
export interface CloudSave {schema:'stellar-cloud-save-v1'|'stellar-cloud-save-v2';savedAt:string;snapshot:Snapshot;nicknameImages:Record<string,string>}
/** Embedded image bytes never leave the device. Story text and remote image links remain intact. */
function withoutEmbeddedMedia(value:unknown):unknown{
 if(typeof value==='string')return value.replace(/data:image\/[a-z0-9.+-]+(?:;[^,\s"'<>]*)?,[^\s"'<>)]*/gi,'').replace(/blob:https?:\/\/[^\s"'<>)]*/gi,'');
 if(Array.isArray(value))return value.map(withoutEmbeddedMedia);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)).map(([k,v])=>[k,withoutEmbeddedMedia(v)]));
 return value;
}
export function remoteImage(value:unknown){if(typeof value!=='string'||value.length>8192)return '';try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?value:'';}catch{return '';}}
export function createCloudSave(source:Session|Snapshot,preferences:Preferences,nicknameImages:Record<string,string>={}):string{
 if('sessions' in source)assertBackupSnapshotFields(source);
 const sessions='sessions' in source?source.sessions:[source];
 const p=copy(preferences),apiDefaults=defaults();
 for(const key of ['profiles','auxiliaryProfiles','stateProfile','mainProfile','auxiliaryProfile','embeddingProfile','storyProfile','summaryProfile','suggestionsProfile','personaProfile','terminalProfile','randomEventProfile','forumReplyProfile'] as const)Object.assign(p,{[key]:apiDefaults[key]});
 p.characterImages=Object.fromEntries(Object.entries(preferences.characterImages||{}).filter(([,v])=>remoteImage(v.url)));
 const cleaned=withoutEmbeddedMedia(copy(sessions)) as Session[];
 for(const session of cleaned)if(session.terminal){session.terminal.avatar=remoteImage(session.terminal.avatar);if(!session.terminal.avatar)delete session.terminal.avatarView;for(const group of session.terminal.conversations||[])if(!remoteImage(group.avatar)){group.avatar='';delete group.avatarPosition;}}
 const archive='sessions' in source&&source.archive?withoutEmbeddedMedia(cloudBackupArchive(source.archive)) as Snapshot['archive']:undefined;
 const snapshot=parseBackup(backup({version:1,sessions:cleaned,preferences:withoutEmbeddedMedia(p) as Preferences,...(archive?{archive}:{})}));
 const value:CloudSave={schema:archive?'stellar-cloud-save-v2':'stellar-cloud-save-v1',savedAt:new Date().toISOString(),snapshot,nicknameImages:Object.fromEntries(Object.entries(nicknameImages).filter(([name,url])=>name.trim()&&name.length<=80&&remoteImage(url)))};
 return JSON.stringify(value);
}
export function parseCloudSave(text:string):CloudSave{
 const value=JSON.parse(text.replace(/^\uFEFF/,''));if(!['stellar-cloud-save-v1','stellar-cloud-save-v2'].includes(value?.schema)||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw Error('不是兼容的云端存档备份。');
 if(value.schema==='stellar-cloud-save-v2'&&(!value.snapshot?.archive||Object.keys(value).some(k=>!['schema','savedAt','snapshot','nicknameImages'].includes(k))))throw Error('完整云端备份缺少资料或格式过新。');
 const snapshot=parseBackup(JSON.stringify(value.snapshot));
 if(JSON.stringify(withoutEmbeddedMedia(value))!==JSON.stringify(value))throw Error('云端备份含本地图片数据，不支持直接恢复。');
 const nicknameImages:Record<string,string>={};if(value.nicknameImages!==undefined){if(!value.nicknameImages||typeof value.nicknameImages!=='object'||Array.isArray(value.nicknameImages))throw Error('昵称头像格式不正确。');for(const [name,url] of Object.entries(value.nicknameImages)){if(!name.trim()||name.length>80||['__proto__','constructor','prototype'].includes(name)||!remoteImage(url))throw Error('昵称头像链接不正确。');nicknameImages[name]=url as string;}}
 return {schema:value.schema,savedAt:value.savedAt,snapshot,nicknameImages};
}
/** Local v1/v2 downloads and cloud v1/v2 files share the same validated workspace model. */
export function parseWorkspaceBackup(text:string):{snapshot:Snapshot;cloud:boolean}{
 const value=JSON.parse(text.replace(/^\uFEFF/,''));
 if(value?.schema){const cloud=parseCloudSave(text);const snapshot=cloud.snapshot;if(!snapshot.archive&&Object.keys(cloud.nicknameImages).length)snapshot.archive={version:1,nicknameImages:cloud.nicknameImages};return {snapshot,cloud:true};}
 return {snapshot:parseBackup(text),cloud:false};
}
export function mergeCloudSession(current:Session,incoming:Session){const next=copy(incoming);next.id=current.id;
 // Imported uploads omit local terminal avatar bytes. Preserve the local display in that case.
 if(current.terminal?.avatar&&!next.terminal?.avatar){next.terminal||=emptyTerminal();next.terminal.avatar=current.terminal.avatar;next.terminal.avatarView=copy(current.terminal.avatarView);}
 for(const group of next.terminal?.conversations||[]){const old=current.terminal?.conversations.find(c=>c.id===group.id);if(old?.avatar&&!group.avatar){group.avatar=old.avatar;if(old.avatarPosition)group.avatarPosition=copy(old.avatarPosition);else delete group.avatarPosition;}}
 next.updatedAt=new Date().toISOString();return next;
}
