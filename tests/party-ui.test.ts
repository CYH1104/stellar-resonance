import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createSSRApp,defineComponent,h,reactive,ref} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {defaults,newSession} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';
import type {PartyKind,PartyRoom,TruthRound} from '../src/domain/partyGames';

const controllers=vi.hoisted(()=>({personal:vi.fn(),party:vi.fn()}));
vi.mock('../src/app/usePersonalTerminal',()=>({usePersonalTerminal:controllers.personal}));
vi.mock('../src/app/usePartyGames',()=>({usePartyGames:controllers.party}));
vi.mock('../src/components/CharacterAvatar.vue',()=>({default:{props:['w','id','nickname'],template:'<span class="avatar-stub"></span>'}}));
import PartyGameRoom from '../src/components/PartyGameRoom.vue';
import PersonalTerminal from '../src/components/PersonalTerminal.vue';

function workspace(){const active=newSession('聚会',{name:'玩家',appearance:'',personality:'',background:''},'');active.terminal=emptyTerminal();return {active,state:active.initial,preferences:defaults(),credentials:{},loading:false,busy:false,terminalBusy:false,storageStatus:'saved',save:vi.fn(),localService:{characters:[]}} as unknown as ViewModel;}
function room(kind:PartyKind,id:string,ended=false):PartyRoom{return {version:1,id,kind,name:id,style:'轻松',members:['player','a','b'],invitations:{a:'accepted',b:'accepted'},inviteReplies:{},rounds:[],drunk:{player:0,a:0,b:0},...(ended?{endedAt:'2026-11-17T00:00:00.000Z',endReason:'manual' as const}:{})};}
function partyStub(rows:PartyRoom[]=[],current?:PartyRoom,page='list'){
 const participants=current?.members.filter(id=>id==='player'||current.invitations[id]==='accepted')||[];
 return {rooms:ref(rows),room:ref(current),round:ref(current?.rounds.at(-1)),history:ref(current?.rounds||[]),currentKind:ref(current?.kind||'truth'),page:ref(page),picked:ref<string[]>([]),title:ref(''),style:ref(''),draft:ref(''),error:ref(''),working:ref(false),friends:ref([{id:'a',name:'甲'},{id:'b',name:'乙'}]),name:(id:string)=>(({player:'玩家',a:'甲',b:'乙'} as Record<string,string>)[id]||id),tolerance:(_id:string):number|undefined=>undefined,participants:ref(participants),inviteTarget:ref<string|null>(null),inviteNote:ref(''),pendingInvites:ref(current?.members.filter(id=>current.invitations[id]==='pending')||[]),declinedInvites:ref(current?.members.filter(id=>current.invitations[id]==='declined')||[]),retryActionLabel:ref(''),create:vi.fn(),open:vi.fn(),invite:vi.fn(),retryInvites:vi.fn(),beginInvite:vi.fn(),sendInvite:vi.fn(),start:vi.fn(),hit:vi.fn(),stand:vi.fn(),npcAction:vi.fn(),choose:vi.fn(),answer:vi.fn(),reactions:vi.fn(),end:vi.fn(),retryAfterparty:vi.fn(),retryRequest:vi.fn(),back:vi.fn(),stop:vi.fn()};
}
function personalStub(){return {page:ref('games'),t:ref(emptyTerminal()),room:ref(undefined),round:ref(undefined),friends:ref([]),incoming:ref([]),messages:ref([]),visibleConversations:ref([]),courses:ref([]),search:ref(''),historyPage:ref(0),friendId:ref(''),conversationId:ref(''),conversationFilter:ref('all'),inviteTarget:ref(''),inviteNote:ref(''),error:ref(''),working:ref(false),gameHistory:ref([]),clock:ref({time:'08:00',label:'星历578年'}),storyClock:ref({day:0,time:'08:00',label:'星历578年'}),go:vi.fn(),name:(id:string)=>id};}
const renderParty=(kind:PartyKind)=>renderToString(createSSRApp(PartyGameRoom,{w:workspace(),kind}));
const buttons=(html:string)=>Array.from(html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g),m=>m[0]);
const labels=(html:string)=>buttons(html).map(button=>button.replace(/<[^>]+>/g,'').trim());
beforeEach(()=>{controllers.personal.mockReturnValue(personalStub());controllers.party.mockReturnValue(partyStub());});
afterEach(()=>vi.clearAllMocks());

