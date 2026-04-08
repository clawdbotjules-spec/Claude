/**
 * Ring event handler.
 *
 * The Even Hub SDK delivers ring interactions as a generic event object.
 * We resolve the event type by checking multiple possible fields (pattern
 * from the pong-even-g2 reference app):
 *
 *   event.listEvent?.eventType  ??
 *   event.textEvent?.eventType  ??
 *   event.sysEvent?.eventType   ??
 *   event.jsonData?.eventType | event_type | type
 *
 * Numeric codes:  0 = tap  1 = scroll-up  2 = scroll-down  3 = double-tap
 * String codes:   "CLICK", "SCROLL_TOP"/"UP", "SCROLL_BOTTOM"/"DOWN", "DOUBLE"
 *
 * SDK quirk: tap (code 0) is sometimes normalised to `undefined` by the
 * firmware before delivery.  We detect this by checking whether the event
 * came from a text/list container but carried no eventType — that means tap.
 *
 * Scroll throttle: firmware can fire duplicate scroll events within a single
 * swipe; we enforce a 300 ms minimum interval between scroll actions.
 */

import { state, resetCards, canAnalyzeNow, holeCards, boardCards, TOTAL_CARDS } from './state'
import type { Card } from './poker/cards'
import { RANKS, SUITS } from './poker/cards'
import { render, renderFull } from './display'
import { solve } from './poker/solver'

// ─── Event type resolution ─────────────────────────────────────────────────────

const enum EvType { Tap = 0, ScrollUp = 1, ScrollDown = 2, DoubleTap = 3, Unknown = -1 }

// Minimum ms between consecutive scroll actions (firmware duplicate-fire guard)
const SCROLL_THROTTLE_MS = 300
let lastScrollAt = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveEventType(event: any): EvType {
  // Check whether the event came from an interactive container at all
  const hasContainer = !!(event?.listEvent ?? event?.textEvent ?? event?.sysEvent)

  const raw: unknown =
    event?.listEvent?.eventType ??
    event?.textEvent?.eventType ??
    event?.sysEvent?.eventType ??
    (event?.jsonData as Record<string, unknown> | undefined)?.eventType ??
    (event?.jsonData as Record<string, unknown> | undefined)?.event_type ??
    (event?.jsonData as Record<string, unknown> | undefined)?.Event_Type ??
    (event?.jsonData as Record<string, unknown> | undefined)?.type

  // SDK quirk: tap (0) is sometimes delivered as undefined from a container
  if ((raw === undefined || raw === null) && hasContainer) return EvType.Tap
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
    if (up.includes('DOUBLE'))                                      return EvType.DoubleTap
    if (up.includes('CLICK'))                                       return EvType.Tap
    if (up.includes('SCROLL_TOP')   || up.includes('_UP')   || up === 'UP')   return EvType.ScrollUp
    if (up.includes('SCROLL_BOTTOM')|| up.includes('_DOWN') || up === 'DOWN') return EvType.ScrollDown
  }

  return EvType.Unknown
}

function throttledScroll(type: EvType.ScrollUp | EvType.ScrollDown): boolean {
  const now = Date.now()
  if (now - lastScrollAt < SCROLL_THROTTLE_MS) return false
  lastScrollAt = now
  return true
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
      if (throttledScroll(EvType.ScrollUp) && state.rankIndex > 0) {
        state.rankIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (throttledScroll(EvType.ScrollDown) && state.rankIndex < RANKS.length - 1) {
        state.rankIndex++
        render()
      }
      break

    case EvType.Tap:
      // Lock in the rank; move to suit selection
      state.pendingRank = RANKS[state.rankIndex]!
      state.suitIndex   = 0
      state.phase       = 'SELECT_SUIT'
      render()
      break

    case EvType.DoubleTap:
      // Jump straight to analysis if we're at a valid street boundary
      if (canAnalyzeNow()) startSolving()
      break
  }
}

function handleSuit(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (throttledScroll(EvType.ScrollUp) && state.suitIndex > 0) {
        state.suitIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (throttledScroll(EvType.ScrollDown) && state.suitIndex < SUITS.length - 1) {
        state.suitIndex++
        render()
      }
      break

    case EvType.Tap: {
      const card: Card = {
        rank: state.pendingRank!,
        suit: SUITS[state.suitIndex]!,
      }
      state.selectedCards[state.cardIndex] = card
      advanceAfterCard()
      break
    }

    case EvType.DoubleTap:
      // Cancel this card — go back to rank selection
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

function advanceAfterCard(): void {
  const nextIndex = state.cardIndex + 1

  if (nextIndex >= TOTAL_CARDS) {
    startSolving()
    return
  }

  state.cardIndex   = nextIndex
  state.rankIndex   = 0
  state.suitIndex   = 0
  state.pendingRank = null
  state.phase       = 'SELECT_RANK'
  render()
}

function startSolving(): void {
  state.phase = 'SOLVING'
  render()

  // Yield so the "Calculating…" frame renders before the heavy compute
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
