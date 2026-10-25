import {expect,it,vi,afterEach} from 'vitest';
import {createSSRApp,createRenderer,h,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal,validateTerminal,type PersonalTerminal as TerminalShape} from '../src/domain/personalTerminal';
import {tarotDeck,tarotCardCount,tarotCard,drawThreeCards,divinationDay,divinationDraftText,ensureDivination,cardsFingerprint,findDivination,type TerminalDivination} from '../src/domain/divination';
import {usePersonalTerminal} from '../src/app/usePersonalTerminal';
import type {ViewModel} from '../src/app/useWorkspace';

afterEach(()=>vi.unstubAllGlobals());

// ── deck: exactly 78 stable, unique cards (22 major + 4 suits × 14) ──
it('tarot deck is 78 unique stable cards with majors and four suits',()=>{
 const deck=tarotDeck();
 expect(deck).toHaveLength(tarotCardCount);
 expect(new Set(deck.map(c=>c.id)).size).toBe(78);
 expect(deck.filter(c=>c.suit==='major')).toHaveLength(22);
 for(const suit of ['wands','cups','swords','pentacles'])expect(deck.filter(c=>c.suit===suit)).toHaveLength(14);
 for(const c of deck){expect(tarotCard(c.id)?.name).toBe(c.name);expect(c.name.length).toBeGreaterThan(0);}
 expect(tarotCard('major-13')?.name).toBe('死神');
 expect(tarotCard('pentacles-14')?.name).toContain('星币');
 expect(tarotCard('nope-1')).toBeUndefined();
});

// ── draw: three distinct cards, random orientation, deterministic with seeded random ──
it('draws three distinct cards with independent reversed flags',()=>{
 let step=0;const seq=[0,1,0, 2,3,1, 4,5,0];const random=(n:number)=>{const v=seq[step++]%n;return v;};
 const cards=drawThreeCards(random);
 expect(cards).toHaveLength(3);
 expect(new Set(cards.map(c=>c.id)).size).toBe(3);
 expect(cards.map(c=>c.reversed)).toEqual([true,true,false]);
 // every card is a real deck member
 for(const c of cards)expect(tarotCard(c.id)).toBeTruthy();
 // random source is validated
 expect(()=>drawThreeCards(()=>99)).toThrow();
});

// ── Beijing day key flips at Beijing midnight, not local or UTC ──
it('divination day key follows Asia/Shanghai and flips at Beijing midnight',()=>{
 expect(divinationDay(new Date('2026-10-26T15:59:00Z'))).toBe('2026-10-26');// 23:59 Beijing
 expect(divinationDay(new Date('2026-10-26T16:00:00Z'))).toBe('2026-10-27');// 00:00 next day
 expect(divinationDay(new Date('2026-10-26T00:30:00Z'))).toBe('2026-10-26');// 08:30 Beijing
});

// ── ensure: only-if-missing per (day, actor) ──
it('ensureDivination is only-if-missing per day and actor and never overwrites',()=>{
 const t=emptyTerminal();
 const first=ensureDivination(t,'2026-10-26','player');
 expect(t.divinations).toHaveLength(1);
 const again=ensureDivination(t,'2026-10-26','player');
 expect(again).toBe(first);
 expect(cardsFingerprint(again.cards)).toBe(cardsFingerprint(first.cards));
 const npc=ensureDivination(t,'2026-10-26','a');
 expect(npc.cards.length).toBe(3);
 expect(findDivination(t,'2026-10-26','a')).toBe(npc);
 // different day = new record, old one untouched
 const tomorrow=ensureDivination(t,'2026-10-27','player');
 expect(t.divinations).toHaveLength(3);
 expect(tomorrow.day).toBe('2026-10-27');
 // no arbitrary count cap: long-term archives with >2000 records stay writable
 const many=Array.from({length:2001},(_,i)=>({day:'2000-01-01',actorId:'x'+i,cards:first.cards,reading:{status:'failed' as const,error:'x'},at:''}));
 t.divinations=many;validateTerminal(t);
 const extra=ensureDivination(t,'2026-10-26','zzz');
 expect(t.divinations).toHaveLength(2002);
 expect(findDivination(t,'2026-10-26','zzz')).toBe(extra);
});

