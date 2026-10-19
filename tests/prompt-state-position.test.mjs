import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMessages} from '../server/ai.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';

const card={characters:[{id:'one',name:'甲'}],world:{greeting:[]},places:[]};
const request={persona:{name:'玩家'},state:{player:{id:'player',name:'玩家',present:true},characters:[{id:'one',name:'甲',present:true,affinity:8}]},input:'继续',history:[{role:'user',content:'第一轮'},{role:'assistant',content:'第一轮回复'},{role:'user',content:'第二轮'},{role:'assistant',content:'第二轮回复'}],memories:[],presets:[],opening:'',theaterSettings:defaultTheaters().map(t=>({...t,enabled:false}))};

test('dynamic state is sent once, after history and immediately before the player input',()=>{
 const {messages}=buildMessages(card,request);
 const stateIndex=messages.findIndex(m=>m.content.includes('Current state JSON (authoritative, read-only)'));
 assert.ok(stateIndex>0);
 const historyIndex=messages.findIndex(m=>m.content==='第一轮');
 const userIndex=messages.findLastIndex(m=>m.role==='user'&&m.content==='继续');
 assert.ok(stateIndex>historyIndex);
 assert.ok(stateIndex<userIndex);
 assert.equal(messages.filter(m=>m.content.includes('"stat_data"')).length,1);
});

test('disabling state generation sends neither the protocol nor the dynamic state',()=>{
 const {messages}=buildMessages(card,{...request,stateEnabled:false});
 assert.ok(!messages.some(m=>m.content.includes('Current state JSON')));
 assert.ok(!messages.some(m=>m.content.includes('"stat_data"')));
});
test('actual default story request consistently teaches delta rosters and embedded reviews',()=>{
 const {messages}=buildMessages(card,request);
 const sent=messages.map(m=>m.content).join('\n');
 assert.ok(sent.includes('Omission is not departure'));
 assert.ok(sent.includes('"present":["one"]'));
 assert.ok(sent.includes('"attitude":"neutral"'));
 assert.ok(!sent.includes('presentCharacterIds'));
 assert.ok(!sent.includes('UpdateVariable/Analysis update summary is allowed'));
});
