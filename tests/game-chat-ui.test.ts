import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';import {renderToString} from 'vue/server-renderer';
import GameChat from '../src/components/GameChat.vue';import {partyDialogueLines} from '../src/domain/partyDialogueView';
import {createPartyRoom,startPartyRound,type ElevenRound,type PartyRound,type TruthRound} from '../src/domain/partyGames';import {startLiarRound,type LiarRound} from '../src/domain/liarDice';
const name=(id:string)=>({player:'玩家',a:'甲',b:'乙'} as Record<string,string>)[id]||id;
const render=(lines:{id:string;text:string}[])=>renderToString(createSSRApp(GameChat,{lines,name,label:'连续游戏对话'}));
function liar():LiarRound{
 const r=createPartyRoom('liar',['a','b'],'','','r');r.invitations={a:'accepted',b:'accepted'};const x=startPartyRound(r,undefined,()=>0) as LiarRound;x.starter='player';x.turn='player';x.moves=[{id:'player',action:'bid',bid:{count:3,face:2,pure:false},text:'我叫三个非二，别猜我。',replies:[],pending:false,replyWithNext:true},{id:'a',action:'bid',bid:{count:3,face:3,pure:false},text:'',replies:[{id:'a',text:'你刚才的冒号：不表示新角色。'},{id:'a',text:'同一个人又补充。'},{id:'b',text:'乙也在回话。'}],pending:false}];x.dialogueVersion=1;return x;
}
it('renders one flat log in exact input order, repeats same IDs and leaves colons inside the utterance',async()=>{
 const lines=[{id:'b',text:'第二位先说。'},{id:'b',text:'同一人继续。'},{id:'player',text:'玩家：冒号文本不能拆说话人。'},{id:'a',text:'最后一句。'}],html=await render(lines),visible=html.replace(/<[^>]*>/g,'');const positions=lines.map(line=>visible.indexOf(name(line.id)+'：'+line.text));expect(positions.every(n=>n>=0)).toBe(true);expect([...positions].sort((a,b)=>a-b)).toEqual(positions);expect(html).toContain('role="log"');expect(html).not.toMatch(/第 \d+ 波|波次|分组卡片/);expect((html.match(/<p/g)||[])).toHaveLength(4);
});
it('flattens XI wave speech and repeated roles across boundaries, final replies and modern interaction without wave markers',()=>{
 const round:ElevenRound={kind:'eleven',number:1,banker:'a',deck:[],hands:{player:['S-A'],a:['H-2'],b:['C-3']},stopped:[],turn:'',phase:'complete',winner:'a',flow:'waves-v1',waves:[{number:1,choices:{},speeches:[{id:'a',text:'第一句。'},{id:'a',text:'第二句。'}],status:'dealt',dialogueVersion:1},{number:2,choices:{},speeches:[{id:'b',text:'第三句。'}],status:'dealt',dialogueVersion:1}],batch:{version:1,pending:false,wave:2,playerInput:'',finalReplies:[{id:'a',text:'结算尾声。'}],dialogueVersion:1},replies:[{id:'player',text:'玩家后来补一句。'}],dialogueVersion:1};expect(partyDialogueLines(round).map(line=>line.text)).toEqual(['第一句。','第二句。','第三句。','结算尾声。','玩家后来补一句。']);
 const legacy={...round,dialogueVersion:undefined,phase:'playing' as const,replies:[{id:'b',text:'旧未完成回复需隐藏。'}]};expect(partyDialogueLines(legacy)).not.toContainEqual({id:'b',text:'旧未完成回复需隐藏。'});
});
it('orders truth choice dialogue, main answer, extra dialogue and later replies, avoiding an exact repeated main line',()=>{
 const r:TruthRound={kind:'truth',number:1,target:'a',card:{id:'t',truth:'题目',dare:'挑战'},choice:'truth',text:'本人的回答。',refused:false,phase:'complete',choiceDialogue:{version:1,lines:[{id:'a',text:'那我选真心话。'}]},dialogue:{version:1,lines:[{id:'a',text:'本人的回答。'},{id:'b',text:'我听到了。'},{id:'b',text:'再补一句。'}]},replies:[{id:'player',text:'用户真实补充。'},{id:'a',text:'任务之后又回应。'}],dialogueVersion:1};expect(partyDialogueLines(r).map(line=>line.text)).toEqual(['那我选真心话。','本人的回答。','我听到了。','再补一句。','用户真实补充。','任务之后又回应。']);
});
it('orders liar player bid, NPC table speech and later turn speech without duplicating replyWithNext',()=>{
 const r=liar();expect(partyDialogueLines(r).map(line=>line.text)).toEqual(['我叫三个非二，别猜我。','你刚才的冒号：不表示新角色。','同一个人又补充。','乙也在回话。']);
});
it('flattens historical rounds chronologically while preserving each repeated utterance',()=>{
 const lines=partyDialogueLines(liar());expect([...lines,...lines].map(x=>x.text)).toEqual(['我叫三个非二，别猜我。','你刚才的冒号：不表示新角色。','同一个人又补充。','乙也在回话。','我叫三个非二，别猜我。','你刚才的冒号：不表示新角色。','同一个人又补充。','乙也在回话。']);
});
