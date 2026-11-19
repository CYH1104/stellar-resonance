import {afterEach, expect, it, vi} from 'vitest';
import {createSSRApp, ref} from 'vue';
import {renderToString} from 'vue/server-renderer';
import type {ViewModel} from '../src/app/useWorkspace';
import type {ElevenRound, PartyRoom} from '../src/domain/partyGames';
import PartyGameRoom from '../src/components/PartyGameRoom.vue';

const controller = vi.hoisted(() => vi.fn());
vi.mock('../src/app/usePartyGames', () => ({usePartyGames: controller}));
vi.mock('../src/components/CharacterAvatar.vue', () => ({default: {render: () => null}}));

function fixture() {
  const wave = {
    number: 1,
    choices: {a: 'stand' as const, b: 'hit' as const},
    speeches: [{id: 'a', text: '我可没有说过自己牌小。'}],
    status: 'deciding' as const,
  };
  const round: ElevenRound = {
    kind: 'eleven', number: 1, banker: 'a', deck: [], turn: '', phase: 'playing',
    flow: 'waves-v1', waves: [wave], stopped: ['a'],
    hands: {player: ['S-A', 'C-2'], a: ['H-9', 'D-Q'], b: ['S-K', 'C-8']},
    replies: [{id: 'b', text: 'LEGACY_PRIVATE_REPLY'}],
    batch: {version: 1, pending: false, wave: 0, playerInput: ''},
  };
  const room: PartyRoom = {
    version: 1, id: 'room', kind: 'eleven', name: '十一点半牌局', style: '轻松',
    members: ['player', 'a', 'b'], invitations: {a: 'accepted', b: 'accepted'},
    inviteReplies: {}, rounds: [round], drunk: {player: 0, a: 0, b: 0},
  };
  const stub = {
    room, round, wave, rooms: [room], history: [round],
    page: ref<'room' | 'play' | 'history'>('play'),
    elevenBatchPending: ref(false), elevenPrepared: ref(true), playerNeedsChoice: ref(true),
    name: (id: string) => ({player: '玩家', a: '甲', b: '乙'})[id] ?? id,
    tolerance: () => 3, participants: room.members,
    pendingInvites: [], declinedInvites: [], draft: '继续看看。', inviteTarget: null,
    error: ref(''), retryActionLabel: ref(''), working: ref(false),
    npcAction: vi.fn(), hit: vi.fn(), stand: vi.fn(), start: vi.fn(),
  };
  controller.mockReturnValue(stub);
  return {stub, room, round};
}

const render = () => renderToString(createSSRApp(PartyGameRoom, {w: {} as ViewModel, kind: 'eleven'}));
const buttons = (html: string) => [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)]
  .map(([, attributes, label]) => ({label: label.trim(), disabled: /\bdisabled\b/.test(attributes)}));
const labels = (html: string) => buttons(html).map(({label}) => label);
const retry = '重试本轮角色回应';
const retired = ['统一发牌', '全员判定并发言', '要牌并提交决定', '停牌并提交决定', '开始同步判定'];

afterEach(() => vi.clearAllMocks());

it('shows one-step player actions, carries the draft and keeps opponents’ cards and decisions out of the page', async () => {
  fixture();
  const html = await render();
  expect(labels(html)).toEqual(expect.arrayContaining(['要牌', '停牌']));
  expect(labels(html).filter(label => retired.includes(label))).toEqual([]);
  expect(html).toContain('maxlength="500"');
  expect(html).toContain('继续看看。');
  expect(html).toContain('提交后统一发牌并回应你的留言');
  expect(html).toContain('♠A');
  expect(html).toContain('3 点');
  expect(html).toContain('甲的暗牌，共2张');
  expect(html).toContain('我可没有说过自己牌小。');
  for (const secret of ['♥9', '♦Q', '♠K', '♣8', 'H-9', 'D-Q', '9.5 点', '8.5 点', 'LEGACY_PRIVATE_REPLY', '已停牌</small>']) {
    expect(html).not.toContain(secret);
  }
  expect(html).not.toMatch(/\b(?:choices|hit|stand)\b/);
});

it('lets a stopped player send a draft and continue the round', async () => {
  const {stub, round} = fixture();
  stub.playerNeedsChoice.value = false;
  round.stopped.push('player');
  const html = await render();
  expect(labels(html)).toContain('继续本轮（我已停牌）');
  expect(labels(html)).not.toContain('要牌');
  expect(labels(html)).not.toContain('停牌');
  expect(html).toContain('maxlength="500"');
});

it('offers a single recovery action for an older round without prepared decisions', async () => {
  const {stub, round} = fixture();
  delete round.batch;
  delete round.flow;
  delete round.waves;
  stub.elevenPrepared.value = false;
  const html = await render();
  expect(labels(html)).toContain('继续牌局并读取角色决定');
  expect(labels(html)).not.toContain('要牌');
  expect(labels(html).filter(label => retired.includes(label))).toEqual([]);
  expect(html).not.toContain('LEGACY_PRIVATE_REPLY');
});

it('retries the saved deal without offering another choice or a duplicate retry button', async () => {
  const {stub, round} = fixture();
  stub.elevenBatchPending.value = true;
  stub.error.value = '连接已中断';
  stub.retryActionLabel.value = retry;
  round.batch!.pending = true;
  const html = await render();
  expect(labels(html).filter(label => label === retry)).toEqual([retry]);
  expect(html).toContain('本轮已发牌，角色回应尚未完成，重试不会重复发牌');
  expect(labels(html)).not.toContain('要牌');
  expect(labels(html)).not.toContain('停牌');
});

it('blocks the next round on both play and room screens while the final reply is pending', async () => {
  const {stub, round} = fixture();
  stub.elevenBatchPending.value = true;
  round.phase = 'complete';
  round.winner = 'player';
  round.batch!.pending = true;
  for (const page of ['play', 'room'] as const) {
    stub.page.value = page;
    const html = await render();
    expect(buttons(html)).toContainEqual({label: '开始下一轮', disabled: true});
    expect(labels(html)).toContain(retry);
    expect(labels(html)).not.toContain('发送互动');
  }
});

it('keeps the pending reply retry available after the room ends', async () => {
  const {stub, room, round} = fixture();
  stub.elevenBatchPending.value = true;
  round.phase = 'complete';
  round.winner = 'player';
  round.batch!.pending = true;
  room.endedAt = '2026-11-19T04:00:00.000Z';
  room.endReason = 'drunk';
  stub.page.value = 'history';
  const html = await render();
  expect(html).toContain('有人达到酒量上限');
  expect(buttons(html)).toContainEqual({label: retry, disabled: false});
  expect(labels(html)).not.toContain('开始下一轮');
});

it('shows final replies alongside the completed result and in game history', async () => {
  const {stub, round} = fixture();
  round.phase = 'complete';
  round.winner = 'player';
  round.batch!.finalReplies = [{id: 'a', text: '这局我服。'}, {id: 'b', text: '差一点就赢了。'}];
  for (const page of ['play', 'history'] as const) {
    stub.page.value = page;
    const html = await render();
    expect(html).toContain('本局结束回应');
    expect(html).toContain('这局我服。');
    expect(html).toContain('差一点就赢了。');
    expect(html).toContain('♥9');
    expect(html).toContain('我可没有说过自己牌小。');
    expect(labels(html)).not.toContain(retry);
  }
});
