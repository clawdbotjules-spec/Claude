/**
 * Post-flop hand category detection.
 *
 * Determines whether hero's holding is a monster, made hand tier, draw, or air.
 * Drives category-specific frequency adjustments on top of equity-bucket baselines.
 */

import type { Card } from './cards'
import type { Position } from '../state'

// Low-to-high rank ordering for straight detection
const RANK_LO_HI = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const
type RankStr = typeof RANK_LO_HI[number]

function rankIdx(rank: string): number {
  return RANK_LO_HI.indexOf(rank as RankStr)
}

export type HandTier =
  | 'monster'      // Str.flush / quads / full house / flush / straight
  | 'strong'       // Set, trips, top-two-pair
  | 'good'         // TPTK, solid two pair
  | 'medium'       // TPGK, middle pair, overpair (on scary board)
  | 'weak'         // TPWK, bottom pair, underpair, weak overpair
  | 'combo_draw'   // Flush draw + straight draw (12–15 outs)
  | 'nfd'          // Nut flush draw (9 outs)
  | 'fd'           // Non-nut flush draw (9 outs)
  | 'oesd'         // Open-ended straight draw (8 outs)
  | 'gutshot'      // Gutshot (4 outs)
  | 'overcards'    // Two overcards, no pair/draw
  | 'air'          // Nothing useful

export interface HandAnalysis {
  tier: HandTier
  detail: string      // Short label for display: "TPTK", "NutFD+OESD", etc.
  catDelta: number    // Bet-frequency delta to add to position/multiway delta
  isPolarised: boolean  // Nut or draw: prefer large sizing
  isMerged: boolean     // Mid-strength made hand: prefer small sizing
}

// ─── Board texture ────────────────────────────────────────────────────────────

export function isBoardWet(board: Card[]): boolean {
  if (board.length < 3) return false
  const flop = board.slice(0, 3)
  const suitCounts: Record<string, number> = {}
  for (const c of flop) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1
  const hasTwoSuited = Object.values(suitCounts).some(n => n >= 2)
  const idxs = flop.map(c => rankIdx(c.rank))
  const isConnected = Math.max(...idxs) - Math.min(...idxs) <= 4
  return hasTwoSuited || isConnected
}

// ─── Range advantage proxy ────────────────────────────────────────────────────

/**
 * Returns a c-bet frequency delta based on positional range advantage.
 * Positive = hero has range advantage (bet more).
 * Negative = hero is at a range disadvantage (bet less).
 */
export function rangeAdvantageDelta(position: Position | null, board: Card[]): number {
  if (!position || board.length < 3) return 0

  const flop = board.slice(0, 3)
  const topVal = Math.max(...flop.map(c => rankIdx(c.rank)))
  const botVal = Math.min(...flop.map(c => rankIdx(c.rank)))

  const isIP  = position === 'BTN' || position === 'CO' || position === 'HJ'
  const isOOP = position === 'SB'  || position === 'BB'

  // Ace-high / king-high boards: PFR (IP) has more of these in range
  if (topVal >= 11) return isIP ? +8 : isOOP ? -8 : 0
  // Queen/jack-high: slight PFR advantage
  if (topVal >= 9)  return isIP ? +4 : isOOP ? -4 : 0
  // Low connected (T-high and below, span ≤ 4): BB defends more of these
  if (topVal <= 8 && topVal - botVal <= 4) return isOOP ? +6 : isIP ? -6 : 0

  return 0
}

// ─── Draw detection ───────────────────────────────────────────────────────────

interface DrawFlags {
  isFlushDraw: boolean
  isNutFlushDraw: boolean
  isOESD: boolean
  isGutshot: boolean
}

function detectDraws(hole: Card[], board: Card[]): DrawFlags {
  const all = [...hole, ...board]

  // ── Flush draw ────────────────────────────────────────────────────────────
  const suitGroups: Record<string, Card[]> = {}
  for (const c of all) {
    suitGroups[c.suit] = suitGroups[c.suit] ?? []
    suitGroups[c.suit]!.push(c)
  }

  let isFlushDraw = false
  let isNutFlushDraw = false
  for (const [suit, cards] of Object.entries(suitGroups)) {
    if (cards.length === 4 && hole.some(c => c.suit === suit)) {
      isFlushDraw = true
      // Nut flush draw = ace is in hero's hand for this suit
      const holeInSuit = hole.filter(c => c.suit === suit)
      isNutFlushDraw = holeInSuit.some(c => c.rank === 'A')
    }
  }

  // ── Straight draw ─────────────────────────────────────────────────────────
  const allRankIdxs = [...new Set(all.map(c => rankIdx(c.rank)))]
  const holeRankSet = new Set(hole.map(c => rankIdx(c.rank)))
  // Ace can play low (wheel)
  if (allRankIdxs.includes(12)) allRankIdxs.push(-1)
  if (holeRankSet.has(12)) holeRankSet.add(-1)

  let isOESD = false
  let isGutshot = false

  for (let lo = -1; lo <= 8; lo++) {
    const window = [lo, lo+1, lo+2, lo+3, lo+4]
    const present = window.filter(r => allRankIdxs.includes(r))
    if (present.length !== 4) continue
    if (!window.some(r => holeRankSet.has(r))) continue
    const absent = window.find(r => !allRankIdxs.includes(r))
    if (absent === lo || absent === lo + 4) {
      isOESD = true  // outside card missing
    } else {
      if (!isOESD) isGutshot = true  // inside card missing (weaker)
    }
  }

  return { isFlushDraw, isNutFlushDraw, isOESD, isGutshot }
}

