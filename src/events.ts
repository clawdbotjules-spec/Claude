/**
 * Ring event handler.
 *
 * Event type resolution (pong-even-g2 pattern):
 *   event.listEvent?.eventType ?? event.textEvent?.eventType ?? …
 *
 * Numeric codes:  0 = tap  1 = scroll-up  2 = scroll-down  3 = double-tap
 * SDK quirk: tap (code 0) may arrive as `undefined` from a container event.
 * Scroll throttle: 300 ms minimum between scroll actions.
 */

import {
  state,
  resetCards,
  canAnalyzeNow,
  holeCards,
  boardCards,
  TOTAL_CARDS,
  POSITIONS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  SPR_VALUES,
} from './state'
import type { Card } from './poker/cards'
import { RANKS, SUITS } from './poker/cards'
import { render, renderFull } from './display'
import { solve } from './poker/solver'

// ─── Event type resolution ─────────────────────────────────────────────────────

const enum EvType { Tap = 0, ScrollUp = 1, ScrollDown = 2, DoubleTap = 3, Unknown = -1 }

const SCROLL_THROTTLE_MS = 300
let lastScrollAt = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveEventType(event: any): EvType {
  const hasContainer = !!(event?.listEvent ?? event?.textEvent ?? event?.sysEvent)

  const raw: unknown =
    event?.listEvent?.eventType ??
    event?.textEvent?.eventType ??
    event?.sysEvent?.eventType ??
    (event?.jsonData as Record<string, unknown> | undefined)?.eventType ??
    (event?.jsonData as Record<string, unknown> | undefined)?.event_type ??
    (event?.jsonData as Record<string, unknown> | undefined)?.Event_Type ??
    (event?.jsonData as Record<string, unknown> | undefined)?.type

  // SDK normalises tap (0) to undefined in some firmware versions
  if ((raw === undefined || raw === null) && hasContainer) return EvType.Tap
  if (raw === undefined || raw === null) return EvType.Unknown

  if (typeof raw === 'number') {
    if (raw === 0) return EvType.Tap
    if (raw === 1) return EvType.ScrollUp
    if (raw === 2) return EvType.ScrollDown
    if (raw === 3) return EvType.DoubleTap
  }

  if (typeof raw === 'string') {
    const up = raw.toUpperCase()
    if (up.includes('DOUBLE'))                                       return EvType.DoubleTap
    if (up.includes('CLICK'))                                        return EvType.Tap
    if (up.includes('SCROLL_TOP')   || up.includes('_UP')   || up === 'UP')   return EvType.ScrollUp
    if (up.includes('SCROLL_BOTTOM')|| up.includes('_DOWN') || up === 'DOWN') return EvType.ScrollDown
  }

  return EvType.Unknown
}

function canScroll(): boolean {
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
    case 'WELCOME':          handleWelcome(type);   break
    case 'SELECT_POSITION':  handlePosition(type);  break
    case 'SELECT_SPR':       handleSPR(type);       break
    case 'SELECT_RANK':      handleRank(type);      break
    case 'SELECT_SUIT':      handleSuit(type);      break
    case 'SELECT_PLAYERS':   handlePlayers(type);   break
    case 'SOLVING':          /* ignore */           break
    case 'RESULT':           handleResult(type);    break
  }
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function handleWelcome(type: EvType): void {
  if (type === EvType.Tap || type === EvType.DoubleTap) {
    state.phase         = 'SELECT_POSITION'
    state.positionIndex = 0
    renderFull()
  }
}

// ─── Position selection ───────────────────────────────────────────────────────

function handlePosition(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (canScroll() && state.positionIndex > 0) {
        state.positionIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (canScroll() && state.positionIndex < POSITIONS.length - 1) {
        state.positionIndex++
        render()
      }
      break

    case EvType.Tap:
      state.position = POSITIONS[state.positionIndex]!
      state.phase    = 'SELECT_SPR'
      renderFull()
      break

    case EvType.DoubleTap:
      // Back to welcome
      state.phase = 'WELCOME'
      renderFull()
      break
  }
}

// ─── SPR selection ────────────────────────────────────────────────────────────

function handleSPR(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (canScroll() && state.sprIndex > 0) {
        state.sprIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (canScroll() && state.sprIndex < SPR_VALUES.length - 1) {
        state.sprIndex++
        render()
      }
      break

    case EvType.Tap:
      state.spr       = SPR_VALUES[state.sprIndex]!
      state.cardIndex = 0
      state.rankIndex = 0
      state.phase     = 'SELECT_RANK'
      renderFull()
      break

    case EvType.DoubleTap:
      // Skip — keep current SPR value
      state.cardIndex = 0
      state.rankIndex = 0
      state.phase     = 'SELECT_RANK'
      renderFull()
      break
  }
}