it('offers every game as its own launch button with an independent title',async()=>{
 const html=await renderToString(createSSRApp(PersonalTerminal,{w:workspace()})),entries=buttons(html);
 for(const game of ['国王游戏','每日占卜','十点半','真心话大冒险','狼人杀','日麻','斗地主']){
  const matches=entries.filter(button=>new RegExp('<strong\\b[^>]*>'+game+'</strong>').test(button));expect(matches,game).toHaveLength(1);
  if(['十点半','真心话大冒险'].includes(game))expect(matches[0]).not.toMatch(/\bdisabled(?:[ =>])/);
 }
 expect(entries.some(button=>/<strong\b[^>]*>十点半<\/strong>/.test(button)&&/<strong\b[^>]*>真心话大冒险<\/strong>/.test(button))).toBe(false);
});

it.each(['eleven','truth'] as const)('shows only %s rooms and its create action without a redundant internal back button',async kind=>{
 const rows=[room('eleven','牌局进行'),room('truth','转瓶进行'),room('eleven','牌局结束',true),room('truth','转瓶结束',true)];controllers.party.mockReturnValue(partyStub(rows));
 const html=await renderParty(kind),text=labels(html),own=kind==='eleven'?'牌局':'转瓶',other=kind==='eleven'?'转瓶':'牌局';
 expect(html).toContain(own+'进行');expect(html).toContain(own+'结束');expect(html).not.toContain(other+'进行');expect(html).not.toContain(other+'结束');
 expect(text.some(value=>value.startsWith(`创建${kind==='eleven'?'十点半':'真心话大冒险'}房间`))).toBe(true);
 expect(text.some(value=>/返回|‹/.test(value))).toBe(false);
});

it('keeps optional room settings and creates a waiting room before selecting friends',async()=>{
 const stub=partyStub([],undefined,'create');stub.currentKind.value='truth';controllers.party.mockReturnValue(stub);
 const html=await renderParty('truth');
 expect(html).toContain('房间名称（可选）');expect(html).toContain('仅用于区分已保存的房间，留空使用游戏名称。');
 expect(html).toContain('聚会氛围（可选）');expect(html).toContain('影响角色邀请和互动的语气，不改变游戏规则。');
 expect(html).toContain('先建房，再邀请朋友');expect(html).not.toContain('type="checkbox"');
 expect(labels(html)).toContain('创建等候房间');
});

it('distinguishes retrying a pending request from asking a declined character again',async()=>{
 const current=room('truth','邀请房间');current.invitations={a:'pending',b:'declined'};current.inviteReplies={b:'今天不想玩。'};controllers.party.mockReturnValue(partyStub([current],current,'room'));
 const html=await renderParty('truth'),members=Array.from(html.matchAll(/<article\b[^>]*class="party-member"[^>]*>([\s\S]*?)<\/article>/g),m=>m[1]);
 const pending=members.find(member=>/<strong\b[^>]*>甲<\/strong>/.test(member))!,declined=members.find(member=>/<strong\b[^>]*>乙<\/strong>/.test(member))!;
 expect(pending).toBeTruthy();expect(pending).toContain('等待回应');expect(labels(pending)).toContain('重试邀请请求');expect(labels(pending).some(text=>/留言|再次邀请/.test(text))).toBe(false);
 expect(declined).toBeTruthy();expect(declined).toContain('今天不想玩。');expect(labels(declined)).toContain('写留言，再次邀请');expect(labels(declined)).not.toContain('重试邀请请求');
 expect(labels(html)).toContain('重新邀请被拒绝的好友');
});