// ── composable flow fixture ──
const good={overall:'今天的基调是缓慢的观察，星象把步调放慢半拍，适合整理思路再行动。',love:'圣杯逆位提示一段热闹里的小失落，坦白比迁就更有效。',career:'权杖正位给了推进项目的执行力，主动开口就有回应。',caution:'午后别替别人做决定，保留自己的判断。'};
const reaction='哼，逆位圣杯？我才不会为这种小事在意——才怪。';
function makeTerminal():TerminalShape{return {...emptyTerminal(),friends:[{id:'a',status:'accepted' as const,reply:'好',note:''}]};}
async function fixture(terminal=makeTerminal()){
 const s=newSession('占卜',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.initial.characters=[{id:'a',name:'阿一',present:true},{id:'b',name:'阿二',present:true}];
 s.terminal=terminal;
 const preferences=defaults();preferences.mode='server';preferences.terminalProfile=preferences.profiles[0].id;
 const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:async()=>{},connectionReady:()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;
 await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}}));
 return {w,u,s};
}
const fetchStub=(calls:any[],handler:(data:any)=>unknown)=>vi.stubGlobal('fetch',vi.fn(async(_url:string,options:any)=>{const data=JSON.parse(options.body);calls.push(data);return Response.json(handler(data));}));
const seqOf=(seq:number[])=>{let i=0;return (n:number)=>seq[i++]%n;};
const divinationOk=(data:any)=>data.task==='divination'?({...(data.context.divination.kind==='npc'?{reaction}:{}),...good}):{raw:'{}'};

it('draw persists the locked cards first, then one interpretation request; success re-entry sends nothing',async()=>{
 const {u}=await fixture();const calls:any[]=[];
 fetchStub(calls,divinationOk);
 await u.drawDaily();expect(u.error.value).toBe('');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);
 const record=findDivination(u.t.value,divinationDay(),'player')!;
 expect(record.cards).toHaveLength(3);
 expect(new Set(record.cards.map(c=>c.id)).size).toBe(3);
 expect(record.reading.status).toBe('ready');
 expect(record.reading.reaction).toBeUndefined();// own sign has no NPC self-review
 const sent=calls[0];
 expect(sent.context.divination.kind).toBe('player');
 expect(sent.context.divination.cards.map((c:any)=>c.id)).toEqual(record.cards.map(c=>c.id));
 expect(sent.actorIds).toEqual(['player']);
 expect(u.myDivination.value?.reading.overall).toBe(good.overall);
 // re-entry: already done today, no further requests, cards unchanged
 await u.drawDaily();expect(u.error.value).toBe('');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);
 // the draw is not tied to the king game: no penalty/room side effects
 expect(u.t.value.rooms).toHaveLength(0);expect(u.t.value.tolerances).toBeUndefined();
});

it('failed interpretation keeps cards locked, marks failed with a retryable entry, then completes without re-drawing',async()=>{
 const {u}=await fixture();const calls:any[]=[];let bad=true;
 fetchStub(calls,data=>data.task==='divination'&&bad?{text:'一段并非四板块的回复。'}:divinationOk(data));
 await u.drawDaily();expect(u.error.value).not.toBe('');
 const before=findDivination(u.t.value,divinationDay(),'player')!;
 expect(before.reading.status).toBe('failed');
 const fingerprint=cardsFingerprint(before.cards);
 bad=false;await u.retryDivination('player');expect(u.error.value).toBe('');
 const after=findDivination(u.t.value,divinationDay(),'player')!;
 expect(after.reading.status).toBe('ready');
 expect(cardsFingerprint(after.cards)).toBe(fingerprint);
 expect(u.t.value.divinations).toHaveLength(1);// no re-draw
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(2);
 // retry on a completed record is rejected without a request
 await u.retryDivination('player');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(2);
});

