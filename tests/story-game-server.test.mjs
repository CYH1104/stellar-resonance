import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalPlan,parseTerminalResult} from '../server/personal-terminal.mjs';
import {wolfRequest,createWerewolf} from '../src/domain/werewolf.ts';
const all=['a','b','c','d','e','f'];
const card={world:{name:'学院',entries:[]},characters:all.map(id=>({id,name:id,personality:'谨慎',hiddenPrompt:'PRIVATE-'+id}))};
function req(task,party,ids){return {task,actorIds:ids,input:'角色自行开局',persona:{name:'玩家'},context:{state:{characters:[]},memories:[],audience:[...ids],party}};}
const seats=ids=>ids.map(id=>({id,name:id}));
test('NPC-only scored tables dispatch, cover every NPC and reject a spectator in their private audience',()=>{
 for(const kind of ['landlord','mahjong']){
  const ids=all.slice(0,kind==='landlord'?3:4),party={kind,participants:seats(ids),...(kind==='landlord'?{missingTolerances:[]}: {})};
  const d=req(kind==='landlord'?'party-landlord-style':'party-mahjong-style',party,ids),p=terminalPlan(card,d);
  const styles=ids.map(id=>({id,skill:3,aggression:3,...(kind==='landlord'?{cooperation:3}:{}),caption:'谨慎'}));
  assert.equal(parseTerminalResult(JSON.stringify({styles,...(kind==='landlord'?{tolerances:[]}: {})}),p).styles.length,ids.length);
  const s=terminalPlan(card,req('party-settlement',{kind,participants:seats(ids),round:1,facts:'本局结束，得分由程序结算。'},ids));
  assert.equal(parseTerminalResult(JSON.stringify({lines:ids.map(id=>({id,text:'下局再来。'}))}),s).lines.length,ids.length);
  d.context.audience.push('player');assert.throws(()=>terminalPlan(card,d));
 }
});
test('NPC-only truth and own-hand eleven retain exact actor scope',()=>{
 const participants=seats(all.slice(0,3));
 const d=req('party-eleven',{kind:'eleven',round:1,participants,banker:'a',hand:['S-A','H-9'],score:10,maxCards:5,stood:[]},['b']);
 const p=terminalPlan(card,d);assert.deepEqual(parseTerminalResult('{"choice":"stand"}',p),{choice:'stand'});assert.ok(!JSON.stringify(p.messages).includes('PRIVATE-c'));
 const truth=terminalPlan(card,req('party-truth',{kind:'truth',round:1,participants,target:'b',stage:'respond',choice:'truth',card:{id:'t1',truth:'开心的事？',dare:'唱歌。'}},['b']));
 assert.equal(parseTerminalResult('{"text":"今天很开心。","refused":false}',truth).refused,false);
});
test('NPC-only liar returns one private decision and public lines for the whole table',()=>{
 const ids=all.slice(0,3),d=req('party-liar-turn',{kind:'liar',round:1,participants:seats(ids),turn:'a',starter:'a',moves:[],ownDice:[1,2,3,4,5]},['a']);
 const p=terminalPlan(card,d),out=parseTerminalResult(JSON.stringify({action:'bid',bid:{count:3,face:6,pure:false},replies:ids.map(id=>({id,text:'看看这局。'}))}),p);
 assert.equal(out.replies.length,3);d.context.party.opponentDice={b:[6,6,6,6,6]};assert.throws(()=>terminalPlan(card,d));
});
test('NPC-only werewolf requests keep observer and unrelated identities out of wolf council',()=>{
 const g=createWerewolf(seats(all),{key:'opening:a',turnId:'',variantId:'',path:['a']},'今天',{hostId:'a',invitationId:'invite'});g.roles=['wolf','wolf','seer','witch','villager','villager'];
 const r=wolfRequest(g,'werewolf-council','a'),p=terminalPlan(card,{task:r.task,actorIds:r.actorIds,context:{werewolf:r,traits:r.actorIds.map(id=>({id,personality:'谨慎'}))}});
 const v=JSON.parse(p.messages.at(-1).content).view;assert.deepEqual(v.wolfIds,['a','b']);assert.equal(v.players.some(p=>p.id==='player'),false);assert.equal(v.roles,undefined);
 assert.equal(parseTerminalResult(JSON.stringify({opinions:[{id:'a',target:'e',reason:'判断'},{id:'b',target:'e',reason:'同意'}],target:'e'}),p).target,'e');
});
