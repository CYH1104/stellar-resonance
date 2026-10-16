import {expect,it} from 'vitest';
import {activePromptEntries,cleanPreset,exportTavernPreset,importTavernPreset} from '../src/domain/presets';
import {promptFolders} from '../src/domain/promptGroups';
import {backup,defaults,parseBackup} from '../src/domain/story';
const grouping={version:1,groups:[{id:'head',name:'头部越狱',order:0,collapsed:true,enabled:true},{id:'identity',name:'身份',order:1,collapsed:false,enabled:true}],prompts:{a:{groupId:'head'},b:{groupId:'head'},c:{groupId:'identity'}}};
const fixture=()=>({name:'分组预设',prompts:[{identifier:'a',name:'Gemini 头部',content:'甲',enabled:true},{identifier:'b',name:'Claude 头部',content:'乙',enabled:false},{identifier:'c',name:'身份条目',content:'丙',enabled:true},{identifier:'d',name:'无分组条目',content:'丁',enabled:true}],extensions:{baibaiToolkit:{presetPromptGroups:grouping},script:'synthetic-extension-must-not-run'}});
it('导入真实大分组格式，将子条目挂到正确分组，保留开关和顺序',()=>{
 const imported=importTavernPreset(JSON.stringify(fixture()));const folders=promptFolders(imported.entries);
 expect(folders.map(g=>g.name)).toEqual(['头部越狱','身份','未分组']);expect(folders[0].entries.map(p=>p.identifier)).toEqual(['a','b']);expect(folders[0].collapsed).toBe(true);expect(folders[0].entries.filter(p=>p.enabled)).toHaveLength(1);
 expect(imported.entries.map(p=>p.identifier)).toEqual(['a','b','c','d']);expect(imported.entries.map(p=>p.content)).toEqual(['甲','乙','丙','丁']);
});
it('折叠只改变显示，整组暂停保留子条目开关，重新开启恢复原选择',()=>{
 const entries=importTavernPreset(JSON.stringify(fixture())).entries;const before=activePromptEntries(entries).map(p=>p.identifier);
 for(const p of entries)if(p.group?.id==='head')p.group.collapsed=false;expect(activePromptEntries(entries).map(p=>p.identifier)).toEqual(before);
 for(const p of entries)if(p.group?.id==='head')p.group.enabled=false;
 expect(activePromptEntries(entries).map(p=>p.identifier)).toEqual(['c','d']);expect(entries.map(p=>p.enabled)).toEqual([true,false,true,true]);
 for(const p of entries)if(p.group?.id==='head')p.group.enabled=true;expect(activePromptEntries(entries).map(p=>p.identifier)).toEqual(before);
});
it('存档与酒馆导出再导入均保留分组、折叠、开关和未分组，不带其他扩展',()=>{
 const entries=importTavernPreset(JSON.stringify(fixture())).entries;entries[3].group=null;for(const p of entries)if(p.group?.id==='head'){p.group.collapsed=false;p.group.enabled=false;}
 const prefs=defaults();prefs.presets=entries;const saved=backup({version:1,sessions:[],preferences:prefs});const restored=parseBackup(saved).preferences.presets;
 expect(restored).toEqual(entries);const exported=exportTavernPreset(restored,prefs.profiles[0]);expect(exported).not.toContain('synthetic-extension-must-not-run');
 const reimported=importTavernPreset(exported).entries;expect(reimported.find(p=>p.identifier==='a')?.group).toMatchObject({id:'head',collapsed:false,enabled:false});expect(reimported.find(p=>p.identifier==='b')?.enabled).toBe(false);expect(reimported.find(p=>p.identifier==='d')?.group).toBeNull();
});
it('旧版小冰块按精确标识恢复丢失分组，不覆盖用户改过的内容、开关和顺序',()=>{
 const ids=['61c5dabf-c028-4588-a243-83e3403ae029','0956180f-b292-4e6e-a8c7-f6812338fab4','eee9108c-1da7-495f-b7cf-346973296b0b','84c4bc39-2435-4ac7-af72-860e42bd1059'];
 const prefs=defaults();prefs.presets=ids.map((identifier,i)=>({id:'local-'+i,identifier,name:'我的条目'+i,content:'已编辑内容'+i,enabled:i===2}));
 const restored=parseBackup(JSON.stringify({version:1,sessions:[],preferences:prefs})).preferences.presets;
 expect(restored.map(p=>[p.identifier,p.content,p.enabled])).toEqual(prefs.presets.map(p=>[p.identifier,p.content,p.enabled]));expect(promptFolders(restored)[0].name).toBe('🔒头部越狱');expect(promptFolders(restored)[0].entries.filter(p=>p.enabled)).toHaveLength(1);
 const changed={version:1 as const,sessions:[],preferences:{...prefs,presets:restored.map(p=>({...p,group:null}))}};
 expect(parseBackup(backup(changed)).preferences.presets.every(p=>p.group===null)).toBe(true);
});
it('分组名称相似不会猜测归属，坏分组扩展不妨碍普通提示词导入',()=>{
 const fake=fixture();fake.extensions.baibaiToolkit.presetPromptGroups={...grouping,version:2};
 const entries=importTavernPreset(JSON.stringify(fake)).entries;expect(entries.every(p=>p.group===undefined)).toBe(true);expect(entries).toHaveLength(4);
});
it('备份拒绝非法分组结构，不保存扩展附带的任意字段',()=>{
 const p=importTavernPreset(JSON.stringify(fixture())).entries[0];expect(()=>cleanPreset({...p,group:{...p.group!,collapsed:'yes'} as any})).toThrow('分组');expect(()=>cleanPreset({...p,group:{...p.group!,script:'not-code'} as any})).toThrow('分组');
});

it('分组显示跟随原条目顺序，不用旧元数据排序把变量组挪到列表末尾',()=>{
 const entries=importTavernPreset(JSON.stringify(fixture())).entries;const reordered=[entries[2],entries[0],entries[1],entries[3]];
 expect(promptFolders(reordered).map(g=>g.name)).toEqual(['身份','头部越狱','未分组']);expect(reordered.map(p=>p.identifier)).toEqual(['c','a','b','d']);
});
