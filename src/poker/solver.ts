import type { Card } from './cards'
import { encodeCard } from './cards'
import { computeEquity } from './equity'
import { handCategoryName } from './evaluator'
import type { Position } from '../state'
import { preflopTableActions } from './preflopTable'
import { analyzeHand, isBoardWet, rangeAdvantageDelta } from './handCategory'

export interface Action {
  label: string   // e.g. "Bet 2/3 pot"
  freq: number    // 0–100 percent
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export interface SolverResult {
  equity: number        // 0–1
  handName: string
  handDetail: string    // e.g. "TPTK", "NutFD+OESD", "AKs"
  street: Street
  position: Position | null
  playerCount: number
  spr: number
  actions: Action[]
}

export function solve(
  holeCards: Card[],
  board: Card[],
  position: Position | null,
  playerCount: number,
  spr = 10,
): SolverResult {
  const holeNums  = holeCards.map(encodeCard)
  const boardNums = board.map(encodeCard)

  const street: Street =
    board.length === 0 ? 'preflop' :
    board.length === 3 ? 'flop'    :
    board.length === 4 ? 'turn'    : 'river'

  // Pre-flop equity is computed HU regardless of player count.
  const villains = street === 'preflop' ? 1 : Math.max(1, playerCount - 1)
  const equity = computeEquity(holeNums, boardNums, villains, 2000)

  const allNums  = [...holeNums, ...boardNums]
  const handName = board.length >= 3 ? handCategoryName(allNums) : '\u2014'

  let handDetail: string
  let actions: Action[]

  if (street === 'preflop') {
    // Use pre-computed lookup table for accurate pre-flop ranges
    actions    = preflopTableActions(holeCards, position)
    handDetail = '' // no post-flop detail on pre-flop
  } else {
    const analysis = analyzeHand(holeCards, board)
    handDetail = analysis.detail
    actions = buildActions(equity, street, board, position, playerCount, spr, analysis.catDelta)
  }

  return { equity, handName, handDetail, street, position, playerCount, spr, actions }
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
  spr: number,
  catDelta: number,
): Action[] {
  return postflopActions(equity, street, board, position, playerCount, spr, catDelta)
}

// ─── Post-flop ────────────────────────────────────────────────────────────────

function postflopActions(
  equity: number,
  _street: Street,
  board: Card[],
  position: Position | null,
  playerCount: number,
  spr: number,
  catDelta: number,
): Action[] {
  const posDelta   = position ? POS_BET_DELTA[position] : 0
  const mwDelta    = multiWayBetDelta(playerCount)
  const rangeDelta = rangeAdvantageDelta(position, board)
  const totalDelta = posDelta + mwDelta + rangeDelta + catDelta

  const wet = isBoardWet(board)

  // Get base action set from equity bucket, then apply SPR sizing labels
  let base = basePostflopActions(equity, wet)
  base = applySprSizing(base, spr, equity)

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
function applyDelta(base: Action[], delta: number, _position: Position | null): Action[] {
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

// ─── SPR-based sizing overlay ─────────────────────────────────────────────────
//
// Short SPR → prefer shove / jam language for strong hands.
// Deep SPR  → prefer smaller sizing, pot control framing.

function applySprSizing(base: Action[], spr: number, equity: number): Action[] {
  if (spr > 4) return base  // standard SPR: no change

  // Short/medium SPR: if hero is strong, upgrade sizing labels toward all-in
  return base.map(a => {
    const lbl = a.label.toLowerCase()
    if (spr <= 2) {
      // Very short stack: replace big bets with shove
      if (lbl.includes('bet pot') || lbl.includes('bet 2/3')) {
        return { ...a, label: equity >= 0.55 ? 'Jam / Shove' : a.label }
      }
    } else {
      // Short-ish SPR (2-4): note commitment threshold
      if (lbl.includes('bet pot')) {
        return { ...a, label: 'Bet (commit)' }
      }
    }
    return a
  })
}