// ─── Made hand tier relative to board ────────────────────────────────────────

function madeHandTier(
  hole: Card[], board: Card[],
): { tier: HandTier; detail: string } | null {
  const boardRanks = board.map(c => rankIdx(c.rank)).sort((a, b) => b - a)
  const holeRanks  = hole.map(c => rankIdx(c.rank)).sort((a, b) => b - a)

  const topB = boardRanks[0] ?? -1
  const midB = boardRanks[1] ?? -1
  const botB = boardRanks[2] ?? -1

  const h1 = holeRanks[0] ?? -1
  const h2 = holeRanks[1] ?? -1

  // Pocket pair
  if (h1 === h2) {
    if (h1 > topB)  return { tier: 'good',   detail: 'Overpair' }
    if (h1 === topB) return { tier: 'strong', detail: 'Set' }      // set of top pair
    if (h1 === midB) return { tier: 'strong', detail: 'Set(mid)' }
    if (h1 === botB) return { tier: 'strong', detail: 'Set(bot)' }
    if (h1 < botB)  return { tier: 'weak',   detail: 'Underpair' }
    return null
  }

  // ── Check both hole cards for board pairing ────────────────────────────────
  for (const [hr, kr] of [[h1, h2], [h2, h1]] as [number, number][]) {
    if (hr === topB) {
      // Top pair — grade kicker
      if (kr >= 10) return { tier: 'good',   detail: 'TPTK' }
      if (kr >= 7)  return { tier: 'medium', detail: 'TPGK' }
      return             { tier: 'weak',   detail: 'TPWK' }
    }
    if (hr === midB) return { tier: 'medium', detail: 'MidPair' }
    if (hr === botB) return { tier: 'weak',   detail: 'BotPair' }
  }

  // ── Two pair via both hole cards pairing different board cards ─────────────
  const h1PairsBoard = boardRanks.includes(h1)
  const h2PairsBoard = boardRanks.includes(h2)
  if (h1PairsBoard && h2PairsBoard) return { tier: 'good', detail: 'TwoPair' }

  // ── Overcards ─────────────────────────────────────────────────────────────
  if (h1 > topB) return { tier: 'overcards', detail: 'Overcards' }

  return null
}

// ─── Main analyser ────────────────────────────────────────────────────────────

const TIER_DELTA: Record<HandTier, number> = {
  monster:    +25,
  strong:     +18,
  good:       +10,
  medium:      +0,
  weak:       -15,
  combo_draw: +22,
  nfd:        +18,
  fd:         +12,
  oesd:       +12,
  gutshot:    +5,
  overcards:  -5,
  air:        -12,
}

