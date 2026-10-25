import {PersonaLibrary,personaLibraryStamp,type PersonaFile} from './personaLibrary';
import {accountStorage,accountDatabase} from './accountScope';
import {cleanBackupArchive,cleanBackupPersona,type BackupArchive,type BackupPersona} from '../domain/backupArchive';
import {refreshLocalCharacterImages} from '../app/localCharacterImages';
import {refreshNicknameImages} from '../app/localNicknameImages';

const metadata={masterPersona:'academy:master-persona:v1',homeImageFileId:'academy:master-image-file',hiddenPersonaSessionIds:'academy:persona-hidden-sessions:v1',nicknameImages:'terminal-nickname-images',characterImages:'character-images'} as const;
const baselines=new WeakMap<BackupArchive,{revision:string;metadata:string}>();
function readMetadata(){return Object.fromEntries(Object.values(metadata).map(key=>[key,accountStorage.getItem(key)])) as Record<string,string|null>;}
async function encodeBlob(blob:Blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:'+(blob.type||'application/octet-stream')+';base64,'+btoa(binary);}
function decodeBlob(text:string){const comma=text.indexOf(','),binary=atob(text.slice(comma+1));return new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:text.slice(5,comma).split(';')[0]});}
async function encodeFile(file:PersonaFile,draft=false){const {portrait,avatar,...text}=file;return cleanBackupPersona({...text,...(portrait?{portrait:await encodeBlob(portrait)}:{}),...(avatar?{avatar:await encodeBlob(avatar)}:{})},draft);}
function decodeFile(file:BackupPersona):PersonaFile{const {portrait,avatar,...text}=file;return {...text,...(portrait?{portrait:decodeBlob(portrait)}:{}),...(avatar?{avatar:decodeBlob(avatar)}:{})};}
function notify(){refreshNicknameImages();refreshLocalCharacterImages();if(typeof window!=='undefined'){const text=accountStorage.getItem(metadata.masterPersona);window.dispatchEvent(new CustomEvent('academy:master-persona',{detail:text?JSON.parse(text):{name:'',department:'',spiritLevel:''}}));window.dispatchEvent(new Event('academy:persona-avatar-updated'));const id=accountStorage.getItem(metadata.homeImageFileId);void new PersonaLibrary().list().then(files=>{if(accountStorage.getItem(metadata.homeImageFileId)!==id)return;const file=files.find(f=>f.id===id);window.dispatchEvent(new CustomEvent('academy:persona-image',{detail:{image:file?.useAsHomeImage?file.portrait||null:null}}));}).catch(()=>{});}}

/** A consistent archive read; never silently substitute an empty library after a storage error. */
export async function collectWorkspaceArchive(newGameDraft?:BackupArchive['newGameDraft']):Promise<BackupArchive>{
 const scope=accountDatabase('backup'),library=new PersonaLibrary(),meta=readMetadata(),state=await library.readBackupState();
 const personas=await Promise.all(state.files.map(f=>encodeFile(f))),draft=state.draft?await encodeFile(state.draft,true):null;
 const after=await library.readBackupState();
 if(scope!==accountDatabase('backup')||state.revision!==after.revision||personaLibraryStamp(state.files,state.draft)!==personaLibraryStamp(after.files,after.draft)||JSON.stringify(meta)!==JSON.stringify(readMetadata()))throw Error('备份期间人设或设置发生变化，请重试。');
 const result=cleanBackupArchive({version:1,personas,draft,masterPersona:meta[metadata.masterPersona]?JSON.parse(meta[metadata.masterPersona]!):null,homeImageFileId:meta[metadata.homeImageFileId],hiddenPersonaSessionIds:JSON.parse(meta[metadata.hiddenPersonaSessionIds]||'[]'),nicknameImages:JSON.parse(meta[metadata.nicknameImages]||'{}'),characterImages:JSON.parse(meta[metadata.characterImages]||'{}'),...(newGameDraft?{newGameDraft}:{})});
 baselines.set(result,{revision:state.revision,metadata:JSON.stringify(meta)});return result;
}

