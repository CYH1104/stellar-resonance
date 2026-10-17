import {test} from 'node:test';import assert from 'node:assert/strict';
import {withTavernContext,expandTavernMacros} from '../server/tavern-macro-engine.mjs';
import {internalPrompt,withInternalPrompts} from '../server/internal-prompts.mjs';
import {buildMessages} from '../server/ai.mjs';import {defaultTheaters} from '../src/domain/theaters.ts';
const run=(content,options={})=>expandTavernMacros([{content}],options)[0].content;
test('Tavern variables evaluate left to right, distinguish local/global and add numeric values',()=>{
 assert.equal(run('{{setvar::x::2}}{{getvar::x}}/{{addvar::x::3}}{{getvar::x}}/{{setglobalvar::x::9}}{{getglobalvar::x}}/{{getvar::x}}'),'2/5/9/5');
 assert.equal(run('{{getvar::x}}{{setvar::x::later}}'),'');
 assert.equal(run('{{setvar::a::text}}{{addvar::a::more}}{{getvar::a}}'),'textmore');
 assert.equal(run('{{setvar::a::[1]}}{{addvar::a::2}}{{getvar::a}}'),'[1,"2"]');
 assert.equal(run('{{incvar::x}}/{{decvar::x}}/{{hasvar::x}}{{deletevar::x}}{{hasvar::x}}'),'1/0/truefalse');
});
test('nested macro arguments, counted whitespace and direct input are expanded once',()=>{
 assert.equal(run('{{setvar::a::x}}{{setvar::{{getvar::a}}::value}}{{getvar::x}}{{newline::2}}{{space::3}}{{noop}}'),'value\n\n   ');
 assert.equal(run('a\n{{trim}}\nb'),'ab');
 assert.equal(run('{{user}}/{{char}}/{{persona}}',{user:'{{setvar::bad::yes}}',char:'学院',persona:'人设'}),'{{setvar::bad::yes}}/学院/人设');
 assert.equal(run('{{getvar::bad}}'),'');
});
test('internal templates share Tavern macros while program placeholder values remain literal',()=>{
 withTavernContext({user:'玩家',char:'学院'},()=>withInternalPrompts({'ai.12':'{{user}}/{{char}}{{setvar::tone::平静}}{{newline}}','ai.5':'{{getvar::tone}} {{p0}} {{p1}}'},()=>{
  assert.equal(internalPrompt('ai.12'),'玩家/学院\n');
  assert.equal(internalPrompt('ai.5',{p0:'{{setvar::bad::yes}}',p1:'尾部'}),'平静 {{setvar::bad::yes}} 尾部');
  assert.equal(run('{{getvar::bad}}'),'');
 }));
});
test('internal and user prompts share the request environment without leaking to another request',()=>{
 const card={world:{name:'学院',entries:[]},characters:[],places:[]},request={persona:{name:'玩家'},state:{player:{id:'player',name:'玩家',present:true},characters:[]},input:'观察',opening:'',history:[],memories:[],presets:[],theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),promptEntries:[{id:'test',name:'test',enabled:true,content:'{{getvar::tone}}/{{user}}/{{char}}'}]};
 const result=withInternalPrompts({'ai.12':'{{setvar::tone::平静}}CTX'},()=>buildMessages(card,request));assert.ok(result.messages.some(m=>m.content==='平静/玩家/学院'));
 const next=buildMessages(card,request);assert.ok(next.messages.some(m=>m.content==='/玩家/学院'));
});
