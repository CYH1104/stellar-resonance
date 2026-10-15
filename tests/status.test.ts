import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import StatusBar from '../src/components/StatusBar.vue';
import type {ViewModel} from '../src/app/useWorkspace';
import type {Outcome,Session,Variant} from '../src/domain/contracts';
import {backup,defaults,encounteredCharacters,finishVariant,newSession,parseBackup,selectVariant,stateAt,truncate} from '../src/domain/story';
function game(){const s=newSession('状态测试',{name:'玩家',identity:'学院新生',primaryGender:'女',secondaryGender:'Beta',appearance:'',personality:'',background:'',spiritAnimal:'白猫'},'');s.initial={player:{id:'player',name:'玩家',present:true,primaryGender:'女',secondaryGender:'Beta',spiritAnimal:'白猫',spiritThought:'想晒太阳',innerThought:'玩家不该显示的想法'},characters:[{id:'one',name:'相遇甲',present:false},{id:'two',name:'未见乙',present:false,affinity:99}]};return s;}
function turn(s:Session,id:string,outcome:Outcome){const v:Variant={id:id+'-a',text:'剧情',status:'incomplete',createdAt:''};s.turns.push({id,input:'行动',variants:[v],selected:0,...(outcome.diceEvent?{dice:{value:outcome.diceEvent.direction==='negative'?1:outcome.diceEvent.direction==='positive'?80:50,grade:outcome.diceEvent.direction==='negative'?'大凶':outcome.diceEvent.direction==='positive'?'顺遂':'平平',rulesVersion:'d100-v1' as const}}:{})});finishVariant(s,s.turns.length-1,v,outcome);return v;}
function render(s:Session){const w={state:stateAt(s),active:s,preferences:{mode:'server'},localService:{runtime:'local-card'}} as unknown as ViewModel;return renderToString(createSSRApp(StatusBar,{w}));}
it('user 显示身份和精神体 OS，不显示自己的内心想法或未遇到角色好感度',async()=>{
  const s=game();turn(s,'one',{event:'初见',characters:[{id:'one',present:true,innerThought:'角色自己的想法',affinity:12}]});turn(s,'two',{event:'暂别',characters:[{id:'one',present:false,affinity:15}]});
  const html=await render(s);expect(html).toContain('学院新生');expect(html).toContain('想晒太阳');expect(html).toContain('相遇甲');expect(html).toContain('15');expect(html).not.toContain('未见乙');expect(html).not.toContain('玩家不该显示的想法');expect(html).not.toContain('内心想法');
});
it('提名、远程论坛和未完成稿不算相遇；切稿、回退按当前分支重算',async()=>{
  const s=game();turn(s,'one',{event:'提到了甲',forum:[{id:'remote',authorName:'相遇甲',content:'远程发帖'}],characters:[{id:'one',present:false}]});
  const v=turn(s,'two',{event:'见面',characters:[{id:'one',present:true,affinity:5}]});expect(encounteredCharacters(s).map(c=>c.id)).toEqual(['one']);
  const alternative:Variant={...v,id:'two-b',status:'incomplete'};s.turns[1].variants.push(alternative);finishVariant(s,1,alternative,{event:'独处',characters:[{id:'one',present:false}]});selectVariant(s,1,1);
  expect(encounteredCharacters(s)).toEqual([]);selectVariant(s,1,0);expect(encounteredCharacters(s)).toHaveLength(1);truncate(s,1);
  s.turns.push({id:'partial',input:'行动',selected:0,variants:[{id:'partial-a',text:'一半',status:'incomplete',createdAt:'',outcome:{event:'未完成',characters:[{id:'two',present:true}]}}]});
  expect(encounteredCharacters(s)).toEqual([]);const html=await render(s);expect(html).toContain('尚未遇到角色');expect(html).not.toContain('未见乙');
});
it('身份变化与骰子事件可随备份恢复，回退恢复原身份；旧存档仍可读取',()=>{
  const s=game();turn(s,'one',{event:'获得任命',player:{identity:'项目助理'},diceEvent:{direction:'positive',description:'获得了实习机会'},characters:[{id:'one',present:true}]});
  const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(stateAt(restored).player.identity).toBe('项目助理');expect(restored.turns[0].variants[0].outcome?.diceEvent?.description).toBe('获得了实习机会');expect(encounteredCharacters(restored)).toHaveLength(1);
  const forged=JSON.parse(backup({version:1,sessions:[s],preferences:defaults()}));forged.sessions[0].turns[0].variants[0].outcome.diceEvent.direction='negative';expect(()=>parseBackup(JSON.stringify(forged))).toThrow('骰子事件');
  truncate(restored,0);expect(stateAt(restored).player.identity).toBe('学院新生');expect(encounteredCharacters(restored)).toEqual([]);
});
it('精神体 OS 开局等待 AI，每轮展示 AI 更新，回退不保留后来的想法；旧存档恢复人设中的精神体',async()=>{
  const s=game();delete s.initial.player.spiritAnimal;delete s.initial.player.spiritThought;
  expect(stateAt(s).player.spiritAnimal).toBe('白猫');expect(await render(s)).toContain('等待 AI 随剧情生成');
  s.initial.player.spiritThought='未提供';expect(await render(s)).toContain('等待 AI 随剧情生成');delete s.initial.player.spiritThought;
  turn(s,'first',{event:'有人走近',player:{spiritThought:'耳朵竖起来了，看看来的是谁。'}});expect(await render(s)).toContain('耳朵竖起来了，看看来的是谁。');
  turn(s,'second',{event:'来人离开',player:{spiritThought:'放松下来，想找个地方趴着。'}});const latest=await render(s);expect(latest).toContain('放松下来，想找个地方趴着。');expect(latest).not.toContain('耳朵竖起来了');truncate(s,1);expect(await render(s)).toContain('耳朵竖起来了');
  truncate(s,0);expect(await render(s)).toContain('等待 AI 随剧情生成');delete s.persona.spiritAnimal;expect(await render(s)).toContain('请先在人设中填写精神体');
});
