import {randomInt} from 'node:crypto';
import {stripReasoning} from '../src/domain/reasoning.ts';
import {validateGameDialogue} from '../src/domain/gameDialogue.ts';
/** Randomise public conversation only, never game decisions, cards, dice, penalties or outcomes. */
export function createGameDialoguePlan(ids,requiredIds=[],random=n=>randomInt(n)){
 const unique=[...new Set(ids)];if(!unique.length||unique.length>7||unique.some(id=>typeof id!=='string'||id==='player')||requiredIds.some(id=>!unique.includes(id)))throw Error('INVALID_DIALOGUE_ROSTER');
 const pick=n=>{const v=random(n);if(!Number.isInteger(v)||v<0||v>=n)throw Error('INVALID_DIALOGUE_RANDOM');return v;};const slots=[];
 for(const id of unique){const roll=pick(100),count=roll<4&&!requiredIds.includes(id)?0:roll>=97?3:roll>=80?2:1;for(let i=0;i<count;i++)slots.push(id);}
 if(!slots.length)slots.push(unique[pick(unique.length)]);
 for(let i=slots.length-1;i>0;i--){const j=pick(i+1);[slots[i],slots[j]]=[slots[j],slots[i]];}
 return {version:1,slots};
}
export const GAME_DIALOGUE_PROMPT='公开聊天使用独立dialogue数组，按dialogueSchedule.slots给出的说话人顺序，每个槽位返回一条{id,text}。同一个角色可能连续或间隔说多句，未排到的角色本次保持沉默，不能为沉默者额外补话。每条200字以内，可以几句自然的台词，可试探、接话、撒谎、半真半假、感慨；不要挨个点名轮流汇报；同一人多个槽位应有不同内容，接着上文说，不要逐字复读。只写说出口的话，不写内心独白、思考过程、旁白或动作，不替玩家说话。顺序与沉默只影响公开聊天，绝不能省略或更改程序要求的每人私有决定、命令结果和惩罚事实。';
export const GAME_RISK_PROMPT='涉及赌运气时，按本人性格、自己的真实手牌/骰子、公开可见的张数/已停牌状态和桌上发言作不确定推测，猜测对方可能的大致牌势或是否诈唬。公开台词可能是谎话，不能当成确认的点数，更不能读取其他角色的私有区段或玩家暗牌来透视。谨慎、算计、好胜、爱冒险、逞强等性格可作不同选择，不要让所有角色在同一点数机械地作相同决定；例如8点既可以冒险要牌，也可以见好就收，要结合性格和局势。公开发言可以试探或诈唬，但不输出内心推理，不把猜测写成已知事实，不用固定阈值代替角色判断。';
export function cleanGameSpeech(value){
 const text=stripReasoning(value).trim();
 if(!text||/[<>]|内心独白|旁白|(?:心想|暗想|思忖|OS)\s*[:：]|[（(][^）)]*(?:心想|暗想|心理活动)/i.test(text)||/^[他她].{0,12}(?:说道|笑道|想着|挑眉|皱眉)/.test(text))return '先听听你怎么说。';
 return text;
}
export function parseGameDialogue(raw,schedule,ids,clean=cleanGameSpeech){
 if(!schedule||schedule.version!==1||!Array.isArray(raw)||raw.length!==schedule.slots.length)throw Error('INVALID_GAME_DIALOGUE');
 const lines=raw.map((row,i)=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>k!=='id'&&k!=='text')||row.id!==schedule.slots[i]||typeof row.text!=='string'||!row.text.trim()||row.text.length>200)throw Error('INVALID_GAME_DIALOGUE');return {id:row.id,text:clean(row.text,row.id)};});
 const value={version:1,lines};validateGameDialogue(value,ids);return value;
}
