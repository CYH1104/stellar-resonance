import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder,buildMessages} from '../server/ai.mjs';
import {streamStory} from '../server/story-stream.mjs';
import {newSession,stateAt,finishVariant,validateOutcome,migrateAffinitySession,backup,parseBackup,defaults} from '../src/domain/story.ts';
import {missingRepairPlan} from '../src/domain/repairPlan.ts';
import {mergeRepairOutcome} from '../src/domain/stateRepair.ts';
import {defaultTheaters} from '../src/domain/theaters.ts';
const settings=defaultTheaters().map(t=>({...t,enabled:false}));
const card={world:{name:'学院'},places:[],characters:[]};
const state=()=>({player:{id:'player',name:'玩家',present:true,spiritAnimal:'狐',spiritThought:'旧玩家想法'},characters:[{id:'npc-a',name:'甲',present:true,affinity:10,relationship:'同学',innerThought:'旧想法',spiritAnimal:'猫',spiritThought:'旧猫想法'}],variables:{score:2}});
const row=(delta=0)=>({id:'npc-a',affinity:{delta,reason:'这轮没有新的有效互动，他维持此前态度。'},relationship:{action:'keep'},innerThought:{action:'set',value:'我想先听他说完。'},spiritThought:{action:'set',value:'我侧耳听着门口的脚步。'}});
const payload=(r=row())=>({schemaVersion:'state-output-v1',requestId:'test-request',event:'在门口交谈',presentCharacterIds:['npc-a'],characters:[r],player:{spiritThought:{action:'set',value:'我绕着柜台看了一圈。'}},customUpdates:[]});
const options={singleStateCall:true,requireDynamicState:true,requestId:'test-request',theaterSettings:settings};
function decode(raw,s=state(),extra='',opts=options){const d=new StoryDecoder();d.push('固定正文<SR_STATE>'+JSON.stringify(raw)+'</SR_STATE>'+extra+'<SR_DONE>');return d.finish(card,s,opts);}
function session(s=state()){const v=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'');v.initial=s;return v;}
function commit(s,out){const v={id:'v'+s.turns.length,text:'固定正文',status:'incomplete',createdAt:new Date().toISOString()};s.turns.push({id:'t'+s.turns.length,input:'继续',selected:0,variants:[v]});finishVariant(s,s.turns.length-1,v,out);return stateAt(s);}
test('positive, fractional, zero and unbounded negative requests settle once with complete audit',()=>{
 for(const [before,delta,after,actual]of [[10,0.5,10.5,0.5],[10,0,10,0],[10,8,18,8],[-98,-20,-100,-2],[99.8,0.5,100,0.2]]){
  const s=state();s.characters[0].affinity=before;const out=decode(payload(row(delta)),s),saved=commit(session(s),out);
  assert.equal(saved.characters[0].affinity,after);assert.equal(out.stateUpdate.affinityReviews[0].appliedDelta,actual);assert.equal(out.stateUpdate.affinityReviews[0].requestedDelta,delta);
  assert.ok(out.stateUpdate.affinityReviewedIds.includes('npc-a'));assert.equal(JSON.stringify(saved.characters[0]).includes('reason'),false);
  assert.deepEqual(validateOutcome(out,s).stateUpdate.affinityReviews,out.stateUpdate.affinityReviews);
  if(delta>3)assert.ok(out.stateUpdate.codes.includes('STATE_AFFINITY_LARGE_INCREASE'));
 }
});
test('missing reason or placeholder is missing, not an invented neutral review; other fields survive',()=>{
 for(const reason of [undefined,'','略','按剧情']){const r=row();r.affinity.reason=reason;const out=decode(payload(r));assert.deepEqual(out.stateUpdate.affinityReviewedIds,[]);assert.ok(missingRepairPlan(out,state(),[],true,false).affinityIds.includes('npc-a'));assert.equal(out.characters[0].innerThought,'我想先听他说完。');}
});
test('new NPC registers spirit OS and explicit default before applying fractional delta',()=>{
 const p=payload({...row(0.5),id:'npc-new',name:'乙',present:true,spiritAnimal:'白鸟',relationship:{action:'set',value:'初次接触'}});p.presentCharacterIds=['npc-new'];const out=decode(p);const next=commit(session(),out).characters.find(c=>c.id==='npc-new');assert.equal(next.affinity,0.5);assert.equal(next.spiritAnimal,'白鸟');assert.equal(next.spiritThought,'我侧耳听着门口的脚步。');
});
test('duplicate IDs, mismatched request, and parallel MVU cannot double-settle affinity',()=>{
 const p=payload();p.characters.push(row(2));const dup=decode(p);assert.ok(dup.stateUpdate.codes.includes('STATE_DUPLICATE_CHARACTER'));assert.equal(commit(session(),dup).characters[0].affinity,10);
 const bad=payload(row(3));bad.requestId='stale';const stale=decode(bad);assert.ok(stale.stateUpdate.codes.includes('STATE_REQUEST_MISMATCH'));assert.equal(commit(session(),stale).characters[0].affinity,10);
 const out=decode(payload(row(2)),state(),'<UpdateVariable><JSONPatch>[{"op":"delta","path":"/characters/npc-a/affinity","value":2}]</JSONPatch></UpdateVariable>');assert.equal(commit(session(),out).characters[0].affinity,10);assert.deepEqual(out.stateUpdate.affinityReviews,[]);
});
test('omitted present actors stay visible and available for targeted review',()=>{
 const p=payload();p.characters=[];p.presentCharacterIds=[];const out=decode(p),saved=commit(session(),out);
 assert.equal(saved.characters[0].present,true);assert.ok(missingRepairPlan(out,saved,[],true,false).affinityIds.includes('npc-a'));
});
test('roster repair preserves an already accepted score and custom repair touches only requested variables',()=>{
 const prior=decode(payload(row(1))),effective=commit(session(),prior),plan={roster:true,affinityIds:[],spiritIds:[],theaterSlots:[],suggestions:false};
 const incoming=decode(payload(row(40)));const merged=mergeRepairOutcome(prior,incoming,state(),effective,plan);
 assert.equal(commit(session(),merged).characters[0].affinity,11);assert.equal(merged.stateUpdate.affinityReviews[0].requestedDelta,1);
 const custom=payload();custom.customUpdates=[{path:'/custom/score',action:'delta',delta:3,reason:'完成了本轮登记事项。'}];
 const scoped={...plan,roster:false,customPaths:['/custom/score']};const fixed=decode(custom,state(),'',{...options,repairPlan:scoped});
 assert.equal(commit(session(),mergeRepairOutcome(prior,fixed,state(),effective,scoped)).variables.score,5);
});
test('custom variable transaction rejects every operation on an unauthorized path',()=>{
 const p=payload();p.customUpdates=[{path:'/custom/score',action:'delta',delta:3,reason:'完成了本轮登记事项。'},{path:'/custom/not-registered',action:'set',value:9,reason:'试图写入未登记的路径。'}];const out=decode(p);assert.ok(out.stateUpdate.codes.includes('STATE_CUSTOM_REJECTED'));assert.equal(commit(session(),out).variables.score,2);
 p.customUpdates.pop();assert.equal(commit(session(),decode(p)).variables.score,5);
});
test('missing text variables are included in targeted repair without recalculating accepted affinity',()=>{
 const p=payload(row(1));delete p.characters[0].innerThought;const prior=decode(p),s=session(),effective=commit(s,prior),plan=missingRepairPlan(prior,effective,[],true,false);assert.deepEqual(plan.affinityIds,[]);assert.deepEqual(plan.textFields,{'npc-a':['innerThought']});
 const repair=payload(row(50));repair.characters[0].innerThought={action:'set',value:'现在我知道该如何回答了。'};
 const incoming=decode(repair,state(),'',{...options,repairPlan:plan});const merged=mergeRepairOutcome(prior,incoming,state(),effective,plan);const final=commit(session(),merged);assert.equal(final.characters[0].affinity,11);assert.equal(final.characters[0].innerThought,'现在我知道该如何回答了。');assert.equal(merged.stateUpdate.affinityReviews[0].requestedDelta,1);
});
test('old high-affinity branches migrate explicitly with originals and without duplicate deltas',()=>{
 const s=session();s.initial.characters[0].affinity=150;s.turns.push({id:'t',input:'继续',selected:0,variants:[{id:'v',text:'正文',status:'complete',createdAt:'',outcome:{event:'交谈',mvu:[{op:'delta',path:'/characters/npc-a/affinity',value:20}]}},{id:'v2',text:'另一稿',status:'complete',createdAt:'',outcome:{event:'道别',characters:[{id:'npc-a',affinity:120}]}}]});s.memories.push({id:'m',kind:'event',text:'旧记忆',createdAt:'',status:'ready',vector:{model:'e',values:[1],text:'旧记忆'}});
 migrateAffinitySession(s);assert.equal(s.initial.characters[0].affinity,100);assert.equal(stateAt(s).characters[0].affinity,100);s.turns[0].selected=1;assert.equal(stateAt(s).characters[0].affinity,100);assert.equal(s.affinityMigration.records[0].value.characters[0].affinity,150);assert.equal(s.memories[0].status,'pending');assert.equal(s.memories[0].vector,undefined);const once=JSON.stringify(s);migrateAffinitySession(s);assert.equal(JSON.stringify(s),once);
});
test('transport completes story, canonical state, forum and chat in the original request',async()=>{
 const p=payload(row(0.5));const raw='固定正文<SR_STATE>'+JSON.stringify(p)+'</SR_STATE><forum>[{"id":"f","authorName":"路人","content":"食堂开门了","comments":[]}]</forum><theater slot="2">{"slot":2,"kind":"group","title":"群聊","content":"","messages":[{"speaker":"甲","content":"下课了"}]}</theater><SR_DONE>';
 const response=new Response(JSON.stringify({choices:[{message:{content:raw}}]}),{headers:{'Content-Type':'application/json'}}),events=[];
 for await(const e of streamStory({card,state:state(),options:{...options,theaterSettings:defaultTheaters()},messages:[],firstResponse:response,signal:new AbortController().signal,fetchImpl:()=>{throw Error('unexpected extra request');}}))events.push(e);
 const out=events.find(e=>e.type==='done').outcome;assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'固定正文');assert.equal(out.forum.length,1);assert.equal(out.theaters[0].messages.length,1);assert.equal(commit(session(),out).characters[0].affinity,10.5);
});
test('actual final prompt contains unique request manifest and v1 fields instead of fixed 2/5 scoring',()=>{
 const request={persona:{name:'玩家'},state:state(),history:[],memories:[],input:'观察',presets:[],theaterSettings:settings};const a=buildMessages(card,request),b=buildMessages(card,request);assert.notEqual(a.requestId,b.requestId);const prompt=a.messages.find(m=>m.content.includes('Manifest:')).content;assert.ok(prompt.includes(a.requestId));assert.ok(prompt.includes('affinity:{delta:number,reason:string}'));assert.ok(!prompt.includes('small changes of 2'));
});
test('enabled preset, state rules and every enabled theater instruction share one message bundle',()=>{
 const theaterSettings=defaultTheaters().map(t=>({...t,enabled:t.slot<=3,instruction:'ENABLED_SLOT_'+t.slot}));
 const built=buildMessages(card,{persona:{name:'玩家'},state:state(),history:[],memories:[],input:'观察',presets:[],promptEntries:[{id:'on',name:'开启',enabled:true,content:'ENABLED_PRESET_MARKER'},{id:'off',name:'关闭',enabled:false,content:'DISABLED_PRESET_MARKER'}],theaterSettings});
 const text=JSON.stringify(built.messages);assert.ok(text.includes('state-output-v1'));assert.ok(text.includes('ENABLED_PRESET_MARKER'));assert.ok(!text.includes('DISABLED_PRESET_MARKER'));
 for(const slot of [1,2,3])assert.ok(text.includes('ENABLED_SLOT_'+slot));assert.ok(!text.includes('ENABLED_SLOT_4'));
});
test('audit and fractional values survive backup; old-range originals survive migration backup',()=>{
 const s=session();commit(s,decode(payload(row(0.5))));const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));assert.equal(stateAt(restored.sessions[0]).characters[0].affinity,10.5);assert.equal(restored.sessions[0].turns[0].variants[0].outcome.stateUpdate.affinityReviews[0].requestedDelta,0.5);
 const old=session();old.initial.characters[0].affinity=175;const migrated=parseBackup(backup({version:1,sessions:[old],preferences:defaults()})).sessions[0];assert.equal(stateAt(migrated).characters[0].affinity,100);assert.equal(migrated.affinityMigration.records[0].value.characters[0].affinity,175);
});
test('canonical ID/field whitespace recovers and conflicting aliases never overwrite the canonical field',()=>{
 const p=payload();p.characters[0].id=' npc-a ';p.characters[0]['spiritThought ']={action:'set',value:'冲突的猫想法'};const out=decode(p);assert.ok(out.stateUpdate.codes.includes('STATE_FIELD_CONFLICT'));assert.equal(commit(session(),out).characters[0].spiritThought,'旧猫想法');assert.equal(out.stateUpdate.affinityReviews[0].id,'npc-a');
});