export function analyzeHand(hole: Card[], board: Card[]): HandAnalysis {
  const none: HandAnalysis = {
    tier: 'air', detail: '', catDelta: TIER_DELTA.air,
    isPolarised: false, isMerged: false,
  }
  if (board.length < 3) return none

  // ── Check evaluator hand strength category (0-8) via rank counting ─────────
  // We use a simple rank-count approach to detect trips+ without re-importing
  // the full evaluator (avoids adding another dep in this file).
  const allCards = [...hole, ...board]
  const rankCount: Record<number, number> = {}
  for (const c of allCards) {
    const r = rankIdx(c.rank)
    rankCount[r] = (rankCount[r] ?? 0) + 1
  }
  const counts = Object.values(rankCount).sort((a, b) => b - a)
  const topCount = counts[0] ?? 0
  const secCount = counts[1] ?? 0

  // Suit count for flush detection
  const suitCount: Record<string, number> = {}
  for (const c of allCards) suitCount[c.suit] = (suitCount[c.suit] ?? 0) + 1
  const maxSuit = Math.max(...Object.values(suitCount))

  // Straight detection (simplified — just board reads)
  const uniqueRanks = [...new Set(allCards.map(c => rankIdx(c.rank)))].sort((a,b) => a-b)
  let hasStraight = false
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if ((uniqueRanks[i+4] ?? 0) - (uniqueRanks[i] ?? 0) === 4) { hasStraight = true; break }
  }
  // Wheel
  if (uniqueRanks.includes(12) && uniqueRanks.includes(0) &&
      uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
    hasStraight = true
  }

  // Monster: quads / full house / flush / straight
  if (topCount === 4) {
    return { tier: 'monster', detail: 'Quads',     catDelta: TIER_DELTA.monster, isPolarised: true, isMerged: false }
  }
  if (topCount === 3 && secCount === 2) {
    return { tier: 'monster', detail: 'Boat',      catDelta: TIER_DELTA.monster, isPolarised: true, isMerged: false }
  }
  if (maxSuit >= 5) {
    return { tier: 'monster', detail: 'Flush',     catDelta: TIER_DELTA.monster, isPolarised: true, isMerged: false }
  }
  if (hasStraight) {
    return { tier: 'monster', detail: 'Straight',  catDelta: TIER_DELTA.monster, isPolarised: true, isMerged: false }
  }
  if (topCount === 3) {
    return { tier: 'strong',  detail: 'Trips/Set', catDelta: TIER_DELTA.strong,  isPolarised: true, isMerged: false }
  }
  if (topCount === 2 && secCount === 2) {
    // Two pair — check if hero's hole cards make it
    const h1 = rankIdx(hole[0]?.rank ?? '2')
    const h2 = rankIdx(hole[1]?.rank ?? '2')
    const boardRanks = board.map(c => rankIdx(c.rank))
    const heroMakesTP = (boardRanks.includes(h1) || boardRanks.includes(h2))
    const tier: HandTier = heroMakesTP ? 'good' : 'medium'
    return { tier, detail: 'TwoPair', catDelta: TIER_DELTA[tier], isPolarised: false, isMerged: !heroMakesTP }
  }

  // ── Made hand relative to board ────────────────────────────────────────────
  const made = madeHandTier(hole, board)

  // ── Draws ──────────────────────────────────────────────────────────────────
  const draws = detectDraws(hole, board)

  // ── Combine made hand + draws ──────────────────────────────────────────────
  if (made) {
    const { tier, detail } = made
    // Pair + strong draw = hybrid (use highest delta + annotate)
    if (draws.isFlushDraw || draws.isOESD) {
      const drawLabel = draws.isFlushDraw ? '+FD' : '+OESD'
      // Bump delta a bit for the semi-bluff component
      const bonus = draws.isNutFlushDraw ? 8 : 5
      const delta = Math.min(30, TIER_DELTA[tier] + bonus)
      return { tier, detail: detail + drawLabel, catDelta: delta, isPolarised: false, isMerged: tier === 'medium' || tier === 'weak' }
    }
    return {
      tier,
      detail,
      catDelta:    TIER_DELTA[tier],
      isPolarised: tier === 'monster' || tier === 'strong',
      isMerged:    tier === 'medium' || tier === 'weak',
    }
  }

  // ── No made hand → draw or air ─────────────────────────────────────────────
  if (draws.isFlushDraw && (draws.isOESD || draws.isGutshot)) {
    const detail = draws.isNutFlushDraw
      ? (draws.isOESD ? 'NutFD+OESD' : 'NutFD+GS')
      : (draws.isOESD ? 'FD+OESD'    : 'FD+GS')
    return { tier: 'combo_draw', detail, catDelta: TIER_DELTA.combo_draw, isPolarised: true, isMerged: false }
  }
  if (draws.isNutFlushDraw) {
    return { tier: 'nfd',      detail: 'NutFD',    catDelta: TIER_DELTA.nfd,      isPolarised: true,  isMerged: false }
  }
  if (draws.isFlushDraw) {
    return { tier: 'fd',       detail: 'FlushDraw', catDelta: TIER_DELTA.fd,       isPolarised: true,  isMerged: false }
  }
  if (draws.isOESD) {
    return { tier: 'oesd',     detail: 'OESD',     catDelta: TIER_DELTA.oesd,     isPolarised: true,  isMerged: false }
  }
  if (draws.isGutshot) {
    return { tier: 'gutshot',  detail: 'Gutshot',  catDelta: TIER_DELTA.gutshot,  isPolarised: false, isMerged: false }
  }

  const boardRanks = board.map(c => rankIdx(c.rank))
  const hRanks     = hole.map(c => rankIdx(c.rank))
  const topBoard   = Math.max(...boardRanks)
  if (hRanks.every(r => r > topBoard)) {
    return { tier: 'overcards', detail: 'Overcards', catDelta: TIER_DELTA.overcards, isPolarised: false, isMerged: false }
  }

  return { tier: 'air', detail: 'Air', catDelta: TIER_DELTA.air, isPolarised: false, isMerged: false }
}
