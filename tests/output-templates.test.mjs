import {test} from 'node:test';
import assert from 'node:assert/strict';
import {featureContract} from '../server/feature-prompts.mjs';
import {stateExample} from '../server/state-protocol.mjs';
import {repairedMessages} from '../server/story-stream.mjs';
import {cleanTheaterScenes,defaultTheaters} from '../src/domain/theaters.ts';

test('each enabled companion template is closed, parseable and uses its actual slot',()=>{
 const plans=defaultTheaters().map(p=>({...p,enabled:true}));
 plans[2].participantIds=['player','lin'];
 plans[3]={...plans[3],templateId:'spirit',diaryOwners:[{ownerId:'lin'}]};
 plans[4].templateId='interview';plans[5].templateId='off-duty';
 plans.push({slot:18,kind:'custom',enabled:true,title:'Extra',instruction:'Write a scene'});
 plans.push({slot:19,kind:'custom',enabled:false,title:'HiddenSentinel',instruction:'HiddenInstruction'});
 const prompt=featureContract(plans,true);
 assert.ok(!prompt.includes('HiddenSentinel'));assert.ok(!prompt.includes('HiddenInstruction'));
 const scenes=[...prompt.matchAll(/<theater slot="(\d+)">(.*?)<\/theater>/gs)].map(m=>{const s=JSON.parse(m[2]);assert.equal(s.slot,Number(m[1]));return s;});
 assert.deepEqual(scenes.map(s=>s.slot),[2,3,4,5,6,7,18]);
 assert.equal(cleanTheaterScenes(scenes).length,7);
 assert.equal(scenes.find(s=>s.slot===4).diary.ownerId,'lin');
 assert.ok(Array.isArray(JSON.parse(prompt.match(/\n<choices>(.*?)<\/choices>/s)[1])));
 assert.equal(JSON.parse(prompt.match(/\n<forum>(.*?)<\/forum>/s)[1])[0].comments.length,1);
 assert.equal(featureContract(plans.map(p=>({...p,enabled:false})),false),'');
});
test('state example covers every present character without importing absent actors',()=>{
 const state={player:{id:'player',spiritAnimal:'cat'},characters:[{id:'lin',name:'Lin',present:true},{id:'mei',name:'Mei',present:true,spiritAnimal:'bird'},{id:'absent',name:'Away',present:false}]};
 const example=stateExample({state});assert.deepEqual(example.present,['lin','mei']);
 assert.ok(example.characters.every(c=>c.name&&c.attitude==='neutral'&&c.strength==='small'));
 assert.ok(example.characters[1].spiritThought);assert.ok(example.player.spiritThought);
});
test('targeted repair provides actual slot template and allows requested status reviews',()=>{
 const state={player:{id:'player',name:'Player'},characters:[{id:'lin',name:'Lin',present:true,affinity:2}]};
 const plan={roster:false,affinityIds:['lin'],spiritIds:[],theaterSlots:[2],suggestions:false};
 const messages=repairedMessages([],'Fixed prose',{world:{},characters:[]},state,{repairPlan:plan,theaterSettings:defaultTheaters()});
 assert.ok(messages[0].content.includes('<theater slot="2">'));
 const data=JSON.parse(messages[1].content);assert.ok(data.output.status.includes('attitude'));
 assert.ok(!messages[0].content.includes('<choices>'));
});
