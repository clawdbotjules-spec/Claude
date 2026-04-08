import type { Card } from './cards'
import { encodeCard } from './cards'
import { computeEquity } from './equity'
import { handCategoryName } from './evaluator'
import type { Position } from '../state'

export interface Action {
  label: string   // e.g. "Bet 2/3 pot"
  freq: number    // 0–100 percent
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export interface SolverResult {
  equity: number        // 0–1
  handName: string
  street: Street
  position: Position | null
  playerCount: number
  actions: Action[]
}

export function solve(
  holeCards: Card[],
  board: Card[],
  position: Position | null,
  playerCount: number,
): SolverResult {
  const holeNums  = holeCards.map(encodeCard)
  const boardNums = board.map(encodeCard)

  const street: Street =
    board.length === 0 ? 'preflop' :
    board.length === 3 ? 'flop'    :
    board.length === 4 ? 'turn'    : 'river'

  // Pre-flop equity must be computed HU (1 villain) regardless of player count.
  // GTO pre-flop charts are built on HU equity; player count adjusts the
  // opening threshold separately, not the equity calculation itself.
  const villains = street === 'preflop' ? 1 : Math.max(1, playerCount - 1)
  const equity = computeEquity(holeNums, boardNums, villains, 2000)

  const allNums  = [...holeNums, ...boardNums]
  const handName = board.length >= 3 ? handCategoryName(allNums) : '\u2014'

  const actions  = buildActions(equity, street, board, position, playerCount)

  return { equity, handName, street, position, playerCount, actions }
}

// ─── Position modifiers ───────────────────────────────────────────────────────
//
// IP (BTN/CO/HJ) → bet more, check less.
// OOP (SB/BB)    → bet less, check more.
// Applied as a flat +/- delta on raw bet frequency before normalising.

const POS_BET_DELTA: Record<Position, number> = {
  BTN: +14,
  CO:  +8,
  HJ:  +3,
  MP:  -2,
  UTG: -6,
  SB:  -10,
  BB:  -13,
}

// Pre-flop: added to raw HU equity before comparing against thresholds.
// Positive = easier to clear threshold (better position / fewer players).
// Calibrated so BTN 6-max opens ~50% of hands, UTG ~20%.
const POS_PREFLOP_ADJ: Record<Position, number> = {
  BTN: +0.10,
  CO:  +0.06,
  HJ:  +0.02,
  MP:  -0.02,
  UTG: -0.06,
  SB:  +0.05,
  BB:  -0.04,
}

// More players behind = harder to open; fewer = easier.
function preflopPlayerAdj(playerCount: number): number {
  if (playerCount <= 2) return +0.06
  if (playerCount === 3) return +0.03
  if (playerCount === 4) return 0
  if (playerCount === 5) return -0.02
  if (playerCount === 6) return -0.04
  return -0.06 // 7+
}

// ─── Player-count modifier (multi-way = tighten up) ───────────────────────────

function multiWayBetDelta(playerCount: number): number {
  if (playerCount <= 2)  return 0
  if (playerCount === 3) return -10
  if (playerCount === 4) return -16
  if (playerCount === 5) return -20
  return -24 // 6+
}

// ─── Action builder ───────────────────────────────────────────────────────────

function buildActions(
  equity: number,
  street: Street,
  board: Card[],
  position: Position | null,
  playerCount: number,
): Action[] {
  if (street === 'preflop') return preflopActions(equity, position, playerCount)
  return postflopActions(equity, street, board, position, playerCount)
}

// ─── Pre-flop ─────────────────────────────────────────────────────────────────
//
// Thresholds are compared against adjusted HU equity (equity + posAdj + playerAdj).
// Reference hand equities (HU vs random):
//   AA 85%  KK 82%  QQ 80%  JJ 77%  TT 75%
//   AKs 67%  AKo 65%  AQs 66%  KQs 63%
//   QJs 58%  JTs 57%  22 53%  72o 32%
//
// With BTN +0.10, 6-max -0.04 → net +0.06:
//   QJs: 0.587 + 0.06 = 0.647 → Open 90%  ✓
//   22:  0.530 + 0.06 = 0.590 → Open 80%  ✓
//   72o: 0.320 + 0.06 = 0.380 → Fold 90%  ✓
//
// With UTG -0.06, 6-max -0.04 → net -0.10:
//   QJs: 0.587 - 0.10 = 0.487 → Open 40% (borderline UTG — correct)
//   AKo: 0.650 - 0.10 = 0.550 → Open 80%  ✓

function preflopActions(equity: number, position: Position | null, playerCount: number): Action[] {
  const posAdj = position ? POS_PREFLOP_ADJ[position] : 0
  const plrAdj = preflopPlayerAdj(playerCount)
  const e = equity + posAdj + plrAdj

  const isBB = position === 'BB'

  if (e >= 0.76) return [{ label: isBB ? 'Raise / 3bet' : 'Open / 3bet', freq: 100 }]
  if (e >= 0.66) return [
    { label: isBB ? 'Raise'        : 'Open',         freq: 95 },
    { label: 'Fold',                                   freq: 5  },
  ]
  if (e >= 0.60) return [
    { label: isBB ? 'Raise/Defend' : 'Open',          freq: 90 },
    { label: 'Fold',                                   freq: 10 },
  ]
  if (e >= 0.54) return [
    { label: isBB ? 'Defend/Raise' : 'Open',          freq: isBB ? 75 : 80 },
    { label: 'Fold',                                   freq: isBB ? 25 : 20 },
  ]
  if (e >= 0.49) return [
    { label: isBB ? 'Defend'       : 'Open',          freq: isBB ? 60 : 65 },
    { label: 'Fold',                                   freq: isBB ? 40 : 35 },
  ]
  if (e >= 0.44) return [
    { label: 'Open / Steal',                           freq: 40 },
    { label: 'Fold',                                   freq: 60 },
  ]
  if (e >= 0.40) return [
    { label: 'Open / Steal',                           freq: 20 },
    { label: 'Fold',                                   freq: 80 },
  ]
  return [{ label: 'Fold', freq: 95 }, { label: 'Open', freq: 5 }]
}

// ─── Post-flop ────────────────────────────────────────────────────────────────

function postflopActions(
  equity: number,
  street: Street,
  board: Card[],
  position: Position | null,
  playerCount: number,
): Action[] {
  const posDelta  = position ? POS_BET_DELTA[position] : 0
  const mwDelta   = multiWayBetDelta(playerCount)
  const totalDelta = posDelta + mwDelta  // total adjustment to bet %

  const wet = isBoardWet(board)

  // Get base action set from equity bucket
  const base = basePostflopActions(equity, wet)

  // Apply delta: shift frequency from/to the first action (bet/check) and the
  // last action (check/fold), keeping total = 100.
  return applyDelta(base, totalDelta, position)
}

function basePostflopActions(equity: number, wet: boolean): Action[] {
  if (equity >= 0.82) return [
    { label: 'Bet pot (100%)', freq: 55 },
    { label: 'Bet 2/3 pot',    freq: 30 },
    { label: 'Check (trap)',   freq: 15 },
  ]
  if (equity >= 0.70) return [
    { label: 'Bet 2/3 pot',    freq: 55 },
    { label: 'Bet 1/3 pot',    freq: 25 },
    { label: 'Check',          freq: 20 },
  ]
  if (equity >= 0.58) return [
    { label: 'Bet 1/3 pot',    freq: 50 },
    { label: 'Check',          freq: 40 },
    { label: 'Bet 2/3 pot',    freq: 10 },
  ]
  if (equity >= 0.47) return [
    { label: 'Check',          freq: 65 },
    { label: 'Bet 1/3 pot',    freq: 25 },
    { label: 'Fold vs bet',    freq: 10 },
  ]
  if (equity >= 0.37) {
    const bluff = wet ? 30 : 15
    return [
      { label: 'Check',             freq: 55 },
      { label: 'Bet 1/3 (bluff)',   freq: bluff },
      { label: 'Fold vs bet',       freq: 45 - bluff },
    ]
  }
  if (equity >= 0.26) return [
    { label: 'Fold vs bet',    freq: 60 },
    { label: 'Check',          freq: 30 },
    { label: 'Bet 1/3 (bluff)', freq: 10 },
  ]
  return [
    { label: 'Fold',           freq: 80 },
    { label: 'Check',          freq: 15 },
    { label: 'Bet (bluff)',    freq: 5 },
  ]
}

/**
 * Shift frequency from passive actions (check/fold) to aggressive (bet)
 * or vice versa, clamping each action to [0,100] and re-normalising.
 *
 * IP positions add delta to the first "bet" action and take from the last
 * passive action; OOP does the reverse.
 */
function applyDelta(base: Action[], delta: number, position: Position | null): Action[] {
  if (delta === 0) return base

  const result = base.map(a => ({ ...a }))
  const len = result.length

  // Find the first bet action and the last passive action
  const betIdx  = result.findIndex(a => a.label.toLowerCase().includes('bet'))
  const passIdx = len - 1  // check or fold is always last

  if (betIdx === -1 || betIdx === passIdx) return result

  // Positive delta → more betting (IP); negative → less (OOP / multi-way)
  const change = Math.abs(delta)
  const src = delta > 0 ? passIdx : betIdx
  const dst = delta > 0 ? betIdx  : passIdx

  const transfer = Math.min(change, result[src]!.freq)
  result[src]!.freq -= transfer
  result[dst]!.freq += transfer

  // Drop zero-frequency actions
  return result.filter(a => a.freq > 0)
}

// ─── Board texture ────────────────────────────────────────────────────────────

function isBoardWet(board: Card[]): boolean {
  if (board.length < 3) return false
  const flop = board.slice(0, 3)

  // Two or more of the same suit on the flop
  const suitCounts: Record<string, number> = {}
  for (const c of flop) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1
  const hasTwoSuited = Object.values(suitCounts).some(n => n >= 2)

  // Three cards span ≤ 4 ranks (connected)
  const RANK_ORDER = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
  const idxs = flop.map(c => RANK_ORDER.indexOf(c.rank))
  const isConnected = Math.max(...idxs) - Math.min(...idxs) <= 4

  return hasTwoSuited || isConnected
}
