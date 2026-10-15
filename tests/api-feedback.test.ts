import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import ApiProfileEditor from '../src/components/ApiProfileEditor.vue';
import ApiSettings from '../src/components/ApiSettings.vue';
import StoryView from '../src/components/StoryView.vue';
import type {ViewModel} from '../src/app/useWorkspace';
import {defaults,newSession} from '../src/domain/story';
it('文字与向量表单均保留获取模型、测试与保存，说明默认折叠到问号',async()=>{
  const p=defaults().profiles[0],w={credentials:{},connectionReady:()=>false} as unknown as ViewModel;
  for(const embedding of [false,true]){
    const html=await renderToString(createSSRApp(ApiProfileEditor,{w,p,title:'测试 API',embedding}));
    expect(html).toContain('测试连接');expect(html).toContain('获取模型');expect(html).toContain('保存 API');expect(html).toContain('<select');expect(html).toContain('测试 API说明');expect(html).not.toContain('可能计费');expect(html).not.toContain('Temperature');
  }
});
it('副接口下拉显示全部选项但只展开一份，新增表单和详细设置默认收起，向量攻略简短',async()=>{
  const preferences=defaults(),auxiliaryProfiles=preferences.profiles.filter(p=>![preferences.mainProfile,preferences.embeddingProfile].includes(p.id));
  auxiliaryProfiles.push({...auxiliaryProfiles[0],id:'extra',name:'另一副 API'});
  const w={preferences,auxiliaryProfiles,credentials:{},connectionReady:()=>false,apiSelectable:()=>false,apiReady:false} as unknown as ViewModel;
  const html=await renderToString(createSSRApp(ApiSettings,{w}));expect(html).toContain('另一副 API');expect(html.match(/class="api-card compact-api-card"/g)).toHaveLength(3);expect(html).toContain('增加副 API');expect(html).not.toContain('<dialog');expect(html).not.toContain('<details open');expect(html).toContain('BAAI/bge-m3');expect(html).toContain('Pro/BAAI/bge-m3');expect(html).not.toContain('<table');
});
it('正文为空时仍展示生成阶段，失败原因也出现在输入区旁',async()=>{
  const active=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  const w={active,preferences:defaults(),busy:true,generationPhase:'中转站正在返回数据，目前尚无可展示正文',generationStarted:Date.now(),problem:'模型没有返回可展示正文',input:''} as unknown as ViewModel;
  const html=await renderToString(createSSRApp(StoryView,{w}));expect(html).toContain('中转站正在返回数据');expect(html).toContain('模型没有返回可展示正文');expect(html).toContain('停止生成');
});
it('待选事件展示两种决定、不展示空正文，恢复中断显示重试和跳过',async()=>{
  const active=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'');active.turns.push({id:'t',input:'本轮行动',randomEvent:{status:'pending',proposal:{kind:'奇遇事件',title:'来信',description:'等待查看。'}},variants:[],selected:0});
  const w={active,preferences:defaults(),busy:false,input:'下一轮',pendingRandomEvent:true} as unknown as ViewModel;
  const html=await renderToString(createSSRApp(StoryView,{w}));expect(html).toContain('等待查看。');expect(html).toContain('拒绝触发，正常生成正文');expect(html).toContain('Roll D100，触发事件');expect(html).not.toContain('assistant-message');expect(html).toContain('type="submit" disabled');
  active.turns[0].randomEvent={status:'preparing',kind:'奇遇事件'};const restored=await renderToString(createSSRApp(StoryView,{w}));expect(restored).toContain('重试事件候选');expect(restored).toContain('跳过事件，生成正文');
});
