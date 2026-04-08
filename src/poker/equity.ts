import { evalHand7 } from './evaluator'

// Fisher-Yates shuffle (in-place, first `count` elements are usable)
function shuffle(deck: number[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]
    deck[i] = deck[j]!
    deck[j] = tmp!
  }
}

/**
 * Monte Carlo equity estimate: probability hero wins vs one random villain.
 * @param holeCards  Hero's 2 hole cards (encoded 0-51)
 * @param board      Community cards already dealt (0, 3, 4, or 5 cards)
 * @param iterations Number of random runouts (higher = more accurate)
 */
export function computeEquity(
  holeCards: number[],
  board: number[],
  iterations = 2000,
): number {
  const usedSet = new Set([...holeCards, ...board])
  const deck = Array.from({ length: 52 }, (_, i) => i).filter(c => !usedSet.has(c))

  let wins = 0
  let ties = 0

  for (let i = 0; i < iterations; i++) {
    shuffle(deck)

    const boardNeeded = 5 - board.length
    // Run out remaining board cards from the front of the shuffled deck,
    // then take 2 cards for villain
    const runBoard = [...board, ...deck.slice(0, boardNeeded)]
    const villain = [deck[boardNeeded]!, deck[boardNeeded + 1]!]

    const heroScore = evalHand7([...holeCards, ...runBoard])
    const villainScore = evalHand7([...villain, ...runBoard])

    if (heroScore > villainScore) wins++
    else if (heroScore === villainScore) ties += 0.5
  }

  return (wins + ties) / iterations
}
