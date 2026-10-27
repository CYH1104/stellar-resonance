import {expect,it} from 'vitest';
import {builtinOutput} from '../src/domain/builtinOutput';
import {committedRenderText,renderChunks,type RenderChunk} from '../src/domain/renderChunks';
import {htmlRenderDocument} from '../src/domain/htmlRendering';

const style='<style>\n.diary-card{border:3px dashed #c0392b;padding:18px}\n.diary-card h4{color:#0066cc}\n</style>';
const card='<div class="diary-card"><h4>小标题</h4><p>正文段落。</p></div>';
const inlineCard='<div style="background:#ffffd9;color:#332b22;border:2px solid #cbb89d;padding:20px"><h4>标题</h4><p>正文。</p></div>';
const renderable=(text:string)=>text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').trim();
const bodyOf=(chunk:string)=>{const doc=htmlRenderDocument(chunk,'chan',{},false,'http://127.0.0.1:8807',{color:'#20242a',background:'#fffaf3',scheme:'light'});return doc.slice(doc.indexOf('<body>')+6,doc.lastIndexOf('</body>'));};
const htmlChunks=(text:string):RenderChunk[]=>renderChunks(builtinOutput(text,false,true).prose,true).filter(c=>c.kind==='html');
const fencedPage='<!doctype html><html lang="zh-CN"><head><style>.c{border:2px solid red}</style></head><body class="page" style="background:#123456;padding:31px"><div class="c">围栏完整页面</div></body></html>';
const fencedDocument='```html\n'+fencedPage+'\n```';
const privateFence='```html\n<style>div{display:none}</style><div>第一帧</div>\n```';
const visibleFence='```html\n<div style="color:red">第二帧应可见</div>\n```';
const docOf=(chunk:string)=>htmlRenderDocument(chunk,'chan',{},false,'http://127.0.0.1:8807',{color:'#20242a',background:'#fffaf3',scheme:'light'});

