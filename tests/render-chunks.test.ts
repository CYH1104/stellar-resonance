import {expect,it} from 'vitest';
import {committedRenderText,renderChunks} from '../src/domain/renderChunks';
it('commits only complete fences and paragraphs during streaming',()=>{
 const first='```html\n<div>已完成</div>\n```\n';
 expect(committedRenderText(first+'```html\n<div>未完',true)).toBe(first);
 expect(renderChunks(first+'段落')).toEqual([{kind:'html',text:first.trimEnd()},{kind:'story',text:'段落'}]);
 expect(renderChunks(first.trimEnd())[0]).toEqual(renderChunks(first)[0]);
 expect(committedRenderText('第一段。\n\n第二段未完',true)).toBe('第一段。\n\n');
 expect(committedRenderText('```html\n<div>未完',true)).toBe('');
});
it('waits for nested tags, raw script text and documents to close',()=>{
 expect(committedRenderText('<div><p>文字</p>',true)).toBe('');
 expect(committedRenderText('<div><p>文字</p></div><div>未完',true)).toBe('<div><p>文字</p></div>');
 const script='<script>if(a < b){x="<div>"}</script>';
 expect(committedRenderText(script,true)).toBe(script);
 const doc='<!doctype html><html><body><p>完整</p></body></html>';
 expect(committedRenderText(doc,true)).toBe(doc);
 expect(committedRenderText('<div title="a > b">内容</div>',true)).toBe('<div title="a > b">内容</div>');
});
it('generation completion preserves malformed raw content for readable fallback',()=>{
 expect(committedRenderText('<div>未闭合',false)).toBe('<div>未闭合');
});