// ─── Rank selection ───────────────────────────────────────────────────────────

function handleRank(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (canScroll() && state.rankIndex > 0) {
        state.rankIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (canScroll() && state.rankIndex < RANKS.length - 1) {
        state.rankIndex++
        render()
      }
      break

    case EvType.Tap:
      state.pendingRank = RANKS[state.rankIndex]!
      state.suitIndex   = 0
      state.phase       = 'SELECT_SUIT'
      render()
      break

    case EvType.DoubleTap:
      if (canAnalyzeNow()) startSolving()
      break
  }
}

// ─── Suit selection ───────────────────────────────────────────────────────────

function handleSuit(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (canScroll() && state.suitIndex > 0) {
        state.suitIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (canScroll() && state.suitIndex < SUITS.length - 1) {
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
      // Cancel — go back to rank selection for this card
      state.phase     = 'SELECT_RANK'
      state.rankIndex = 0
      render()
      break
  }
}

// ─── Player count selection ───────────────────────────────────────────────────

function handlePlayers(type: EvType): void {
  switch (type) {
    case EvType.ScrollUp:
      if (canScroll() && MIN_PLAYERS + state.playerCountIndex > MIN_PLAYERS) {
        state.playerCountIndex--
        render()
      }
      break

    case EvType.ScrollDown:
      if (canScroll() && MIN_PLAYERS + state.playerCountIndex < MAX_PLAYERS) {
        state.playerCountIndex++
        render()
      }
      break

    case EvType.Tap:
      // Confirm player count and move on
      state.playerCount = MIN_PLAYERS + state.playerCountIndex
      proceedAfterPlayers()
      break

    case EvType.DoubleTap:
      // Jump straight to analysis with current player count
      state.playerCount = MIN_PLAYERS + state.playerCountIndex
      startSolving()
      break
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────

function handleResult(type: EvType): void {
  switch (type) {
    case EvType.Tap: {
      if (boardCards().length >= 5) {
        // River already complete — tap also restarts
        resetCards()
        renderFull()
      } else {
        // Continue adding cards for the next street
        state.phase       = 'SELECT_RANK'
        state.rankIndex   = 0
        state.suitIndex   = 0
        state.pendingRank = null
        // state.cardIndex is already pointing at the next unconfirmed card
        renderFull()
      }
      break
    }
    case EvType.DoubleTap:
      resetCards()
      renderFull()
      break
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * After confirming a card: either open player-count screen (end of each
 * street) or move straight to the next rank-selection.
 */
function advanceAfterCard(): void {
  const nextIndex = state.cardIndex + 1

  // Street just completed → ask for player count
  if (nextIndex === 5) {
    // Just entered flop card 3 (index 4), board = 3
    state.streetForPlayers = 'flop'
    state.cardIndex        = nextIndex
    state.phase            = 'SELECT_PLAYERS'
    renderFull()
    return
  }
  if (nextIndex === 6) {
    // Just entered turn (index 5), board = 4
    state.streetForPlayers = 'turn'
    state.cardIndex        = nextIndex
    state.phase            = 'SELECT_PLAYERS'
    renderFull()
    return
  }
  if (nextIndex >= TOTAL_CARDS) {
    // Just entered river (index 6), board = 5 — ask for players then solve
    state.streetForPlayers = 'river'
    state.phase            = 'SELECT_PLAYERS'
    renderFull()
    return
  }

  // Otherwise: just advance to the next card
  state.cardIndex   = nextIndex
  state.rankIndex   = 0
  state.suitIndex   = 0
  state.pendingRank = null
  state.phase       = 'SELECT_RANK'
  render()
}

/**
 * After player count is confirmed, either start entering the next street's
 * cards or solve (river done).
 */
function proceedAfterPlayers(): void {
  const street = state.streetForPlayers

  if (street === 'river') {
    // All cards entered — solve now
    startSolving()
    return
  }

  // Next street's first card: cardIndex was already advanced in advanceAfterCard
  state.rankIndex       = 0
  state.suitIndex       = 0
  state.pendingRank     = null
  state.streetForPlayers = null
  state.phase           = 'SELECT_RANK'
  renderFull()
}

function startSolving(): void {
  state.phase = 'SOLVING'
  render()

  setTimeout(() => {
    try {
      state.result = solve(holeCards(), boardCards(), state.position, state.playerCount, state.spr)
    } catch (err) {
      console.error('[solver] error:', err)
      state.result = null
    }
    state.phase = 'RESULT'
    renderFull()
  }, 80)
}
