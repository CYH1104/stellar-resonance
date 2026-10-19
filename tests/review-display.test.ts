import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import VariableChanges from '../src/components/VariableChanges.vue';
import {newSession,finishVariant} from '../src/domain/story';
import type {Outcome,Variant} from '../src/domain/contracts';

it('shows per-actor review states instead of treating a missing judgment as unchanged',async()=>{
  const session=newSession('显示',{name:'玩家',appearance:'',personality:'',background:''},'');
  const variant:Variant={id:'v',text:'正文',status:'incomplete',createdAt:''};
  session.turns.push({id:'t',input:'交谈',selected:0,variants:[variant]});
  const outcome:Outcome={event:'交谈',characters:[{id:'guide',affinity:32}],stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_ATTITUDE_REVIEW_MISSING'],review:{guide:'changed',engineer:'missing'}}};
  finishVariant(session,0,variant,outcome);
  const html=await renderToString(createSSRApp(VariableChanges,{session,index:0}));
  expect(html).toContain('样例引导员 · 已更新');
  expect(html).toContain('样例巡检员 · 缺少判断');
  expect(html).toContain('不会按“未变化”处理');
});
