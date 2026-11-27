import {confirmGameInvite} from '../../helpers/confirm-game-invite';
import {useStoryGameInvites} from '../../../src/app/useStoryGameInvites';
import {createApp,h,reactive,nextTick} from 'vue';
import type {ViewModel} from '../../../src/app/useWorkspace';
import FloatingGroupChat from '../../../src/components/FloatingGroupChat.vue';
import {defaults,newSession,backup,parseBackup} from '../../../src/domain/story';
import {emptyTerminal,validateTerminal} from '../../../src/domain/personalTerminal';
import {applyStoryGameInvites,storyGameNames,type StoryGameKind} from '../../../src/domain/storyGameInvites';
import {terminalAnchor,terminalOrigin} from '../../../src/domain/terminalLedger';
import {startPartyRound,applyPartyLandlordAction} from '../../../src/domain/partyGames';
import {landlordPublicContext} from '../../../src/domain/landlord';
import {chooseLandlordAction} from '../../../src/domain/landlordStrategy';
import '../../../src/styles/tokens.css';import '../../../src/styles/layout.css';import '../../../src/styles/palette.css';import '../../../src/styles/terminal-workspace.css';import '../../../src/styles/refinements.css';
const s=newSession('合成验收',{name:'测试玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();
s.initial.characters=['a','b','c','d','e','f'].map((id,i)=>({id,name:['卫锋','凌青','秦凛','陆离','白星','苏明'][i],present:true}));
const story=Object.values(storyGameNames).map(name=>'卫锋想玩'+name+'，邀请朋友来一局。').join('');s.turns.push({id:'t1',input:'休息',selected:0,variants:[{id:'v1',text:story,status:'complete',outcome:{event:'休息'},createdAt:'now'}]});
for(const kind of Object.keys(storyGameNames) as StoryGameKind[]){const members=s.initial.characters.map(a=>a.id).slice(0,kind==='mahjong'?4:kind==='werewolf'?6:3);applyStoryGameInvites(s,[{kind,hostId:'a',members,quote:'卫锋想玩'+storyGameNames[kind]+'，邀请朋友来一局。',message:'今晚和朋友玩一会儿，你来一起玩，或者坐旁边看看？'}],story,terminalAnchor(s),terminalOrigin(s,0)!,s.initial.characters);}
for(const i of s.terminal.gameInvitations||[])confirmGameInvite(i,s.initial.characters.map(a=>a.id).slice(0,i.kind==='mahjong'?4:i.kind==='werewolf'?6:3));
if(new URLSearchParams(location.search).has('recruitment')){s.terminal.gameInvitations=[];s.terminal.friends=[{id:'a',status:'accepted',reply:'朋友',note:''}];}
s.terminal.tolerances=Object.fromEntries(['player',...s.initial.characters.map(a=>a.id)].map(id=>[id,10]));
const preferences=defaults();preferences.terminalEnabled=true;preferences.terminalProfile='aux';preferences.profiles=preferences.profiles.map(p=>({...p,apiBaseUrl:'https://synthetic.example/v1',model:'fixture'}));
const w=reactive({active:s,state:s.initial,preferences,credentials:{},terminalEpoch:0,busy:false,terminalBusy:false,backupWorking:false,storageStatus:'saved',loading:false,theaters:[],localService:{characters:[]},save:async()=>{},saveTerminal:async(s:any)=>validateTerminal(s.terminal),connectionReady:()=>true,connectProfile:async()=>true,indexTerminalNotes:()=>{},get terminalProfile(){return preferences.profiles.find(p=>p.id==='aux');}});
const app=createApp({setup(){useStoryGameInvites(w as unknown as ViewModel,{automatic:true});return {};},render:()=>h(FloatingGroupChat,{w:w as unknown as ViewModel})}),vm=app.mount('#academy-workspace');
function find(name:string){const walk=(node:any):any=>{if(!node)return;if(node.component){const c=node.component;if(c.type.__name===name)return c;const found=walk(c.subTree);if(found)return found;}if(Array.isArray(node.children))for(const ch of node.children){const found=walk(ch);if(found)return found;}};return walk(vm.$.subTree);}
(window as any).fixture={w,find,async home(){find('PersonalTerminal').setupState.u.page='home';await nextTick();},async restore(){w.active=parseBackup(backup({version:1,sessions:[w.active],preferences:w.preferences})).sessions[0];await nextTick();},async history(){const r=w.active.terminal!.partyRooms!.find(r=>r.kind==='landlord')!;r.rounds=[];r.scores=Object.fromEntries(r.members.map(id=>[id,10000]));let seed=3;const rand=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};for(let j=0;j<2;j++){const round=startPartyRound(r,terminalAnchor(w.active),rand);if(round.kind!=='landlord')return;let n=0;while(round.phase!=='complete'&&n++<600)applyPartyLandlordAction(r,round.turn,chooseLandlordAction(landlordPublicContext(round,round.turn),r.landlordStyles![round.turn]));}startPartyRound(r,terminalAnchor(w.active),rand);validateTerminal(w.active.terminal!);find('PartyGameRoom').setupState.u.page='room';await nextTick();}};
