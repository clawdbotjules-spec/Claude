/**
 * G2 display layer.
 *
 * Containers:
 *   1  capture  – isEventCapture=1, full screen, receives all ring input.
 *                 Prevents firmware from consuming scroll events internally.
 *   2  main     – text content, full screen.
 *
 * Render strategy:
 *   First call      → createStartUpPageContainer  (layout + content)
 *   Content update  → textContainerUpgrade         (fast, no flicker)
 *   Phase change    → rebuildPageContainer          (layout + content)
 */

import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'

import {
  state,
  canAnalyzeNow,
  enteredCards,
  holeCards,
  boardCards,
  POSITIONS,
  POSITION_LABEL,
  MIN_PLAYERS,
  MAX_PLAYERS,
  SPR_VALUES,
} from './state'
import { RANKS, SUITS, SUIT_SYMBOL, cardDisplay, cardIndexLabel } from './poker/cards'

// ─── Display constants ────────────────────────────────────────────────────────
const W = 488
const H = 288
const CAPTURE_ID = 1
const MAIN_ID    = 2

let started = false

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

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fast text-only update (no layout rebuild). */
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

/** Full page rebuild — use when switching major phases. */
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

// ─── Screen routing ───────────────────────────────────────────────────────────

function buildContent(): string {
  switch (state.phase) {
    case 'WELCOME':          return welcome()
    case 'SELECT_POSITION':  return selectPosition()
    case 'SELECT_SPR':       return selectSPR()
    case 'SELECT_RANK':      return selectRank()
    case 'SELECT_SUIT':      return selectSuit()
    case 'SELECT_PLAYERS':   return selectPlayers()
    case 'SOLVING':          return solving()
    case 'RESULT':           return result()
  }
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function welcome(): string {
  return join(
    'POKER SOLVER',
    '',
    'Tap to begin',
    '',
    '1. Pick position',
    '2. Enter hole cards',
    '3. Enter board cards',
    '   (or 2x tap to',
    '    analyze sooner)',
    '4. Get GTO advice',
  )
}

// ── Position selection ────────────────────────────────────────────────────────

function selectPosition(): string {
  const pos   = POSITIONS[state.positionIndex]!
  const label = POSITION_LABEL[pos]
  const prev  = state.positionIndex > 0                 ? POSITION_LABEL[POSITIONS[state.positionIndex - 1]!] : null
  const next  = state.positionIndex < POSITIONS.length - 1 ? POSITION_LABEL[POSITIONS[state.positionIndex + 1]!] : null

  return join(
    '\u25B6 Your Position',
    '',
    prev  ? `  ${prev}`  : '',
    `\u2192 ${label}`,
    next  ? `  ${next}`  : '',
    '',
    'Scroll \u2195  Tap=confirm',
  )
}

// ── SPR selection ─────────────────────────────────────────────────────────────

function selectSPR(): string {
  const spr  = SPR_VALUES[state.sprIndex]!
  const prev = state.sprIndex > 0                      ? SPR_VALUES[state.sprIndex - 1] : null
  const next = state.sprIndex < SPR_VALUES.length - 1  ? SPR_VALUES[state.sprIndex + 1] : null
  const pos  = state.position ?? '?'

  return join(
    `\u25B6 Stack-to-Pot [${pos}]`,
    '',
    prev !== undefined ? `  SPR ${prev}` : '',
    `\u2192 SPR ${spr}`,
    next !== undefined ? `  SPR ${next}` : '',
    '',
    'Scroll \u2195  Tap=confirm',
    '2x=skip (keep current)',
  )
}

// ── Rank selection ────────────────────────────────────────────────────────────

function selectRank(): string {
  const label = cardIndexLabel(state.cardIndex)
  const rank  = RANKS[state.rankIndex]!
  const prev  = state.rankIndex > 0                 ? RANKS[state.rankIndex - 1] : null
  const next  = state.rankIndex < RANKS.length - 1  ? RANKS[state.rankIndex + 1] : null

  const entered = enteredCards().map(c => cardDisplay(c)).join(' ')
  const pos     = state.position ?? '?'
  const hint    = canAnalyzeNow() ? 'Tap=confirm  2x=analyze' : 'Scroll \u2195  Tap=confirm'

  return join(
    `\u25B6 ${label}  [${pos}]`,
    '',
    prev ? `  ${prev}` : '',
    `\u2192 ${rank}`,
    next ? `  ${next}` : '',
    '',
    entered ? `Cards: ${entered}` : '',
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

  return join(
    `\u25B6 ${label}: ${state.pendingRank}`,
    '',
    prev ? `  ${SUIT_SYMBOL[prev]}` : '',
    `\u2192 ${sym}`,
    next ? `  ${SUIT_SYMBOL[next]}` : '',
    '',
    'Scroll \u2195  Tap=confirm',
    '2x tap = back to rank',
  )
}

// ── Player count selection ────────────────────────────────────────────────────

function selectPlayers(): string {
  const street = state.streetForPlayers ?? 'flop'
  const streetLabel = street.charAt(0).toUpperCase() + street.slice(1)

  const count = MIN_PLAYERS + state.playerCountIndex
  const prev  = count > MIN_PLAYERS ? count - 1 : null
  const next  = count < MAX_PLAYERS ? count + 1 : null

  const hd = holeCards().map(c => cardDisplay(c)).join(' ')
  const bd = boardCards().map(c => cardDisplay(c)).join(' ')

  return join(
    `\u25B6 Players (${streetLabel})`,
    '',
    prev !== null ? `  ${prev} players` : '',
    `\u2192 ${count} players`,
    next !== null ? `  ${next} players` : '',
    '',
    `Hand: ${hd}`,
    bd ? `Board: ${bd}` : '',
    '',
    'Scroll \u2195  Tap=confirm',
  )
}

// ── Solving ───────────────────────────────────────────────────────────────────

function solving(): string {
  const hd = holeCards().map(c => cardDisplay(c)).join(' ')
  const bd = boardCards().map(c => cardDisplay(c)).join(' ')
  const pos = state.position ?? '?'
  return join(
    'Calculating\u2026',
    '',
    `Pos: ${pos}  Players: ${state.playerCount}`,
    `Hand: ${hd}`,
    bd ? `Board: ${bd}` : 'Pre-flop',
    '',
    'Running Monte Carlo\u2026',
  )
}

// ── Result ────────────────────────────────────────────────────────────────────

function result(): string {
  if (!state.result) return 'No result'
  const r = state.result

  const hd = holeCards().map(c => cardDisplay(c)).join(' ')
  const bd = boardCards().map(c => cardDisplay(c)).join(' ')
  const eqPct = Math.round(r.equity * 100)
  const pos = r.position ?? '?'
  const streetLabel = r.street.charAt(0).toUpperCase() + r.street.slice(1)

  const actionLines = r.actions
    .filter(a => a.freq > 0)
    .map(a => {
      const bar = '\u2588'.repeat(Math.round(a.freq / 10))
      return `${bar.padEnd(10)} ${String(a.freq).padStart(3)}%  ${a.label}`
    })

  const canContinue = boardCards().length < 5
  const footer = canContinue
    ? 'Tap=add turn/river  2x=new hand'
    : '2x tap = new hand'

  const detailPart = r.handDetail ? `  ${r.handDetail}` : ''
  const sprLabel   = `SPR:${r.spr}`

  return join(
    `${hd}  [${pos} / ${r.playerCount}p]`,
    bd ? `Board: ${bd}` : '',
    `${r.handName}${detailPart}  ${streetLabel}`,
    `Eq: ${eqPct}%  ${sprLabel}`,
    '\u2500\u2500 GTO Strategy \u2500\u2500',
    ...actionLines,
    '',
    footer,
  )
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function join(...parts: string[]): string {
  return parts.join('\n')
}
