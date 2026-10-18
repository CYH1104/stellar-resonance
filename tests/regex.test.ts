import {it,expect} from 'vitest';
import {applyRegexRules,cleanRegexRules,importRegexRules,regexPattern,regexHtmlDocument} from '../src/domain/regex';
import {importTavernPreset,exportTavernPreset} from '../src/domain/presets';
import {backup,parseBackup,defaults} from '../src/domain/story';
const rule=(changes:Record<string,unknown>={})=>cleanRegexRules([{id:'one',scriptName:'测试',findRegex:String.raw`/hello (?<name>\w+)/g`,replaceString:'<b>$<name></b>',placement:[2],markdownOnly:true,...changes}])[0];
const display={placement:2,scope:'display' as const,depth:0};
it('imports both Tavern extension formats, deduplicates and preserves scope and disabled flags',()=>{
 const r=rule(),raw={extensions:{regex_scripts:[r],SPreset:{RegexBinding:{regexes:[r,{...r,id:'two',scriptName:'其他',findRegex:'other',disabled:true,placement:'1',trimStrings:'a b'}]}}}};
 const imported=importRegexRules(raw,'preset');expect(imported).toHaveLength(2);expect(imported[0].setId).toBe('preset');expect(imported[1]).toMatchObject({disabled:true,placement:[1],trimStrings:['a','b']});
});
it('preset regex survives export/import and browser backup without executing replacements',()=>{
 const p=importTavernPreset(JSON.stringify({prompts:[{identifier:'main',content:'Prompt'}],extensions:{regex_scripts:[rule({replaceString:'<script>throw Error("must not run")</script>'})]}}));
 const prefs=defaults();prefs.presets=p.entries;prefs.activePreset=p.id;prefs.regexRules=p.regexRules;
 const restored=parseBackup(backup({version:1,sessions:[],preferences:prefs}));expect(restored.preferences.regexRules).toEqual(p.regexRules);
 const again=importTavernPreset(exportTavernPreset(p.entries,prefs.profiles[0],p.regexRules));expect(again.regexRules[0].replaceString).toContain('<script>');expect(again.regexRules[0].setId).toBe(again.id);
});
it('matches numbered/named groups and match macro, trims captures and applies rules in order',()=>{
 const a=rule({findRegex:'/hello (.*)/',replaceString:'$1 / {{match}}',trimStrings:['!']});
 expect(applyRegexRules('hello Bob!',[a],display).text).toBe('Bob / hello Bob');
 expect(applyRegexRules('hello Bob',[rule()],display).text).toBe('<b>Bob</b>');
 expect(applyRegexRules('hello Bob',[rule(),rule({findRegex:'Bob',replaceString:'Alice'})],display).text).toBe('<b>Alice</b>');
});
it('respects disabled, placement, scope, depth and edit switches',()=>{
 const r=rule();for(const context of [{...display,placement:1},{...display,scope:'prompt' as const},{...display,edited:true}])expect(applyRegexRules('hello Bob',[r],context).text).toBe('hello Bob');
 for(const patch of [{disabled:true},{minDepth:1},{maxDepth:0}])expect(applyRegexRules('hello Bob',[rule(patch)],{...display,depth:2}).text).toBe(patch.minDepth?'<b>Bob</b>':'hello Bob');
 expect(applyRegexRules('hello Bob',[rule({runOnEdit:true})],{...display,edited:true}).text).toBe('<b>Bob</b>');
 expect(applyRegexRules('hello Bob',[rule({markdownOnly:false,promptOnly:true})],{...display,scope:'prompt'}).text).toBe('<b>Bob</b>');
});
it('substitutes escaped name macros in find patterns without interpreting the name as regex',()=>{
 const r=rule({findRegex:'/{{user}}/g',replaceString:'{{char}}',substituteRegex:2});
 expect(applyRegexRules('A+B AAB',[r],{...display,user:'A+B',char:'NPC'}).text).toBe('NPC AAB');
});
it('invalid patterns preserve source and report errors; replacement growth is bounded',()=>{
 expect(()=>regexPattern('/[/g')).toThrow();const result=applyRegexRules('hello Bob',[rule({findRegex:'/[/g'})],display);expect(result.text).toBe('hello Bob');expect(result.errors).toHaveLength(1);
 const expanded=applyRegexRules('x'.repeat(100),[rule({findRegex:'/x/g',replaceString:'a'.repeat(10000)})],display);expect(expanded.text).toBe('x'.repeat(100));expect(expanded.errors[0]).toContain('过大');
});
it('HTML documents enforce isolation policy and can highlight source text',()=>{
 const html=regexHtmlDocument('```html\n<style>body{color:red}</style><div>Test</div>\n```',true);
 expect(html).toContain("script-src 'none'");expect(html).toContain("form-action 'none'");expect(html).toContain('text-decoration:underline');expect(html).toContain('<div>Test</div>');expect(html).not.toContain('```');
});
