import { expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import LandlordTable from '../src/components/LandlordTable.vue';
import type { LandlordRound } from '../src/domain/landlord';
import type { ViewModel } from '../src/app/useWorkspace';

const participants = ['player', 'npc-a', 'npc-b'];
const npcA = ['H-3', 'H-4', 'H-5', 'H-6', 'H-7', 'H-8', 'H-9', 'H-10', 'H-J', 'H-Q', 'H-K', 'H-A', 'H-2', 'C-4', 'C-5', 'C-6', 'C-7'];
const npcB = ['D-3', 'D-4', 'D-5', 'D-6', 'D-7', 'D-8', 'D-9', 'D-10', 'D-J', 'D-Q', 'D-K', 'D-A', 'D-2', 'C-8', 'C-9', 'C-10', 'C-J'];
const own = ['S-3', 'S-4', 'S-5', 'S-6', 'S-7', 'S-8', 'S-9', 'S-10', 'S-J', 'S-Q', 'S-K', 'S-A', 'S-2', 'C-Q', 'C-K', 'C-A', 'C-2'];
const name = (id: string) => ({ player: '玩家', 'npc-a': '甲同学', 'npc-b': '乙同学' }[id] || id);
function round(phase: LandlordRound['phase'] = 'bidding'): LandlordRound {
  const result = phase === 'complete' ? { winner: 'farmers' as const, deltas: { player: -200, 'npc-a': 100, 'npc-b': 100 }, spring: true } : undefined;
  return {
    kind: 'landlord', rulesVersion: 1, number: 4, participants, starter: 'player',
    initialHands: { player: own, 'npc-a': npcA, 'npc-b': npcB },
    hands: { player: own, 'npc-a': npcA, 'npc-b': npcB }, bottom: ['BJ', 'RJ', 'C-3'],
    openingScores: { player: 10000, 'npc-a': 10000, 'npc-b': 10000 },
    phase, turn: phase === 'complete' ? '' : 'player', landlord: phase === 'complete' ? 'player' : undefined,
    highestBid: phase === 'bidding' ? 1 : 2, moves: [], passes: 0, multiplier: 2,
    ...(result ? { result } : {}),
  } as LandlordRound;
}
const render = (r: LandlordRound, extra: Record<string, unknown> = {}) => renderToString(createSSRApp(LandlordTable, {
  w: {} as ViewModel, round: r, scores: { player: 9800, 'npc-a': 10100, 'npc-b': 10100 }, name,
  busy: false, ...extra,
}));
const buttons = (html: string) => Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g), match => ({
  attrs: match[1] || '', text: (match[2] || '').replace(/<[^>]+>/g, '').trim(),
}));

it('hides opponent cards and the bottom during bidding; exposes them only after completion', async () => {
  const bidding = await render(round());
  expect(bidding).toContain('17 张');
  expect(bidding).toContain('底牌 · 3 张');
  for (const secret of ['♥3', '♦3', '♣3', '小王', '大王']) expect(bidding).not.toContain(secret);
  const complete = await render(round('complete'));
  for (const exposed of ['♥3', '♦3', '♣3', '小王', '大王']) expect(complete).toContain(exposed);
  expect(complete).toContain('农民获胜');
  expect(complete).toContain('春天');
  expect(complete).toContain('本局 -200');
  expect(complete).toContain('余额 9800');
});

it('shows score controls only for a legal player turn and hides all mutation buttons in read-only mode', async () => {
  const html = await render(round());
  const scoreButtons = buttons(html).filter(button => ['不叫', '1 分', '2 分', '3 分'].includes(button.text));
  expect(scoreButtons).toHaveLength(4);
  expect(scoreButtons.find(button => button.text === '不叫')?.attrs).not.toContain('disabled');
  expect(scoreButtons.find(button => button.text === '1 分')?.attrs).toContain('disabled');
  expect(scoreButtons.find(button => button.text === '2 分')?.attrs).not.toContain('disabled');
  expect(buttons(await render(round(), { readOnly: true }))).toEqual([]);
  const waiting = round(); waiting.turn = 'npc-a';
  expect(buttons(await render(waiting)).filter(button => ['不叫', '1 分', '2 分', '3 分'].includes(button.text))).toHaveLength(0);
});

it('renders three named seats, avatars, role labels and public score details', async () => {
  const html = await render(round('complete'));
  for (const visible of ['玩家', '甲同学', '乙同学', '地主', '农民', '余额 9800', '余额 10100', '农民获胜']) expect(html).toContain(visible);
  expect((html.match(/class="pt-avatar/g) || []).length).toBeGreaterThanOrEqual(3);
});
