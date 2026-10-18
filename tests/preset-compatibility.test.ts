import {it,expect} from 'vitest';
import {importTavernPreset,exportTavernPreset} from '../src/domain/presets';
import {restorePresetCompatibility,confirmPresetCompatibility} from '../src/domain/presetCompatibility';
import {backup,defaults,parseBackup} from '../src/domain/story';
const entry=(name:string,content:string,enabled=true)=>({name,content,enabled});
const source=(prompts:unknown[])=>JSON.stringify({prompts});
it('import review explicitly enables unselected candidates and preserves text',()=>{
 const text=source([entry('状态栏', '每轮必须输出状态栏：<panel>玩家地点与好感度等状态信息</panel>'),entry('输出格式','请输出 <custom>自定义内容</custom>'),entry('状态栏旧版','每轮必须输出状态栏：<panel>玩家地点与好感度等状态信息</panel>',false)]);
 const rows=importTavernPreset(text).entries,original=rows.map(p=>p.content);
 expect(rows.every(p=>p.compatibility)).toBe(true);
 confirmPresetCompatibility(rows,[]);expect(rows.map(p=>p.enabled)).toEqual([true,true,true]);
 confirmPresetCompatibility(rows,[0,1,2]);expect(rows.every(p=>!p.enabled)).toBe(true);
 confirmPresetCompatibility(rows,[1]);expect(rows.map(p=>p.enabled)).toEqual([true,false,true]);
 expect(rows.map(p=>p.content)).toEqual(original);
 const again=importTavernPreset(exportTavernPreset(rows,defaults().profiles[0])).entries;
 expect(rows.map(row=>again.find(p=>p.name===row.name)?.enabled)).toEqual([true,false,true]);
});
it('detects dynamic output templates by purpose, not a fixed status tag',()=>{
 for(const tag of ['StatusBlock','custom_stats','人物面板']){
 const text=source([entry('状态栏（可选）',`每轮必须输出以下状态栏格式：<${tag}>玩家、地点、好感度</${tag}>`)]);
 const p=importTavernPreset(text).entries[0];expect(p.enabled).toBe(false);expect(p.compatibility?.categories).toContain('beautify');expect(p.content).toContain(tag);
 }
});
it('inherits only pure UI sections and closes same-name and END separators',()=>{
 for(const close of ['——小剧场——','——END——']){
 const result=importTavernPreset(source([entry('——小剧场——','输出各类独立片段'),entry('手机适配','手机屏幕布局'),entry(close,'结束'),entry('捕获输入','尊重本轮玩家输入')])).entries;
 expect(result.slice(0,3).every(p=>!p.enabled)).toBe(true);expect(result[3].enabled).toBe(true);
 }
});
it('mixed sections preserve writing, protected entries and markers',()=>{
 const result=importTavernPreset(source([entry('——部件区——','说明'),entry('状态栏','每轮输出格式 <stats>日期位置</stats>'),entry('字数锁（下限）','必须输出2000字'),entry('必开：状态栏','必须输出 <foo>状态栏</foo>'),entry('基础文风','描写角色状态，输出 <p>示例</p>'),{...entry('状态栏','输出 <foo>状态栏</foo>'),marker:true}])).entries;
 expect(result[1].enabled).toBe(false);expect(result.slice(2).every(p=>p.enabled)).toBe(true);expect(result[4].compatibility?.verdict).toBe('review');
});
it('English world facts and ordinary choices are not UI output commands',()=>{
 const result=importTavernPreset(source([entry('World rules','Status effects affect choices at the scholars forum.'),entry('Formatting','Output the status bar in <different_schema>Time and location</different_schema> after each turn.'),entry('A difficult choice','A character faces a difficult choice.'),entry('Content wrapper','Wrap prose in <content> tags.')])).entries;
 expect(result.map(p=>p.enabled)).toEqual([true,false,true,true]);expect(result[3].compatibility?.verdict).toBe('review');
});
it('restores the original switch rather than enabling previously disabled entries',()=>{
 const r=importTavernPreset(source([entry('行动选项','必须输出行动选项 <pick>下一步行动</pick>'),entry('状态栏','必须输出状态栏 <foo>当前状态</foo>',false)])).entries;
 expect(r.every(p=>!p.enabled)).toBe(true);restorePresetCompatibility(r,'choices');expect(r.map(p=>p.enabled)).toEqual([true,false]);restorePresetCompatibility(r);expect(r.map(p=>p.enabled)).toEqual([true,false]);
});
it('preserve-output option only reports; backup and export preserve reversible decisions',()=>{
 const raw=source([entry('状态栏','必须输出状态栏 <stats>日期地点角色</stats>')]);
 expect(importTavernPreset(raw,'test',{preserveOutputs:true}).entries[0]).toMatchObject({enabled:true,compatibility:{verdict:'review'}});
 const r=importTavernPreset(raw),prefs=defaults();prefs.presets=r.entries;prefs.preservePresetOutputs=true;
 const saved=parseBackup(backup({version:1,sessions:[],preferences:prefs}));expect(saved.preferences.presets).toEqual(r.entries);expect(saved.preferences.preservePresetOutputs).toBe(true);
 const again=importTavernPreset(exportTavernPreset(r.entries,prefs.profiles[0]));expect(again.entries[0].compatibility?.originalEnabled).toBe(true);restorePresetCompatibility(again.entries);expect(again.entries[0].enabled).toBe(true);
 const restored=importTavernPreset(exportTavernPreset(again.entries,prefs.profiles[0]));expect(restored.entries[0].enabled).toBe(true);
});
