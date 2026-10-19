import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryDecoder} from '../server/ai.mjs';
import {defaultTheaters,visibleTheaters} from '../src/domain/theaters.ts';
import {newSession,finishVariant} from '../src/domain/story.ts';
import {featureContract} from '../server/feature-prompts.mjs';
const state={player:{id:'player',name:'玩家',present:true},characters:[]},card={world:{name:'学院'},characters:[],places:[]};
const decode=raw=>{const d=new StoryDecoder();d.push('正文<status>{"event":"上课","present":[],"enter":[],"exit":[],"characters":[]}</status>'+raw+'<done>');return d.finish(card,state,{singleStateCall:true,requireDynamicState:true,theaterSettings:defaultTheaters()});};
test('theater wrapper supplies an omitted JSON slot without changing explicit slot data',()=>{
 for(const attr of ['slot="2"',"slot='2'",'slot=2']){
 const out=decode('<theater '+attr+'>{"messages":[{"speaker":"甲","content":"早上好"}]}</theater>');
 assert.equal(out.theaters[0].slot,2);assert.equal(out.theaters[0].messages[0].content,'早上好');
 }
});
test('empty group replies keep the last saved chat rather than erasing it',()=>{
 const session=newSession('test',{name:'玩家',appearance:'',personality:'',background:''},'');session.initial=state;
 const responses=[decode('<theater slot="2">{"slot":2,"messages":[{"speaker":"甲","content":"早上好"}]}</theater>'),decode('<theater slot="2">{"slot":2,"messages":[],"content":""}</theater>')];
 responses.forEach((out,i)=>{const v={id:'v'+i,text:'正文',status:'incomplete',createdAt:new Date().toISOString()};session.turns.push({id:'t'+i,input:'继续',selected:0,variants:[v]});finishVariant(session,i,v,out);});
 assert.equal(visibleTheaters(session)[0].messages[0].content,'早上好');
 assert.ok(responses[1].stateUpdate.codes.includes('STATE_THEATER_SKIPPED'));
});
test('adjacent choice arrays recover strings and a cut-off forum does not discard status',()=>{
 const d=new StoryDecoder();
 d.push('正文<status>{"event":"登记完成","present":[],"enter":[],"exit":[],"characters":[]}</status><choices>["问宿舍"] ["去食堂"]\n["道别"] ["等一会"]</choices><forum>[{"id":"1","content":"你们');
 const out=d.finish(card,state,{singleStateCall:true,requireDynamicState:true,theaterSettings:defaultTheaters()});
 assert.equal(out.event,'登记完成');
 assert.deepEqual(out.suggestions,['问宿舍','去食堂','道别','等一会']);
 assert.ok(out.stateUpdate.codes.includes('STATE_FORUM_INCOMPLETE'));
 assert.equal(out.stateUpdate.storyComplete,false);
 assert.ok(!out.theaters?.some(s=>s.kind==='group'));
});
test('enabled companion templates put complete group chat before the forum and prohibit duplicate prose appendices',()=>{
 const prompt=featureContract(defaultTheaters());
 assert.ok(prompt.lastIndexOf('<theater slot="2">')<prompt.lastIndexOf('<forum>'));
 assert.ok(prompt.includes('never append a second Markdown forum'));
});