it('does not display zero or unknown drunkenness before the game has begun',async()=>{
 const current=room('eleven','未开始牌局');controllers.party.mockReturnValue(partyStub([current],current,'room'));
 const html=await renderParty('eleven');
 expect(html).not.toContain('aria-label="参与者醉酒度与酒量"');expect(html).not.toContain('<progress');expect(html).not.toContain('待确认');
 expect(html).toContain('房间成员');expect(html).toContain('开始游戏');
});

it('shows the real drunkenness progress after starting instead of hiding it altogether',async()=>{
 const current=room('truth','已开始转瓶');const round:TruthRound={kind:'truth',number:1,target:'a',card:{id:'card',truth:'最开心的事？',dare:'讲一个笑话。'},phase:'choose'};current.rounds=[round];current.drunk.a=1;
 const stub=partyStub([current],current,'play');stub.tolerance=()=>5;controllers.party.mockReturnValue(stub);
 const html=await renderParty('truth');expect(html).toContain('aria-label="参与者醉酒度与酒量"');expect(html).toMatch(/<progress\b[^>]*value="1"[^>]*max="5"/);expect(html).not.toContain('待确认');
});

it('offers atmosphere presets without submitting and keeps manual edits',async()=>{
 const stub=partyStub([],undefined,'create');controllers.party.mockReturnValue(stub);let state:any;
 const Harness=defineComponent({setup(){state=(PartyGameRoom as any).setup({w:workspace(),kind:'truth',active:true},{expose(){},emit(){}});return ()=>h('div');}});await renderToString(createSSRApp(Harness));
 for(const preset of ['搞笑','休闲','欢乐','暧昧']){state.selectAtmosphere(preset);expect(stub.style.value).toBe(preset);}expect(stub.create).not.toHaveBeenCalled();stub.style.value='欢乐，带一点暧昧';const html=await renderParty('truth');expect(html).toContain('欢乐，带一点暧昧');expect(html).toContain('maxlength="40"');for(const preset of ['搞笑','休闲','欢乐','暧昧'])expect(html).toMatch(new RegExp('<button[^>]*type="button"[^>]*>'+preset+'</button>'));stub.working.value=true;state.selectAtmosphere('搞笑');expect(stub.style.value).toBe('欢乐，带一点暧昧');
});

it('landlord keeps settlement and the next hand in landscape until the match ends or the table is hidden',async()=>{const current=room('landlord','斗地主');current.rounds=[{kind:'landlord',phase:'playing',turn:'player',number:1} as any];const stub=partyStub([current],current,'play');controllers.party.mockReturnValue(stub);const props=reactive({w:workspace(),kind:'landlord' as const,active:true}),events:boolean[]=[];let state:any;const Harness=defineComponent({setup(){state=(PartyGameRoom as any).setup(props,{expose(){},emit:(event:string,value:boolean)=>{if(event==='landscape')events.push(value);}});return ()=>h('div');}});await renderToString(createSSRApp(Harness));expect(events).toContain(true);expect(state.isLandlordLandscape.value).toBe(true);stub.page.value='room';expect(state.isLandlordLandscape.value).toBe(false);stub.page.value='play';expect(state.isLandlordLandscape.value).toBe(true);stub.round.value!.phase='complete';expect(state.isLandlordLandscape.value).toBe(true);stub.room.value!.endedAt='2026-11-21T12:00:00.000Z';expect(state.isLandlordLandscape.value).toBe(false);delete stub.room.value!.endedAt;expect(state.isLandlordLandscape.value).toBe(true);stub.round.value!.phase='playing';props.active=false;expect(state.isLandlordLandscape.value).toBe(false);});
it('shows the final totals in portrait after a negative-score ending',async()=>{const current=room('landlord','结束的牌局',true);current.scores={player:34000,a:-2000,b:-2000};current.endReason='drunk';current.endTriggers=['a','b'];controllers.party.mockReturnValue(partyStub([current],current,'history'));const html=await renderParty('landlord');for(const text of ['整场积分统计','34000 分','-2000 分','总变化 +24000','出现负分，整场结束'])expect(html).toContain(text);expect(html).not.toContain('aria-label="斗地主牌桌"');});
