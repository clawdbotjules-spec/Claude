import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { Card, Rank } from './poker/cards'
import type { SolverResult } from './poker/solver'

export type Phase =
  | 'WELCOME'
  | 'SELECT_POSITION'   // scroll / tap to pick table position
  | 'SELECT_SPR'        // scroll / tap to set stack-to-pot ratio
  | 'SELECT_RANK'       // scroll ranks A→2, tap to confirm
  | 'SELECT_SUIT'       // scroll suits ♠♥♦♣, tap to confirm
  | 'SELECT_PLAYERS'    // scroll / tap to set active player count
  | 'SOLVING'           // Monte Carlo in progress
  | 'RESULT'            // show GTO recommendation

// ─── Position ────────────────────────────────────────────────────────────────

export type Position = 'BTN' | 'CO' | 'HJ' | 'MP' | 'UTG' | 'SB' | 'BB'

/** Ordered best-to-worst (intuitive scrolling direction). */
export const POSITIONS: Position[] = ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB']

export const POSITION_LABEL: Record<Position, string> = {
  BTN: 'BTN  Button',
  CO:  'CO   Cutoff',
  HJ:  'HJ   Hi-Jack',
  MP:  'MP   Mid-Pos',
  UTG: 'UTG  Early',
  SB:  'SB   Sm.Blind',
  BB:  'BB   Bg.Blind',
}

/** True when the position is in-position post-flop vs most opponents. */
export function isIP(pos: Position): boolean {
  return pos === 'BTN' || pos === 'CO' || pos === 'HJ'
}

/** True when position is always out-of-position post-flop. */
export function isOOP(pos: Position): boolean {
  return pos === 'SB' || pos === 'BB'
}

// ─── Player count ─────────────────────────────────────────────────────────────

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 9
export const DEFAULT_PLAYERS = 6

// ─── SPR ──────────────────────────────────────────────────────────────────────

/** Predefined SPR options presented to the user. */
export const SPR_VALUES = [1, 2, 3, 4, 6, 8, 10, 15, 20, 30] as const
/** Default index into SPR_VALUES (SPR = 10, typical 100BB cash game). */
export const DEFAULT_SPR_INDEX = 6

// ─── Cards ────────────────────────────────────────────────────────────────────

export const TOTAL_CARDS = 7

// ─── App state ────────────────────────────────────────────────────────────────

export interface AppState {
  phase: Phase
  bridge: EvenAppBridge | null

  // Card entry
  cardIndex: number            // 0–6
  rankIndex: number            // 0–12 (A→2)
  suitIndex: number            // 0–3  (♠♥♦♣)
  pendingRank: Rank | null
  selectedCards: (Card | null)[]

  // Position selection
  position: Position | null
  positionIndex: number        // cursor into POSITIONS[]

  // Player count selection
  playerCount: number          // 2–9
  playerCountIndex: number     // 0 = MIN_PLAYERS, stored across streets
  streetForPlayers: 'flop' | 'turn' | 'river' | null  // which street just ended

  // SPR selection
  spr: number                  // effective stack / pot (set once at hand start)
  sprIndex: number             // cursor into SPR_VALUES[]

  // Result
  result: SolverResult | null
}

export function createInitialState(): AppState {
  return {
    phase: 'WELCOME',
    bridge: null,

    cardIndex: 0,
    rankIndex: 0,
    suitIndex: 0,
    pendingRank: null,
    selectedCards: Array<Card | null>(TOTAL_CARDS).fill(null),

    position: null,
    positionIndex: 0,            // default cursor = BTN

    playerCount: DEFAULT_PLAYERS,
    playerCountIndex: DEFAULT_PLAYERS - MIN_PLAYERS,
    streetForPlayers: null,

    spr: SPR_VALUES[DEFAULT_SPR_INDEX],
    sprIndex: DEFAULT_SPR_INDEX,

    result: null,
  }
}

export const state: AppState = createInitialState()

export function resetCards(): void {
  // Keep position and SPR (user stays at same table) but reset everything else
  const savedPos      = state.position
  const savedPosIndex = state.positionIndex
  const savedBridge   = state.bridge
  const savedSpr      = state.spr
  const savedSprIndex = state.sprIndex

  Object.assign(state, createInitialState())

  state.bridge        = savedBridge
  state.position      = savedPos
  state.positionIndex = savedPosIndex
  state.spr           = savedSpr
  state.sprIndex      = savedSprIndex
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function enteredCards(): Card[] {
  return state.selectedCards.filter((c): c is Card => c !== null)
}

export function holeCards(): Card[] {
  return state.selectedCards.slice(0, 2).filter((c): c is Card => c !== null)
}

export function boardCards(): Card[] {
  return state.selectedCards.slice(2).filter((c): c is Card => c !== null)
}

/**
 * Can the user double-tap to jump to analysis?
 * Only allowed at natural street boundaries to avoid a partial board.
 */
export function canAnalyzeNow(): boolean {
  if (holeCards().length < 2) return false
  const bc = boardCards().length
  return bc === 0 || bc === 3 || bc === 4 || bc === 5
}
