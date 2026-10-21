import {expect,it} from 'vitest';
import {activePromptEntries,newPresetEntries,reorderPresetEntries,cleanPresetParameters,importTavernPreset,exportTavernPreset} from '../src/domain/presets';
import {defaults,backup,parseBackup} from '../src/domain/story';
import {storyApi} from '../src/domain/apis';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import PresetManager from '../src/components/PresetManager.vue';
import type {ViewModel} from '../src/app/useWorkspace';
it('新建预设含固定历史占位，拖动跨过历史时改变真实注入侧，深度注入保持原配置',()=>{
  const entries=newPresetEntries('set','测试'),history=entries.findIndex(p=>p.identifier==='chatHistory'),main=entries.find(p=>p.identifier==='main')!;main.triggers=['continue'];
  const moved=reorderPresetEntries(entries,0,history+1);expect(moved.find(p=>p.identifier==='main')?.position).toBe('after');expect(activePromptEntries(moved,'normal')).not.toContain(main);expect(activePromptEntries(moved,'continue')).toContain(main);
  main.position='in-chat';main.depth=2;const again=reorderPresetEntries(moved,moved.indexOf(main),0);expect(again[0]).toMatchObject({position:'in-chat',depth:2});
});
it('采样参数按预设恢复与备份，不改变 API、辅助任务参数或导入凭据',()=>{
  const p=defaults();p.presetParameters={one:{temperature:0.2,maxTokens:2000},two:{temperature:1.1,maxTokens:5000}};p.activePreset='one';expect(storyApi(p)?.temperature).toBe(0.2);p.activePreset='two';expect(storyApi(p)?.maxTokens).toBe(5000);expect(p.profiles[0].temperature).toBe(0.7);
  const restored=parseBackup(backup({version:1,preferences:p,sessions:[]}));expect(restored.preferences.presetParameters).toEqual(p.presetParameters);expect(cleanPresetParameters({one:{temperature:0.2,apiBaseUrl:'https://blocked.example',model:'do-not-import'}})).toEqual({one:{temperature:0.2}});
});
it('提示词库中未插入项保留文件内容，不参与请求，导出再导入仍保持未插入',()=>{
  const raw={prompts:[{identifier:'main',content:'正文规则'},{identifier:'library',content:'未插入提示词'}],prompt_order:[{character_id:100001,order:[{identifier:'main',enabled:true}]}]};const a=importTavernPreset(JSON.stringify(raw));const library=a.entries.find(p=>p.identifier==='library')!;expect(library.included).toBe(false);expect(activePromptEntries(a.entries).map(p=>p.identifier)).toEqual(['main']);
  const b=importTavernPreset(exportTavernPreset(a.entries,defaults().profiles[0]));expect(b.entries.find(p=>p.identifier==='library')).toMatchObject({included:false,content:'未插入提示词'});
});
it('预设页区分分组和条目操作，提供快捷分组与对话入口，渲染保持交错条目的文件顺序',async()=>{
 const imported=importTavernPreset(JSON.stringify({name:'顺序测试',prompts:[{identifier:'first',name:'第一条目',content:'a'},{identifier:'second',name:'第二条目',content:'b'},{identifier:'third',name:'第三条目',content:'c'}]}));
 const group={id:'group',name:'我的分组',order:0,enabled:true,collapsed:false};imported.entries[0].group={...group};imported.entries[2].group={...group};
 const preferences=defaults();preferences.presets=imported.entries;preferences.activePreset=imported.id;
 const w={preferences,presetEntries:imported.entries,currentPreset:imported.id,presetSets:[{id:imported.id,name:imported.name}],presetWarnings:[],presetParameters:{}} as unknown as ViewModel;
 const html=await renderToString(createSSRApp(PresetManager,{w}));
 expect(html).toContain('新建分组');expect(html).toContain('新建条目');expect(html).toContain('快捷切换分组');expect(html).toContain('使用当前预设进行对话');expect(html).not.toContain('>新建提示词<');
 expect(html.indexOf('class="prompt-title">第一条目')).toBeLessThan(html.indexOf('class="prompt-title">第二条目'));
 expect(html.indexOf('class="prompt-title">第二条目')).toBeLessThan(html.indexOf('class="prompt-title">第三条目'));
});
