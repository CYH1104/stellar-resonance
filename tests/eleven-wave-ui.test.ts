import {afterEach,it,expect,vi} from 'vitest';
import {createSSRApp,ref} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {defaults,newSession} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';
import type {ElevenRound,PartyRoom} from '../src/domain/partyGames';

const controller=vi.hoisted(()=>vi.fn());
vi.mock('../src/app/usePartyGames',()=>({usePartyGames:controller}));
vi.mock('../src/components/CharacterAvatar.vue',()=>({default:{props:['w','id','nickname'],template:'<span class="avatar-stub"></span>'}}));
import PartyGameRoom from '../src/components/PartyGameRoom.vue';
const labels=(html:string)=>Array.from(html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g),m=>m[1].replace(/<[^>]+>/g,'').trim());
function workspace(){const active=newSession('波次测试',{name:'玩家',appearance:'',personality:'',background:''},'');active.terminal=emptyTerminal();return {active,state:active.initial,preferences:defaults(),credentials:{},loading:false,busy:false,terminalBusy:false,storageStatus:'saved',save:vi.fn()} as unknown as ViewModel;}
function fixture(status:'deciding'|'ready'|'dealt'='deciding'){
 const wave={number:1,choices:{player:'hit' as const,a:'stand' as const,b:'hit' as const},speeches:[{id:'player',text:'我说看起来还可以。'},{id:'a',text:'我可没说自己点数低。'},{id:'b',text:'先聊一会儿。'}],status};
 const round:ElevenRound={kind:'eleven',number:1,flow:'waves-v1',waves:[wave],banker:'a',deck:[],hands:{player:['S-A','C-2'],a:['H-9','D-Q'],b:['S-K','C-8']},stopped:[],turn:'a',phase:'playing',replies:[{id:'a',text:'旧公开回复含真实暗牌SECRET-LEGACY'}]};
 const room:PartyRoom={version:1,id:'room',kind:'eleven',name:'同步牌局',style:'轻松',members:['player','a','b'],invitations:{a:'accepted',b:'accepted'},inviteReplies:{},rounds:[round],drunk:{player:0,a:0,b:0}};
 const stub={rooms:ref([room]),room:ref(room),round:ref(round),wave:ref(wave),playerNeedsChoice:ref(false),history:ref([round]),currentKind:ref('eleven'),page:ref('play'),picked:ref([]),title:ref(''),style:ref(''),draft:ref(''),error:ref(''),working:ref(false),friends:ref([]),name:(id:string)=>({player:'玩家',a:'甲',b:'乙'} as Record<string,string>)[id]||id,tolerance:()=>5,participants:ref(['player','a','b']),inviteTarget:ref(null),inviteNote:ref(''),pendingInvites:ref([]),declinedInvites:ref([]),retryActionLabel:ref(''),hit:vi.fn(),stand:vi.fn(),npcAction:vi.fn(),dealWave:vi.fn(),create:vi.fn(),open:vi.fn(),retryInvites:vi.fn(),beginInvite:vi.fn(),sendInvite:vi.fn(),start:vi.fn(),choose:vi.fn(),answer:vi.fn(),reactions:vi.fn(),end:vi.fn(),retryAfterparty:vi.fn(),retryRequest:vi.fn(),stop:vi.fn()};
 controller.mockReturnValue(stub);return {stub,round,room};
}
const render=()=>renderToString(createSSRApp(PartyGameRoom,{w:workspace(),kind:'eleven'}));
afterEach(()=>vi.clearAllMocks());
it('offers simultaneous wave decision and user speech instead of a per-character turn',async()=>{
 const {stub}=fixture();stub.playerNeedsChoice.value=true;
 const html=await render(),buttons=labels(html);
 expect(buttons).toContain('要牌并同步判定');expect(buttons).toContain('停牌并同步判定');expect(buttons).not.toContain('统一发牌');expect(buttons.some(text=>/^让 .* 行动$/.test(text))).toBe(false);expect(html).not.toContain('轮到 甲');
 expect(html).toContain('本波发言或动作');expect(html).toContain('提交时与本波决定一起锁定');expect(html).toContain('公开发言可诈唬');
});
it('allows stopped players to speak while collecting all participant decisions, including retries',async()=>{
 const {round,stub}=fixture();round.stopped=['player'];stub.error.value='本波请求失败';stub.retryActionLabel.value='重试本波判定';
 const html=await render(),buttons=labels(html);expect(buttons).toContain('全员判定并发言');expect(buttons).toContain('重试本波判定');expect(buttons).not.toContain('要牌并同步判定');expect(html).toContain('本波发言或动作');
});
it('shows one unified deal gate only after all decisions and keeps card details and choices private',async()=>{
 fixture('ready');const html=await render();expect(html).toContain('全员已决定，等待统一发牌');expect(labels(html)).toContain('统一发牌');expect(labels(html)).not.toContain('全员判定并发言');
 expect(html).toContain('♠A');expect(html).toContain('♣2');expect(html).toContain('3 点');
 for(const secret of ['♥9','♦Q','♠K','♣8','H-9','D-Q','9.5 点','8.5 点','SECRET-LEGACY'])expect(html).not.toContain(secret);
 expect(html).toContain('甲的暗牌，共2张');expect(html).not.toMatch(/(?:title|aria-label)="[^\"]*(?:9\.5|8\.5|♥9|♦Q|stand|hit)[^\"]*"/);
 expect(html).not.toContain('choices');expect(html).toContain('我说看起来还可以。');expect(html).toContain('我可没说自己点数低。');expect(html).toContain('先聊一会儿。');
});
it('legacy playing rounds offer migration without showing old potentially leaking replies',async()=>{
 const {round,stub}=fixture();delete round.flow;delete round.waves;stub.wave.value=undefined as never;
 const html=await render();expect(html).toContain('沿用原手牌，点击开始同步判定');expect(labels(html)).toContain('开始同步判定');expect(labels(html)).not.toContain('统一发牌');expect(html).not.toContain('SECRET-LEGACY');
});
it('history includes every wave speech and the player but hides undealt choices, opponents cards and old replies',async()=>{
 const {round,stub}=fixture('ready');round.waves!.push({number:2,choices:{},speeches:[{id:'player',text:'第二波玩家发言。'},{id:'a',text:'第二波甲发言。'}],status:'deciding'});stub.page.value='history';
 const html=await render();expect(html).toContain('历史波次发言');for(const speech of ['我说看起来还可以。','我可没说自己点数低。','先聊一会儿。','第二波玩家发言。','第二波甲发言。'])expect(html).toContain(speech);
 for(const secret of ['♥9','♦Q','♠K','♣8','9.5 点','SECRET-LEGACY'])expect(html).not.toContain(secret);expect(html).not.toContain('choices');
});
it('completed history reveals cards and retains legacy completed replies',async()=>{
 const {round,stub}=fixture('dealt');round.phase='complete';round.winner='player';stub.page.value='history';
 const html=await render();expect(html).toContain('♥9');expect(html).toContain('9.5 点');expect(html).toContain('SECRET-LEGACY');expect(html).toContain('我说看起来还可以。');
});
