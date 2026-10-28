import {it,expect,vi,afterEach} from 'vitest';
import {cleanNativePresetConfig,addNativePreset,selectNativePreset,removeNativePreset,nativePresetForRequest,encodeNativePresetDraft,decodeNativePresetDraft} from '../src/domain/nativePreset';
import {defaults,backup,parseBackup} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {cleanEditorDrafts} from '../src/domain/backupArchive';
import {HttpGateway} from '../src/gateway/http';
const raw=(temperature:number)=>({temperature,prompts:[{identifier:'a',role:'system',content:'content',enabled:true,extension:{depth:4}}],prompt_order:[{order:[{identifier:'a',enabled:true}]}],future:{keep:true}});
const library=()=>cleanNativePresetConfig({...addNativePreset({version:1,preset:raw(.2)},raw(.8),'终端专用','phone'),taskPresets:{story:'default',memory:'phone',terminal:'phone',summary:'default'}});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('switches, duplicates and removes without dropping unknown fields or breaking bound task references',()=>{
 const source=library(),next=selectNativePreset(source,'default');expect(next.preset.temperature).toBe(.2);expect(next.presets![0].preset.future).toEqual({keep:true});expect(source.id).toBe('phone');
 expect(()=>removeNativePreset(source,'phone')).toThrow('已绑定');
 const third=addNativePreset(next,raw(.4),'暂用','third'),removed=removeNativePreset(third,'third');expect(removed.id).toBe('default');expect(removed.taskPresets).toEqual(source.taskPresets);expect(removed.presets).toHaveLength(1);
 for(const invalid of [{...source,presets:[{id:'phone',name:'重复',preset:raw(.1)}]},{...source,taskPresets:{story:'missing'}},{...source,taskPresets:{unknown:'phone'}},{...source,presets:[{id:'other',name:'角色',preset:{...raw(.5),api_key:'synthetic'}}]}])expect(()=>cleanNativePresetConfig(invalid)).toThrow();
});
it('selects an isolated raw snapshot for each task and does not transmit the library or bindings',async()=>{
 const source=library(),selected=nativePresetForRequest(source,'generate',{});source.presets![0].preset.temperature=.5;expect(selected.preset.temperature).toBe(.2);expect(Object.keys(selected)).toEqual(['version','preset']);
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({items:['ok']}));}));
 const gateway=new HttpGateway(library);gateway.capabilities.native=true;const profile=defaults().profiles[0],signal=new AbortController().signal;
 await gateway.terminal({task:'synthetic'},profile,'synthetic',signal);await gateway.utility('summary',[],profile,'synthetic',signal);await gateway.utility('suggestions',[],profile,'synthetic',signal);
 expect(calls.map(c=>c.body.nativePreset.preset.temperature)).toEqual([.8,.2,.8]);expect(calls.every(c=>!c.body.nativePreset.presets&&!c.body.nativePreset.taskPresets)).toBe(true);
 const routeMap={'generate':.2,'memory':.8,'personal-terminal':.8,'persona':.8,'random-event':.8,'forum-reply':.8,'probe':.8};for(const [path,temperature]of Object.entries(routeMap))expect(nativePresetForRequest(library(),path,{}).preset.temperature).toBe(temperature);
});
it('round trips complete libraries and unpublished editor state through local and cloud formats, while old single presets remain valid',()=>{
 const value=library(),text=encodeNativePresetDraft(value,JSON.stringify({...value.preset,temperature:.6})),snapshot={version:1 as const,sessions:[],preferences:defaults(),archive:{version:1 as const,nativePreset:value,editorDrafts:{'preset:native-runtime':text}}};
 for(const restored of [parseBackup(backup(snapshot)),parseCloudSave(createCloudSave(snapshot,defaults())).snapshot]){expect(restored.archive!.nativePreset).toEqual(value);const draft=decodeNativePresetDraft(restored.archive!.editorDrafts!['preset:native-runtime'],value);expect(draft.config).toEqual(value);expect(JSON.parse(draft.rawText).temperature).toBe(.6);}
 expect(cleanNativePresetConfig({version:1,preset:raw(.2)})).toEqual({version:1,preset:raw(.2)});expect(decodeNativePresetDraft(JSON.stringify(raw(.4)),value).config.presets).toEqual(value.presets);
 expect(()=>decodeNativePresetDraft(JSON.stringify({schema:'native-preset-draft-v2',config:value,rawText:'{}'}),value)).toThrow();
});
it('rejects credentials inside escaped editor raw text and inactive presets before any draft or backup transfer',()=>{
 for(const rawText of ['{"api_key":"synthetic"}','{"Authorization":"Bearer synthetic','{"\\u0061pi_key":"synthetic"}']){
  const text=JSON.stringify({schema:'native-preset-draft-v1',config:library(),rawText});expect(()=>cleanEditorDrafts({'preset:native-runtime':text})).toThrow('凭据');expect(()=>encodeNativePresetDraft(library(),rawText)).toThrow('凭据');
 }
 const bad=library();bad.presets![0].preset.api_key='synthetic';expect(()=>cleanNativePresetConfig(bad)).toThrow('凭据');
});
