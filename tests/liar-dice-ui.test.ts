import {it,expect} from 'vitest';import {createSSRApp} from 'vue';import {renderToString} from 'vue/server-renderer';
import LiarDiceTable from '../src/components/LiarDiceTable.vue';import {startLiarRound} from '../src/domain/liarDice';
const participants=['player','a','b'],name=(id:string)=>id==='player'?'玩家':id;
it('renders own dice only until a challenge is complete and does not leak pips in attributes',async()=>{
 const r=startLiarRound(participants,1,'player',undefined,()=>0);r.dice={player:[1,1,1,1,1],a:[6,6,6,6,6],b:[5,5,5,5,5]};const html=await renderToString(createSSRApp(LiarDiceTable,{round:r,participants,name,working:false,draft:''}));expect(html).toContain('⚀');expect(html).not.toContain('⚅');expect(html).not.toContain('⚄');expect(html).not.toContain('6点');expect(html).not.toContain('5点');expect(html).toContain('叫号');expect(html).toContain('五颗暗骰');
});
it('shows NPC turn as one action and public speech instead of inner commentary fields',async()=>{const r=startLiarRound(participants,1,'a',undefined,()=>0);const html=await renderToString(createSSRApp(LiarDiceTable,{round:r,participants,name,working:false,draft:''}));expect(html).toContain('请 a 叫号或开骰');expect(html).toContain('每次行动一次请求');expect(html).not.toContain('合法叫号');});
