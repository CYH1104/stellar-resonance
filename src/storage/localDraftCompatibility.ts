import {cleanEditorDraftShape} from '../domain/backupArchive';
import {assertNativePresetDraftSafe} from '../domain/nativePreset';
import {backup,parseBackup} from '../domain/story';
export const nativeDraftKey='preset:native-runtime';
/** Projection only: original bytes stay untouched until an explicit cleanup transaction. */
export function localEditorDrafts(raw:unknown){
 const safe=cleanEditorDraftShape(raw);let blocked=false;
 if(safe[nativeDraftKey]!==undefined)try{assertNativePresetDraftSafe(safe[nativeDraftKey]);}catch(e){if((e as {code?:string}).code!=='NATIVE_DRAFT_CREDENTIALS')throw e;delete safe[nativeDraftKey];blocked=true;}
 return {safe,blocked};
}
export function localSnapshot(raw:any){
 let blocked=false,projection=raw;
 if(raw?.archive?.editorDrafts!==undefined){const result=localEditorDrafts(raw.archive.editorDrafts);blocked=result.blocked;projection={...raw,archive:{...raw.archive,editorDrafts:result.safe}};}
 return {value:projection?.version===1?parseBackup(backup(projection)):parseBackup(JSON.stringify(projection)),blocked};
}
