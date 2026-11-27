import {computed,reactive} from 'vue';
import {describe,it,expect} from 'vitest';
import {newSession,stateAt,backup,parseBackup,defaults} from '../src/domain/story';
import {terminalStoryClock,scenePaths} from '../src/domain/storyScene';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import StoryView from '../src/components/StoryView.vue';
import type {ViewModel} from '../src/app/useWorkspace';
import {dataFromState} from '../src/domain/mvu';
import {storyRenderStates} from '../src/app/storyRenderState';

function fixture(){
 const session=reactive(newSession('渲染测试',{name:'玩家',appearance:'',personality:'',background:''},'开场'));
 session.turns.push({id:'t1',input:'第一轮',selected:0,variants:[{id:'v1',text:'正文',status:'complete',createdAt:'2026-10-27',outcome:{event:'第一轮'}}]});
 session.turns.push({id:'t2',input:'第二轮',selected:0,variants:[{id:'v2',text:'',status:'incomplete',createdAt:'2026-10-27'}]});
 const rows=computed(()=>storyRenderStates(session,session.turns.map((_,i)=>i)));
 return {session,rows};
}
describe('opening scene header',()=>{
 it('preserves per-variant opening while terminal follows the latest ending and people come from before the turn',()=>{
  const s=newSession('星历',{name:'玩家',appearance:'',personality:'',background:''},'');
  s.initial.characters=[{id:'a',name:'开场同伴',present:true},{id:'b',name:'结尾来客',present:false}];
  s.turns.push({id:'t',input:'去图书馆',selected:0,variants:[{id:'v',text:'从教室出发，晚上到达图书馆。',status:'complete',createdAt:'now',outcome:{event:'到达',openingScene:{日期:'星历578年09月01日',时间:'08:00',地点:'教室'},characters:[{id:'a',present:false},{id:'b',present:true}],mvu:[{op:'replace',path:scenePaths.日期,value:'星历578年09月01日'},{op:'replace',path:scenePaths.时间,value:'19:00'},{op:'replace',path:scenePaths.地点,value:'图书馆'}]}}]});
  const row=storyRenderStates(s,[0]).get(0)!;
  expect(row.openingTime).toBe('星历578年09月01日 · 08:00');expect(row.openingLocation).toBe('教室');expect(row.openingPeople).toContain('开场同伴');expect(row.openingPeople).not.toContain('结尾来客');
  expect(terminalStoryClock(stateAt(s))).toMatchObject({time:'19:00',location:'图书馆',day:0});
  const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
  expect(storyRenderStates(restored,[0]).get(0)).toEqual(row);
  restored.turns.push({id:'t2',input:'继续',selected:0,variants:[{id:'v2',text:'次日',status:'complete',createdAt:'now',outcome:{event:'次日',mvu:[{op:'replace',path:scenePaths.日期,value:'星历578年09月02日'}]}}]});
  expect(storyRenderStates(restored,[0]).get(0)).toEqual(row);
  expect(terminalStoryClock(stateAt(restored)).label).toBe('星历578年09月02日');
  restored.turns[0].variants.push({...restored.turns[0].variants[0],id:'branch',outcome:{event:'另一个开场',openingScene:{日期:'星历578年09月03日',时间:'10:00',地点:'操场'}}});restored.turns[0].selected=1;
  expect(storyRenderStates(restored,[0]).get(0)!.openingLocation).toBe('操场');
 });
 it('renders fixed named fields below the academy signature even for legacy unknown scenes',async()=>{
  const {session}=fixture();
  const w={active:session,preferences:defaults(),busy:false,input:''} as unknown as ViewModel;
  const html=await renderToString(createSSRApp(StoryView,{w}));
  expect(html).toContain('aria-label="本轮开场时间地点人物"');expect(html).toContain('<dt>时间</dt>');expect(html).toContain('<dt>地点</dt>');expect(html).toContain('<dt>人物</dt>');expect(html).toContain('时间待明确');expect(html).toContain('地点待明确');expect(html).toContain('本轮开始前在场');
  expect(html.indexOf('INTERSTELLAR ACADEMY')).toBeLessThan(html.indexOf('本轮开场时间地点人物'));
 });
});
describe('stable state for streaming story rendering',()=>{
 it('keeps every replay and iframe context cached across prose deltas',()=>{
  const {session,rows}=fixture(),before=rows.value;
  for(let i=0;i<100;i++){
   session.turns[1].variants[0].text+='流式文字';
   expect(rows.value).toBe(before);
  }
  expect(rows.value.get(1)!.context.variables).toEqual(dataFromState(stateAt(session,2)));
 });
 it('updates after a branch, an outcome, a persona or initial variables change',()=>{
  const {session,rows}=fixture();let before=rows.value;
  session.initial.player.name='更新后的玩家';expect(rows.value).not.toBe(before);before=rows.value;
  session.persona.name='新昵称';expect(rows.value.get(0)!.context.user).toBe('新昵称');expect(rows.value).not.toBe(before);before=rows.value;
  session.turns[1].variants[0].status='complete';session.turns[1].variants[0].outcome={event:'完成'};
  expect(rows.value).not.toBe(before);before=rows.value;
  session.turns[0].variants.push({...session.turns[0].variants[0],id:'branch',outcome:{event:'分支'}});
  session.turns[0].selected=1;expect(rows.value).not.toBe(before);
  expect(rows.value.get(1)!.context.variables).toEqual(dataFromState(stateAt(session,2)));
 });
});

it('replays a long visible story window once instead of replaying every prefix for every row',()=>{
 const s=newSession('合成长存档',{name:'玩家',appearance:'',personality:'',background:''},'开场');let reads=0;
 for(let i=0;i<60;i++)s.turns.push({id:'t'+i,input:'继续',selected:0,variants:[{id:'v'+i,text:'正文',status:'complete',createdAt:'now',outcome:{get event(){reads++;return '事件';}}}]});
 const rows=storyRenderStates(s,Array.from({length:10},(_,i)=>50+i));
 expect(rows.size).toBe(10);expect(reads).toBeLessThan(300);
});