it('never turns a style block into its own frame: every frame has visible markup',()=>{
 // A style-only frame renders an empty body, which is the blank box reported in the spirit diary.
 expect(htmlChunks(style)).toHaveLength(0);
 for(const text of [style+'\n\n'+card,style+'\n\n说明一句。\n\n'+card,'说明一句。\n\n'+style+'\n\n'+card]){
  const chunks=htmlChunks(text);
  expect(chunks.length).toBeGreaterThan(0);
  for(const chunk of chunks){
   expect(renderable(chunk.text)).not.toBe('');
   expect(bodyOf(chunk.text).trim()).not.toBe('');
  }
 }
});
it('keeps a style block with the markup it styles instead of dropping it',()=>{
 const chunks=htmlChunks(style+'\n\n说明一句。\n\n'+card);
 expect(chunks).toHaveLength(1);
 expect(chunks[0]!.text).toContain('.diary-card{border:3px dashed #c0392b');
 expect(chunks[0]!.text).toContain('class="diary-card"');
 // The prose between them still renders as story text, before the frame.
 const ordered=renderChunks(builtinOutput(style+'\n\n说明一句。\n\n'+card,false,true).prose,true);
 expect(ordered.map(c=>c.kind)).toEqual(['story','html']);
 expect(ordered[0]!.text).toContain('说明一句。');
});
it('carries one style block into every later markup frame',()=>{
 const text=style+'\n\n甲说明。\n\n'+card+'\n\n乙说明。\n\n<div class="diary-card"><p>第二段</p></div>';
 const chunks=htmlChunks(text);
 expect(chunks).toHaveLength(2);
 for(const chunk of chunks)expect(chunk.text).toContain('.diary-card{border:3px dashed #c0392b');
});
it('leaves ordinary inline-style fragments untouched',()=>{
 const chunks=htmlChunks(inlineCard);
 expect(chunks).toHaveLength(1);
 expect(chunks[0]!.text).toBe(inlineCard);
 expect(bodyOf(chunks[0]!.text)).toContain('background:#ffffd9');
});
it('injects carried styles inside an html fence after the opening line',()=>{
 const text=style+'\n\n```html\n'+card+'\n```';
 const chunks=htmlChunks(text);
 expect(chunks).toHaveLength(1);
 expect(chunks[0]!.text.startsWith('```html\n'+style)).toBe(true);
 expect(chunks[0]!.text).toContain('class="diary-card"');
});
it('keeps complete documents as documents so the doctype survives',()=>{
 const doc='<!doctype html><html><head><style>.c{border:2px solid #16a085}</style></head><body><div class="c"><p>正文</p></div></body></html>';
 const chunks=htmlChunks(doc);
 expect(chunks).toHaveLength(1);
 expect(chunks[0]!.text).toBe(doc);
 const rendered=htmlRenderDocument(chunks[0]!.text,'chan',{},false,'http://127.0.0.1:8807',{color:'#20242a',background:'#fffaf3',scheme:'light'});
 expect(rendered.startsWith('<!doctype html>')).toBe(true);
 expect(rendered.match(/<html\b/g)).toHaveLength(1);
 expect(rendered.indexOf('academy-render-jquery.js')).toBeLessThan(rendered.indexOf('class="c"'));
});
it('does not turn teaching prose or escaped markup into a frame',()=>{
 expect(htmlChunks('HTML 里可以用 <div> 标签做容器，这只是普通教学说明。')).toHaveLength(0);
 expect(htmlChunks('&lt;div style="color:red"&gt;只是举例&lt;/div&gt;')).toHaveLength(0);
});
it('holds an uncommitted fragment back while streaming instead of framing a partial tag',()=>{
 const partial='<div style="color:#332b22"><h4>标题</h4><p>还没写完';
 expect(committedRenderText(partial,true)).toBe('');
 expect(htmlChunks(committedRenderText(partial,true))).toHaveLength(0);
 const complete=partial+'</p></div>';
 expect(committedRenderText(complete,true)).toBe(complete);
 expect(htmlChunks(committedRenderText(complete,true))).toHaveLength(1);
});
it('keeps a complete page inside an html fence a complete page, not a fragment',()=>{
 const page=htmlChunks(fencedDocument);
 expect(page).toHaveLength(1);
 // The fence is passed through untouched: nothing was hoisted in front of its doctype.
 expect(page[0]!.text).toBe(fencedDocument);
 const rendered=docOf(page[0]!.text);
 expect(rendered.startsWith('<!doctype html>')).toBe(true);
 expect(rendered).toContain('<html lang="zh-CN">');
 expect(rendered).toContain('<body class="page" style="background:#123456;padding:31px">');
 // Its own sheet stays in the head, and the runtime is injected into that same head.
 expect(rendered.indexOf('<style>.c{border:2px solid red}</style>')).toBeLessThan(rendered.indexOf('<body class="page"'));
 expect(rendered.indexOf('academy-render-jquery.js')).toBeLessThan(rendered.indexOf('<body class="page"'));
 expect(rendered).not.toContain('```');
});
it('a complete document neither receives ambient styles nor leaks its own',()=>{
 const after='<div class="diary-card"><p>文档后面的卡片</p></div>';
 const afterFence='```html\n<div class="diary-card"><p>围栏里的卡片</p></div>\n```';
 const chunks=htmlChunks(style+'\n\n'+fencedDocument+'\n\n'+after+'\n\n'+afterFence);
 expect(chunks).toHaveLength(3);
 expect(chunks[0]!.text).toBe(fencedDocument);
 expect(chunks[0]!.text).not.toContain('.diary-card{border:3px dashed');
 expect(docOf(chunks[0]!.text)).toContain('<body class="page" style="background:#123456;padding:31px">');
 // Ambient styles still reach the fragments after the document; its private rules do not.
 for(const chunk of chunks.slice(1)){
  expect(chunk.text).toContain('.diary-card{border:3px dashed #c0392b');
  expect(chunk.text).not.toContain('.c{border:2px solid red}');
 }
 expect(chunks[2]!.text.startsWith('```html\n'+style)).toBe(true);
});
it('two independent fences keep their own styles to themselves',()=>{
 const chunks=htmlChunks(privateFence+'\n\n'+visibleFence);
 expect(chunks.map(c=>c.text)).toEqual([privateFence,visibleFence]);
 expect(chunks[0]!.text).toContain('div{display:none}');
 // The second fence never inherits the first one's rule, so its content stays visible.
 expect(chunks[1]!.text).not.toContain('display:none');
 expect(bodyOf(chunks[1]!.text)).toContain('第二帧应可见');
 expect(bodyOf(chunks[1]!.text)).not.toContain('display:none');
});
it('a fence does not push its private styles into the plain fragment that follows it',()=>{
 const plain='<div style="color:red">围栏之后的独立片段</div>';
 const chunks=htmlChunks(privateFence+'\n\n'+plain);
 expect(chunks.map(c=>c.text)).toEqual([privateFence,plain]);
 expect(bodyOf(chunks[1]!.text)).toContain('围栏之后的独立片段');
 expect(bodyOf(chunks[1]!.text)).not.toContain('display:none');
});
it('a fence holding only a style block styles the markup after it instead of rendering blank',()=>{
 const lone='```html\n'+style+'\n```';
 expect(htmlChunks(lone)).toHaveLength(0);
 const chunks=htmlChunks(lone+'\n\n'+card);
 expect(chunks).toHaveLength(1);
 expect(chunks[0]!.text).toContain('.diary-card{border:3px dashed #c0392b');
 expect(chunks[0]!.text).toContain('class="diary-card"');
});
