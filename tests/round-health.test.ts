import {it,expect} from 'vitest';
import {needsStateRepair} from '../src/domain/roundHealth';
import {newSession,finishVariant} from '../src/domain/story';
import {defaultTheaters} from '../src/domain/theaters';
import type {Outcome} from '../src/domain/contracts';
import type {ViewModel} from '../src/app/useWorkspace';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import StoryActions from '../src/components/StoryActions.vue';
const settings=()=>defaultTheaters().map(s=>({...s,enabled:s.slot<=4,...(s.slot===4?{templateId:'spirit' as const}:{} )}));
function round(){
 const s=newSession('测试',{name:'玩家',appearance:'',background:'',personality:'',spiritAnimal:'白猫'},'');
 s.initial={player:{id:'player',name:'玩家',present:true,spiritAnimal:'白猫',spiritThought:'旧想法'},characters:[{id:'one',name:'同学',present:false,spiritAnimal:'狐狸',affinity:10,spiritThought:'旧想法'}]};
 const outcome:Outcome={event:'见面',player:{spiritThought:'想去认识狐狸'},characters:[{id:'one',present:true,affinity:12,spiritThought:'看看白猫'}],forum:[{id:'f',authorName:'同学',content:'动态'}],theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'同学',content:'你好'}]},{slot:3,kind:'fanfic',title:'同人文',content:'独立番外'.repeat(200)+'\nEND',complete:true,participantIds:['player','one']},{slot:4,kind:'custom',title:'精神体日记',content:'今天我认识了狐狸。'.repeat(40),diary:{ownerId:'player',signatureName:'白猫',signatureDate:'日期未详',title:'新朋友',content:'今天我认识了狐狸。'.repeat(40)}}]};
 const v={id:'v',text:'正文已完。',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'打招呼',selected:0,variants:[v]});finishVariant(s,0,v,outcome);return s;
}
it('完整状态和全部已开启小剧场无需补全；缺项补齐后恢复隐藏',()=>{
 const s=round();expect(needsStateRepair(s,0,settings())).toBe(false);
 const outcome=s.turns[0].variants[0].outcome!,group=outcome.theaters!.shift()!;
 expect(needsStateRepair(s,0,settings())).toBe(true);outcome.theaters!.push(group);expect(needsStateRepair(s,0,settings())).toBe(false);
});
it('继承上一轮数值不能掩盖本轮缺少好感或 OS，错误与占位内容也需要修复',()=>{
 for(const change of [(o:Outcome)=>delete o.player,(o:Outcome)=>delete o.characters![0].affinity,(o:Outcome)=>delete o.characters![0].spiritThought,(o:Outcome)=>o.player!.spiritThought='未提供',(o:Outcome)=>o.theaters![0].messages=[]]){
  const s=round();change(s.turns[0].variants[0].outcome!);expect(needsStateRepair(s,0,settings())).toBe(true);
 }
});
it('仅检查开启的小剧场，日记和指定同人文角色必须匹配',()=>{
 const s=round();const o=s.turns[0].variants[0].outcome!;o.forum=[];expect(needsStateRepair(s,0,settings())).toBe(true);
 const config=settings();config[0].enabled=false;expect(needsStateRepair(s,0,config)).toBe(false);
 delete o.theaters![2].diary;expect(needsStateRepair(s,0,config)).toBe(true);config[3].enabled=false;expect(needsStateRepair(s,0,config)).toBe(false);
 config[2].charId='other';expect(needsStateRepair(s,0,config)).toBe(true);
});
it('未完成回复使用续写入口，不被当作完整回合补全',()=>{const s=round();s.turns[0].variants[0].status='incomplete';expect(needsStateRepair(s,0,settings())).toBe(false);});
it('剧情界面仅在最新完整回复缺项时显示补全按钮，修好后隐藏',async()=>{
 const s=round(),w={active:s,preferences:{theaters:settings(),shortcuts:[],diceEnabled:false},busy:false,canContinue:true,input:''} as unknown as ViewModel;
 const render=()=>renderToString(createSSRApp(StoryActions,{w,index:0,showAvatar:true}));expect(await render()).not.toContain('>补全状态和小剧场</button>');
 const scene=s.turns[0].variants[0].outcome!.theaters!.pop()!;expect(await render()).toContain('>补全状态和小剧场</button>');s.turns[0].variants[0].outcome!.theaters!.push(scene);expect(await render()).not.toContain('>补全状态和小剧场</button>');
});
