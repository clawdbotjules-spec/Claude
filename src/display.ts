/**
 * G2 display layer.
 *
 * Layout:
 *   Container 1 (capture) – invisible, isEventCapture=1, full screen.
 *     Prevents firmware from consuming ring scroll events before the app sees them.
 *   Container 2 (main)    – text content, full screen.
 *
 * On first render: createStartUpPageContainer
 * Subsequent:      textContainerUpgrade  (content-only, no layout rebuild)
 * When layout must change (welcome ↔ cards): rebuildPageContainer
 */

import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'

import { state, canAnalyzeNow, enteredCards, holeCards, boardCards } from './state'
import { RANKS, SUITS, SUIT_SYMBOL, cardDisplay, cardIndexLabel } from './poker/cards'

// ─── Display constants ────────────────────────────────────────────────────────
const W = 488    // text container width (px)
const H = 288    // display height (px)
const CAPTURE_ID = 1
const MAIN_ID    = 2

let started = false   // has createStartUpPageContainer been called?

// ─── Container builders ───────────────────────────────────────────────────────

function captureContainer(): TextContainerProperty {
  return new TextContainerProperty({
    containerID: CAPTURE_ID,
    containerName: 'capture',
    content: ' ',
    xPosition: 0,
    yPosition: 0,
    width: W,
    height: H,
    isEventCapture: 1,
    paddingLength: 0,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
  })
}

function mainContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    containerID: MAIN_ID,
    containerName: 'main',
    content,
    xPosition: 0,
    yPosition: 0,
    width: W,
    height: H,
    isEventCapture: 0,
    paddingLength: 4,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
  })
}

function pageConfig(content: string) {
  return {
    containerTotalNum: 2,
    textObject: [captureContainer(), mainContainer(content)],
  }
}

// ─── Public render entry-point ────────────────────────────────────────────────

export function render(): void {
  const { bridge } = state
  if (!bridge) return

  const content = buildContent()

  if (!started) {
    bridge.createStartUpPageContainer(new CreateStartUpPageContainer(pageConfig(content)))
    started = true
  } else {
    bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: MAIN_ID, content }))
  }
}

/** Force a full page rebuild (layout containers are re-sent). */
export function renderFull(): void {
  const { bridge } = state
  if (!bridge) return

  const content = buildContent()

  if (!started) {
    bridge.createStartUpPageContainer(new CreateStartUpPageContainer(pageConfig(content)))
    started = true
  } else {
    bridge.rebuildPageContainer(new RebuildPageContainer(pageConfig(content)))
  }
}

// ─── Content builders ─────────────────────────────────────────────────────────

function buildContent(): string {
  switch (state.phase) {
    case 'WELCOME':     return welcome()
    case 'SELECT_RANK': return selectRank()
    case 'SELECT_SUIT': return selectSuit()
    case 'SOLVING':     return solving()
    case 'RESULT':      return result()
  }
}

// ── Welcome ──────────────────────────────────────────────────────────────────

function welcome(): string {
  return lines(
    'POKER SOLVER',
    '',
    'Tap to begin',
    '',
    'Enter hole cards',
    'then community cards',
    'for GTO advice',
    '',
    '(2x tap = analyze',
    ' after hole cards)',
  )
}

// ── Rank selection ────────────────────────────────────────────────────────────

function selectRank(): string {
  const label = cardIndexLabel(state.cardIndex)
  const rank  = RANKS[state.rankIndex]!
  const prev  = state.rankIndex > 0                ? RANKS[state.rankIndex - 1] : null
  const next  = state.rankIndex < RANKS.length - 1 ? RANKS[state.rankIndex + 1] : null

  const entered = enteredCards().map(c => cardDisplay(c)).join(' ')

  const hint = canAnalyzeNow() ? 'Tap=confirm  2x=analyze' : 'Scroll \u2195  Tap=confirm'

  return lines(
    `\u25B6 ${label}`,
    '',
    ...(prev  ? [`  ${prev}`]  : ['   ']),
    `\u25BA ${rank} \u25C4`,
    ...(next  ? [`  ${next}`]  : ['   ']),
    '',
    entered ? `Cards: ${entered}` : '',
    '',
    hint,
  )
}

// ── Suit selection ────────────────────────────────────────────────────────────

function selectSuit(): string {
  const label = cardIndexLabel(state.cardIndex)
  const suit  = SUITS[state.suitIndex]!
  const sym   = SUIT_SYMBOL[suit]
  const prev  = state.suitIndex > 0                ? SUITS[state.suitIndex - 1] : null
  const next  = state.suitIndex < SUITS.length - 1 ? SUITS[state.suitIndex + 1] : null

  return lines(
    `\u25B6 ${label}: ${state.pendingRank}`,
    '',
    ...(prev  ? [`  ${SUIT_SYMBOL[prev]}`]  : ['   ']),
    `\u25BA ${sym} \u25C4`,
    ...(next  ? [`  ${SUIT_SYMBOL[next]}`] : ['   ']),
    '',
    'Scroll \u2195  Tap=confirm',
  )
}

// ── Solving ───────────────────────────────────────────────────────────────────

function solving(): string {
  const hole  = holeCards().map(c => cardDisplay(c)).join(' ')
  const board = boardCards().map(c => cardDisplay(c)).join(' ')
  return lines(
    'Calculating\u2026',
    '',
    `Hand: ${hole}`,
    board ? `Board: ${board}` : 'Pre-flop',
    '',
    'Running Monte Carlo\u2026',
  )
}

// ── Result ────────────────────────────────────────────────────────────────────

function result(): string {
  if (!state.result) return 'No result'

  const { result: r } = state
  const hole  = holeCards().map(c => cardDisplay(c)).join(' ')
  const board = boardCards().map(c => cardDisplay(c)).join(' ')
  const eqPct = Math.round(r.equity * 100)

  const streetLabel = r.street.charAt(0).toUpperCase() + r.street.slice(1)

  const actionLines = r.actions
    .filter(a => a.freq > 0)
    .map(a => {
      const bar = '\u2588'.repeat(Math.round(a.freq / 10)) // ▓ visual bar (max 10)
      return `${bar.padEnd(10)} ${String(a.freq).padStart(3)}%  ${a.label}`
    })

  return lines(
    `Hand: ${hole}`,
    board ? `Board: ${board}` : '',
    `Made: ${r.handName}  [${streetLabel}]`,
    `Equity: ${eqPct}%`,
    '\u2500\u2500\u2500 GTO Strategy \u2500\u2500\u2500',
    ...actionLines,
    '',
    '2x tap = restart',
  )
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function lines(...parts: string[]): string {
  return parts.join('\n')
}