it('save failure blocks the API call entirely and never fakes success',async()=>{
 const {w,u}=await fixture();const calls:any[]=[];
 w.save=async()=>{throw Error('存档已被其他页面修改，已停止覆盖保存。');};
 fetchStub(calls,divinationOk);
 await u.drawDaily();
 expect(u.error.value).toContain('其他页面');
 expect(calls).toHaveLength(0);// nothing requested when the draw could not persist
 // the un-saved draw stays pending and retryable — never faked as ready
 expect(findDivination(u.t.value,divinationDay(),'player')?.reading.status).toBe('pending');
});

it('NPC peek is lazy and fixed per day, ignores the player count and returns distinct reactions',async()=>{
 const {u}=await fixture();const calls:any[]=[];
 fetchStub(calls,divinationOk);
 await u.peekDaily('a');expect(u.error.value).toBe('');
 expect(u.peekActorId.value).toBe('a');
 const a1=findDivination(u.t.value,divinationDay(),'a')!;
 expect(a1.reading.status).toBe('ready');
 expect(a1.reading.reaction).toBe(reaction);
 expect(findDivination(u.t.value,divinationDay(),'player')).toBeUndefined();// player draw untouched
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);
 expect(calls[0].context.divination.kind).toBe('npc');
 // second peek: fixed, no new request
 await u.peekDaily('a');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);
 expect(findDivination(u.t.value,divinationDay(),'a')).toBe(a1);
 // another NPC gets an independent record; player record still untouched
 await u.peekDaily('b');
 expect(findDivination(u.t.value,divinationDay(),'b')!.reading.status).toBe('ready');
 expect(findDivination(u.t.value,divinationDay(),'player')).toBeUndefined();
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(2);
 // unknown actors are refused
 await u.peekDaily('ghost');
 expect(u.error.value).toContain('已知角色');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(2);
});

it('history lists past days read-only while today stays independent',async()=>{
 const {u}=await fixture();const calls:any[]=[];
 fetchStub(calls,divinationOk);
 await u.drawDaily();
 const today=u.t.value.divinations![0];
 expect(u.divinationHistory.value.some(d=>d.day===today.day)).toBe(false);
 u.t.value.divinations!.push({day:'2026-10-25',actorId:'player',cards:today.cards,reading:{status:'ready',...good},at:''});
 expect(u.divinationHistory.value.map(d=>d.day)).toContain('2026-10-25');
 expect(u.myDivination.value?.day).toBe(today.day);
});

