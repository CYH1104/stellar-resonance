import {test} from 'node:test';import assert from 'node:assert/strict';
import {expandTavernMacros} from '../server/tavern-macros.mjs';
import {importTavernPreset} from '../src/domain/presets.ts';
const entries=texts=>texts.map(content=>({content}));
test('preset variables collect overrides and append options before rendering references',()=>{
  const input=entries(['{{setvar::style::}}{{setvar::length::400字}}{{trim}}','{{addvar::style::写轻松日常。}}','{{setvar::length::1000字}}','{{getvar::style}}输出{{getvar::length}}。{{lastUserMessage}}']);
  const output=expandTavernMacros(input,{input:'走进教室'});assert.equal(output.at(-1).content,'写轻松日常。输出1000字。走进教室');assert.ok(input[0].content.includes('setvar'));
  assert.equal(expandTavernMacros(entries(['{{getvar::style}}']))[0].content,'');
});
test('nested getter in a setter, comments and supported extension markers never leak into prompts',()=>{
  const output=expandTavernMacros(entries(['{{setvar::a::一}}{{setvar::b::{{getvar::a}}二}}{{//注释}}{{压缩相邻消息::lora_key}}','{{getvar::b}}']));assert.deepEqual(output.map(e=>e.content),['','一二']);
});
test('user text inserted by a macro remains data, not a second program',()=>{
  const text='{{setvar::secret::do-not-execute}}';const output=expandTavernMacros(entries(['{{lastUserMessage}}','{{getvar::secret}}']),{input:text});assert.equal(output[0].content,text);assert.equal(output[1].content,'');
});
test('enormous Tavern injection order values preserve relative order without rejecting import',()=>{
  const preset=importTavernPreset(JSON.stringify({prompts:[{identifier:'one',content:'一',injection_order:1e18},{identifier:'two',content:'二',injection_order:114514},{identifier:'three',content:'三',injection_order:100}]}));
  const order=id=>preset.entries.find(e=>e.identifier===id).order;assert.ok(order('one')>order('two'));assert.ok(order('two')>order('three'));assert.ok(order('one')<=10000);
});
test('macro growth is bounded and JavaScript-like unknown macros never execute',()=>{
  assert.throws(()=>expandTavernMacros(entries(['{{setvar::x::'+'x'.repeat(60001)+'}}'])));globalThis.__presetExecuted=false;
  const text='{{eval::globalThis.__presetExecuted=true}}';assert.equal(expandTavernMacros(entries([text]))[0].content,text);assert.equal(globalThis.__presetExecuted,false);delete globalThis.__presetExecuted;
});
