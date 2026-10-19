import {it,expect} from 'vitest';
import {inlineMarkdown,narrativeLines} from '../src/domain/narrativeMarkdown';
it('renders ordinary emphasis and separators without changing story data',()=>{
 expect(inlineMarkdown('前**加粗**，*强调*，`代码`')).toEqual([{kind:'text',text:'前'},{kind:'strong',text:'加粗'},{kind:'text',text:'，'},{kind:'em',text:'强调'},{kind:'text',text:'，'},{kind:'code',text:'代码'}]);
 expect(narrativeLines('正文\n\n***\n## 标题').map(l=>l.kind)).toEqual(['line','line','rule','heading']);
 expect(inlineMarkdown('还没闭合**')).toEqual([{kind:'text',text:'还没闭合**'}]);
});
it('keeps HTML and link-like strings as text spans, never executable markup',()=>{
 const input='<img src=x onerror=alert(1)> [a](javascript:alert(1))';
 expect(inlineMarkdown(input)).toEqual([{kind:'text',text:input}]);
});
