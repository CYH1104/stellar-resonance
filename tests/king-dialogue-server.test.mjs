import {test} from 'node:test';import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
const card={characters:[{id:'a',name:'甲',primaryGender:'男'},{id:'b',name:'乙',primaryGender:'女'}]},persona={name:'玩家'},base={task:'react',actorIds:['a','b'],input:'执行命令',persona,context:{state:{characters:[]},round:1,king:'player',command:'分享一件趣事',targets:[1,2],revealedTargets:[{id:'a',number:1},{id:'b',number:2}],replies:[],interactions:[],maxNumber:2,audience:['player','a','b']}};
const core={betrayal:false,replies:[{id:'a',text:'我完成了这个命令。',refused:false,penalty:''},{id:'b',text:'我也完成了。',refused:false,penalty:''}]};
test('react adds a server-scheduled flat public dialogue without changing required target outcomes',()=>{
 const plan=terminalPlan(card,base);assert.ok(plan.dialogueSchedule);assert.equal(plan.dialogueSchedule.version,1);assert.ok(plan.dialogueSchedule.slots.every(id=>['a','b'].includes(id)));assert.ok(JSON.stringify(plan.messages).includes('不要挨个点名轮流汇报'));assert.ok(JSON.stringify(plan.messages).includes('GAME_RISK')===false);const response={...core,dialogue:plan.dialogueSchedule.slots.map((id,i)=>({id,text:i?'我还想听后续。':'我可得先看看你想分享什么。'}))};const out=parseTerminalResult(JSON.stringify(response),plan);assert.deepEqual(out.replies,core.replies);assert.deepEqual(out.dialogue.lines,response.dialogue);
});
test('legacy react results without optional dialogue remain byte-compatible, while invalid slots are rejected',()=>{
 const plan=terminalPlan(card,base);assert.deepEqual(parseTerminalResult(JSON.stringify(core),plan),core);assert.throws(()=>parseTerminalResult(JSON.stringify({...core,dialogue:[{id:'player',text:'用户台词'}]}),plan));assert.throws(()=>parseTerminalResult(JSON.stringify({...core,dialogue:[{id:'c',text:'未入席的角色'}]}),plan));assert.throws(()=>parseTerminalResult(JSON.stringify({...core,dialogue:[...plan.dialogueSchedule.slots.map(id=>({id,text:'符合顺序。'})),{id:'a',text:'额外说话槽位。'}]}),plan));
});
test('game-interact adds optional conversation without weakening mandatory refused penalty replies',()=>{
 const data={...base,task:'game-interact',actorIds:['a','b'],context:{...base.context,interactionKind:'chat'}};const plan=terminalPlan(card,data);const dialogue=plan.dialogueSchedule.slots.map(id=>({id,text:'我可能会，也可能不会。'}));const replies=[{id:'a',text:'我拒绝出卖他',refused:true,penalty:'喝一杯'}, {id:'b',text:'我接着聊',refused:false,penalty:''}];const out=parseTerminalResult(JSON.stringify({replies,dialogue}),plan);assert.deepEqual(out.replies,replies);assert.deepEqual(out.dialogue.lines,dialogue);
 const legacy=parseTerminalResult(JSON.stringify({replies}),plan);assert.deepEqual(legacy.replies,replies);assert.equal(legacy.dialogue,undefined);
});
test('public multi-line history survives normal King context while anonymous command still strips it',()=>{
 const d=structuredClone(base);d.task='game-interact';d.context.interactionKind='chat';d.context.dialogue={version:1,lines:[{id:'a',text:'第一句。'},{id:'b',text:'再等等。'},{id:'a',text:'我接着说。'}]};d.context.interactions=[{kind:'chat',text:'用户真实输入',replies:core.replies,dialogue:{version:1,lines:[{id:'b',text:'还没说完。'},{id:'b',text:'这才说完。'}]}}];const p=terminalPlan(card,d),ctx=JSON.parse(p.messages.at(-1).content).context;assert.deepEqual(ctx.dialogue.lines.map(r=>r.id),['a','b','a']);assert.equal(ctx.interactions[0].dialogue.lines.length,2);
 const command=terminalPlan(card,{task:'command',actorIds:['a'],input:'出令',persona,context:{maxNumber:2,targets:[1],dialogue:{version:1,lines:[{id:'b',text:'PUBLIC_HISTORY_MUST_NOT_ENTER_ANONYMOUS_COMMAND'}]}}});assert.ok(!JSON.stringify(command.messages).includes('PUBLIC_HISTORY_MUST_NOT_ENTER_ANONYMOUS_COMMAND'));
});
test('command target and anonymous context do not receive dialogue schedules',()=>{
 const plan=terminalPlan(card,{task:'command',actorIds:['a'],input:'出令',persona,context:{state:{characters:[]},targets:[1],maxNumber:2,participantNames:['玩家','甲','乙'],audience:['player','a']}});assert.equal(plan.dialogueSchedule,undefined);assert.equal(plan.lockedTargets[0],1);assert.equal(plan.ids[0],'a');
});
