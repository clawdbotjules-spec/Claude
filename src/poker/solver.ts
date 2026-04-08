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

  // Villains = playerCount - 1 (hero is one player)
  const villains = Math.max(1, playerCount - 1)
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

// Pre-flop: equity threshold offset by position (vs random hand, HU).
// Negative = can open with weaker hands; positive = needs stronger hand.
const POS_PREFLOP_OFFSET: Record<Position, number> = {
  BTN: -0.08,
  CO:  -0.05,
  HJ:  -0.02,
  MP:  0,
  UTG: +0.04,
  SB:  -0.03,
  BB:  +0.02,
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
  if (street === 'preflop') return preflopActions(equity, position)
  return postflopActions(equity, street, board, position, playerCount)
}

// ─── Pre-flop ─────────────────────────────────────────────────────────────────

function preflopActions(equity: number, position: Position | null): Action[] {
  const offset = position ? POS_PREFLOP_OFFSET[position] : 0
  const e = equity + offset  // adjusted equity threshold

  // BB special case: in the big blind we also want a "defend" action label
  const isBB = position === 'BB'

  if (e >= 0.78) return [{ label: isBB ? 'Raise / 3bet' : 'Open / 3bet', freq: 100 }]
  if (e >= 0.68) return [
    { label: isBB ? 'Raise'   : 'Open',  freq: 90 },
    { label: 'Fold',                      freq: 10 },
  ]
  if (e >= 0.58) return [
    { label: isBB ? 'Defend/Raise' : 'Open', freq: isBB ? 75 : 80 },
    { label: 'Fold',                          freq: isBB ? 25 : 20 },
  ]
  if (e >= 0.50) return [
    { label: isBB ? 'Defend' : 'Open',    freq: isBB ? 60 : 60 },
    { label: 'Fold',                       freq: isBB ? 40 : 40 },
  ]
  if (e >= 0.43) return [
    { label: 'Open/Steal',  freq: 35 },
    { label: 'Fold',        freq: 65 },
  ]
  return [{ label: 'Fold', freq: 90 }, { label: 'Open', freq: 10 }]
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
