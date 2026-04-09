/**
 * Pre-computed GTO pre-flop opening/defence ranges.
 *
 * Tier per position: [BTN, CO, HJ, MP, UTG, SB, BB]
 *   5 = Premium   — always raise/3-bet (100%)
 *   4 = Strong    — open 95%
 *   3 = Good      — open 80%
 *   2 = Marginal  — open 50%
 *   1 = Steal     — open 25%
 *   0 = Fold      — fold almost always
 *
 * BB column = defend / 3-bet tier vs a BTN open (representative).
 * SB column = open / steal vs BB only.
 *
 * Calibrated against solver outputs for 6-max cash (100 BB effective).
 */

import type { Card } from './cards'
import { RANKS } from './cards'
import type { Position } from '../state'
import type { Action } from './solver'

// ─── Hand key ─────────────────────────────────────────────────────────────────

/**
 * Canonical 3-char hand key used as lookup index.
 * Examples: "AKs", "QJo", "TT", "99"
 */
export function handKey(holeCards: Card[]): string {
  // Sort high-to-low: RANKS is high→low so lower indexOf = higher rank
  const sorted = [...holeCards].sort(
    (a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank),
  )
  const a = sorted[0]
  const b = sorted[1]
  if (!a || !b) return ''
  if (a.rank === b.rank) return `${a.rank}${b.rank}`
  return `${a.rank}${b.rank}${a.suit === b.suit ? 's' : 'o'}`
}

// ─── Lookup table ─────────────────────────────────────────────────────────────

type Row = [number, number, number, number, number, number, number]
//          BTN     CO      HJ      MP      UTG     SB      BB

