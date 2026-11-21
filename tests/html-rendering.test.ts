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


it('blocks external resource classes while preserving bundled libraries and local scripting',()=>{
 const html=htmlRenderDocument('<button onclick="this.textContent=1">点我</button>','c',{},false,'http://127.0.0.1:9000');
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];
 expect(policy).toContain("img-src data: blob:");expect(policy).toContain("media-src data: blob:");expect(policy).toContain("style-src 'unsafe-inline';");expect(policy).toContain("font-src data:");expect(policy).toContain("worker-src 'none'");expect(policy).not.toMatch(/(?:^|[ ;])https?:[ ;]/);expect(policy).toContain('/assets/academy-render-jquery.js');expect(policy).toContain('/assets/academy-render-lodash.js');
});
it.each(['<html><!-- <head> --><head><script>attack()</script></head><body>x</body></html>','<html><script>attack()</script><head></head><body>x</body></html>'])('places effective policy before all supplied document content',source=>{
 const html=htmlRenderDocument(source,'c');expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('attack()'));expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.includes('<!--')?html.indexOf('<!--'):Infinity);
});