it('late results cannot land on tampered cards or after an archive switch; cards stay locked',async()=>{
 const {w,u}=await fixture();let release!:()=>void;
 const gate=new Promise<void>(r=>{release=r;});
 const fetchMock=vi.fn(async()=>{await gate;return Response.json(good);});
 vi.stubGlobal('fetch',fetchMock);
 const pending=u.drawDaily();
 // wait until the request (and thus the guard fingerprint) is actually in flight
 await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));
 const record=u.t.value.divinations![0];
 expect(record.reading.status).toBe('pending');
 // scenario 1: the persisted draw changed while the request was in flight
 record.cards=[...record.cards];record.cards[0]={...record.cards[0],reversed:!record.cards[0].reversed};
 release();await pending;expect(u.error.value).toContain('占卜记录已改变');
 expect(findDivination(u.t.value,record.day,record.actorId)!.reading.status).toBe('pending');
 // scenario 2: the archive is switched before the response arrives
 const {w:w2,u:u2}=await fixture();let release2!:()=>void;
 const gate2=new Promise<void>(r=>{release2=r;});
 const fetchMock2=vi.fn(async()=>{await gate2;return Response.json(good);});
 vi.stubGlobal('fetch',fetchMock2);
 const pending2=u2.drawDaily();
 await vi.waitFor(()=>expect(fetchMock2).toHaveBeenCalledTimes(1));
 const original2=w2.active!;
 const other=newSession('另一档',{name:'别人',appearance:'',personality:'',background:''},'');
 (w2 as any).active=other;
 release2();await pending2.catch(()=>{});
 // the archive-switch watcher clears the visible error, but the write must not land
 expect(original2.terminal!.divinations![0].reading.status).toBe('pending');
});
it('validateTerminal enforces divination shape and backup roundtrip keeps draw and reading status',()=>{
 const t=emptyTerminal();
 const record=ensureDivination(t,divinationDay(),'player');
 record.reading={status:'ready',...good,at:new Date().toISOString()};
 validateTerminal(t);
 // duplicate keys rejected
 const bad=structuredClone(JSON.parse(JSON.stringify(t)));bad.divinations.push({...bad.divinations[0]});
 expect(()=>validateTerminal(bad)).toThrow(/重复/);
 // broken card rejected
 const broken=structuredClone(JSON.parse(JSON.stringify(t)));broken.divinations[0].cards[0]={...broken.divinations[0].cards[0],id:'cups-99'};
 expect(()=>validateTerminal(broken)).toThrow();
 // ready without all four sections rejected
 const partial=structuredClone(JSON.parse(JSON.stringify(t)));delete (partial.divinations[0].reading as any).love;
 expect(()=>validateTerminal(partial)).toThrow(/不完整/);
 // npc ready without a reaction rejected
 const npc=structuredClone(JSON.parse(JSON.stringify(t)));npc.divinations.push({day:'2026-10-25',actorId:'a',cards:record.cards,reading:{status:'ready',...good},at:''});
 expect(()=>validateTerminal(npc)).toThrow(/自评/);
 (npc.divinations[1].reading as any).reaction=reaction;
 validateTerminal(npc);
 // backup roundtrip via the real entries is covered in tests/divination-archive.test.ts;
 // here: old save without the field keeps loading (lazy init) and structural rejects
 const legacy=emptyTerminal();
 expect(validateTerminal(legacy).divinations).toBeUndefined();
 // invalid calendar dates and empty actors are rejected
 const badDate=structuredClone(JSON.parse(JSON.stringify(t)));badDate.divinations[0].day='2026-02-30';
 expect(()=>validateTerminal(badDate)).toThrow();
 const badActor=structuredClone(JSON.parse(JSON.stringify(t)));badActor.divinations[0].actorId='';
 expect(()=>validateTerminal(badActor)).toThrow();
});

// ── reactive day: an open page flips to the new Beijing day at midnight ──
it('an open page refreshes the day across Beijing midnight: yesterday moves to history, cleanup on unmount',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(Date.UTC(2026,9,26,15,59,0)));// 23:59 Beijing
 const renderer=createRenderer<any,any>({createElement:()=>({}),insert:()=>{},remove:()=>{},setElementText:()=>{},createText:()=>({}),setText:()=>{},createComment:()=>({}),parentNode:()=>null,nextSibling:()=>null,patchProp:()=>{}});
 try{
  const s=newSession('占卜',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial.characters=[{id:'a',name:'阿一',present:true}];
  const preferences=defaults();preferences.mode='server';preferences.terminalProfile=preferences.profiles[0].id;
  const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:async()=>{},connectionReady:()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{}}) as unknown as ViewModel;
  let u!:ReturnType<typeof usePersonalTerminal>;
  const app=renderer.createApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}});app.mount({});
  expect(u.divinationToday.value).toBe('2026-10-26');
  vi.advanceTimersByTime(60000);// 00:00 next Beijing day
  expect(u.divinationToday.value).toBe('2026-10-27');
  // a record made before midnight is history now; the new day reads "not drawn yet"
  u.t.value.divinations=[{day:'2026-10-26',actorId:'player',cards:drawThreeCards(seqOf([0,1,0,2,3,1,4,5,0])),reading:{status:'failed',error:'x'},at:''}];
  expect(u.myDivination.value).toBeUndefined();
  expect(u.divinationHistory.value.map(d=>d.day)).toContain('2026-10-26');
  app.unmount();expect(vi.getTimerCount()).toBe(0);// interval released
 }finally{vi.useRealTimers();}
});

