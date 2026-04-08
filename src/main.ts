/**
 * Poker Solver – Even Realities G2
 *
 * Entry point.  Connects to the Even Hub bridge, registers the ring event
 * listener, and kicks off the initial render.
 */

import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { state } from './state'
import { render } from './display'
import { handleEvent } from './events'

const BRIDGE_TIMEOUT_MS = 10_000

function setStatus(msg: string): void {
  const el = document.getElementById('status')
  if (el) el.textContent = msg
  console.log('[status]', msg)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
  )
  return Promise.race([promise, timer])
}

async function boot(): Promise<void> {
  setStatus('Connecting to glasses…')

  const bridge = await withTimeout(
    waitForEvenAppBridge(),
    BRIDGE_TIMEOUT_MS,
    'waitForEvenAppBridge',
  )

  state.bridge = bridge
  setStatus('Connected — tap the ring to start')

  // Register ring event listener
  bridge.onEvenHubEvent((event) => {
    handleEvent(event)
  })

  // Initial display
  render()
}

void boot().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  setStatus(`Connection failed: ${msg}`)
  console.error('[boot]', err)
})
