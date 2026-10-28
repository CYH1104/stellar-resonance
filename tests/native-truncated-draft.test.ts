// Regression copied unchanged from the independent failing acceptance.
import {it,expect} from 'vitest';
import {assertNativePresetDraftSafe,encodeNativePresetDraft,decodeNativePresetDraft} from '../src/domain/nativePreset';
import {cleanEditorDrafts} from '../src/domain/backupArchive';
import {backup,defaults} from '../src/domain/story';
import {createCloudSave} from '../src/domain/cloudBackup';
const canary='SYNTHETIC_TRUNCATED_REVIEW_NOT_A_KEY';
const text=JSON.stringify({schema:'native-preset-draft-v1',rawText:JSON.stringify({api_key:canary})}).slice(0,-1);
const config={version:1 as const,preset:{prompts:[{identifier:'main',content:'safe',role:'system'}],prompt_order:[]}};
const snapshot={version:1 as const,sessions:[],preferences:defaults(),archive:{version:1 as const,editorDrafts:{'preset:native-runtime':text}}};
it('rejects a recognizable but truncated envelope containing an escaped credential',()=>{expect(()=>assertNativePresetDraftSafe(text)).toThrow();});
it('rejects the same pasted truncated envelope before editor persistence',()=>{expect(()=>encodeNativePresetDraft(config,text)).toThrow();});
it('rejects a damaged nested draft before local export',()=>{expect(()=>backup(snapshot)).toThrow();});
it('rejects a damaged nested draft before cloud encoding',()=>{expect(()=>createCloudSave(snapshot,defaults())).toThrow();});
it('keeps ordinary incomplete raw drafts recoverable',()=>{const safe='{"prompts":[';expect(cleanEditorDrafts({'preset:native-runtime':safe})['preset:native-runtime']).toBe(safe);expect(encodeNativePresetDraft(config,safe)).toContain('rawText');});
it('restores legacy bare unfinished raw text without activating it or losing editable content',()=>{const safe='{"prompts":[';expect(decodeNativePresetDraft(safe,config)).toEqual({config,rawText:safe});});
it('still blocks complete and direct unfinished credential fields',()=>{for(const raw of ['{"api_key":"'+canary+'"}','{"Authorization":"Bearer '+canary])expect(()=>encodeNativePresetDraft(config,raw)).toThrow('凭据');});
it('blocks generic key/token credentials while retaining native worldbook keyword arrays',()=>{for(const raw of ['{"key":"'+canary+'"}','{"token":"'+canary])expect(()=>encodeNativePresetDraft(config,raw)).toThrow('凭据');expect(()=>encodeNativePresetDraft(config,'{"entries":{"0":{"key":["keyword"],"content":"draft')).not.toThrow();});
it('rejects reordered, escaped, nested and partially quoted envelopes without blocking normal prompt strings',()=>{
 const variants=[JSON.stringify({rawText:JSON.stringify({api_key:canary}),schema:'native-preset-draft-v1'}).slice(0,-1),text.replace('schema','\\u0073chema'),text.replace('rawText','\\u0072awText'),text.slice(0,-6),'{"rawText":"{\\"api_key\\":\\"'+canary];
 for(const raw of variants)for(const wrap of [(s:string)=>s,(s:string)=>encodeNativePresetDraft(config,s),(s:string)=>JSON.stringify({schema:'native-preset-draft-v1',config,rawText:s})])expect(()=>assertNativePresetDraftSafe(wrap(raw))).toThrow();
 expect(()=>encodeNativePresetDraft(config,'{"prompts":[{"content":"an example mentions \\\"api_key\\\": but has no credential field"}]}')).not.toThrow();
});
it('bounds string decoding recursion and rejects unsupported envelopes before transfer',()=>{
 let raw='safe';for(let i=0;i<18;i++)raw=JSON.stringify(raw);expect(()=>assertNativePresetDraftSafe(raw)).toThrow('无法校验');
 expect(()=>encodeNativePresetDraft(config,JSON.stringify({schema:'native-preset-draft-v99',config,rawText:'{}'}))).toThrow();
});
