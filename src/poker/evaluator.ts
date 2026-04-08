// 5-card and 7-card hand evaluator.
// Score: higher number = better hand.
//
// Card encoding (0-51):
//   rankOf(card) = Math.floor(card / 4)   → 0=2, 1=3, …, 12=Ace
//   suitOf(card) = card % 4               → 0=clubs, 1=diamonds, 2=hearts, 3=spades

function rankOf(card: number): number { return Math.floor(card / 4) }
function suitOf(card: number): number { return card % 4 }

// Powers of 13 for tiebreaker arithmetic: P[i] = 13^i
const P = [1, 13, 169, 2197, 28561, 371293]

interface Group { r: number; c: number }

export function evalHand5(cards: number[]): number {
  // cards is always exactly 5 elements when called internally
  const ranks = cards.map(rankOf).sort((a, b) => b - a) // descending
  const suits = cards.map(suitOf)

  const isFlush = suits.every(s => s === suits[0])

  // Straight detection (needs 5 distinct ranks)
  let isStraight = false
  let straightTop = 0
  if (new Set(ranks).size === 5) {
    if (ranks[0]! - ranks[4]! === 4) {
      isStraight = true
      straightTop = ranks[0]!
    }
    // Wheel: A(12),5(3),4(2),3(1),2(0)
    if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true
      straightTop = 3 // 5-high straight
    }
  }

  // Group ranks by count: highest count first, then highest rank
  const cnt: Record<number, number> = {}
  for (const r of ranks) cnt[r] = (cnt[r] ?? 0) + 1
  const groups: Group[] = Object.entries(cnt)
    .map(([r, c]) => ({ r: +r, c }))
    .sort((a, b) => b.c - a.c || b.r - a.r)

  const g = (i: number): Group => groups[i] ?? { r: 0, c: 0 }

  if (isFlush && isStraight)             return 8 * P[5]! + straightTop
  if (g(0).c === 4)                      return 7 * P[5]! + g(0).r * P[1]! + g(1).r
  if (g(0).c === 3 && g(1).c === 2)     return 6 * P[5]! + g(0).r * P[1]! + g(1).r
  if (isFlush) return (
    5 * P[5]! + ranks[0]!*P[4]! + ranks[1]!*P[3]! + ranks[2]!*P[2]! + ranks[3]!*P[1]! + ranks[4]!
  )
  if (isStraight)                        return 4 * P[5]! + straightTop
  if (g(0).c === 3)                      return 3 * P[5]! + g(0).r * P[3]! + g(1).r * P[1]! + g(2).r
  if (g(0).c === 2 && g(1).c === 2)     return 2 * P[5]! + g(0).r * P[3]! + g(1).r * P[2]! + g(2).r
  if (g(0).c === 2) return (
    1 * P[5]! + g(0).r * P[4]! + g(1).r * P[2]! + g(2).r * P[1]! + g(3).r
  )
  // High card
  return ranks[0]!*P[4]! + ranks[1]!*P[3]! + ranks[2]!*P[2]! + ranks[3]!*P[1]! + ranks[4]!
}

// Best 5-card score from exactly 7 cards (all C(7,2)=21 drop-2 combos).
export function evalHand7(cards: number[]): number {
  let best = -1
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five = cards.filter((_, k) => k !== i && k !== j)
      const s = evalHand5(five)
      if (s > best) best = s
    }
  }
  return best
}

// Best 5-card score from 5 or 6 cards (handles flop+hole = 5 cards, turn+hole = 6 cards).
function evalBest56(cards: number[]): number {
  if (cards.length === 5) return evalHand5(cards)
  // 6 cards: try each single-card removal (C(6,1) = 6 combos)
  let best = -1
  for (let skip = 0; skip < 6; skip++) {
    const s = evalHand5(cards.filter((_, k) => k !== skip))
    if (s > best) best = s
  }
  return best
}

const HAND_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Trips',
  'Straight', 'Flush', 'Full House', 'Quads', 'Str. Flush',
]

// Returns a human-readable hand category for 5–7 cards.
export function handCategoryName(cards: number[]): string {
  if (cards.length < 5) return '\u2014'
  const score =
    cards.length === 7 ? evalHand7(cards) : evalBest56(cards)
  const cat = Math.floor(score / P[5]!)
  return HAND_NAMES[cat] ?? '\u2014'
}