// ── a real click just after Beijing midnight uses the fresh day even though the
// 30s interval has not ticked yet; page entry refreshes, backfill never moves the day ──
it('clicks right after Beijing midnight use the fresh day before the 30s timer ticks',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(Date.UTC(2026,9,26,15,59,0)));// 23:59 Beijing
 const renderer=createRenderer<any,any>({createElement:()=>({}),insert:()=>{},remove:()=>{},setElementText:()=>{},createText:()=>({}),setText:()=>{},createComment:()=>({}),parentNode:()=>null,nextSibling:()=>null,patchProp:()=>{}});
 try{
  const s=newSession('占卜',{name:'玩家',appearance:'',personality:'',background:''},'');s.initial.characters=[{id:'a',name:'阿一',present:true}];
  const preferences=defaults();preferences.mode='server';preferences.terminalProfile=preferences.profiles[0].id;
  const w=reactive({active:s,state:s.initial,preferences,credentials:{},loading:false,busy:false,terminalBusy:false,theaters:[],storageStatus:'saved',save:async()=>{},connectionReady:()=>true,scopedRecall:async()=>[],indexTerminalNotes:()=>{}}) as unknown as ViewModel;
  let u!:ReturnType<typeof usePersonalTerminal>;
  const app=renderer.createApp({setup(){u=usePersonalTerminal(w);return()=>h('div');}});app.mount({});
  const calls:any[]=[];
  fetchStub(calls,divinationOk);
  await u.drawDaily();expect(u.error.value).toBe('');
  expect(findDivination(u.t.value,'2026-10-26','player')!.reading.status).toBe('ready');
  // midnight passes by one second: the 30s interval has not ticked, the page is stale
  vi.setSystemTime(new Date(Date.UTC(2026,9,26,16,0,1)));
  vi.advanceTimersByTime(1000);
  expect(u.divinationToday.value).toBe('2026-10-26');
  // opening the divination page refreshes the day before anything is drawn
  u.go('divination');
  expect(u.divinationToday.value).toBe('2026-10-27');
  // a real draw click lands on the new day, yesterday stays untouched
  await u.drawDaily();expect(u.error.value).toBe('');
  expect(calls.at(-1).context.divination.day).toBe('2026-10-27');
  expect(findDivination(u.t.value,'2026-10-26','player')!.reading.status).toBe('ready');
  const fresh=findDivination(u.t.value,'2026-10-27','player')!;
  expect(fresh.reading.status).toBe('ready');
  // peek uses the fresh day as well
  await u.peekDaily('a');expect(u.error.value).toBe('');
  expect(calls.at(-1).context.divination.day).toBe('2026-10-27');
  // retry on the new day reaches the new record, not yesterday's completed one
  findDivination(u.t.value,'2026-10-27','player')!.reading={status:'failed',error:'x'};
  await u.retryDivination('player');expect(u.error.value).toBe('');
  expect(findDivination(u.t.value,'2026-10-27','player')!.reading.status).toBe('ready');
  // backfill on an explicit past day keeps its original day and never moves dayNow
  u.t.value.divinations!.push({day:'2026-10-25',actorId:'player',cards:drawThreeCards(seqOf([0,1,0,2,3,1,4,5,0])),reading:{status:'failed',error:'x'},at:''});
  await u.backfillDivination('2026-10-25','player');expect(u.error.value).toBe('');
  expect(calls.at(-1).context.divination.day).toBe('2026-10-25');
  expect(u.divinationToday.value).toBe('2026-10-27');
  app.unmount();expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});

