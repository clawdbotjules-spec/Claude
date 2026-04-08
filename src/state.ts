import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { Card, Rank } from './poker/cards'
import type { SolverResult } from './poker/solver'

export type Phase =
  | 'WELCOME'       // splash / start screen
  | 'SELECT_RANK'   // scrolling through card ranks
  | 'SELECT_SUIT'   // scrolling through suits after rank locked in
  | 'SOLVING'       // computing equity (async)
  | 'RESULT'        // showing GTO recommendation

// Total cards: 2 hole + up to 5 community (flop×3, turn, river)
export const TOTAL_CARDS = 7

export interface AppState {
  phase: Phase

  // Which card we are currently entering (0 = hole1, 1 = hole2, 2-4 = flop, 5 = turn, 6 = river)
  cardIndex: number

  // Selection cursors
  rankIndex: number   // 0–12 (A→2)
  suitIndex: number   // 0–3  (♠♥♦♣)

  // Rank locked in for current card while choosing suit
  pendingRank: Rank | null

  // Cards entered so far (null = not yet entered)
  selectedCards: (Card | null)[]

  // Filled in after SOLVING completes
  result: SolverResult | null

  // Reference to the Even Hub bridge
  bridge: EvenAppBridge | null
}

export function createInitialState(): AppState {
  return {
    phase: 'WELCOME',
    cardIndex: 0,
    rankIndex: 0,
    suitIndex: 0,
    pendingRank: null,
    selectedCards: Array<Card | null>(TOTAL_CARDS).fill(null),
    result: null,
    bridge: null,
  }
}

// Mutable singleton — the whole app reads/writes this object.
export const state: AppState = createInitialState()

export function resetCards(): void {
  state.phase = 'WELCOME'
  state.cardIndex = 0
  state.rankIndex = 0
  state.suitIndex = 0
  state.pendingRank = null
  state.selectedCards = Array<Card | null>(TOTAL_CARDS).fill(null)
  state.result = null
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Cards that have actually been entered so far. */
export function enteredCards(): Card[] {
  return state.selectedCards.filter((c): c is Card => c !== null)
}

/** Hero's hole cards (always the first two). */
export function holeCards(): Card[] {
  return state.selectedCards.slice(0, 2).filter((c): c is Card => c !== null)
}

/** Community cards (flop / turn / river). */
export function boardCards(): Card[] {
  return state.selectedCards.slice(2).filter((c): c is Card => c !== null)
}

/**
 * True when the user can double-tap to jump straight to analysis.
 * Only allowed at natural street boundaries to avoid a partial board.
 *   board=0 → pre-flop analysis
 *   board=3 → flop analysis
 *   board=4 → turn analysis
 *   board=5 → river analysis (but the app auto-solves there anyway)
 */
export function canAnalyzeNow(): boolean {
  if (holeCards().length < 2) return false
  const bc = boardCards().length
  return bc === 0 || bc === 3 || bc === 4 || bc === 5
}
