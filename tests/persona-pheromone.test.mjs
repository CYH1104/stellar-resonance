import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonaMessages,parsePersonaResult} from '../server/ai.mjs';
test('persona helper explicitly requests pheromone in the existing other field and respects no-pheromone identities',()=>{
 const messages=buildPersonaMessages({world:'学院世界'},'生成一个 Omega 人设',{name:'玩家',other:'玩家既有备注'});
 assert.match(messages[0].content,/信息素：具体气味或设定/);assert.match(messages[0].content,/Beta/);assert.match(messages[0].content,/已有信息素必须原样保留/);assert.match(messages[0].content,/不要新增 pheromone/);
 const result=parsePersonaResult('{"name":"玩家","secondaryGender":"Omega","other":"备注\\n信息素：雪松"}');assert.equal(result.other,'备注\n信息素：雪松');
 const beta=parsePersonaResult('{"name":"玩家","secondaryGender":"Beta","other":"信息素：无"}');assert.equal(beta.other,'信息素：无');
});

test('persona helper accepts a long wish without truncating it before native context budgeting',()=>{
 const wish='原始人设描述\n'.repeat(1200)+'最后一行';
 const messages=buildPersonaMessages({world:'公开世界背景'},wish,{name:'玩家'});
 assert.equal(JSON.parse(messages.find(m=>m.role==='user').content).wish,wish);
 assert.throws(()=>buildPersonaMessages({world:'公开世界背景'},' ',{name:'玩家'}),{code:'INVALID_PERSONA_WISH'});
});
