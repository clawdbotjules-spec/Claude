import { evalHand7 } from './evaluator'

function shuffle(deck: number[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }
}

/**
 * Monte Carlo equity estimate: probability hero survives against N villains.
 *
 * Hero wins the pot only when their 7-card score beats every villain.
 * Ties are split equally (awarded 0.5 to hero when hero ties the leader).
 *
 * @param holeCards   Hero's 2 encoded hole cards (0-51)
 * @param board       Community cards dealt so far (0, 3, 4, or 5 cards)
 * @param villainCount  Number of active opponents (1–8); default 1
 * @param iterations  Monte Carlo sample count; default 2000
 */
export function computeEquity(
  holeCards: number[],
  board: number[],
  villainCount = 1,
  iterations = 2000,
): number {
  const usedSet = new Set([...holeCards, ...board])
  const deck = Array.from({ length: 52 }, (_, i) => i).filter(c => !usedSet.has(c))

  // Sanity check: enough cards to deal for this villain count?
  const boardNeeded = 5 - board.length
  const cardsNeeded = boardNeeded + villainCount * 2
  const actualVillains = cardsNeeded <= deck.length ? villainCount : Math.floor((deck.length - boardNeeded) / 2)

  let wins = 0
  let ties = 0

  for (let i = 0; i < iterations; i++) {
    shuffle(deck)

    // Run out the remaining board from the front of the shuffled deck
    const runBoard = [...board, ...deck.slice(0, boardNeeded)]
    const heroScore = evalHand7([...holeCards, ...runBoard])

    // Each villain gets 2 cards from after the run-out board
    let bestVillainScore = -1
    for (let v = 0; v < actualVillains; v++) {
      const offset = boardNeeded + v * 2
      const vScore = evalHand7([deck[offset]!, deck[offset + 1]!, ...runBoard])
      if (vScore > bestVillainScore) bestVillainScore = vScore
    }

    if (heroScore > bestVillainScore) wins++
    else if (heroScore === bestVillainScore) ties += 0.5
  }

  return (wins + ties) / iterations
}
