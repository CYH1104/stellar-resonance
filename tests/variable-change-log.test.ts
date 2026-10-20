import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {variableChangeLog} from '../src/domain/variableChangeLog';
import {initialState,copy} from '../src/domain/story';
import {useFormatErrors} from '../src/app/useFormatErrors';
import {FormatErrorRepository} from '../src/storage/formatErrors';
import FormatErrorsView from '../src/components/FormatErrorsView.vue';
it('captures immutable applied changes including unchanged affinity review, and rejects partial updates',()=>{
 const before=initialState('玩家'),after=copy(before);after.characters[0].affinity=31;const id=after.characters[0].id;
 const log=variableChangeLog(before,after,true,[id]);expect(log.changes.some(c=>c.path.includes('affinity')&&c.after==='31')).toBe(true);after.characters[0].affinity=80;expect(log.reviews[0].after).toBe(31);
 const unchanged=variableChangeLog(before,before,true,[id]);expect(unchanged.total).toBe(0);expect(unchanged.reviews[0].before).toBe(unchanged.reviews[0].after);
 expect(variableChangeLog(before,after,false).changes).toHaveLength(0);
});
it('stores independent generation snapshots and redacts private values in them',async()=>{
 const logs=useFormatErrors(()=>['synthetic-key']);await logs.clear();const before=initialState('玩家'),after=copy(before);after.player.name='synthetic-key';const snapshot=variableChangeLog(before,after,true);
 await logs.record('生成完成','GENERATION_COMPLETE','s','t','generation',{variantId:'v1',round:1,variables:snapshot});snapshot.changes[0].after='later edit';
 const stored=(await new FormatErrorRepository().read())[0];expect(stored.variantId).toBe('v1');expect(stored.variables?.changes[0].after).not.toBe('later edit');expect(JSON.stringify(stored)).not.toContain('synthetic-key');
 await logs.record('取消','GENERATION_INCOMPLETE','s','t','generation',{variantId:'v1',round:1,variables:variableChangeLog(before,before,false)});expect(logs.entries.value).toHaveLength(2);await logs.clear();
});
it('places variable changes after the corresponding log text without depending on current session',async()=>{
 const snapshot=variableChangeLog(initialState('玩家'),initialState('玩家'),true);
 const w={formatErrors:{entries:[{id:'log',at:'2026-10-21',sessionId:'s',turnId:'t',kind:'generation',code:'GENERATION_COMPLETE',raw:'本次运行结束',variantId:'v',round:1,variables:snapshot}],problem:''},localService:undefined};
 const html=await renderToString(createSSRApp(FormatErrorsView,{w:w as never}));expect(html.indexOf('变量变化 ·')).toBeGreaterThan(html.indexOf('本次运行结束'));expect(html).toContain('0 项已应用');
});
