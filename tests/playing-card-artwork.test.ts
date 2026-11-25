import mahjongBack from '../src/assets/mahjong/TileBack.png?url';
import { expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { landlordDeck, landlordCardLabel } from '../src/domain/landlordCards';
import { playingCardArtworkName } from '../src/domain/playingCardArtwork';
import PlayingCard from '../src/components/PlayingCard.vue';
import MahjongTile from '../src/components/MahjongTile.vue';
const assets = import.meta.glob('../src/assets/playing-cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
it('all 54 playable cards resolve to distinct local faces, with separate red and black jokers', async () => {
  const sources = new Set<string>();
  for (const card of landlordDeck) {
    const src = assets['../src/assets/playing-cards/' + playingCardArtworkName(card) + '.webp'];
    expect(src, card).toBeTypeOf('string');
    sources.add(src);
    const html = await renderToString(createSSRApp({ render: () => h(PlayingCard, { card }) }));
    expect(html).toContain('alt="' + landlordCardLabel(card) + '"');
    expect(html).not.toMatch(/src="https?:/);
  }
  expect(sources.size).toBe(54);
  for (const card of ['S-1', 'RJ-extra', '../../back', 'H-11']) expect(() => playingCardArtworkName(card)).toThrow();
});
it('concealed Mahjong uses its own tile back while poker retains the patterned card back', async () => {
  const back = assets['../src/assets/playing-cards/Back.webp'];
  expect(back).toBeTypeOf('string');
  for (const [component, props, label, source] of [[PlayingCard, { card: 'back' }, '扑克牌背', back], [MahjongTile, { tile: 'back' }, '暗牌', mahjongBack]] as const) {
    const html = await renderToString(createSSRApp({ render: () => h(component as any, props) }));
    expect(html).toContain('src="' + source + '"');
    expect(html).toContain('alt="' + label + '"');
  }
});