// ── cross-midnight backfill: an unfinished past-day reading can be completed on its
// original day with the original cards; completed history stays read-only ──
it('backfills an unfinished past-day reading on its original day and never re-draws',async()=>{
 const {u}=await fixture();const calls:any[]=[];let bad=true;
 fetchStub(calls,data=>data.task==='divination'&&bad?{text:'不是解读。'}:divinationOk(data));
 const record:TerminalDivination={day:'2026-10-25',actorId:'player',cards:drawThreeCards(seqOf([0,1,0,2,3,1,4,5,0])),reading:{status:'failed',error:'断网失败',draft:'昨日保留的草稿。'},at:''};
 u.t.value.divinations=[record];
 const fingerprint=cardsFingerprint(record.cards);
 // retryDivination only looks at today: yesterday is unreachable through it
 await u.retryDivination('player');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(0);
 // explicit backfill reuses the original day and cards
 bad=false;await u.backfillDivination('2026-10-25','player');expect(u.error.value).toBe('');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);
 expect(calls[0].context.divination.day).toBe('2026-10-25');
 expect(calls[0].context.divination.priorDraft).toBe('昨日保留的草稿。');// the cat continues the original draft
 const after=findDivination(u.t.value,'2026-10-25','player')!;
 expect(after.reading.status).toBe('ready');
 expect(cardsFingerprint(after.cards)).toBe(fingerprint);
 // a completed record is read-only: no backfill, no request
 await u.backfillDivination('2026-10-25','player');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);
});

// ── persist-first across retries: a draw left in memory by a failed save is re-persisted
// before any API call, and a failed reading save never leaves a fake ready ──
it('retries persist the leftover draw first, and a failed reading save rolls back to a retryable state',async()=>{
 const {w,u}=await fixture();const calls:any[]=[];let blockSave=true;
 fetchStub(calls,divinationOk);
 w.save=async()=>{if(blockSave)throw Error('存档已被其他页面修改，已停止覆盖保存。');};
 await u.drawDaily();
 expect(calls).toHaveLength(0);// memory leftover never reaches the API
 const fingerprint=cardsFingerprint(findDivination(u.t.value,divinationDay(),'player')!.cards);
 blockSave=false;
 await u.drawDaily();
 expect(u.error.value).toBe('');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(1);// saved first, then one request
 expect(cardsFingerprint(findDivination(u.t.value,divinationDay(),'player')!.cards)).toBe(fingerprint);// no re-draw
 // reading save failure: no fake ready, record rolls back to a retryable state
 blockSave=true;
 const stuck=findDivination(u.t.value,divinationDay(),'player')!;
 stuck.reading={status:'failed',error:'上次生成失败'};
 await u.retryDivination('player');
 expect(u.error.value).toContain('其他页面');
 expect(findDivination(u.t.value,divinationDay(),'player')!.reading.status).toBe('failed');// rolled back, not faked ready
 blockSave=false;
 await u.retryDivination('player');expect(u.error.value).toBe('');
 expect(findDivination(u.t.value,divinationDay(),'player')!.reading.status).toBe('ready');
 expect(calls.filter(c=>c.task==='divination')).toHaveLength(3);
});

// ── draft extraction: readable section text only, never the raw JSON payload ──
it('keeps readable drafts from partial model output and never stores the raw JSON payload',async()=>{
 const {u}=await fixture();const calls:any[]=[];
 // structurally invalid reply with one valid section: that section is kept as the draft
 fetchStub(calls,()=>({overall:'这是可以读的基调草稿，内容足够长可以被保留下来。',love:'短。'}));
 await u.drawDaily();
 const record=findDivination(u.t.value,divinationDay(),'player')!;
 expect(record.reading.status).toBe('failed');
 expect(record.reading.draft).toBe('这是可以读的基调草稿，内容足够长可以被保留下来。');
 // raw payload handling: parsed sections are kept, unparseable JSON blobs are dropped
 expect(divinationDraftText('{"overall":"原始输出里的完整段落，也应当进入草稿而不丢失。","love":"同样保留"}')).toBe('原始输出里的完整段落，也应当进入草稿而不丢失。');
 expect(divinationDraftText('{"overall":"好","lov')).toBe('');// JSON blob that fails to parse is never stored
 expect(divinationDraftText('```json\n{"overall":"围栏里的修正稿正文，解析后保留。"}\n```')).toBe('围栏里的修正稿正文，解析后保留。');
 expect(divinationDraftText('普通正文残片\n\n[纠正稿]\n{"overall":"纠正稿里更长的可读段落，优先保留这一段。"}')).toBe('纠正稿里更长的可读段落，优先保留这一段。');
});
