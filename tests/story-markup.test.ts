import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {storyBlocks,displayText} from '../src/domain/storyMarkup';
import StoryContent from '../src/components/StoryContent.vue';
it('renders a local styled div in an isolated frame while keeping surrounding prose outside',async()=>{
 const html=await renderToString(createSSRApp(StoryContent,{text:'前面的正文。\n<div style="color:lightblue">局部内容</div>\n后面的正文。'}));
 expect(html).toContain('<iframe');expect(html).toContain('sandbox="allow-scripts"');expect(html).toContain('color:lightblue');expect(html).toContain('前面的正文。');expect(html).toContain('后面的正文。');
});
it('streams visible prose inside unclosed HTML and fences before completion',async()=>{
 for(const text of ['<content>正文正在出现','```html\n<div><p>正文正在出现','<content>正文正在出现<SR_STATE>{"secret":1']){
  const html=await renderToString(createSSRApp(StoryContent,{text,streaming:true}));
  expect(html).toContain('正文正在出现');expect(html).not.toContain('secret');expect(html).not.toContain('正在准备回复');
 }
 for(const suffix of ['<SR_ST','<think>secret','<!-- secret','<details><summary>草稿自检</summary>secret']){
  const html=await renderToString(createSSRApp(StoryContent,{text:'正文'+suffix,streaming:true}));
  expect(html).toContain('正文');expect(html).not.toContain('secret');expect(html).not.toContain('&lt;SR_ST');
 }
});
import {finishVariant,newSession} from '../src/domain/story';
const slate='<Slate>\n<Scene_NO>001</Scene_NO>\n<Scene_Title>金属与浮尘</Scene_Title>\n<EN_Title>Stardust Path</EN_Title>\n<Quote>新生踏入中立之地的第一步。</Quote>\n<Location>盖亚之眼 · 学院正门广场</Location>\n<Ti>0578.09.01 · 09:15</Ti>\n</Slate>';
it('多层换行转义统一展示，代码、URL和Windows路径保持原样',()=>{
  for(let depth=1;depth<=4;depth++)expect(displayText('一'+'\\'.repeat(depth)+'n二')).toBe('一\n二');
  const protectedText='C:\\new\\notes https://example.com/\\name `a\\nb`';
  expect(displayText(protectedText)).toBe(protectedText);
  expect(storyBlocks('<dream_plot><dream_body>第一段\\\\n第二段</dream_body></dream_plot>')).toEqual([{kind:'text',text:'第一段\n第二段'}]);
});
it('预设Slate转换为场景卡数据，前后正文顺序及原字符串保留',()=>{
  const source='前文。\n'+slate+'\n后文。',blocks=storyBlocks(source);
  expect(blocks).toEqual([{kind:'text',text:'前文。\n'},{kind:'slate',scene:{sceneNo:'001',title:'金属与浮尘',englishTitle:'Stardust Path',quote:'新生踏入中立之地的第一步。',location:'盖亚之眼 · 学院正门广场',time:'0578.09.01 · 09:15'}},{kind:'text',text:'\n后文。'}]);expect(source).toContain('<Slate>');
});
it('流式接收完整块前显示等待；停止后未闭合或未知结构回退原文字，不吞正文',()=>{
  for(let i=7;i<slate.length;i++)expect(storyBlocks(slate.slice(0,i),true)).toEqual([{kind:'pending'}]);
  const unfinished=slate.slice(0,slate.indexOf('</Slate>'));expect(storyBlocks(unfinished,false)).toEqual([{kind:'text',text:unfinished}]);
  for(const source of ['<Slate><Unknown>保留文字</Unknown></Slate>','<Slate><Scene_NO>1</Scene_NO><Scene_NO>2</Scene_NO></Slate>','<Slate>不符合格式但不能丢失的剧情</Slate>'])expect(storyBlocks(source)).toEqual([{kind:'text',text:source}]);
});
it('支持多个场景块、缺省字段和不区分大小写，不添加模型没给出的信息',()=>{
  expect(storyBlocks('<slate><scene_title>仅标题</scene_title></slate>正文'+slate)).toHaveLength(3);
  expect(storyBlocks('<Slate><Location>广场</Location></Slate>')[0]).toEqual({kind:'slate',scene:{location:'广场'}});
});
it('真实渲染显示排版，思维链不展示，模型HTML仅作为文字而不能执行',async()=>{
  const text='<think>synthetic-secret'+slate+'</think>'+slate+'正文<img src=x onerror="alert(1)">';
  const html=await renderToString(createSSRApp(StoryContent,{text}));expect(html).toContain('class="scene-slate"');expect(html).toContain('金属与浮尘');expect(html).toContain('学院正门广场');expect(html).not.toContain('synthetic-secret');expect(html).not.toContain('&lt;Scene_NO&gt;');expect(html).not.toContain('<img');expect(html).toContain('&lt;img');
  const injected=await renderToString(createSSRApp(StoryContent,{text:'<Slate><Scene_Title><script>alert(1)</script></Scene_Title></Slate>'}));expect(injected).not.toContain('<script>');expect(injected).not.toContain('alert(1)');
});
it('顶栏、DRAFTING 与 content 只去包装，场景卡和正文保留，旧回复同样可显示',async()=>{
 const text='<顶栏>'+slate+'</顶栏>\n<DRAFTING>\n<content>你走进报到大厅。<think>隐藏推理</think>\n楚昭南看向你。</content>\n</DRAFTING>';
 const html=await renderToString(createSSRApp(StoryContent,{text}));
 for(const tag of ['&lt;顶栏','&lt;/顶栏','&lt;DRAFTING','&lt;content','隐藏推理'])expect(html).not.toContain(tag);
 expect(html).toContain('你走进报到大厅。');expect(html).toContain('楚昭南看向你。');expect(html).toContain('class="scene-slate"');
 const s=newSession('存档',{name:'玩家',appearance:'',background:'',personality:''},'');const v={id:'v',text,status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});finishVariant(s,0,v,{event:'报到'});expect(v.text).not.toContain('<DRAFTING>');expect(v.text).toContain('你走进报到大厅。');
});
it('分片未闭合的包装标签暂不闪出，未知 HTML 仍是不可执行文字',async()=>{
 for(const tag of ['<DRAFTING>','</DRAFTING>','<content>','</content>','<顶栏>','</顶栏>'])for(let i=1;i<tag.length;i++)expect(storyBlocks('正文'+tag.slice(0,i),true)).toEqual([{kind:'text',text:'正文'}]);
 const html=await renderToString(createSSRApp(StoryContent,{text:'<content><img src=x onerror=alert(1)>正文</content>'}));expect(html).not.toContain('<img');expect(html).toContain('&lt;img');expect(html).toContain('正文');
});
it('截图中的 DRAFTINKG 拼写变体及关闭标签不再显示，逐片输出也不会闪出',async()=>{
 const text='<DRAFTINKG><content>完整正文。</content></DRAFTINKG>';
 const html=await renderToString(createSSRApp(StoryContent,{text}));expect(html).toContain('完整正文。');expect(html).not.toContain('DRAFTINKG');
 for(const tag of ['<DRAFTINKG>','</DRAFTINKG>'])for(let i=1;i<tag.length;i++)expect(storyBlocks('正文'+tag.slice(0,i),true)).toEqual([{kind:'text',text:'正文'}]);
});
