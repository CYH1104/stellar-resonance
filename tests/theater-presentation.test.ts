import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import GroupChatPhone from '../src/components/GroupChatPhone.vue';
import SpiritDiaryView from '../src/components/SpiritDiaryView.vue';
import FloatingGroupChat from '../src/components/FloatingGroupChat.vue';
import TheaterRail from '../src/components/TheaterRail.vue';
import type {ViewModel} from '../src/app/useWorkspace';
import type {TheaterScene} from '../src/domain/contracts';
import {cleanTheaters,defaultTheaters,cleanTheaterScenes} from '../src/domain/theaters';
import {isSpiritDiary,diaryInstruction,legacyDiaryInstruction} from '../src/domain/spiritDiary';
import {backup,defaults,newSession,parseBackup,finishVariant} from '../src/domain/story';
const diary:TheaterScene={slot:4,kind:'custom',title:'精神体日记',content:'',diary:{ownerId:'player',ownerName:'祁言',spiritAnimal:'白猫',title:'留给主人的半块鱼干',mood:'满足',date:'0578.09.01',content:'今天我找到了鱼干。\n\n我偷偷给主人留了一半。'}};
it('群聊显示手机框、头像与消息气泡，玩家靠右，无虚假的发送功能',async()=>{
  const scene:TheaterScene={slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'楚昭南',content:'带上通知书。'},{speaker:'祁言',content:'好，我记得。'}]};const html=await renderToString(createSSRApp(GroupChatPhone,{scene,title:'新生群',playerName:'祁言'}));expect(html).toContain('chat-phone');expect(html).toContain('phone-message-mine');expect(html).toContain('phone-avatar');expect(html).toContain('2 位发言');expect(html).toContain('带上通知书。');expect(html).not.toContain('只读小剧场');expect(html).not.toContain('<form');expect(html).not.toContain('<input');
});
it('日记有篇名、故事日期、作者、心情与分段正文，未知日期不编造',async()=>{
  const html=await renderToString(createSSRApp(SpiritDiaryView,{scene:diary,title:'精神体日记'}));for(const text of ['留给主人的半块鱼干','0578.09.01','白猫的日记','主人：祁言','心情：满足','今天我找到了鱼干。','我偷偷给主人留了一半。'])expect(html).toContain(text);expect(html).toContain('diary-pages');const missing={...diary,diary:{...diary.diary!,date:undefined}};expect(await renderToString(createSSRApp(SpiritDiaryView,{scene:missing,title:'精神体日记'}))).not.toContain('故事日期未记录');
});
it('旧日记按原文展示且不附加结构说明，不把动作描述悄悄改成日记，HTML不能执行',async()=>{
  const content='白猫甩了甩尾巴。<img src=x onerror="alert(1)">';const html=await renderToString(createSSRApp(SpiritDiaryView,{scene:{...diary,diary:undefined,content},title:'精神体日记'}));expect(html).toContain('白猫甩了甩尾巴。');expect(html).not.toContain('此记录没有独立日记字段');expect(html).not.toContain('<img');expect(html).not.toContain('主人：');
});
it('旧精神体日记模板迁移且保留自定义内容要求，其他自定义模板不误判',()=>{
  const settings=defaultTheaters();settings[3]={slot:4,kind:'custom',enabled:true,title:'精神体日记',instruction:legacyDiaryInstruction};const migrated=cleanTheaters(settings);expect(migrated[3].templateId).toBe('spirit');expect(migrated[3].instruction).toBe(diaryInstruction);settings[3].instruction='我另写的日记要求';expect(cleanTheaters(settings)[3].instruction).toBe('我另写的日记要求');expect(isSpiritDiary({...settings[3],templateId:'interview'})).toBe(false);expect(()=>cleanTheaters(settings.map(s=>({...s,templateId:'unknown'})))).toThrow();
});
it('结构化日记随存档恢复且保持与精神体OS独立，旧文字场景兼容',()=>{
  const session=newSession('测试',{name:'祁言',appearance:'',personality:'',background:'',spiritAnimal:'白猫'},''),variant={id:'v',text:'你站在窗边。',createdAt:'',status:'incomplete' as const};session.turns.push({id:'t',input:'看看窗外',variants:[variant],selected:0});finishVariant(session,0,variant,{event:'观察窗外',player:{spiritThought:'想晒太阳。'},theaters:[diary]});const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[session]}));expect(restored.sessions[0].turns[0].variants[0].outcome?.theaters?.[0].diary?.title).toBe(diary.diary?.title);expect(restored.sessions[0].turns[0].variants[0].outcome?.player?.spiritThought).toBe('想晒太阳。');expect(cleanTheaterScenes([{slot:4,kind:'custom',title:'旧日记',content:'旧记录'}])[0].content).toBe('旧记录');
});
it('四窗口以折叠栏展示手机及日记，只保留高度手柄',async()=>{
  const preferences=defaults();preferences.theaters![0].enabled=false;preferences.theaters![3]={slot:4,enabled:true,kind:'custom',title:'精神体日记',instruction:legacyDiaryInstruction};const w={preferences,theaters:[diary,{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'楚昭南',content:'报到了吗？'}]}],state:{player:{name:'祁言'}}} as unknown as ViewModel;
  const html=await renderToString(createSSRApp(TheaterRail,{w}));expect(html).not.toContain('aria-label="手机群聊"');expect(html).toContain('aria-label="精神体日记"');expect(html).toContain('<summary');expect(html).not.toContain('resize-both');expect(html).toContain('调整精神体日记高度');
});


it('群聊默认收起为悬浮手机SVG，不占右栏卡片',async()=>{const w={preferences:{theaters:[{slot:2,kind:'group',enabled:true,title:'群聊'}]},theaters:[],state:{player:{name:'玩家'}}} as unknown as ViewModel;const html=await renderToString(createSSRApp(FloatingGroupChat,{w}));expect(html).toContain('打开群聊手机');expect(html).toContain('<svg');expect(html).not.toContain('手机群聊');});

it('renders inline CSS in custom theater, group and diary bodies',async()=>{
 const content='Before\n<div style="background:linear-gradient(145deg,#18181b,#27272a);border-radius:10px;padding:22px"><h3 style="color:#f87171">PJ-001</h3><p>Styled theater</p></div>\nAfter';
 const settings=defaults();settings.theaters=[{slot:3,kind:'custom',title:'CSS',enabled:true,instruction:''}];
 const scene={slot:3,kind:'custom',title:'CSS',content} as TheaterScene;
 const w={preferences:settings,theaters:[scene],forum:[]} as unknown as ViewModel;
 const outputs=[await renderToString(createSSRApp(TheaterRail,{w})),await renderToString(createSSRApp(GroupChatPhone,{scene:{...scene,kind:'group',messages:[{speaker:'NPC',content}]},title:'Chat',playerName:'Player'})),await renderToString(createSSRApp(SpiritDiaryView,{scene:{...diary,diary:{...diary.diary!,content}},title:'Diary'}))];
 for(const html of outputs){expect(html).toContain('sandbox="allow-scripts"');expect(html).toContain('linear-gradient(145deg,#18181b,#27272a)');expect(html).toContain('PJ-001');expect(html).toContain('Before');expect(html).toContain('After');}
 expect(scene.content).toBe(content);
});
