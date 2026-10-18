import {expect,it} from 'vitest';
import {hasRenderableHtml,htmlMessageContent,htmlRenderDocument} from '../src/domain/htmlRendering';
it('recognizes fenced/direct HTML without requiring a regex replacement',()=>{
 for(const text of ['```html\n<button>打开</button>\n```','<!doctype html><html><body>内容</body></html>','<script>document.body.textContent="hello"</script>'])expect(hasRenderableHtml(text)).toBe(true);
 expect(hasRenderableHtml('普通正文。')).toBe(false);
});
it('preserves HTML fences and surrounding prose; does not execute outside-fence markup',()=>{
 const rendered=htmlMessageContent('前言 <test>\n```html\n<div>第一块</div>\n```\n中间\n```html\n<style>p{color:red}</style><p>第二块</p>\n```\n后记');
 expect(rendered).toContain('&lt;test&gt;');expect(rendered).toContain('<div>第一块</div>');expect(rendered).toContain('<style>p{color:red}</style>');expect(rendered).toContain('中间');expect(rendered).toContain('后记');expect(rendered).not.toContain('```');
});
it('injects dependencies/runtime before user scripts without nesting full HTML documents',()=>{
 const rendered=htmlRenderDocument('```html\n<!DOCTYPE html><html><head><style>button{color:red}</style></head><body><button>按钮</button><script>$("button").hide()</script></body></html>\n```','channel',{},false,'http://localhost:8807');
 expect(rendered.match(/<html>/g)).toHaveLength(1);expect(rendered.indexOf('academy-render-jquery.js')).toBeLessThan(rendered.indexOf('$("button")'));expect(rendered).toContain('ResizeObserver');expect(rendered).toContain('connect-src \'none\'');expect(rendered).toContain('form-action \'none\'');
});
it('escapes injected variable data and keeps bridge read-only',()=>{
 const rendered=htmlRenderDocument('<div>内容</div>','unique',{variables:{text:'</script><script>bad()</script>'}});
 expect(rendered).toContain('\\u003c/script>');expect(rendered).not.toContain('</script><script>bad()');expect(rendered).toContain('window.getVariables');expect(rendered).not.toContain('window.replaceVariables');expect(rendered).not.toContain('localStorage');
});
