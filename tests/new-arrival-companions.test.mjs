import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {streamStory} from '../server/story-stream.mjs';
import {defaultTheaters,visibleTheaters} from '../src/domain/theaters.ts';
import {newSession,finishVariant,stateAt,visibleForum} from '../src/domain/story.ts';
const card={world:{name:'星港'},characters:[],places:[]};
const status={event:'抵达星港接待大厅，与值班员交谈',present:['npc-lin-yu'],enter:['npc-lin-yu'],exit:[],characters:[{id:'npc-lin-yu',name:'林雨',attitude:'neutral',strength:'small',innerThought:'这个访客问得有点奇怪'}],player:{spiritThought:'这地方冷得离谱，式呢'}};
const choices=['询问接待流程和学院位置','查看大厅里有没有其他线索','问林雨最近有没有异常情况','在大厅里找个地方坐下等待'];
const forum=[{id:'port-1',authorName:'港务提醒',type:'Service reminder',time:'Early morning',content:'星港接待大厅今日正常营业。办理各类手续请携带有效证件。',comments:[]},{id:'campus-1',authorName:'新生论坛',type:'Student update',time:'Just now',content:'听说又有新生要来报到了，宿舍分配系统是不是又要爆炸。',comments:[{id:'r1',authorName:'宿舍管理员',content:'请不要传播不实信息。系统运行正常。'}]}];
const scene={slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'港务频道',content:'接待大厅值班人员已上线。'},{speaker:'新生群',content:'有人知道宿舍怎么分配吗'}]};
const raw=s=>'<status>\n'+JSON.stringify(s)+'\n</status>\n<choices>'+JSON.stringify(choices)+'</choices>\n<forum>'+JSON.stringify(forum)+'</forum>\n<theater slot="2">'+JSON.stringify(scene)+'</theater>\n<done>';
const initial=()=>({player:{id:'player',name:'斥',present:true,spiritAnimal:'式'},characters:[]});
const options={singleStateCall:true,commitGroups:true,theaterSettings:defaultTheaters(),requireDynamicState:true};
function assertSaved(out,text='正文'){
 const session=newSession('复现',{name:'斥',appearance:'',personality:'',background:''},'');session.initial=initial();
 const variant={id:'v',text,status:'incomplete',createdAt:new Date().toISOString()};session.turns.push({id:'t',input:'询问值班员',selected:0,variants:[variant]});finishVariant(session,0,variant,out);
 assert.equal(stateAt(session).characters.find(c=>c.id==='npc-lin-yu').present,true);
 assert.equal(stateAt(session).player.spiritThought,status.player.spiritThought);
 assert.equal(visibleForum(session).length,2);assert.equal(visibleTheaters(session)[0].messages.length,2);
 assert.deepEqual(variant.outcome.suggestions,choices);
}
test('reported new-arrival block commits status, spirit, choices, both forum posts and group chat',()=>{
 const d=new StoryDecoder();d.push(raw(status));const out=d.finish(card,initial(),options);assertSaved(out,'');
 assert.equal(out.characters.find(c=>c.id==='npc-lin-yu').affinity,0);
});
test('a missing attitude retains the new card and companion modules without a conflicting default exit',()=>{
 const s=structuredClone(status);delete s.characters[0].attitude;delete s.characters[0].strength;
 const d=new StoryDecoder();d.push('正文'+raw(s));const out=d.finish(card,initial(),options);assertSaved(out);
 assert.ok(out.stateUpdate.codes.includes('STATE_ATTITUDE_REVIEW_MISSING'));
});
test('the real transport-decoder path emits prose only and commits all returned modules in one request',async()=>{
 const content='你走到接待台前，林雨抬头向你问好。'+raw(status),events=[];
 const firstResponse=new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{'Content-Type':'application/json'}});
 for await(const event of streamStory({card,state:initial(),options,messages:[],firstResponse,signal:new AbortController().signal,fetchImpl:()=>{throw Error('Unexpected extra API call');}}))events.push(event);
 const prose=events.filter(e=>e.type==='delta').map(e=>e.text).join('');
 assert.equal(prose.trim(),'你走到接待台前，林雨抬头向你问好。');
 assertSaved(events.find(e=>e.type==='done').outcome,prose);
});
