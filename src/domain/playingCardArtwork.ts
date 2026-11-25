import { landlordDeck } from './landlordCards';
/** Keep display assets separate from the persisted card IDs and rule engine. */
export function playingCardArtworkName(card: string): string {
  if (card === 'back') return 'Back';
  if (!landlordDeck.includes(card)) throw new Error('扑克牌无效');
  return card;
}
