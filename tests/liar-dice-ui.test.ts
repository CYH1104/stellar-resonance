import {it,expect} from 'vitest';
import {createSSRApp,defineComponent,h,nextTick} from 'vue';
import {renderToString} from 'vue/server-renderer';
import LiarDiceTable from '../src/components/LiarDiceTable.vue';
import {startLiarRound,type LiarRound,type LiarBid} from '../src/domain/liarDice';
const participants=['player','a','b'],name=(id:string)=>id==='player'?'玩家':id;
function round(previous?:LiarBid):LiarRound{
 const r=startLiarRound(participants,1,'player',undefined,()=>0);
 r.dice={player:[1,1,1,1,1],a:[6,6,6,6,6],b:[5,5,5,5,5]};r.rulesVersion='liar-v1';
 if(previous)r.moves.push({id:'b',action:'bid',bid:previous,text:'我先叫。',replies:[{id:'a',text:'先看你怎么说。'},{id:'b',text:'敢不敢继续？'}],pending:false});
 return r;
}
const render=(r=round(),extra:Record<string,unknown>={})=>renderToString(createSSRApp(LiarDiceTable,{round:r,participants,name,working:false,draft:'',...extra}));
const buttons=(html:string)=>Array.from(html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g),m=>m[1].replace(/<[^>]+>/g,'').trim());
const quantity=(html:string)=>html.match(/<input\b[^>]*aria-label="叫号数量"[^>]*>/)?.[0]||html.match(/<input\b[^>]*type="number"[^>]*>/)?.[0]||'';
it('renders bounded numeric count and two short selects, never the full legal bid dropdown',async()=>{
 const html=await render();const input=quantity(html);expect(input).toContain('type="number"');expect(input).toContain('inputmode="numeric"');expect(input).toContain('step="1"');expect(input).toContain('min="3"');expect(input).toContain('max="15"');expect(input).toContain('value="3"');expect((html.match(/<select\b/g)||[])).toHaveLength(2);expect((html.match(/<option\b/g)||[])).toHaveLength(8);expect(html).not.toContain('合法叫号');expect(buttons(html)).toContain('叫号并继续');
});
it('defaults to a minimum valid 斋/非 combination and handles the pure-six ceiling',async()=>{
 const fromWild=quantity(await render(round({count:5,face:6,pure:false})));expect(fromWild).toContain('min="5"');expect(fromWild).toContain('value="5"');
 const fromPure=quantity(await render(round({count:5,face:1,pure:true})));expect(fromPure).toContain('min="5"');expect(fromPure).toContain('value="5"');
 const edge=await render(round({count:15,face:5,pure:true}));expect(quantity(edge)).toContain('min="15"');expect(quantity(edge)).toContain('value="15"');expect(edge.match(/<option value="wild"[^>]*>/)?.[0]).toContain('disabled');
 const terminal=await render(round({count:15,face:6,pure:true}));expect(terminal).toContain('已经无法再加叫');expect(quantity(terminal)).toBe('');expect(buttons(terminal)).toEqual(['开上家']);
});
it('shows automatic NPC waiting without a normal advance button and exposes retries only on an idle error',async()=>{
 const r=round();r.turn='a';const html=await render(r);expect(html).toContain('正在等待a自动叫号或开骰');expect(buttons(html)).toEqual([]);expect(html).not.toContain('请 a');expect(html).not.toContain('叫号并继续');
 expect(buttons(await render(r,{error:'断线'}))).toEqual(['重试角色行动']);expect(buttons(await render(r,{error:'断线',working:true}))).toEqual([]);
});
it('a saved pending bid waits for the next actor and full table response, without manual normal progression',async()=>{
 const r=round({count:3,face:2,pure:false});r.moves[0].id='player';r.moves[0].pending=true;r.moves[0].replies=[];r.turn='a';const html=await render(r);expect(html).toContain('叫号已保存，正在等待下家行动和全桌回应');expect(buttons(html)).toEqual([]);expect(buttons(await render(r,{error:'断线'}))).toEqual(['重试本轮行动']);expect(buttons(await render(r,{error:'断线',working:true}))).toEqual([]);
 r.moves[0].action='open';delete r.moves[0].bid;r.phase='complete';expect(await render(r)).toContain('开骰已保存，正在等待全桌回应');
});
it('hides opponents in DOM attributes until complete, renders only public records, and is control-free in read-only mode',async()=>{
 const r=round({count:3,face:2,pure:false});(r.moves[0] as unknown as {inner:string}).inner='SECRET-INNER-MONOLOGUE';const html=await render(r);expect(html).toContain('⚀');expect(html).not.toContain('⚅');expect(html).not.toContain('⚄');expect(html).not.toContain('6点');expect(html).not.toContain('5点');expect(html).toContain('五颗暗骰');expect(html).toContain('先看你怎么说。');expect(html).not.toContain('SECRET-INNER-MONOLOGUE');
 const readOnly=await render(r,{readOnly:true,error:'断线'});expect(buttons(readOnly)).toEqual([]);expect(readOnly).not.toContain('<input');expect(readOnly).not.toContain('<select');expect(readOnly).not.toContain('<textarea');
 r.phase='complete';r.winner='player';r.loser='a';r.actual=3;const revealed=await render(r,{readOnly:true});expect(revealed).toContain('⚅');expect(revealed).toContain('⚄');expect(revealed).toContain('6点');expect(revealed).toContain('实际共有 3 个');
});

