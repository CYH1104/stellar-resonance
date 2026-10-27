// 分支锚点的哈希缓存必须逐位复现改动前的值：旧存档里的终端消息、记忆笔记和游戏轮次
// 都靠 anchor.path 判断自己属于哪条分支，哈希一旦漂移就会被判成别的分支，于是整片
// 消息与记忆同时消失。这里把改动前的实现原样保留成基准，逐轮比对 key、path 和可见性；
// 另外覆盖缓存失效的边界（流式追加、编辑、切换变体、回退），避免发出过期摘要。
import {describe,expect,it} from 'vitest';
import {terminalAnchor,terminalAnchorActive,terminalMessageVisible} from '../src/domain/terminalLedger';
import type {Session} from '../src/domain/contracts';

function legacyHash(value:string){let n=2166136261;for(let i=0;i<value.length;i++)n=Math.imul(n^value.charCodeAt(i),16777619);return (n>>>0).toString(16);}
function legacyPath(s:Session,before=s.turns.length){
 return s.turns.slice(0,before).map(turn=>{const variant=turn.variants[turn.selected];return turn.id+':'+(variant?.id||'')+':'+legacyHash(turn.input+'\n'+(variant?.text||''));});
}
function legacyAnchor(s:Session,before=s.turns.length){
 let index=before-1;while(index>=0&&s.turns[index].variants[s.turns[index].selected]?.status!=='complete')index--;
 const turn=s.turns[index],variant=turn?.variants[turn.selected],path=[legacyHash(legacyPath(s,index+1).join('|'))];
 return {key:turn?turn.id+':'+variant.id+':'+legacyHash(path.join('|')):'opening:'+legacyHash(s.opening),turnId:turn?.id||'',variantId:variant?.id||'',path};
}
function legacyActive(s:Session,anchor:ReturnType<typeof legacyAnchor>,before=s.turns.length){
 if(!anchor.turnId)return anchor.key==='opening:'+legacyHash(s.opening);
 const index=s.turns.slice(0,before).findIndex(turn=>turn.id===anchor.turnId);
 if(index<0)return false;
 const turn=s.turns[index],variant=turn.variants[turn.selected];
 return variant?.status==='complete'&&variant.id===anchor.variantId&&JSON.stringify([legacyHash(legacyPath(s,index+1).join('|'))])===JSON.stringify(anchor.path);
}
function terminalSession(rounds:number,textLength=60){
 const turns=Array.from({length:rounds},(_,index)=>({
  id:'t'+index,input:'第'+index+'轮输入',selected:0,
  variants:[
   {id:'v'+index+'a',status:'complete' as const,text:'甲'.repeat(textLength)+index},
   {id:'v'+index+'b',status:'complete' as const,text:'乙'.repeat(textLength)+index}
  ]
 }));
 return {id:'session-anchor',opening:'开场白',turns,memories:[],terminal:{}} as unknown as Session;
}
/** 缓存前后必须看到同一组锚点：任一 before 位置的 key 与可见性判定都要一致。 */
function expectSameAnchors(s:Session){
 expect(terminalAnchor(s).key).toBe(legacyAnchor(s).key);
 expect(terminalAnchor(s).path).toEqual(legacyAnchor(s).path);
 for(let before=0;before<=s.turns.length;before++){
  expect(terminalAnchor(s,before).key).toBe(legacyAnchor(s,before).key);
  const anchor=legacyAnchor(s,before);
  expect(terminalAnchorActive(s,anchor,before)).toBe(legacyActive(s,anchor,before));
 }
}

describe('终端分支锚点缓存',()=>{
 it('空存档与单轮存档的锚点与改动前一致',()=>{
  expectSameAnchors(terminalSession(0));
  expectSameAnchors(terminalSession(1));
 });

 it('多轮存档的每一轮前缀都与改动前一致',()=>{
  const s=terminalSession(12);
  expectSameAnchors(s);
  expect(terminalAnchorActive(s,legacyAnchor(s))).toBe(true);
 });

 it('流式追加正文后旧锚点立即失效',()=>{
  const s=terminalSession(6),before=terminalAnchor(s);
  s.turns[5].variants[0].text+='后续正文';
  expectSameAnchors(s);
  expect(terminalAnchor(s).key).not.toBe(before.key);
  expect(terminalAnchorActive(s,before)).toBe(false);
 });

 it('编辑早期轮次会让它之后的锚点全部换值',()=>{
  const s=terminalSession(8),before=terminalAnchor(s);
  s.turns[2].variants[0].text='被改写的一轮';
  expectSameAnchors(s);
  expect(terminalAnchorActive(s,before)).toBe(false);
 });

 it('切换选中变体只改该轮及之后的分支',()=>{
  const s=terminalSession(8),before=terminalAnchor(s);
  s.turns[4].selected=1;
  expectSameAnchors(s);
  expect(terminalAnchorActive(s,before)).toBe(false);
  expect(terminalAnchorActive(s,legacyAnchor(s,4))).toBe(true);
  s.turns[4].selected=0;
  expectSameAnchors(s);
  expect(terminalAnchorActive(s,before)).toBe(true);
 });

 it('未完成轮次回退到上一轮完成处，结果与改动前一致',()=>{
  const s=terminalSession(5);
  s.turns[4].variants[0].status='streaming' as 'complete';
  expectSameAnchors(s);
  expect(terminalAnchor(s).turnId).toBe('t3');
 });

 it('回退一轮后不会返回过期摘要',()=>{
  const s=terminalSession(7);
  const full=terminalAnchor(s);
  s.turns.pop();
  expectSameAnchors(s);
  expect(terminalAnchorActive(s,full)).toBe(false);
 });

 it('同一分支上大量消息的可见性判定与逐条重算一致，且不再逐条哈希正文',()=>{
  const s=terminalSession(200,2000),anchor=terminalAnchor(s),expected=legacyActive(s,legacyAnchor(s));
  const messages=Array.from({length:600},(_,index)=>({id:'m'+index,sender:'npc',text:'内容',at:'2026-01-01T00:00:00.000Z',anchor}));
  const started=Date.now();
  const results=messages.map(message=>terminalMessageVisible(s,message));
  const elapsed=Date.now()-started;
  expect(results.every(result=>result===expected)).toBe(true);
  // 逐条重算正文时这里是 1.5 秒级；阈值留足余量，只拦明显回退。
  expect(elapsed).toBeLessThan(400);
 });
});
