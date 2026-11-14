import {afterEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {blankPresetTail,isPresetTail,updatePresetTail,exportTavernPreset,importTavernPreset,activePromptEntries} from '../src/domain/presets';
import {defaults,backup,parseBackup} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {IndexedDbRepository} from '../src/storage/repository';
import PresetTailEntry from '../src/components/PresetTailEntry.vue';
import type {ViewModel} from '../src/app/useWorkspace';
afterEach(()=>vi.unstubAllGlobals());
it('fixed tail starts disabled and empty; simply viewing an old preset does not mutate it',async()=>{
 const p=defaults(),before=JSON.stringify(p),tail=blankPresetTail('legacy','原有预设');
 expect(tail).toMatchObject({enabled:false,content:'',role:'user',position:'after'});expect(activePromptEntries([tail])).toEqual([]);
 const html=await renderToString(createSSRApp(PresetTailEntry,{w:{preferences:p,presetEntries:p.presets,currentPreset:'legacy',presetSets:[{id:'legacy',name:'原有预设'}]} as unknown as ViewModel}));
 expect(html).toContain('固定末尾');expect(html).toContain('最后一条消息的发送身份');expect(html).not.toContain('checked');expect(html).toMatch(/<textarea[^>]*><\/textarea>/);expect(JSON.stringify(p)).toBe(before);
});
it('tail content, selected role and switch survive local/cloud export and Tavern round trips',()=>{
 const p=defaults();const tail=updatePresetTail(p.presets,'legacy','原有预设',{role:'assistant',content:'自行填写\n{{user}}',enabled:true});
 const original=structuredClone(tail);
 for(const prefs of [parseBackup(backup({version:1,sessions:[],preferences:p})).preferences,parseCloudSave(createCloudSave({version:1,sessions:[],preferences:p},p)).snapshot.preferences])expect(prefs.presets.find(isPresetTail)).toEqual(original);
 const json=JSON.parse(exportTavernPreset(p.presets,p.profiles[0]));expect(json.prompt_order[0].order.at(-1).identifier).toBe(tail.identifier);
 expect(importTavernPreset(JSON.stringify(json)).entries.find(isPresetTail)).toMatchObject({role:'assistant',content:tail.content,enabled:true});
 updatePresetTail(p.presets,'legacy','原有预设',{enabled:false});expect(p.presets.filter(isPresetTail)).toHaveLength(1);expect(p.presets.find(isPresetTail)?.content).toBe(original.content);
 const other=updatePresetTail(p.presets,'other','其他预设',{content:'其他预设尾部'});expect(other.enabled).toBe(false);expect(tail.content).toBe(original.content);
});
it('invalid tail settings stop before modifying the preset',()=>{
 const entries=defaults().presets,before=structuredClone(entries);expect(()=>updatePresetTail(entries,'legacy','旧预设',{role:'invalid' as never})).toThrow();expect(entries).toEqual(before);
});
it('actual IndexedDB restore retains both incoming tail and the complete preoverwrite tail',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());const repo=new IndexedDbRepository('preset-tail-'+crypto.randomUUID());await repo.read();
 const p=defaults();updatePresetTail(p.presets,'legacy','旧预设',{role:'system',content:'覆盖前的用户文字',enabled:true});const prior={version:1 as const,sessions:[],preferences:p};await repo.write(prior);
 const incoming=structuredClone(prior);updatePresetTail(incoming.preferences.presets,'legacy','旧预设',{role:'assistant',content:'云端用户文字',enabled:false});
 const downloaded=parseCloudSave(createCloudSave(incoming,incoming.preferences)).snapshot;
 const unlock=await repo.lockRestore();try{await repo.prepareCloudRecovery(prior);await repo.write(downloaded,undefined,true);expect((await repo.read())?.preferences.presets.find(isPresetTail)).toMatchObject({role:'assistant',enabled:false,content:'云端用户文字'});const recovery=await repo.readCloudRecovery('workspace');expect(recovery?.preferences.presets.find(isPresetTail)).toMatchObject({role:'system',enabled:true,content:'覆盖前的用户文字'});await repo.write(recovery!,undefined,true);expect((await repo.read())?.preferences.presets.find(isPresetTail)?.content).toBe('覆盖前的用户文字');}finally{await unlock();}
});
