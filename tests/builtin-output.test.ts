import {expect,it} from 'vitest';
import {builtinOutput} from '../src/domain/builtinOutput';
import {applyRegexRules,cleanRegexRules} from '../src/domain/regex';
it('never exposes comments, unclosed planning or executable document contents',()=>{
 expect(builtinOutput('<!-- draft: hidden -->正文<preparation>secret').prose).toBe('正文');
 expect(builtinOutput('```\n<!DOCTYPE html><html><script>alert(1)</script><body>正文</body></html>\n```').prose).toBe('正文');
});
it('retains surrounding prose and routes nested details without duplicating it',()=>{
 const out=builtinOutput('前<details><summary>小剧场</summary>甲<details><summary>副标题</summary>乙</details></details>后');
 expect(out.prose).toBe('前后');expect(out.blocks).toEqual([{kind:'theater',title:'小剧场',text:'甲副标题乙'}]);
 expect(builtinOutput('<details><summary>草稿自检</summary>secret</details>正文').blocks).toEqual([]);
});
it('shows status as presentation without mutating variables and tolerates missing content closures',()=>{
 const out=builtinOutput('<content>正文<glass_status>[Time|下午][Mood|平静]</glass_status>');
 expect(out.prose).toBe('正文');expect(out.blocks[0].text).toBe('Time：下午\nMood：平静\n');
});
it('blocks display HTML injection but retains deletion and prompt-side transformations',()=>{
 const rules=cleanRegexRules([{findRegex:'正文',replaceString:'<div>美化</div>',placement:[2]},{findRegex:'隐藏',replaceString:'',placement:[2]}]);
 expect(applyRegexRules('正文隐藏',rules,{placement:2,scope:'display'}).text).toBe('正文');
 expect(applyRegexRules('正文',rules,{placement:2,scope:'prompt'}).text).toBe('<div>美化</div>');
});
