import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessages} from '../server/ai.mjs';
import {applyPromptEntries} from '../server/presets.mjs';
const card={world:{greeting:[]},places:[],characters:[{id:'c1',name:'角色甲'},{id:'c2',name:'角色乙'}]};
const request=()=>({persona:{name:'祁言',identity:'学生',rawText:'与角色甲是旧识。'},input:'我询问登记流程。',history:[{role:'user',content:'之前行动'},{role:'assistant',content:'<think>不可见推理</think>之前剧情'}],state:{player:{id:'player',name:'祁言',present:true},characters:[{id:'c1',present:true},{id:'c2',present:false}]},presets:[],memories:[]});
test('user persona, narrator card and NPCs stay separate as the present cast changes',()=>{
 const entry={id:'names',name:'身份',content:'{{user}} / {{char}} / {{persona}}',enabled:true};
 const a=buildMessages(card,{...request(),promptEntries:[entry]}),r=request();r.state.characters.forEach(c=>c.present=!c.present);const b=buildMessages(card,{...r,promptEntries:[entry]});
 const prompt=messages=>messages.find(m=>m.content.startsWith('祁言 / ')).content;
 assert.equal(prompt(a.messages),prompt(b.messages));assert.ok(prompt(a.messages).includes('群星共振世界卡'));assert.ok(prompt(a.messages).includes('与角色甲是旧识'));
 const context=JSON.parse(a.messages[2].content.split('：\n')[1]);assert.equal(context.participants.user.id,'player');assert.equal(context.participants.char.id,'world-card');assert.equal(context.participants.npcs[0].id,'c1');assert.equal(context.persona.rawText,'与角色甲是旧识。');
});
test('history roles and explicit speaker labels remain distinct from NPCs and current user action',()=>{
 const {messages}=buildMessages(card,request());const user=messages.find(m=>m.content.includes('之前行动')),assistant=messages.find(m=>m.content.includes('之前剧情'));
 assert.equal(user.role,'user');assert.ok(user.content.startsWith('[USER / player / "祁言"]'));assert.equal(assistant.role,'assistant');assert.ok(assistant.content.startsWith('[CHAR / world-card / "群星共振世界卡"]'));assert.ok(!JSON.stringify(messages).includes('不可见推理'));assert.equal(messages.at(-1).content,'我询问登记流程。');
});
test('basic identity macros expand once, legacy aliases work, unknown macros and disabled entries are untouched',()=>{
 const base=[{role:'system',content:'r'},{role:'system',content:'c'},{role:'system',content:'s'},{role:'user',content:'行动'}],persona={name:'玩家{{char}}',rawText:'原文 {{char}}'},entries=[{id:'a',name:'a',content:'{{user}}|{{char}}|{{charIfNotGroup}}|<USER>|<BOT>|<CHAR>|{{persona}}|{{complex::x}}',enabled:true},{id:'b',name:'b',content:'关闭',enabled:false}];
 const serialized=JSON.stringify(entries),out=applyPromptEntries(base,entries,persona,'世界卡');assert.equal(out[3].content,'玩家{{char}}|世界卡|世界卡|玩家{{char}}|世界卡|世界卡|姓名：玩家{{char}}\n玩家人设原文：原文 {{char}}|{{complex::x}}');assert.equal(JSON.stringify(entries),serialized);assert.ok(!out.some(m=>m.content==='关闭'));
});
test('expanded persona macros cannot exceed the preset context budget',()=>{
 const messages=[{role:'system',content:'r'},{role:'system',content:'c'},{role:'system',content:'s'}];
 assert.throws(()=>applyPromptEntries(messages,[{id:'a',name:'a',content:'{{persona}}'.repeat(10),enabled:true}],{name:'玩家',rawText:'原文'.repeat(30000)},'卡片'),{code:'PRESET_CONTEXT_TOO_LARGE'});
});
test('private author gender fields are sent independently of player gender and stale client state',()=>{
 const fixed={...card,characters:card.characters.map((c,i)=>({...c,primaryGender:i===0?'女':'男'}))},r=request();r.persona.primaryGender='玩家自定义';r.state.characters[0].primaryGender='过期';
 const built=buildMessages(fixed,r),privateData=JSON.parse(built.messages[1].content.split('：\n')[1]);assert.deepEqual(privateData.characters.map(c=>c.primaryGender),['女','男']);assert.deepEqual(built.state.characters.map(c=>c.primaryGender),['女','男']);assert.equal(built.state.player.primaryGender,'玩家自定义');
});
