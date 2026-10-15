import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {storyBlocks} from '../src/domain/storyMarkup';
import StoryContent from '../src/components/StoryContent.vue';
const slate='<Slate>\n<Scene_NO>001</Scene_NO>\n<Scene_Title>金属与浮尘</Scene_Title>\n<EN_Title>Stardust Path</EN_Title>\n<Quote>新生踏入中立之地的第一步。</Quote>\n<Location>盖亚之眼 · 学院正门广场</Location>\n<Ti>0578.09.01 · 09:15</Ti>\n</Slate>';
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
  const injected=await renderToString(createSSRApp(StoryContent,{text:'<Slate><Scene_Title><script>alert(1)</script></Scene_Title></Slate>'}));expect(injected).not.toContain('<script>');expect(injected).toContain('&lt;script&gt;');
});
