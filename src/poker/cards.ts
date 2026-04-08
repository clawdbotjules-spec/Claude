export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2'
export type Suit = 's' | 'h' | 'd' | 'c'

export interface Card {
  rank: Rank
  suit: Suit
}

// Ordered high-to-low for display scrolling
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
export const SUITS: Suit[] = ['s', 'h', 'd', 'c']

export const SUIT_SYMBOL: Record<Suit, string> = {
  s: '\u2660', // ♠
  h: '\u2665', // ♥
  d: '\u2666', // ♦
  c: '\u2663', // ♣
}

export function cardDisplay(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`
}

// Encode a card as 0-51.
// rank index: 2=0, 3=1, …, A=12  (higher number = higher rank)
// suit index: c=0, d=1, h=2, s=3
// card number = rankIndex * 4 + suitIndex
export function encodeCard(card: Card): number {
  const rankIndex = RANKS.length - 1 - RANKS.indexOf(card.rank) // A=12 high
  const suitIndex = SUITS.indexOf(card.suit)
  return rankIndex * 4 + suitIndex
}

export function cardIndexLabel(idx: number): string {
  return [
    'Hole Card 1',
    'Hole Card 2',
    'Flop 1',
    'Flop 2',
    'Flop 3',
    'Turn',
    'River',
  ][idx] ?? `Card ${idx + 1}`
}
