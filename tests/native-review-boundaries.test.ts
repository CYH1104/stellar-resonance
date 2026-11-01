// Original independent acceptance expectations retained as regressions.
import {it,expect,vi} from 'vitest';
import {assertNativePresetDraftSafe,encodeNativePresetDraft,decodeNativePresetDraft,cleanNativePresetConfig} from '../src/domain/nativePreset';
import {backup,defaults} from '../src/domain/story';
import {createCloudSave} from '../src/domain/cloudBackup';
import {cleanNativeWorldbook,readNativeWorldbookFile,NATIVE_WORLD_FILE_LIMIT_BYTES} from '../src/domain/nativeWorldbooks';
const marker='SYNTHETIC_COMPLETE_WRAPPER_NOT_A_KEY',config={version:1 as const,preset:{prompts:[],prompt_order:[]}};
const payload=JSON.stringify({rawText:JSON.stringify({api_key:marker})});
for(const [name,text]of [['missing schema',payload],['unrecognized schema',JSON.stringify({schema:'other-format',rawText:JSON.stringify({api_key:marker})})],['non-string schema',JSON.stringify({schema:1,rawText:JSON.stringify({api_key:marker})})]])it('rejects credentials in a complete wrapper with '+name,()=>{expect(()=>assertNativePresetDraftSafe(text)).toThrow();expect(()=>encodeNativePresetDraft(config,text)).toThrow();});
const draft=JSON.stringify({schema:'native-preset-draft-v1',config,rawText:payload}),snapshot={version:1 as const,sessions:[],preferences:defaults(),archive:{version:1 as const,editorDrafts:{'preset:native-runtime':draft}}};
it('rejects a complete schema-less wrapper before local backup',()=>{expect(()=>backup(snapshot)).toThrow();});
it('rejects a complete schema-less wrapper before cloud encoding',()=>{expect(()=>createCloudSave(snapshot,defaults())).toThrow();});
it('retains the previous truncated-envelope rejection and ordinary unfinished-text recovery',()=>{expect(()=>assertNativePresetDraftSafe(JSON.stringify({schema:'native-preset-draft-v1',rawText:JSON.stringify({api_key:marker})}).slice(0,-1))).toThrow();expect(decodeNativePresetDraft('{"prompts":[',config).rawText).toBe('{"prompts":[');});
it('a compact Chinese book below the declared character limit is valid even when UTF-8 exceeds 500000 bytes',()=>{const book={entries:{0:{uid:0,key:[],content:'字'.repeat(180000),constant:true}}},text=JSON.stringify(book);expect(text.length).toBeLessThan(500000);expect(new TextEncoder().encode(text).length).toBeGreaterThan(500000);expect(cleanNativeWorldbook(book)).toEqual(book);expect(cleanNativePresetConfig({...config,worldbooks:{version:1,books:[{id:'book',name:'中文书',worldbook:book}],defaultIds:[]}}).worldbooks!.books).toHaveLength(1);});
it('checks nested, escaped and array-held text independently of schema and rejects invalid text metadata',()=>{
 const wrapped=[{extensions:{rawText:payload}},[{rawText:payload}],{schema:false,rawText:JSON.stringify({rawText:payload})},{rawText:JSON.stringify({api_key:marker})},JSON.parse('{"raw\\u0054ext":'+JSON.stringify(JSON.stringify({api_key:marker}))+'}')];
 for(const raw of wrapped)expect(()=>encodeNativePresetDraft(config,JSON.stringify(raw))).toThrow();
 expect(()=>encodeNativePresetDraft(config,'{"rawText":'+JSON.stringify(payload)+',"rawText":"safe"}')).toThrow();
 expect(()=>encodeNativePresetDraft(config,JSON.stringify({RawText:payload}))).toThrow();
 for(const rawText of [null,3,{},[JSON.stringify({api_key:marker})]])expect(()=>encodeNativePresetDraft(config,JSON.stringify({rawText}))).toThrow('无法校验');
 expect(()=>encodeNativePresetDraft(config,JSON.stringify({rawText:'a safe ordinary note'}))).not.toThrow();
});
it('reads valid Chinese UTF-8 and BOM files within a separate byte preflight',async()=>{
 const raw={entries:{0:{uid:0,key:[],content:'字'.repeat(180000),constant:true}}};for(const prefix of ['', '\uFEFF']){const text=prefix+JSON.stringify(raw),file=new Blob([text]);expect(file.size).toBeGreaterThan(500000);expect(await readNativeWorldbookFile(file)).toEqual(raw);}
});
it('rejects files above 5 MiB before reading and accepts valid books above the former character limit',async()=>{
 const text=vi.fn(async()=>'{"entries":{}}');await expect(readNativeWorldbookFile({size:NATIVE_WORLD_FILE_LIMIT_BYTES+1,text})).rejects.toThrow('5 MB');expect(text).not.toHaveBeenCalled();
 const raw={entries:Object.fromEntries([0,1,2].map(uid=>[uid,{uid,key:[],content:'a'.repeat(180000)}]))},file=new Blob([JSON.stringify(raw)]);expect(file.size).toBeLessThan(NATIVE_WORLD_FILE_LIMIT_BYTES);await expect(readNativeWorldbookFile(file)).resolves.toEqual(raw);const oversized={entries:{0:{uid:0,key:[],content:'字'.repeat(1800000)}}};expect(()=>cleanNativeWorldbook(oversized)).toThrow('5 MB');
});
it('retains a valid deep native extension when adding the draft envelope',()=>{
 let extension:unknown='safe';for(let i=0;i<23;i++)extension={nested:extension};const safe=cleanNativePresetConfig({...config,preset:{...config.preset,extension}});
 expect(decodeNativePresetDraft(encodeNativePresetDraft(safe,'{"prompts":['),safe).config).toEqual(safe);
});
