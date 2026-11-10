import {it,expect} from 'vitest';
import {ReasoningFilter,stripReasoning} from '../src/domain/reasoning';
import {cleanOutputParsing,cleanPresetOutputParsing,outputParsingTags,presetOutputParsing} from '../src/domain/outputParsing';
import {defaults,backup,parseBackup} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {importTavernPreset,exportTavernPreset} from '../src/domain/presets';
import {createSSRApp} from 'vue';import {renderToString} from 'vue/server-renderer';
import StoryContent from '../src/components/StoryContent.vue';
const config={version:1 as const,enabled:true,tags:['foundation','ecot','辅助:草稿']};
it('filters arbitrary configured names, attributes, nested blocks and every stream boundary before exposing prose',()=>{
 const text='<FOUNDATION mode="x > y">A<ecot>B</ecot><foundation>C</foundation></FOUNDATION>前文<辅助:草稿>隐藏</辅助:草稿><foundation />后文<unknown>普通内容</unknown>';
 const expected='前文后文<unknown>普通内容</unknown>';
 for(let split=0;split<=text.length;split++){const f=new ReasoningFilter(config.tags);expect(f.push(text.slice(0,split))+f.push(text.slice(split))+f.finish()).toBe(expected);}
 const f=new ReasoningFilter(config.tags);let actual='';for(const chunk of text)actual+=f.push(chunk);expect(actual+f.finish()).toBe(expected);
 expect(stripReasoning('甲<foundation>隐藏<ecot>嵌套</ecot></foundation>乙',config.tags)).toBe('甲乙');
 expect(stripReasoning('甲<foundation>未闭合',config.tags)).toBe('甲');
 expect(stripReasoning('甲<foun',config.tags)).toBe('甲');
 expect(stripReasoning('甲<foundation-other>保留</foundation-other>',config.tags)).toContain('保留');
 expect(stripReasoning('甲<foundation x="'+ 'z'.repeat(5000),config.tags)).toBe('甲');
});
it('a continuation can close an interrupted block or restart auxiliary output without leaking either response',()=>{
 const f=new ReasoningFilter(config.tags);expect(f.push('前文<foundation>隐藏')).toBe('前文');expect(f.unclosed).toBe(true);
 f.beginResponse();expect(f.push('</foundation>后文')+f.finish()).toBe('后文');expect(f.unclosed).toBe(false);
 const other=new ReasoningFilter(config.tags);other.push('<foundation>中断');other.beginResponse();expect(other.push('<ecot>新辅助</ecot>正文')+other.finish()).toBe('正文');
});
it('defaults are fresh, disabling preserves custom blocks, names cannot replace application protocol or HTML',()=>{
 expect(outputParsingTags(undefined)).toEqual(['foundation']);const a=cleanOutputParsing(undefined);a.tags.push('x');expect(outputParsingTags(undefined)).toEqual(['foundation']);
 expect(outputParsingTags({...config,enabled:false})).toEqual([]);expect(stripReasoning('<foundation>保留</foundation>',[])).toContain('保留');
 expect(cleanOutputParsing({...config,tags:['ECOT','ecot',' 辅助:草稿 ']}).tags).toEqual(['ecot','辅助:草稿']);
 for(const tags of [['SR_STATE'],['content'],['div'],['bad tag'],['a.*'],[5],Array(65).fill('a')])expect(()=>cleanOutputParsing({...config,tags})).toThrow();
 for(const value of [{...config,version:2},{...config,newField:true},null])expect(()=>cleanOutputParsing(value)).toThrow();
 expect(()=>cleanPresetOutputParsing(JSON.parse('{"__proto__":{"version":1,"enabled":true,"tags":[]}}'))).toThrow();
});
it('preset files and complete local/cloud payloads retain settings and reject newer formats before import',()=>{
 const p=defaults();p.presetOutputParsing={legacy:config};const r=importTavernPreset(exportTavernPreset(p.presets,p.profiles[0],[],config));expect(r.outputParsing).toEqual(config);
 for(const enabled of [true,false]){p.presetOutputParsing.legacy={...config,enabled};const local=parseBackup(backup({version:1,sessions:[],preferences:p}));expect(local.preferences.presetOutputParsing).toEqual(p.presetOutputParsing);const cloud=parseCloudSave(createCloudSave(local,p));expect(cloud.snapshot.preferences.presetOutputParsing).toEqual(p.presetOutputParsing);}
 const legacy:any=defaults();delete legacy.presetOutputParsing;expect(presetOutputParsing(parseBackup(JSON.stringify({version:1,sessions:[],preferences:legacy})).preferences,'legacy').tags).toEqual(['foundation']);
 expect(()=>importTavernPreset(JSON.stringify({prompts:[{content:'规则'}],extensions:{academy_output_parser:{...config,version:2}}}))).toThrow();
 const raw=JSON.parse(backup({version:1,sessions:[],preferences:p}));raw.preferences.presetOutputParsing.legacy.extra='unknown';expect(()=>parseBackup(JSON.stringify(raw))).toThrow();
});
it('old stored prose hides configured blocks in display, preserves unknown text and respects disabling',async()=>{
 const text='可见正文<foundation>辅助内容</foundation><ecot>其他辅助</ecot>结尾';
 const html=await renderToString(createSSRApp(StoryContent,{text,outputParsing:config}));expect(html).toContain('可见正文');expect(html).toContain('结尾');expect(html).not.toContain('辅助内容');expect(html).not.toContain('其他辅助');
 const off=await renderToString(createSSRApp(StoryContent,{text,outputParsing:{...config,enabled:false}}));expect(off).toContain('辅助内容');expect(text).toContain('<foundation>辅助内容');
});