/** Apply independently stored archives with a rollback handle for the workspace transaction. */
export async function applyWorkspaceArchive(source:BackupArchive,mode:'replace'|'merge',preserveMedia=false,expected?:BackupArchive):Promise<{undo:()=>Promise<void>}>{
 const next=cleanBackupArchive(source),library=new PersonaLibrary(),before=await library.readBackupState(),meta=readMetadata(),scope=accountDatabase('backup');
 const baseline=expected&&baselines.get(expected);if(baseline&&(baseline.revision!==before.revision||baseline.metadata!==JSON.stringify(meta)))throw Error('备份后人设或设置已被其他页面修改，恢复已停止。');
 let files=before.files,draft=before.draft;
 const personaIds=new Map<string,string>();
 if(next.personas){
  const incoming=next.personas.map(decodeFile);
  if(mode==='merge'){
   files=[...files];for(const file of incoming){const original=file.id;if(files.some(f=>f.id===file.id))file.id=crypto.randomUUID();personaIds.set(original,file.id);files.push(file);}
  }else files=incoming.map(file=>{const old=before.files.find(f=>f.id===file.id);if(preserveMedia&&old){file.portrait||=old.portrait;file.avatar||=old.avatar;}return file;});
 }
 if(next.draft!==undefined){draft=next.draft?decodeFile(next.draft):undefined;if(draft&&personaIds.has(draft.id))draft.id=personaIds.get(draft.id)!;if(preserveMedia&&draft&&before.draft?.id===draft.id){draft.portrait||=before.draft.portrait;draft.avatar||=before.draft.avatar;}}
 const values={...meta};
 for(const field of Object.keys(metadata) as (keyof typeof metadata)[]){
  if(next[field]===undefined)continue;let value:any=next[field];
  if(field==='masterPersona'&&value?.personaId&&personaIds.has(value.personaId))value={...value,personaId:personaIds.get(value.personaId)};
  if(field==='homeImageFileId'&&value&&personaIds.has(value))value=personaIds.get(value);
  if(mode==='merge'){
   const old=meta[metadata[field]]?(field==='homeImageFileId'?meta[metadata[field]]:JSON.parse(meta[metadata[field]]!)):null;
   if(field==='masterPersona'&&old)value=old;
   if(field==='homeImageFileId'&&old)value=old;
   if(field==='hiddenPersonaSessionIds')value=[...new Set([...(old||[]),...value])];
   if(field==='nicknameImages'||field==='characterImages')value={...(old||{}),...value};
  }else if(preserveMedia&&(field==='nicknameImages'||field==='characterImages')){
   const old=JSON.parse(meta[metadata[field]]||'{}');
   const local=Object.fromEntries(Object.entries(old).filter(([,v])=>typeof v==='string'?v.startsWith('data:'):!!v&&typeof v==='object'&&String((v as any).url).startsWith('data:')));
   value={...local,...value};
  }
  values[metadata[field]]=value===null?null:field==='homeImageFileId'?value:JSON.stringify(value);
 }
 const writeMetadata=(value:Record<string,string|null>)=>{for(const [key,text] of Object.entries(value))if(text===null)accountStorage.removeItem(key);else accountStorage.setItem(key,text);notify();};
 const stamp=personaLibraryStamp(before.files,before.draft);let applied=false,appliedRevision='',metadataCommitted=false;
 const undo=async()=>{
  if(scope!==accountDatabase('backup'))throw Error('账号已改变，恢复已停止。');
  if(metadataCommitted&&JSON.stringify(values)!==JSON.stringify(readMetadata()))throw Error('恢复后的设置已被其他页面修改，已停止自动回退。');
  if(applied){await library.replace(before.files,before.draft,personaLibraryStamp(files,draft),appliedRevision);applied=false;}
  writeMetadata(meta);
 };
 try{
  if(scope!==accountDatabase('backup')||JSON.stringify(meta)!==JSON.stringify(readMetadata()))throw Error('设置已被其他页面修改，请重试。');
  appliedRevision=await library.replace(files,draft,stamp,before.revision);applied=true;writeMetadata(values);metadataCommitted=true;return {undo};
 }catch(error){if(applied)await undo();throw error;}
}
