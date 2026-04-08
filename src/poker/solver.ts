import type { Card } from './cards'
import { encodeCard } from './cards'
import { computeEquity } from './equity'
import { handCategoryName } from './evaluator'

export interface Action {
  label: string   // e.g. "Bet 2/3 pot"
  freq: number    // 0–100 (percent of the time)
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export interface SolverResult {
  equity: number      // 0–1
  handName: string    // e.g. "Two Pair"
  street: Street
  actions: Action[]
}

export function solve(holeCards: Card[], board: Card[]): SolverResult {
  const holeNums = holeCards.map(encodeCard)
  const boardNums = board.map(encodeCard)

  const street: Street =
    board.length === 0 ? 'preflop' :
    board.length === 3 ? 'flop' :
    board.length === 4 ? 'turn' : 'river'

  const equity = computeEquity(holeNums, boardNums, 2000)

  const allNums = [...holeNums, ...boardNums]
  const handName = board.length >= 3 ? handCategoryName(allNums) : '—'

  const actions = buildActions(equity, street, board)

  return { equity, handName, street, actions }
}

// ─── GTO-inspired action recommendations ─────────────────────────────────────
//
// Without knowing position, stack depth, or opponent's prior action these are
// equity-bucket approximations of a balanced strategy for an IP aggressor.
// Frequencies are tuned to match common solver outputs at 100bb depth.

function buildActions(equity: number, street: Street, board: Card[]): Action[] {
  if (street === 'preflop') return preflopActions(equity)

  const wet = isBoardWet(board)
  return postflopActions(equity, wet)
}

function preflopActions(equity: number): Action[] {
  // Equity thresholds vs a random 2-card hand (heads-up):
  //   AA ~85%, KK ~82%, QQ ~80%, JJ ~77%, TT ~75%
  //   AKs ~67%, AKo ~65%, AQs ~66%, KQs ~63%
  //   22  ~53%, 72o ~32%
  if (equity >= 0.80) return [{ label: 'Open / 3bet', freq: 100 }]
  if (equity >= 0.70) return [{ label: 'Open', freq: 95 }, { label: 'Fold', freq: 5 }]
  if (equity >= 0.60) return [{ label: 'Open', freq: 85 }, { label: 'Fold', freq: 15 }]
  if (equity >= 0.52) return [{ label: 'Open', freq: 65 }, { label: 'Fold', freq: 35 }]
  if (equity >= 0.44) return [{ label: 'Open', freq: 40 }, { label: 'Fold', freq: 60 }]
  return [{ label: 'Fold', freq: 85 }, { label: 'Open', freq: 15 }]
}

function postflopActions(equity: number, wet: boolean): Action[] {
  // Strong nutted hand — pure value
  if (equity >= 0.82) return [
    { label: 'Bet pot (100%)', freq: 55 },
    { label: 'Bet 2/3 pot', freq: 30 },
    { label: 'Check (trap)', freq: 15 },
  ]
  // Good value hand
  if (equity >= 0.70) return [
    { label: 'Bet 2/3 pot', freq: 55 },
    { label: 'Bet 1/3 pot', freq: 25 },
    { label: 'Check', freq: 20 },
  ]
  // Thin value / top pair
  if (equity >= 0.58) return [
    { label: 'Bet 1/3 pot', freq: 50 },
    { label: 'Check', freq: 40 },
    { label: 'Bet 2/3 pot', freq: 10 },
  ]
  // Marginal / bluffcatcher
  if (equity >= 0.47) return [
    { label: 'Check', freq: 65 },
    { label: 'Bet 1/3 pot', freq: 25 },
    { label: 'Fold vs bet', freq: 10 },
  ]
  // Draw / mediocre — wetter boards enable more bluffing
  if (equity >= 0.37) {
    const bluff = wet ? 30 : 15
    return [
      { label: 'Check', freq: 55 },
      { label: 'Bet 1/3 (bluff)', freq: bluff },
      { label: 'Fold vs bet', freq: 45 - bluff },
    ]
  }
  // Weak hand
  if (equity >= 0.26) return [
    { label: 'Fold vs bet', freq: 60 },
    { label: 'Check', freq: 30 },
    { label: 'Bet 1/3 (bluff)', freq: 10 },
  ]
  // Near-air
  return [
    { label: 'Fold', freq: 80 },
    { label: 'Check', freq: 15 },
    { label: 'Bet (bluff)', freq: 5 },
  ]
}

// ─── Board texture helper ─────────────────────────────────────────────────────

function isBoardWet(board: Card[]): boolean {
  if (board.length < 3) return false
  const flop = board.slice(0, 3)

  // Flush draw: two or more cards of the same suit
  const suitCounts: Record<string, number> = {}
  for (const c of flop) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1
  const hasTwoSuited = Object.values(suitCounts).some(n => n >= 2)

  // Connected: three cards span ≤ 4 ranks
  const RANK_ORDER = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
  const idxs = flop.map(c => RANK_ORDER.indexOf(c.rank))
  const span = Math.max(...idxs) - Math.min(...idxs)
  const isConnected = span <= 4

  return hasTwoSuited || isConnected
}
