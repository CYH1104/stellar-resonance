import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import StoryView from '../src/components/StoryView.vue';
import ForumFeed from '../src/components/ForumFeed.vue';
import SpiritDiaryView from '../src/components/SpiritDiaryView.vue';
import TheaterRail from '../src/components/TheaterRail.vue';
import {defaults,newSession} from '../src/domain/story';
import {memoryProgress} from '../src/domain/memoryProgress';
import {stateUpdateDetails} from '../src/domain/stateUpdate';
import type {ViewModel} from '../src/app/useWorkspace';
import type {Memory} from '../src/domain/contracts';
function workspace(hideFloors=true,suggestionsEnabled=true){
 const active=newSession('分页测试',{name:'玩家',appearance:'',personality:'',background:''},'开局');
 for(let i=1;i<=12;i++)active.turns.push({id:'t'+i,input:'行动'+i,selected:0,variants:[{id:'v'+i,text:'第'+i+'轮正文',createdAt:'',status:'complete',outcome:{event:'事件',suggestions:['建议'+i]}}]});
 const preferences={...defaults(),suggestionsEnabled,theaters:defaults().theaters!.map(t=>({...t,enabled:false}))};
 return {active,preferences,hideFloors,busy:false,input:'',forum:[]} as unknown as ViewModel;
}
it('12轮默认只呈现第3–12轮，编号使用实际轮次，关闭隐藏后保留完整原文',async()=>{
 const w=workspace();const html=await renderToString(createSSRApp(StoryView,{w}));
 expect(html).not.toContain('id="turn-t1"');expect(html).not.toContain('id="turn-t2"');
 expect(html).toContain('id="turn-t3"');expect(html).toContain('NO.12');expect(html).toContain('第 3–12 轮');
 const all=await renderToString(createSSRApp(StoryView,{w:workspace(false)}));expect(all).toContain('id="turn-t1"');expect(all).toContain('id="turn-t12"');expect(w.active?.turns).toHaveLength(12);
});
it('关闭行动建议立即隐藏历史和当前回复的建议，开启可恢复',async()=>{
 const off=await renderToString(createSSRApp(StoryView,{w:workspace(true,false)}));expect(off).not.toContain('inline-suggestions');expect(off).not.toContain('建议12');
 expect(await renderToString(createSSRApp(StoryView,{w:workspace()}))).toContain('建议12');
});
it('论坛保留内容与评论，但不再显示来源剧情入口',async()=>{
 const w=workspace();(w.forum as unknown[]).push({key:'post',turnId:'t1',authorName:'校园墙',content:'图书馆上新了',comments:[]});
 const html=await renderToString(createSSRApp(ForumFeed,{w}));expect(html).toContain('图书馆上新了');expect(html).toContain('评论 0');expect(html).not.toContain('来源剧情');
});
it('日记真实署名显示在正文之后；旧日记缺少署名时提示未确认，不伪造署名',async()=>{
 const diary={ownerId:'player',title:'晒太阳',content:'我'.repeat(200),signatureName:'小白',signatureDate:'学院第2日'};
 const scene={slot:4,kind:'custom' as const,title:'日记',content:'',diary};
 const signed=await renderToString(createSSRApp(SpiritDiaryView,{scene,title:'日记'}));expect(signed.indexOf('diary-closing-signature')).toBeGreaterThan(signed.indexOf('diary-pages'));expect(signed).toContain('小白');expect(signed).toContain('学院第2日');expect(signed).not.toContain('可能截断');
 const old=await renderToString(createSSRApp(SpiritDiaryView,{scene:{...scene,diary:{...diary,signatureName:undefined}},title:'日记'}));expect(old).not.toContain('diary-closing-signature');expect(old).toContain('尚未确认完成');
});
it('同人文保留截断内容并明确提示；只有实际末尾标记才显示 END',async()=>{
 const w=workspace();w.preferences.theaters![2].enabled=true;
 w.theaters=[{round:12,slot:3,kind:'fanfic',title:'番外',content:'独立番外'.repeat(200),complete:true,participantIds:['player','guide']}];
 const render=()=>renderToString(createSSRApp(TheaterRail,{w}));
 const cut=await render();expect(cut).toContain('未收到结尾 END');expect(cut).not.toContain('class="fanfic-end"');expect(cut).toContain('独立番外');
 w.theaters[0].content+='\nEND';const done=await render();expect(done).toContain('class="fanfic-end">END');expect(done).not.toContain('可能截断');
});
it('失败和中断不会伪装成未满整理间隔，历史分支的任务不污染当前回复',()=>{
 const m:Memory={id:'m',kind:'event',text:'原文',createdAt:'',sourceTurn:'t',sourceVariant:'v',status:'pending'};
 const s=newSession('任务',{name:'玩家',appearance:'',personality:'',background:''},'');s.memoryTasks=[{id:'task',source:{sessionId:s.id,sourceTurnId:'t',sourceVariantId:'v',sourceTextHash:'h',sourceStateRevision:'r'},status:'failed',extractorVersion:'ledger-v1',attempts:1,updatedAt:''}];
 expect(memoryProgress(m,s,true)).toContain('整理失败');s.memoryTasks![0].status='running';expect(memoryProgress(m,s,true)).toContain('被中断');expect(memoryProgress(m,s,true,true)).toContain('正在后台');s.memoryTasks![0].source.sourceVariantId='other';expect(memoryProgress(m,s,true)).toContain('等待后台逐轮');
 expect(stateUpdateDetails({event:'事件',stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_MVU_REJECTED','MODEL_DIARY_UNFINISHED']}}).map(d=>d.text).join('；')).toContain('署名');
});
