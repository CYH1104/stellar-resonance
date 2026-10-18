import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compatibleState} from '../server/state-compat.mjs';
import {StoryDecoder,buildMessages} from '../server/ai.mjs';
import {internalPrompt} from '../server/internal-prompts.mjs';
import {featureContract} from '../server/feature-prompts.mjs';
import {newSession,stateAt,finishVariant,backup,parseBackup,defaults} from '../src/domain/story.ts';
const card={characters:[],world:{greeting:[]},places:[]};
const session=()=>{const s=newSession('论坛',{name:'玩家'},'开场');s.initial.characters=[];return s;};
const post={id:'post',authorName:'校园墙',type:'校园墙',time:'晚课前',topic:'晚自习',content:'今晚自习区好安静。',comments:[{id:'c',authorName:'路人',content:'图书馆见'}]};
test('campus forum contract keeps the existing JSON protocol and privacy boundaries',()=>{
 const prompt=internalPrompt('feature.forum');assert.doesNotMatch(prompt,/\p{Script=Han}/u);
 for(const pattern of [/1.3/,/0.3/,/private/i,/recap/i,/<forum>/,/authorName/,/comments/])assert.match(prompt,pattern);
 assert.match(featureContract([{slot:1,kind:'forum'}],false),/"type":"Student update"/);
 assert.doesNotMatch(featureContract([],false),/forum/);
});
test('forum aliases, optional metadata, escaped newlines and comment lists normalize without losing state',()=>{
 const state=stateAt(session()),warnings=[];state.player.spiritAnimal='猫';
 const result=compatibleState({event:'上课',player:{spiritThought:'听课'},forum:[{'发布主体':'校园墙','类型':'树洞','时间':'刚刚','内容':'第一行\\n第二行','话题':'#日常#','评论':['同学：收到',{用户:'路人',内容:'好呀'}]}, {...post,id:'bad-meta',type:9,time:'x'.repeat(81)}]},card,state,{validationWarnings:warnings});
 assert.equal(result.forum[0].content,'第一行\n第二行');assert.equal(result.forum[0].topic,'日常');assert.equal(result.forum[0].type,'树洞');assert.equal(result.forum[0].time,'刚刚');assert.equal(result.forum[0].comments[0].authorName,'同学');assert.equal(result.forum[0].comments[1].content,'好呀');assert.equal(result.forum.length,2);assert.equal(result.forum[1].type,undefined);assert.equal(result.player.spiritThought,'听课');assert.ok(warnings.includes('STATE_FORUM_METADATA_SKIPPED'));
});
test('only newly generated posts/comments are capped; historical backups retain their contents',()=>{
 const s=session(),state=stateAt(s),forum=Array.from({length:4},(_,i)=>({...post,id:'p'+i,comments:Array.from({length:5},(_,j)=>({...post.comments[0],id:'c'+j}))}));
 const out=compatibleState({event:'上课',forum},card,state,{});assert.equal(out.forum.length,3);assert.equal(out.forum[0].comments.length,3);
 const v={id:'v',text:'正文',createdAt:'',status:'incomplete'};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});finishVariant(s,0,v,{event:'上课',forum});
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]}));assert.equal(restored.sessions[0].turns[0].variants[0].outcome.forum.length,4);assert.equal(restored.sessions[0].turns[0].variants[0].outcome.forum[0].comments.length,5);assert.equal(restored.sessions[0].turns[0].variants[0].outcome.forum[0].time,'晚课前');
});
test('all stream boundaries preserve prose, status, forum metadata and completion together',()=>{
 const text='正文保留。<status>{"event":"下课","presentCharacterIds":[],"characters":[]}</status><forum>'+JSON.stringify([post])+'</forum><done>';
 for(let i=0;i<=text.length;i++){const d=new StoryDecoder(),visible=d.push(text.slice(0,i))+d.push(text.slice(i));const out=d.finish(card,stateAt(session()),{singleStateCall:true});assert.equal(visible,'正文保留。');assert.equal(out.forum[0].time,'晚课前');assert.equal(out.forum[0].type,'校园墙');assert.equal(out.event,'下课');}
});
test('custom random-event direction joins the main call only on a triggered turn',()=>{
 const request={persona:{name:'玩家'},input:'行动',state:stateAt(session()),history:[],memories:[],presets:[],randomEventInstruction:'Prefer a quiet campus encounter.'};
 assert.ok(!buildMessages(card,request).messages.some(m=>m.content.includes(request.randomEventInstruction)));
 const triggered={...request,specialEvent:{kind:'奇遇事件',title:'奇遇',description:'Create an event'},dice:{value:100,grade:'大吉',rulesVersion:'d100-v1'}};
 assert.ok(buildMessages(card,triggered).messages[0].content.includes(request.randomEventInstruction));
 assert.throws(()=>buildMessages(card,{...triggered,randomEventInstruction:'x'.repeat(4001)}),{code:'INVALID_RANDOM_EVENT'});
});
