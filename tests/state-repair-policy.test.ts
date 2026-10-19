import {expect,it} from 'vitest';
import {mergeRepairOutcome} from '../src/domain/stateRepair';
import {newSession,stateAt,copy} from '../src/domain/story';
import {applyMvu} from '../src/domain/mvu';
import {syncCharacterFacts} from '../src/domain/characterFacts';
import {replayIssues} from '../src/domain/stateReplay';
import type {Outcome,WorldState} from '../src/domain/contracts';
import {reactive} from 'vue';
const before:WorldState={player:{id:'player',name:'玩家',present:true},characters:[{id:'one',name:'甲',present:false,affinity:0,identity:'学生',mentalPowerLevel:'S级(空间操纵)'},{id:'two',name:'乙',present:false}]};
const previous:Outcome={event:'甲到场',mvu:[{op:'delta',path:'/characters/one/affinity',value:5}],characters:[{id:'one',present:true}]};
const effective:WorldState={...copy(before),characters:before.characters.map(c=>c.id==='one'?{...c,present:true,affinity:5}:c)};
it('保留名单按角色生效，明确的离场仍能提交，原增量不重复',()=>{
 const update:Outcome={event:'补全',mvu:[{op:'delta',path:'/characters/one/affinity',value:5}],characters:[{id:'one',present:false},{id:'two',present:true}],stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_ROSTER_RETAINED'],retainedPresentIds:['one']}};
 const merged=mergeRepairOutcome(previous,update,before,effective);
 expect(merged.characters?.find(c=>c.id==='one')).toMatchObject({present:true,affinity:5});expect(merged.characters?.find(c=>c.id==='two')?.present).toBe(true);
 const leave=mergeRepairOutcome(previous,{event:'离场',characters:[{id:'one',present:false}],stateUpdate:{status:'updated',received:true,storyComplete:true,codes:[],retainedPresentIds:[]}},before,effective);
 expect(leave.characters?.find(c=>c.id==='one')).toMatchObject({present:false,affinity:5});
 const keep=mergeRepairOutcome(previous,{event:'补全'},before,effective);expect(keep.characters?.find(c=>c.id==='one')?.affinity).toBe(5);
});
it('模型写身份不影响同批合法变量，失败 test 仍保持事务原子性',()=>{
 const result=applyMvu(before,[{op:'replace',path:'/characters/one/identity',value:'图书管理员'},{op:'replace',path:'/characters/one/mentalPowerLevel',value:'S'},{op:'delta',path:'/characters/one/affinity',value:3}]);
 expect(result.characters[0]).toMatchObject({identity:'学生',mentalPowerLevel:'S级(空间操纵)',affinity:3});
 expect(()=>applyMvu(before,[{op:'replace',path:'/characters/one',value:{...before.characters[0],identity:'篡改'}},{op:'test',path:'/characters/one/identity',value:'篡改'}])).toThrow();expect(before.characters[0].affinity).toBe(0);
 expect(applyMvu(before,[{op:'add',path:'/characters/two/identity',value:'编造职业'}]).characters[1].identity).toBeUndefined();
});
it('补修不会丢掉本轮首次登记 NPC 的既有身份、精神力或在场状态',()=>{
 const actor={id:'npc-new',name:'新同学',present:true,identity:'旁听生',mentalPowerLevel:'B级',affinity:8};
 const prior={event:'遇见新同学',characters:[actor]};
 const result=mergeRepairOutcome(prior,{event:'只补小剧场'},before,{...copy(effective),characters:[...effective.characters,actor]});
 expect(result.characters?.find(a=>a.id===actor.id)).toMatchObject(actor);
});
it('旧存档身份用权威投影纠正，旧正文、补丁和记忆原文均保留',()=>{
 const s=newSession('旧档',{name:'玩家',identity:'用户设定',mentalPowerLevel:'B级',appearance:'',background:'',personality:''},'');s.sourceDataset='world';s.initial=copy(before);
 s.turns=[{id:'t',input:'原输入',selected:0,variants:[{id:'v',text:'原正文',status:'complete',createdAt:'',outcome:{event:'原事件',mvu:[{op:'replace',path:'/characters/one/identity',value:'图书管理员'}],characters:[{id:'one',identity:'另一个职业',present:true,affinity:9}]}}]}];
 s.memories=[{id:'m',kind:'note',text:'旧记忆原文',createdAt:''}];const original=JSON.stringify({turns:s.turns,memories:s.memories,initial:s.initial});
 syncCharacterFacts(s,'world',[{id:'one',primaryGender:'男',identity:'银铃系 二年级',mentalPowerLevel:'B+级(共情与语言)'}]);
 for(let i=0;i<10;i++)expect(stateAt(s).characters[0]).toMatchObject({identity:'银铃系 二年级',mentalPowerLevel:'B+级(共情与语言)',present:true,affinity:9});
 expect(JSON.stringify({turns:s.turns,memories:s.memories,initial:{...s.initial,characters:s.initial.characters.map(({primaryGender,...a})=>a)}})).toBe(original);
 expect(stateAt(s).player.identity).toBe('用户设定');
});
it('非法轮次留痕去重且有上限，不改变前一有效状态',()=>{
 const s=newSession('诊断',{name:'玩家',appearance:'',background:'',personality:''},'');s.initial=copy(before);
 s.turns=Array.from({length:50},(_,i)=>({id:'t'+i,input:'行动',selected:0,variants:[{id:'v'+i,text:'正文',createdAt:'',status:'complete',outcome:{event:'事件',mvu:[{op:'replace',path:'/characters/missing/affinity',value:1}]}}]}));
 stateAt(s);stateAt(s);expect(replayIssues(s)).toHaveLength(40);expect(replayIssues(s)[0]).toMatchObject({round:50,stage:'状态校验'});expect(stateAt(s).characters[0].present).toBe(false);
 const proxy=reactive(s);expect(()=>stateAt(proxy)).not.toThrow();expect(replayIssues(proxy)[0].fieldPath).toBe('/characters/missing/affinity');
});