async function formState(r=round()){
 // The Vite test pipeline compiles SFCs for SSR. Capture the actual setup logic in a supplied SSR context.
 let state:any;const bids:LiarBid[]=[];
 const Harness=defineComponent({setup(){state=(LiarDiceTable as any).setup({round:r,participants,name,working:false,draft:'',readOnly:false,error:''},{expose(){},emit:(event:string,bid:LiarBid)=>{if(event==='bid')bids.push(bid);}});return ()=>h('div');}});
 await renderToString(createSSRApp(Harness));return {state,bids};
}
it('does not clamp while typing 10, disallows invalid quantities and normalises only on blur or change',async()=>{
 const {state:s,bids}=await formState();const type=async(value:string)=>{s.onCountInput({target:{value}});await nextTick();};
 await type('1');expect(s.countText.value).toBe('1');expect(s.chosen.value).toBeUndefined();await type('10');expect(s.countText.value).toBe('10');expect(s.chosen.value).toEqual({count:10,face:1,pure:false});s.submitBid();expect(bids).toEqual([{count:10,face:1,pure:false}]);
 for(const value of ['','2','15.5','1e1','99']){await type(value);expect(s.chosen.value,value).toBeUndefined();s.submitBid();expect(bids).toHaveLength(1);}
 s.normaliseCount();expect(s.countText.value).toBe('15');await type('');s.normaliseCount();expect(s.countText.value).toBe('3');await type('3.9');expect(s.chosen.value).toBeUndefined();s.normaliseCount();expect(s.countText.value).toBe('3');
});
it('raises the count immediately for 斋-to-非 and same-face/lower-face changes, with no invalid default',async()=>{
 const {state:s}=await formState(round({count:5,face:1,pure:true}));expect(s.minimum.value).toBe(5);expect(s.countText.value).toBe('5');expect(s.face.value).toBe(2);
 s.changeMode({target:{value:'wild'}});expect(s.minimum.value).toBe(7);expect(s.countText.value).toBe('7');s.changeMode({target:{value:'pure'}});expect(s.minimum.value).toBe(5);expect(s.countText.value).toBe('7');
 s.onCountInput({target:{value:'5'}});s.changeFace({target:{value:'1'}});expect(s.minimum.value).toBe(6);expect(s.countText.value).toBe('6');expect(s.chosen.value).toEqual({count:6,face:1,pure:true});
});
