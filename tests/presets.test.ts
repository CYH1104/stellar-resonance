import {expect,it} from 'vitest';
import {importTavernPreset,exportTavernPreset} from '../src/domain/presets';
import {backup,defaults,parseBackup} from '../src/domain/story';
it('含 model 消息角色的预设可完整导入，转换为 assistant 并保留启停位置和备份',()=>{
  const raw={prompts:[{identifier:'reply',role:'model',content:'模型发言'},{identifier:'disabled',role:'model',content:'保留但停用'},{identifier:'chatHistory',marker:true}],prompt_order:[{character_id:100001,order:[{identifier:'chatHistory',enabled:true},{identifier:'reply',enabled:true},{identifier:'disabled',enabled:false}]}]};
  const result=importTavernPreset(JSON.stringify(raw));
  expect(result.entries.find(p=>p.identifier==='reply')).toMatchObject({role:'assistant',content:'模型发言',enabled:true,position:'after'});
  expect(result.entries.find(p=>p.identifier==='disabled')).toMatchObject({role:'assistant',enabled:false});
  expect(result.warnings.join()).toContain('2 条');expect(result.warnings.join()).toContain('model');
  const p=defaults();p.presets=result.entries;
  const restored=parseBackup(backup({version:1,sessions:[],preferences:p}));expect(restored.preferences.presets).toEqual(result.entries);
  const again=importTavernPreset(exportTavernPreset(result.entries,p.profiles[0]));expect(again.entries.find(p=>p.identifier==='reply')).toMatchObject({role:'assistant',enabled:true,position:'after'});
  expect(raw.prompts[0].role).toBe('model');
});
const fixture={name:'文件预设',temperature:0.85,openai_max_tokens:2600,top_p:0.92,reverse_proxy:'https://do-not-import.example',proxy_password:'synthetic-secret',extensions:{script:'never execute'},prompts:[{identifier:'late',name:'后置',role:'assistant',content:'后置提示'},{identifier:'unused',name:'未启用',role:'system',content:'不要发送'},{identifier:'main',name:'主提示',role:'system',content:'你好 {{user}}',injection_trigger:['normal']},{identifier:'depth',name:'深度',role:'user',content:'插入历史',injection_position:1,injection_depth:1,injection_order:2},{identifier:'chatHistory',name:'聊天历史',marker:true}],prompt_order:[{character_id:100001,order:[{identifier:'main',enabled:true},{identifier:'depth',enabled:true},{identifier:'chatHistory',enabled:true},{identifier:'late',enabled:true},{identifier:'unused',enabled:false}]}]};
it('酒馆文件保留排序、启停、角色、深度与字符串触发类型',()=>{
  const value=importTavernPreset(JSON.stringify(fixture));
  expect(value.entries.map(p=>p.identifier)).toEqual(['late','unused','main','depth','chatHistory']);
  expect(value.entries.find(p=>p.identifier==='late')).toMatchObject({role:'assistant',position:'after'});
  expect(value.entries.find(p=>p.identifier==='depth')).toMatchObject({position:'in-chat',depth:1,order:2});
  expect(value.entries.find(p=>p.identifier==='main')?.triggers).toEqual(['normal']);expect(value.entries.find(p=>p.identifier==='unused')?.enabled).toBe(false);
  expect(value.parameters).toEqual({temperature:0.85,maxTokens:2600,topP:0.92});
});
it('导入不保留地址凭据脚本，条目与采样参数可备份恢复',()=>{
  const value=importTavernPreset(JSON.stringify(fixture)),preferences=defaults();preferences.presets=value.entries;preferences.activePreset=value.id;Object.assign(preferences.profiles[0],value.parameters);
  const saved=backup({version:1,sessions:[],preferences});expect(saved).not.toContain('synthetic-secret');expect(saved).not.toContain('do-not-import');expect(saved).not.toContain('never execute');
  const restored=parseBackup(saved);expect(restored.preferences.presets).toEqual(value.entries);expect(restored.preferences.profiles[0].topP).toBe(0.92);
});
it('导出再导入保留后置条目和启停状态',()=>{
  const value=importTavernPreset(JSON.stringify(fixture));const result=importTavernPreset(exportTavernPreset(value.entries,defaults().profiles[0]));
  expect(result.entries.find(p=>p.identifier==='late')?.position).toBe('after');expect(result.entries.find(p=>p.identifier==='unused')?.enabled).toBe(false);
});
it('旧文字预设仍可导入，坏文件和重复标识会明确拒绝',()=>{
  expect(importTavernPreset('{"name":"旧预设","content":"中文叙事","enabled":false}').entries[0].enabled).toBe(false);
  for(const text of ['{}','{bad}',JSON.stringify({prompts:[{identifier:'x',content:'a'},{identifier:'x',content:'b'}]})])expect(()=>importTavernPreset(text)).toThrow();
});
it('可导入374条且总文字超过30万字的酒馆预设，停用条目仍保留并可备份',()=>{
  const prompts=Array.from({length:374},(_,i)=>({identifier:`p-${i}`,name:`条目${i}`,role:'system',content:'示例'.repeat(700)}));
  const value=importTavernPreset(JSON.stringify({prompts,prompt_order:[{character_id:100001,order:prompts.map((p,i)=>({identifier:p.identifier,enabled:i<83}))}]}));
  expect(value.entries).toHaveLength(374);expect(value.entries.filter(p=>p.enabled)).toHaveLength(83);
  const prefs=defaults();prefs.presets=value.entries;prefs.activePreset=value.id;
  expect(parseBackup(backup({version:1,sessions:[],preferences:prefs})).preferences.presets).toHaveLength(374);
});

it('导出保留聊天历史后的深度注入位置和条目顺序，不移到历史占位前',()=>{
  const raw={prompts:[{identifier:'main',content:'主提示'},{identifier:'chatHistory',marker:true},{identifier:'depth',content:'深度条目',injection_position:1,injection_depth:2},{identifier:'tail',content:'末尾'}],prompt_order:[{character_id:100001,order:[{identifier:'main',enabled:true},{identifier:'chatHistory',enabled:true},{identifier:'depth',enabled:true},{identifier:'tail',enabled:false}]}]};
  const imported=importTavernPreset(JSON.stringify(raw));
  const restored=importTavernPreset(exportTavernPreset(imported.entries,defaults().profiles[0]));
  expect(restored.entries.map(p=>p.identifier)).toEqual(['main','chatHistory','depth','tail']);
  expect(restored.entries.find(p=>p.identifier==='depth')).toMatchObject({position:'in-chat',depth:2,enabled:true});
  expect(restored.entries.find(p=>p.identifier==='tail')).toMatchObject({position:'after',enabled:false});
});
