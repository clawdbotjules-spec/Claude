/**
 * Ring event handler.
 *
 * The Even Hub SDK delivers all ring interactions as a generic event object.
 * We resolve the event type by checking multiple possible fields (matching the
 * pattern used by the pong-even-g2 reference app):
 *
 *   event.listEvent?.eventType  ??
 *   event.textEvent?.eventType  ??
 *   event.sysEvent?.eventType   ??
 *   event.jsonData?.eventType | event_type | type
 *
 * Numeric codes:  0 = tap  1 = scroll-up  2 = scroll-down  3 = double-tap
 * String codes:   "CLICK", "SCROLL_TOP"/"UP", "SCROLL_BOTTOM"/"DOWN", "DOUBLE"
 */

import { state, resetCards, canAnalyzeNow, holeCards, boardCards, TOTAL_CARDS } from './state'
import type { Card } from './poker/cards'
import { RANKS, SUITS } from './poker/cards'
import { render, renderFull } from './display'
import { solve } from './poker/solver'

// ─── Event type resolution ─────────────────────────────────────────────────────

const enum EvType { Tap = 0, ScrollUp = 1, ScrollDown = 2, DoubleTap = 3, Unknown = -1 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveEventType(event: any): EvType {
  const raw: unknown =
    event?.listEvent?.eventType ??
    event?.textEvent?.eventType ??
    event?.sysEvent?.eventType ??
    (event?.jsonData as Record<string, unknown> | undefined)?.eventType ??
    (event?.jsonData as Record<string, unknown> | undefined)?.event_type ??
    (event?.jsonData as Record<string, unknown> | undefined)?.Event_Type ??
    (event?.jsonData as Record<string, unknown> | undefined)?.type

  if (raw === undefined || raw === null) return EvType.Unknown

  // Numeric codes
  if (typeof raw === 'number') {
    if (raw === 0) return EvType.Tap
    if (raw === 1) return EvType.ScrollUp
    if (raw === 2) return EvType.ScrollDown
    if (raw === 3) return EvType.DoubleTap
  }

  // String codes (case-insensitive)
  if (typeof raw === 'string') {
    const up = raw.toUpperCase()
    if (up.includes('DOUBLE'))        return EvType.DoubleTap
    if (up.includes('CLICK'))         return EvType.Tap
    if (up.includes('SCROLL_TOP')  || up.includes('_UP')  || up === 'UP')   return EvType.ScrollUp
    if (up.includes('SCROLL_BOTTOM')|| up.includes('_DOWN')|| up === 'DOWN') return EvType.ScrollDown
  }

  return EvType.Unknown
}

// ─── Public handler ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleEvent(event: any): void {
  const type = resolveEventType(event)
  if (type === EvType.Unknown) return

  switch (state.phase) {
    case 'WELCOME':     handleWelcome(type);    break
    case 'SELECT_RANK': handleRank(type);       break
    case 'SELECT_SUIT': handleSuit(type);       break
    case 'SOLVING':     /* ignore input */      break
    case 'RESULT':      handleResult(type);     break
  }
}

// ─── Phase handlers ───────────────────────────────────────────────────────────

function handleWelcome(type: EvType): void {
  if (type === EvType.Tap || type === EvType.DoubleTap) {
    state.phase = 'SELECT_RANK'
    state.cardIndex = 0
    state.rankIndex = 0
    renderFull()
  }
}

function handleRank(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (state.rankIndex > 0) { state.rankIndex--; render() }
      break

    case EvType.ScrollDown:
      if (state.rankIndex < RANKS.length - 1) { state.rankIndex++; render() }
      break

    case EvType.Tap:
      // Lock in rank, move to suit selection
      state.pendingRank = RANKS[state.rankIndex]!
      state.suitIndex   = 0
      state.phase       = 'SELECT_SUIT'
      render()
      break

    case EvType.DoubleTap:
      // Skip straight to analysis if we already have hole cards
      if (canAnalyzeNow()) {
        startSolving()
      }
      break
  }
}

function handleSuit(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (state.suitIndex > 0) { state.suitIndex--; render() }
      break

    case EvType.ScrollDown:
      if (state.suitIndex < SUITS.length - 1) { state.suitIndex++; render() }
      break

    case EvType.Tap: {
      // Confirm the card
      const card: Card = {
        rank: state.pendingRank!,
        suit: SUITS[state.suitIndex]!,
      }
      state.selectedCards[state.cardIndex] = card
      advanceAfterCard()
      break
    }

    case EvType.DoubleTap:
      // Go back to rank selection for this card
      state.phase     = 'SELECT_RANK'
      state.rankIndex = 0
      render()
      break
  }
}

function handleResult(type: EvType): void {
  if (type === EvType.DoubleTap) {
    resetCards()
    renderFull()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** After a card is confirmed, move to the next card or start solving. */
function advanceAfterCard(): void {
  const nextIndex = state.cardIndex + 1

  if (nextIndex >= TOTAL_CARDS) {
    // All 7 cards entered — solve immediately
    startSolving()
    return
  }

  state.cardIndex  = nextIndex
  state.rankIndex  = 0
  state.suitIndex  = 0
  state.pendingRank = null
  state.phase       = 'SELECT_RANK'
  render()
}

function startSolving(): void {
  state.phase = 'SOLVING'
  render()

  // Yield to let the "Calculating…" frame paint, then compute
  setTimeout(() => {
    try {
      state.result = solve(holeCards(), boardCards())
    } catch (err) {
      console.error('[solver] error:', err)
      state.result = null
    }
    state.phase = 'RESULT'
    renderFull()
  }, 80)
}