/* eslint-disable @typescript-eslint/naming-convention */
const T: Record<string, Row> = {
  // ── Pairs ──────────────────────────────────────────────────────────────────
  AA:  [5,5,5,5,5,5,4], KK:  [5,5,5,5,5,5,4], QQ:  [5,5,5,5,5,5,4],
  JJ:  [4,4,4,4,4,4,4], TT:  [4,4,4,4,3,4,3],
  '99':[4,4,4,3,3,3,3], '88':[4,4,3,3,3,3,3], '77':[4,4,3,3,2,3,2],
  '66':[4,3,3,2,2,3,2], '55':[4,3,2,2,1,3,2], '44':[4,3,2,1,1,2,2],
  '33':[3,2,2,1,0,2,1], '22':[3,2,1,1,0,2,1],

  // ── Suited aces ────────────────────────────────────────────────────────────
  AKs:[5,5,5,5,5,5,4], AQs:[4,4,4,4,4,4,4], AJs:[4,4,4,4,4,4,3],
  ATs:[4,4,4,4,3,4,3], A9s:[4,4,4,3,2,4,3], A8s:[4,4,3,2,2,3,2],
  A7s:[4,4,3,2,1,3,2], A6s:[4,3,3,2,1,3,2], A5s:[4,3,3,2,2,3,2],
  A4s:[4,3,2,2,1,3,2], A3s:[4,3,2,1,1,3,2], A2s:[4,3,2,1,1,3,2],

  // ── Suited kings ───────────────────────────────────────────────────────────
  KQs:[4,4,4,4,4,4,4], KJs:[4,4,4,4,3,4,3], KTs:[4,4,4,3,3,4,3],
  K9s:[4,4,3,2,1,3,2], K8s:[4,3,2,1,0,3,2], K7s:[4,3,2,1,0,3,1],
  K6s:[4,3,2,1,0,2,1], K5s:[3,3,2,1,0,2,1], K4s:[3,2,1,0,0,2,1],
  K3s:[3,2,1,0,0,2,1], K2s:[3,2,1,0,0,2,1],

  // ── Suited queens ──────────────────────────────────────────────────────────
  QJs:[4,4,4,3,3,4,3], QTs:[4,4,4,3,2,4,3], Q9s:[4,4,3,2,1,3,2],
  Q8s:[4,3,2,1,0,3,2], Q7s:[3,2,1,0,0,2,1], Q6s:[3,2,1,0,0,2,1],
  Q5s:[3,2,1,0,0,2,1], Q4s:[2,1,0,0,0,2,1], Q3s:[2,1,0,0,0,1,0],
  Q2s:[2,1,0,0,0,1,0],

  // ── Suited jacks ───────────────────────────────────────────────────────────
  JTs:[4,4,4,3,3,4,3], J9s:[4,4,3,2,1,3,2], J8s:[4,3,2,1,0,3,2],
  J7s:[3,3,2,1,0,2,1], J6s:[3,2,1,0,0,2,1], J5s:[2,2,1,0,0,1,1],
  J4s:[2,1,0,0,0,1,0], J3s:[2,1,0,0,0,1,0], J2s:[2,1,0,0,0,1,0],

  // ── Suited tens ────────────────────────────────────────────────────────────
  T9s:[4,4,3,3,2,3,3], T8s:[4,4,3,2,1,3,2], T7s:[4,3,2,1,0,3,2],
  T6s:[3,3,1,0,0,2,1], T5s:[2,2,1,0,0,2,1], T4s:[2,1,0,0,0,1,0],
  T3s:[2,1,0,0,0,1,0], T2s:[1,1,0,0,0,1,0],

  // ── Suited nines ───────────────────────────────────────────────────────────
  '98s':[4,4,3,3,2,3,3],'97s':[4,4,3,2,1,3,2],'96s':[4,3,2,1,0,3,2],
  '95s':[3,3,1,0,0,2,1],'94s':[2,1,0,0,0,1,0],'93s':[1,1,0,0,0,1,0],
  '92s':[1,0,0,0,0,1,0],

  // ── Suited eights ──────────────────────────────────────────────────────────
  '87s':[4,4,3,2,1,3,2],'86s':[4,3,2,1,0,3,2],'85s':[4,3,2,1,0,3,2],
  '84s':[2,2,1,0,0,2,1],'83s':[2,1,0,0,0,1,0],'82s':[1,1,0,0,0,1,0],

  // ── Suited sevens ──────────────────────────────────────────────────────────
  '76s':[4,4,3,2,1,3,2],'75s':[4,3,2,1,0,3,2],'74s':[3,3,1,0,0,2,1],
  '73s':[2,2,1,0,0,1,1],'72s':[1,1,0,0,0,1,0],

  // ── Suited sixes ───────────────────────────────────────────────────────────
  '65s':[4,4,3,2,1,3,2],'64s':[3,3,2,1,0,2,1],'63s':[3,2,1,0,0,2,1],
  '62s':[2,1,0,0,0,1,0],

  // ── Suited fives / fours / threes ──────────────────────────────────────────
  '54s':[4,4,3,2,1,3,2],'53s':[3,3,2,1,0,2,1],'52s':[2,2,1,0,0,1,1],
  '43s':[3,3,2,1,0,2,1],'42s':[2,2,1,0,0,1,0],
  '32s':[2,2,1,0,0,1,0],

  // ── Offsuit aces ───────────────────────────────────────────────────────────
  AKo:[5,5,5,5,5,5,4], AQo:[4,4,4,4,4,4,3], AJo:[4,4,4,4,3,4,3],
  ATo:[4,4,4,3,2,4,3], A9o:[4,4,3,2,1,3,2], A8o:[4,3,2,1,0,3,2],
  A7o:[4,3,2,1,0,3,2], A6o:[3,3,1,0,0,2,1], A5o:[3,3,2,1,0,3,2],
  A4o:[3,2,1,0,0,2,1], A3o:[3,2,1,0,0,2,1], A2o:[3,2,1,0,0,2,1],

  // ── Offsuit kings ──────────────────────────────────────────────────────────
  KQo:[4,4,4,4,3,4,3], KJo:[4,4,4,3,2,3,3], KTo:[4,4,3,3,2,3,3],
  K9o:[4,3,2,1,0,3,2], K8o:[3,3,1,0,0,2,1], K7o:[3,2,1,0,0,2,1],
  K6o:[3,2,1,0,0,2,1], K5o:[3,2,1,0,0,2,1], K4o:[2,1,0,0,0,1,0],
  K3o:[2,1,0,0,0,1,0], K2o:[2,1,0,0,0,1,0],

  // ── Offsuit queens ─────────────────────────────────────────────────────────
  QJo:[4,4,4,3,2,3,3], QTo:[4,4,3,2,2,3,3], Q9o:[4,3,2,1,0,3,2],
  Q8o:[3,2,1,0,0,2,1], Q7o:[3,2,1,0,0,2,1], Q6o:[2,1,0,0,0,1,0],
  Q5o:[2,1,0,0,0,1,0], Q4o:[1,0,0,0,0,1,0], Q3o:[1,0,0,0,0,0,0],
  Q2o:[1,0,0,0,0,0,0],

  // ── Offsuit jacks ──────────────────────────────────────────────────────────
  JTo:[4,4,3,3,2,3,3], J9o:[4,3,2,2,1,3,2], J8o:[3,3,2,1,0,3,2],
  J7o:[3,2,1,0,0,2,1], J6o:[2,1,0,0,0,1,0], J5o:[2,1,0,0,0,1,0],
  J4o:[1,0,0,0,0,0,0], J3o:[1,0,0,0,0,0,0], J2o:[0,0,0,0,0,0,0],

  // ── Offsuit tens ───────────────────────────────────────────────────────────
  T9o:[4,4,3,2,2,3,3], T8o:[3,3,2,1,0,3,2], T7o:[3,2,1,0,0,2,1],
  T6o:[2,1,0,0,0,1,0], T5o:[1,0,0,0,0,0,0], T4o:[1,0,0,0,0,0,0],
  T3o:[0,0,0,0,0,0,0], T2o:[0,0,0,0,0,0,0],

  // ── Offsuit nines ──────────────────────────────────────────────────────────
  '98o':[4,3,3,2,1,3,2],'97o':[3,3,2,1,0,2,1],'96o':[3,2,1,0,0,2,1],
  '95o':[2,1,0,0,0,1,0],'94o':[1,0,0,0,0,0,0],'93o':[0,0,0,0,0,0,0],
  '92o':[0,0,0,0,0,0,0],

  // ── Offsuit eights ─────────────────────────────────────────────────────────
  '87o':[4,3,2,1,0,3,2],'86o':[3,3,2,1,0,2,1],'85o':[2,2,1,0,0,1,0],
  '84o':[1,0,0,0,0,0,0],'83o':[0,0,0,0,0,0,0],'82o':[0,0,0,0,0,0,0],

  // ── Offsuit sevens ─────────────────────────────────────────────────────────
  '76o':[4,3,2,1,0,3,2],'75o':[3,2,1,0,0,2,1],'74o':[1,0,0,0,0,0,0],
  '73o':[0,0,0,0,0,0,0],'72o':[0,0,0,0,0,0,0],

  // ── Offsuit sixes ──────────────────────────────────────────────────────────
  '65o':[3,3,2,1,0,3,2],'64o':[3,2,1,0,0,2,1],'63o':[1,0,0,0,0,0,0],
  '62o':[0,0,0,0,0,0,0],

  // ── Offsuit fives / fours / threes / twos ──────────────────────────────────
  '54o':[3,3,2,1,0,3,2],'53o':[2,2,1,0,0,1,0],'52o':[0,0,0,0,0,0,0],
  '43o':[2,2,1,0,0,1,0],'42o':[0,0,0,0,0,0,0],
  '32o':[1,0,0,0,0,0,0],
}
/* eslint-enable @typescript-eslint/naming-convention */

