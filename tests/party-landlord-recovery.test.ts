import {fallbackLandlordPhrases} from '../src/domain/landlordSpeech';
import PartyGameRoom from '../src/components/PartyGameRoom.vue';
import { expect, it, vi, afterEach } from 'vitest';
import { effectScope, reactive, nextTick, createRenderer, defineComponent, h, ssrContextKey } from 'vue';
import { usePartyGames } from '../src/app/usePartyGames';
import { defaults, newSession } from '../src/domain/story';
import { emptyTerminal } from '../src/domain/personalTerminal';
import { createPartyRoom, startPartyRound, applyPartyLandlordAction, validatePartyRooms, settlePartyEnd } from '../src/domain/partyGames';
import { HttpGateway } from '../src/gateway/http';
import { landlordDeck, sortLandlordCards } from '../src/domain/landlordCards';
import type {LandlordRound} from '../src/domain/landlord';
const landlord=(u:ReturnType<typeof usePartyGames>)=>{const rr=u.round.value;if(rr?.kind!=='landlord')throw Error('Expected landlord');return rr;};
const scopes: any[] = [];
afterEach(() => { scopes.splice(0).forEach(s => s.stop()); vi.restoreAllMocks(); vi.useRealTimers(); });
const styles = { a: { skill: 3, aggression: 3, cooperation: 3, caption: '审查' }, b: { skill: 3, aggression: 3, cooperation: 3, caption: '审查' } };
function fixture() {
    const session = newSession('审查', { name: '玩家', appearance: '', personality: '', background: '' }, '开场');
    session.terminal = emptyTerminal();
    session.terminal.tolerances = { player: 4, a: 5, b: 6 };
    const room = createPartyRoom('landlord', ['a', 'b'], '审查牌局', '轻松', 'audit-room');
    room.invitations = { a: 'accepted', b: 'accepted' };
    room.landlordStyles = styles;
    room.landlordPhrases = {a:fallbackLandlordPhrases(),b:fallbackLandlordPhrases()};
    session.terminal.partyRooms = [room];
    session.initial.characters = [{ id: 'a', name: '甲', present: true }, { id: 'b', name: '乙', present: true }];
    const preferences = defaults();
    preferences.terminalProfile = 'main';
    preferences.terminalEnabled = true;
    preferences.profiles = preferences.profiles.map(p => p.id === 'main' ? { ...p, apiBaseUrl: 'https://synthetic.invalid/v1', model: 'fake' } : p);
    let persisted = JSON.stringify(session.terminal);
    const w = reactive({ active: session, state: session.initial, preferences, credentials: { main: 'synthetic' }, terminalEpoch: 0, busy: false, terminalBusy: false, backupWorking: false, storageStatus: 'saved', save: vi.fn(), saveTerminal: vi.fn(async (s: any) => { validatePartyRooms(s.terminal.partyRooms); persisted = JSON.stringify(s.terminal); }), connectionReady: () => true, connectProfile: async () => true, indexTerminalNotes: vi.fn() });
    const scope = effectScope();
    scopes.push(scope);
    const u = scope.run(() => usePartyGames(w as any))!;
    u.open('audit-room');
    vi.spyOn(HttpGateway.prototype, 'terminal').mockRejectedValue(Error('No model calls allowed by audit'));
    return { u, w, persisted: () => JSON.parse(persisted) };
}
async function begin() { const f = fixture(); vi.spyOn(crypto, 'getRandomValues').mockImplementation((a: any) => { a.fill(0); return a; }); await f.u.start(); expect(f.u.error.value).toBe(''); expect(landlord(f.u).turn).toBe('player'); return f; }
const pump = async (p: Promise<any> | undefined) => { await vi.runAllTimersAsync(); await p; };
it('finding R1: retry after a failed player bid must commit the same bid exactly once', async () => { vi.useFakeTimers(); const { u, w } = await begin(); const before = JSON.stringify(u.round.value); vi.mocked(w.saveTerminal).mockRejectedValueOnce(Error('synthetic storage failure')); await u.landlordBid(3); expect(JSON.stringify(u.round.value)).toBe(before); expect(u.retryActionLabel.value).toBe('继续角色出牌'); await pump(u.retryRequest()); expect(u.error.value).toBe(''); expect(u.round.value!.phase).toBe('playing'); expect(landlord(u).moves.filter((m: any) => m.kind === 'bid' && m.id === 'player')).toHaveLength(1); });
it('a cancelled initial save retains its deal and can be resumed from the room', async () => { const { u, w } = fixture(); vi.spyOn(crypto, 'getRandomValues').mockImplementation((a: any) => { a.fill(0); return a; }); const saved = w.saveTerminal.getMockImplementation()!; w.saveTerminal.mockImplementationOnce(async (s: any) => { await saved(s); u.stop(); }); await u.start(); expect(u.round.value!.kind).toBe('landlord'); expect(u.page.value).toBe('room'); expect(u.error.value).not.toBe(''); u.open('audit-room'); u.page.value = 'play'; await u.resumeLandlord(); expect(landlord(u).moves).toHaveLength(0); expect(u.error.value).toBe(''); });
it('pause during an NPC delay prevents a move; explicit resume uses the same saved hand', async () => { vi.useFakeTimers(); const { u } = await begin(); const r = u.room.value!; applyPartyLandlordAction(r, 'player', { kind: 'bid', score: 0 }); const before = JSON.stringify(r); const pending = u.resumeLandlord(); await Promise.resolve(); u.setLandlordActive(false); await pump(pending); expect(JSON.stringify(u.room.value)).toBe(before); u.setLandlordActive(true); await pump(u.resumeLandlord()); expect(landlord(u).moves.length).toBeGreaterThan(1); expect(u.error.value).toBe(''); });
it('a failed NPC save can be retried without repeating the already-committed player move', async () => { vi.useFakeTimers(); const { u, w } = await begin(); const original = w.saveTerminal.getMockImplementation()!; w.saveTerminal.mockImplementationOnce(original).mockRejectedValueOnce(Error('NPC save failed')); await pump(u.landlordBid(0)); expect(u.error.value).toBe('NPC save failed'); const first = landlord(u).moves.map((x: any) => JSON.stringify(x)); expect(first.filter(x => x.includes('"id":"player"'))).toHaveLength(1); await pump(u.retryRequest()); expect(u.error.value).toBe(''); expect(landlord(u).moves.slice(0, first.length).map((x: any) => JSON.stringify(x))).toEqual(first); });
it('manually ending an unfinished table does not settle or request an afterparty', async () => { const { u } = await begin(); const initial = JSON.stringify(u.room.value!.scores); await u.end(); expect(u.room.value!.endReason).toBe('manual'); expect(JSON.stringify(u.room.value!.scores)).toBe(initial); expect(u.room.value!.afterparty).toBeUndefined(); expect(HttpGateway.prototype.terminal).not.toHaveBeenCalled(); validatePartyRooms([u.room.value!]); });
it('swapping opponent ownership cannot change the acting NPC projection or decision inputs', async () => { const { u } = await begin(); const r: any = u.round.value; const { landlordPublicContext } = await import('../src/domain/landlord'); const before = landlordPublicContext(r, 'player'); [r.hands.a, r.hands.b] = [r.hands.b, r.hands.a]; expect(landlordPublicContext(r, 'player')).toEqual(before); expect(before).not.toHaveProperty('bottom'); });
it('finding R2: hiding the terminal while a player move is saving must prevent later NPC moves', async () => {
    vi.useFakeTimers();
    const { u, w } = await begin();
    const original = w.saveTerminal.getMockImplementation()!;
    let release!: () => void;
    w.saveTerminal.mockImplementationOnce(async (s: any) => { await new Promise<void>(r => release = r); await original(s); });
    const pending = u.landlordBid(0);
    await Promise.resolve();
    expect(u.working.value).toBe(true);
    u.setLandlordActive(false);
    release();
    await pump(pending);
    expect(landlord(u).moves.filter((m: any) => m.id !== 'player')).toHaveLength(0);
});
it('finding R1-play: failed user play is not re-submitted by the displayed retry', async () => {
    vi.useFakeTimers();
    const { u, w } = await begin();
    await u.landlordBid(3);
    const rr: any = u.round.value, card = rr.hands.player[0], before = JSON.stringify(rr);
    w.saveTerminal.mockRejectedValueOnce(Error('play save failed'));
    await u.landlordPlay([card]);
    expect(JSON.stringify(u.round.value)).toBe(before);
    await pump(u.retryRequest());
    expect(u.error.value).toBe('');
    expect(landlord(u).moves.some((m: any) => m.kind === 'play' && m.id === 'player' && m.cards.includes(card))).toBe(true);
});
function mountedController(w: any) {
    const props = reactive({ w, kind: 'landlord', active: true });
    let state: any;
    const host: any = { patchProp() { }, insert(child: any, parent: any) { parent.children ??= []; parent.children.push(child); child.parent = parent; }, remove() { }, createElement: () => ({ children: [] }), createText: (text: string) => ({ text }), createComment: (text: string) => ({ text }), setText(node: any, text: string) { node.text = text; }, setElementText(node: any, text: string) { node.text = text; }, parentNode: (node: any) => node.parent, nextSibling: () => null };
    const renderer = createRenderer(host), Harness = defineComponent({ setup() { state = (PartyGameRoom as any).setup(props, { expose() { }, emit() { } }); return () => h('div'); } });
    const app = renderer.createApp(Harness);
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount({ children: [] });
    scopes.push({ stop: () => app.unmount() });
    return { u: state.u, props };
}
it('finding R2-ui: real PartyGameRoom watchers still allow one hidden NPC move after delayed player save', async () => {
    vi.useFakeTimers();
    const { w } = fixture();
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((a: any) => { a.fill(0); return a; });
    const { u, props } = mountedController(w);
    u.open('audit-room');
    await u.start();
    await nextTick();
    expect(u.page).toBe('play');
    const original = w.saveTerminal.getMockImplementation()!;
    let release!: () => void;
    w.saveTerminal.mockImplementationOnce(async (s: any) => { await new Promise<void>(r => release = r); await original(s); });
    const pending = u.landlordBid(0);
    await nextTick();
    props.active = false;
    await nextTick();
    release();
    await pump(pending);
    await nextTick();
    console.log('real component hidden moves', JSON.stringify(u.round.moves));
    expect(u.round.moves.filter((m: any) => m.id !== 'player')).toHaveLength(0);
});
it('real component stops all delayed NPC moves after ordinary hiding, then resumes when visible', async () => {
    vi.useFakeTimers();
    const { w } = fixture();
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((a: any) => { a.fill(0); return a; });
    const { u, props } = mountedController(w);
    u.open('audit-room');
    await u.start();
    await nextTick();
    const pending = u.landlordBid(0);
    await nextTick();
    await nextTick();
    props.active = false;
    await nextTick();
    await pump(pending);
    expect(u.round.moves).toHaveLength(1);
    props.active = true;
    await nextTick();
    await vi.runAllTimersAsync();
    expect(u.round.moves.length).toBeGreaterThan(1);
    expect(u.error).toBe('');
});
function prepareBankruptcy(u: any) {
    const room = u.room.value!, r: any = startPartyRound(room, undefined, () => 0);
    const winning = landlordDeck.filter(c => ['3', '4', '5', '6', '7'].includes(c.split('-')[1] || ''));
    const bottom = winning.slice(0, 3), rest = landlordDeck.filter(c => !winning.includes(c));
    r.starter = r.turn = 'player';
    r.initialHands = { player: sortLandlordCards(winning.filter(c => !bottom.includes(c))), a: sortLandlordCards(rest.slice(0, 17)), b: sortLandlordCards(rest.slice(17)) };
    r.hands = JSON.parse(JSON.stringify(r.initialHands));
    r.bottom = sortLandlordCards(bottom);
    applyPartyLandlordAction(room, 'player', { kind: 'bid', score: 3 });
    for (const rank of ['3', '4', '5', '6']) {
        applyPartyLandlordAction(room, 'player', { kind: 'play', cards: winning.filter(c => c.endsWith('-' + rank)) });
        applyPartyLandlordAction(room, 'a', { kind: 'pass' });
        applyPartyLandlordAction(room, 'b', { kind: 'pass' });
    }
    validatePartyRooms([room]);
    u.page.value = 'play';
    return winning.filter(c => c.endsWith('-7'));
}
it('bankruptcy settles both losers once; failed scene retry does not regenerate a successful scene', async () => {
    const { u, w, persisted } = fixture();
    const last = prepareBankruptcy(u), api = vi.mocked(HttpGateway.prototype.terminal);
    api.mockResolvedValueOnce({lines:[{id:'a',text:'认输，再练练。'},{id:'b',text:'输得心服口服。'}]} as any).mockRejectedValueOnce(Error('scene a unavailable')).mockResolvedValue({ text: '合成场景内容。'.repeat(200), summary: '合成场景' } as any);
    await u.landlordPlay(last);
    expect(u.room.value!.scores).toEqual({ player: 48400, a: -9200, b: -9200 });
    expect(u.room.value!.drunk).toEqual({ player: 0, a: 5, b: 6 });
    expect(u.room.value!.endTriggers).toEqual(['a', 'b']);
    expect(api).toHaveBeenCalledTimes(3);
    expect(u.room.value!.afterparty!.scenes!.map(s => s.status)).toEqual(['failed', 'ready']);
    const ready = u.room.value!.afterparty!.scenes![1]!.text;
    const gameBefore = JSON.stringify(u.round.value);
    await u.retryAfterparty('a');
    expect(api).toHaveBeenCalledTimes(4);
    expect((api.mock.calls[3]![0] as {actorIds:string[]}).actorIds).toEqual(['a']);
    expect(u.room.value!.afterparty!.scenes![1]!.text).toBe(ready);
    expect(JSON.stringify(u.round.value)).toBe(gameBefore);
    expect(u.room.value!.scores).toEqual({ player: 48400, a: -9200, b: -9200 });
    expect(persisted().partyRooms[0].scores).toEqual({ player: 48400, a: -9200, b: -9200 });
    validatePartyRooms([u.room.value!]);
    await u.retryAfterparty();
    expect(api).toHaveBeenCalledTimes(4);
});
it('stopping a pending afterparty keeps the committed settlement and permits retrying only that scene', async () => {
    const { u } = fixture();
    const last = prepareBankruptcy(u), api = vi.mocked(HttpGateway.prototype.terminal);
    let release!: (v: any) => void;
    api.mockImplementationOnce(() => new Promise(r => release = r));
    const pending = u.landlordPlay(last);
    for (let i = 0; i < 20 && !release; i++)
        await Promise.resolve();
    expect(release).toBeTypeOf('function');
    expect(u.room.value!.scores).toEqual({ player: 48400, a: -9200, b: -9200 });
    u.stop();
    release({ text: '合成内容。'.repeat(300), summary: '不会写入' });
    await pending;
    expect(u.room.value!.scores).toEqual({ player: 48400, a: -9200, b: -9200 });
    expect(u.room.value!.afterparty!.scenes![0]!.status).toBe('pending');
    api.mockResolvedValue({ text: '恢复后合成内容。'.repeat(200), summary: '恢复' } as any);
    await u.retryAfterparty('a');
    expect(u.room.value!.afterparty!.scenes!.map(s => s.status)).toEqual(['ready', 'pending']);
    expect(api).toHaveBeenCalledTimes(2);
    validatePartyRooms([u.room.value!]);
});
it('public chat packet while playing contains only visible cards; chat leaves action and score unchanged', async () => {
    const { u } = await begin();
    await u.landlordBid(3);
    const rr: any = u.round.value, privateCards = [...rr.hands.a, ...rr.hands.b].filter(c => !rr.bottom.includes(c));
    const api = vi.mocked(HttpGateway.prototype.terminal);
    api.mockResolvedValue({ dialogue: { version: 1, lines: [{ id: 'a', text: '合成桌面回应' }] } } as any);
    const before = JSON.stringify({ moves: rr.moves, hands: rr.hands, scores: u.room.value!.scores });
    u.draft.value = '现在轮到谁了？';
    await u.reactions();
    expect(u.error.value).toBe('');
    const packet = api.mock.calls[0]![0] as any;
    const summary = JSON.stringify(packet.context.party);
    expect(summary).not.toMatch(/initialHands|"hands"|"hand"/);
    for (const c of privateCards) {
        const label = c === 'BJ' ? '小王' : c === 'RJ' ? '大王' : ({ S: '♠', H: '♥', C: '♣', D: '♦' } as any)[c.split('-')[0]!] + c.split('-')[1];
        expect(summary).not.toContain(label);
    }
    expect(JSON.stringify({ moves: (u.round.value as any).moves, hands: (u.round.value as any).hands, scores: u.room.value!.scores })).toBe(before);
});

it('repeated retry survives player-save failure followed by NPC-save failure without replaying the bid',async()=>{
 vi.useFakeTimers();const {u,w}=await begin();const save=w.saveTerminal.getMockImplementation()!;
 w.saveTerminal.mockRejectedValueOnce(Error('player save failed'));await u.landlordBid(0);expect(landlord(u).moves).toHaveLength(0);
 w.saveTerminal.mockImplementationOnce(save).mockRejectedValueOnce(Error('NPC save failed'));await pump(u.retryRequest());expect(u.error.value).toBe('NPC save failed');expect(landlord(u).moves.map(x=>x.id)).toEqual(['player']);
 await pump(u.retryRequest());expect(u.error.value).toBe('');expect(landlord(u).moves.filter(x=>x.id==='player')).toHaveLength(1);expect(landlord(u).moves.length).toBeGreaterThan(1);
});
