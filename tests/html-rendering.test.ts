import {expect,it} from 'vitest';
import {hasRenderableHtml,htmlMessageContent,htmlRenderDocument} from '../src/domain/htmlRendering';
it('uses the page palette rather than OS dark mode and preserves explicit preset styles',()=>{
 const source='<style>.heading{color:#2a2a2a}body{background:ivory}</style><div class="heading">标题</div>';
 const light=htmlRenderDocument(source,'x',{},false,'',{color:'rgb(32,36,42)',background:'rgb(255,250,243)',scheme:'light'});
 expect(light).toContain('color-scheme:only light');expect(light).not.toContain('color-scheme:light dark');expect(light).toContain('color:rgb(32,36,42)');expect(light.indexOf('body{background:ivory}')).toBeGreaterThan(light.indexOf('color-scheme:only light'));
 const dark=htmlRenderDocument('<p>正文</p>','x',{},false,'',{color:'#eee',background:'#222',scheme:'dark'});expect(dark).toContain('color-scheme:only dark');expect(dark).toContain('background:#222');
});
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

it('opts theater HTML into newline preservation without changing source, scripts or other HTML frames',()=>{
 const source=JSON.parse(JSON.stringify('<div style="color:#c8c0b8">第一段。\n\n「第二段。」</div><script>const text="\\n";</script>'));
 const normal=htmlRenderDocument(source,'normal');const theater=htmlRenderDocument(source,'theater',{},false,'',undefined,true);
 expect(normal).not.toContain('body{white-space:pre-line}');expect(theater).toContain('body{white-space:pre-line}');expect(theater).toContain(source);expect(theater).not.toContain('<br>');
});
