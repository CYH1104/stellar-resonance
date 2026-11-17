import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terminalPlan,terminalFollowupPlan} from '../server/personal-terminal.mjs';
import {buildMessages} from '../server/ai.mjs';
import {selectTerminalLore} from '../server/terminal-character-context.mjs';
import {newWorldbook,newWorldEntry} from '../src/domain/worldbooks.ts';
import {defaultTheaters} from '../src/domain/theaters.ts';
const card={world:{name:'学院',departments:[],greeting:[],entries:[{uid:'world',constant:true,disable:false,order:100,position:0,depth:4,role:0,key:[],content:'世界约束：星历900年，第一性别与ABO独立。\n\n颜希\n\n性别：男 Omega。YANXI_OWN_LORE\n\n【白霜 - 她的设定】\n\n性别：女 Alpha。OTHER_PRIVATE_SECRET\n\n【颜 希 - 性格】\n\nYANXI_CHARACTER_STYLE\n\n颜希和白霜有共同秘密 AMBIGUOUS_SECRET'}]},places:[],characters:[{id:'pro-11',name:'颜 希',primaryGender:'男',sex:'Omega',hiddenPrompt:'颜希\n\nOWN_HIDDEN_REFERENCE',intro:'DISPLAY_ONLY'},{id:'other',name:'白霜',primaryGender:'女',sex:'Alpha',hiddenPrompt:'OTHER_HIDDEN_SECRET'},{id:'unknown',name:'未知',sex:'Omega'}]};
const persona={name:'玩家',primaryGender:'男',secondaryGender:'Enigma',rawText:'PLAYER_RAW_REFERENCE'};
const state={player:{id:'player',name:'玩家',present:true},characters:[{id:'pro-11',name:'颜希',primaryGender:'女',secondaryGender:'Alpha',present:true},{id:'other',name:'白霜',present:false},{id:'unknown',name:'未知',present:false}]};
const ids=['pro-11'];const data=task=>({task,actorIds:ids,input:'颜希，你好。',sessionId:'s',persona,context:{state,audience:['player',...ids],conversation:{group:false,members:ids,messages:[]}}});
const all=plan=>JSON.stringify(plan.messages);
const references=plan=>plan.messages.find(m=>m.content.startsWith('Authoritative character gender facts')).content;
function privateBook(){const book=newWorldbook('private'),e=newWorldEntry('yanxi');e.title='颜希';e.keys=['颜希'];e.useProbability=false;e.content='PRIVATE_BOOK_OWN';book.entries=[e];return book;}
test('actual terminal chat receives authoritative male Omega plus target-owned editor and private lore',()=>{
 const plan=terminalPlan(card,data('chat'),[privateBook()]),text=references(plan);
 assert.ok(text.includes('"primaryGender":"男"'));assert.ok(text.includes('"secondaryGender":"Omega"'));assert.ok(text.includes('YANXI_OWN_LORE'));assert.ok(text.includes('YANXI_CHARACTER_STYLE'));assert.ok(text.includes('OWN_HIDDEN_REFERENCE'));assert.ok(text.includes('PRIVATE_BOOK_OWN'));assert.ok(text.includes('星历900年'));
 assert.ok(!text.includes('OTHER_PRIVATE_SECRET'));assert.ok(!text.includes('OTHER_HIDDEN_SECRET'));assert.ok(!text.includes('AMBIGUOUS_SECRET'));assert.ok(all(plan).includes('PLAYER_RAW_REFERENCE'));
 assert.equal(card.world.entries[0].content.includes('OTHER_PRIVATE_SECRET'),true,'source book is never rewritten');
});
test('unknown primary gender is not inferred from Omega and conflicting client gender cannot overwrite server',()=>{
 const request=data('chat');request.actorIds=['unknown'];request.context.audience=['player','unknown'];const ref=references(terminalPlan(card,request));assert.ok(ref.includes('"primaryGender":"未明确"'));assert.ok(ref.includes('Never infer primary gender'));
 const ref2=references(terminalPlan(card,data('chat')));assert.ok(!ref2.includes('"primaryGender":"女"'));
});
test('all terminal task routes share the authoritative context including followup and main-auto',()=>{
 for(const task of ['friend','invite','chat','group-welcome','group-tick','bootstrap-groups','group-plan','react','game-interact','schedule','tolerance','afterparty','evaluate','review','friend-create']){
  const req=data(task);if(['evaluate','review','friend-create'].includes(task))req.actorIds=[];
  if(task==='friend-create'){req.context.contactTarget={id:'contact-00000000-0000-4000-8000-000000000001',description:'哥哥'};}
  const p=terminalPlan(card,req);assert.ok(p.messages.some(m=>m.content.startsWith('Authoritative character gender facts')),task);
 }
 const mainContext={initialized:true,groups:[],newGroupIds:[],friendIds:['pro-11'],courses:[]};
 const automatic=data('main-auto');automatic.mode='story-first';automatic.context.mainContext=mainContext;automatic.context.story='颜希走到这里。';automatic.context.allowSocial=true;
 // The canonical protocol requires five reserved IDs even for initialized contexts.
 automatic.context.mainContext.newGroupIds=['g1','g2','g3','g4','g5'];
 assert.ok(references(terminalPlan(card,automatic)).includes('"primaryGender":"男"'));
 const follow=data('main-followup');follow.context.repairContext=automatic.context.mainContext;follow.context.repairSlots=[];
 assert.ok(references(terminalPlan(card,follow)).includes('YANXI_OWN_LORE'));
 assert.ok(references(terminalFollowupPlan(card,data('chat'),'review',{},[privateBook()])).includes('PRIVATE_BOOK_OWN'));
});
test('anonymous command and NPC divination retain their player-privacy boundaries',()=>{
 const command=data('command');command.context={round:1,targets:[1],maxNumber:2,participantNames:['玩家','颜希','白霜'],state};const p=terminalPlan(card,command,[privateBook()]);const ref=references(p);
 assert.ok(!all(p).includes('PLAYER_RAW_REFERENCE'));assert.ok(!ref.includes('玩家'));assert.ok(!ref.includes('颜'));assert.ok(!ref.includes('PRIVATE_BOOK_OWN'));assert.ok(!ref.includes('OTHER_PRIVATE_SECRET'));
 const npc=data('divination');npc.context={state,audience:['pro-11'],divination:{day:'2026-11-18',actorId:'pro-11',kind:'npc',cards:[{id:'major-0',reversed:false},{id:'major-1',reversed:false},{id:'major-2',reversed:false}]}};
 // Reuse stable shipped card IDs, without drawing or calling any model.
 return import('../src/domain/divination.ts').then(({tarotDeck})=>{npc.context.divination.cards=tarotDeck().slice(0,3).map(c=>({id:c.id,reversed:false}));const text=all(terminalPlan(card,npc,[privateBook()]));assert.ok(!text.includes('PLAYER_RAW_REFERENCE'));assert.ok(text.includes('PRIVATE_BOOK_OWN'));assert.ok(!text.includes('OTHER_PRIVATE_SECRET'));});
});
test('party and eleven contexts preserve role references without importing raw persona or card canaries',()=>{
 const participants=[{id:'player',name:'玩家'},{id:'pro-11',name:'颜希'},{id:'other',name:'白霜'}];
 const req=data('party-eleven');req.actorIds=['pro-11'];delete req.context.conversation;req.persona={...persona,rawText:'RAW_CARD_CANARY deck=S-A choice=hit'};req.context.party={kind:'eleven',round:1,wave:1,participants,banker:'player',hand:['S-A','H-9'],score:10,maxCards:5,stood:[],publicLines:[]};
 const p=terminalPlan(card,req,[privateBook()]);assert.ok(references(p).includes('YANXI_OWN_LORE'));assert.ok(!all(p).includes('RAW_CARD_CANARY'));assert.ok(!all(p).includes('OTHER_PRIVATE_SECRET'));
 const talk=data('party-eleven-talk');talk.actorIds=['pro-11','other'];delete talk.context.conversation;talk.persona=req.persona;talk.context.audience=['player','pro-11','other'];talk.context.party={kind:'eleven',round:1,wave:1,participants,banker:'player',stood:[],publicLines:[]};
 const text=all(terminalPlan(card,talk,[privateBook()]));assert.ok(!text.includes('RAW_CARD_CANARY'));assert.ok(!text.includes('S-A'));assert.ok(references(terminalPlan(card,talk)).includes('OTHER_PRIVATE_SECRET'),'owner-labelled acting references may include all actual speakers, never an absent NPC');
});
test('narrative normal and state-disabled messages carry canonical genders without restoring display prompts',()=>{
 for(const stateEnabled of [true,false]){const req={persona,state,input:'颜希来了',opening:'',history:[],memories:[],presets:[],stateEnabled,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),suggestionsEnabled:false};const p=buildMessages(card,req);const ref=references(p);assert.ok(ref.includes('"primaryGender":"男"'));assert.ok(ref.includes('"secondaryGender":"Omega"'));assert.ok(!ref.includes('DISPLAY_ONLY'));assert.equal(p.state.characters.find(a=>a.id==='pro-11').primaryGender,'男');}
});
test('heading segmentation normalizes spaces, skips unowned mixed paragraphs and never follows client instructions',()=>{
 const parts=selectTerminalLore(card.world.entries[0].content,card.characters,['pro-11']);assert.ok(parts.some(p=>p.content.includes('YANXI_OWN_LORE')));assert.ok(!JSON.stringify(parts).includes('OTHER_PRIVATE_SECRET'));assert.ok(!JSON.stringify(parts).includes('AMBIGUOUS_SECRET'));
 const req=data('chat');req.context.worldInfo=[{content:'CLIENT_PRIVATE_TRICK'}];assert.ok(!references(terminalPlan(card,req)).includes('CLIENT_PRIVATE_TRICK'));
});
