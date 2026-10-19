import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repairedMessages,streamStory} from '../server/story-stream.mjs';
import {defaultTheaters} from '../src/domain/theaters.ts';
import {StoryDecoder} from '../server/ai.mjs';
const plan={roster:false,affinityIds:[],spiritIds:[],theaterSlots:[2],suggestions:false};
test('theater-only repair asks only for missing slot and does not diagnose missing affinity',async()=>{
 const card={world:{name:'学院'},characters:[],places:[]},state={player:{id:'player',name:'玩家',present:true},characters:[{id:'a',name:'甲',present:true,affinity:12}]};
 const options={repairPlan:plan,stateEnabled:false,suggestionsEnabled:false,theaterSettings:defaultTheaters().map(s=>({...s,enabled:s.slot===2})),singleStateCall:true,requireDynamicState:false};
 const messages=repairedMessages([],'已有正文',card,state,options),prompt=JSON.stringify(messages);
 assert.ok(!prompt.includes('AFFINITY REVIEW:'));assert.ok(prompt.includes('ONLY the explicitly requested missing fields'));assert.ok(!prompt.includes('<choices>'));
 const firstResponse=new Response(JSON.stringify({choices:[{message:{content:'<theater slot="2">{"slot":2,"kind":"group","title":"群聊","content":"","messages":[{"speaker":"甲","content":"收到"}]}</theater><done>'}}]}),{headers:{'Content-Type':'application/json'}});
 const events=[];let calls=0;
 for await(const event of streamStory({card,state,options,messages,partial:'已有正文',stateOnly:true,firstResponse,signal:new AbortController().signal,fetchImpl:async()=>{calls++;throw Error('No extra call');}}))events.push(event);
 assert.equal(calls,0);const done=events.find(e=>e.type==='done');assert.equal(done.outcome.theaters[0].slot,2);assert.ok(!done.outcome.stateUpdate.codes.some(c=>/AFFINITY|MVU|ATTITUDE/.test(c)));
});
test('affinity-only repair does not require another judgment for an already accepted actor',()=>{
 const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'a',name:'甲',present:true,affinity:12},{id:'b',name:'乙',present:true,affinity:0}]},d=new StoryDecoder();
 d.push('已有正文');d.beginStateRepair();d.push('<attitudes>{"changes":[{"id":"b","attitude":"positive","strength":"small"}]}</attitudes><done>');
 const out=d.finish({world:{},characters:[],places:[]},state,{stateEnabled:true,repairPlan:{...plan,theaterSlots:[],affinityIds:['b']},singleStateCall:true,requireDynamicState:false});
 assert.deepEqual(out.stateUpdate.affinityReviewedIds,['b']);assert.ok(!out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});