const POS_ORDER: Position[] = ['BTN','CO','HJ','MP','UTG','SB','BB']

function lookupTier(key: string, position: Position): number {
  const row = T[key]
  if (!row) return 0
  const idx = POS_ORDER.indexOf(position)
  return idx >= 0 ? (row[idx] ?? 0) : 0
}

// ─── Action builder ───────────────────────────────────────────────────────────

/** Returns GTO pre-flop actions from the lookup table. */
export function preflopTableActions(holeCards: Card[], position: Position | null): Action[] {
  if (holeCards.length < 2) return [{ label: 'Fold', freq: 100 }]
  if (!position) return [{ label: 'Open', freq: 60 }, { label: 'Fold', freq: 40 }]

  const key = handKey(holeCards)
  if (!key) return [{ label: 'Fold', freq: 100 }]

  const tier = lookupTier(key, position)

  if (position === 'BB') {
    switch (tier) {
      case 5: return [{ label: '3bet', freq: 100 }]
      case 4: return [{ label: '3bet', freq: 30 }, { label: 'Defend', freq: 65 }, { label: 'Fold', freq: 5 }]
      case 3: return [{ label: 'Defend', freq: 80 }, { label: 'Fold', freq: 20 }]
      case 2: return [{ label: 'Defend', freq: 55 }, { label: 'Fold', freq: 45 }]
      case 1: return [{ label: 'Defend', freq: 30 }, { label: 'Fold', freq: 70 }]
      default: return [{ label: 'Fold', freq: 90 }, { label: 'Defend', freq: 10 }]
    }
  }

  if (position === 'SB') {
    switch (tier) {
      case 5: return [{ label: 'Raise / 3bet', freq: 100 }]
      case 4: return [{ label: 'Open', freq: 95 }, { label: 'Fold', freq: 5 }]
      case 3: return [{ label: 'Open', freq: 75 }, { label: 'Fold', freq: 25 }]
      case 2: return [{ label: 'Open', freq: 50 }, { label: 'Fold', freq: 50 }]
      case 1: return [{ label: 'Limp / Fold', freq: 25 }, { label: 'Fold', freq: 75 }]
      default: return [{ label: 'Fold', freq: 100 }]
    }
  }

  // BTN / CO / HJ / MP / UTG
  switch (tier) {
    case 5: return [{ label: 'Raise / 3bet', freq: 100 }]
    case 4: return [{ label: 'Open', freq: 95 }, { label: 'Fold', freq: 5 }]
    case 3: return [{ label: 'Open', freq: 80 }, { label: 'Fold', freq: 20 }]
    case 2: return [{ label: 'Open', freq: 50 }, { label: 'Fold', freq: 50 }]
    case 1: return [{ label: 'Open / Steal', freq: 25 }, { label: 'Fold', freq: 75 }]
    default: return [{ label: 'Fold', freq: 95 }, { label: 'Open', freq: 5 }]
  }
}
