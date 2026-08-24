// The Café module's ONE selected production stream, remembered across its surfaces (#440).
//
// A stream — a (branch, activity) pair, OD-WAY-25/28 — is the axis the whole module turns on:
// the same dish has a different plan, a different balance and a different review queue in
// another stream's books. Before this, each Café surface resolved a stream for itself, so a
// person who picked one on Log and walked to Plan silently changed books. The selection is
// therefore MODULE-scoped, not page-scoped.
//
// Deliberately NOT a React context: /cafe, /cafe/log, /cafe/plan, /cafe/stock, /cafe/review and
// /cafe/pushes are six sibling route elements under three different gates, so a provider would
// have to be hoisted into the router above all of them (shell territory) and every page would
// still have to read it. A module-level remembered key keeps each page owning its own reads,
// and sessionStorage carries the choice across a reload — which page state would not.
// sessionStorage rather than localStorage: this is where you are working TODAY, not a
// preference; a fresh tab starts from the person's own stream again.

import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { streamKey } from '@/lib/kitchen-action-label'

const STORAGE_KEY = 'mos.cafe.stream'

// `undefined` = not read from storage yet. Read lazily so importing this module never
// touches storage (jsdom/SSR safety), and cached so every later read is free.
let remembered: string | null | undefined

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null // private mode / storage disabled — the module still works, just per-page
  }
}

/** The remembered stream's key, or null when nothing has been chosen in this session. */
export function rememberedStreamKey(): string | null {
  if (remembered === undefined) remembered = readStored()
  return remembered
}

/**
 * Record the stream every Café surface should open on from now on. Called on every switch
 * AND on the bootstrap that resolves a default, so the first surface a person opens teaches
 * the rest of the module which books they are in.
 */
export function rememberStream(stream: ProductionStream | null): void {
  remembered = stream ? streamKey(stream.branch.id, stream.activity) : null
  try {
    if (remembered) window.sessionStorage.setItem(STORAGE_KEY, remembered)
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable — the in-memory value still serves this page load
  }
}

/**
 * The stream a Café surface should open on, resolved against ITS live catalog and recorded
 * for the surfaces the person walks to next.
 *
 * Order (FR-001/002 + #440):
 *   1. the stream chosen elsewhere in the module this session, IF it is still in the catalog;
 *   2. otherwise the person's own stream — `shared.default_stream()`, resolved by the caller —
 *      IF it is a catalog stream (a stale pair pointing outside the live six resolves to null,
 *      never to a guess);
 *   3. otherwise null: no default, so the surface asks for an explicit choice exactly as the
 *      capture surface does. A wrong default files production against books nobody chose; a
 *      missing one costs one tap.
 *
 * Pure apart from the recording, which is the point: two surfaces that resolve independently
 * are exactly how they come to disagree.
 */
export function resolveCafeStream(
  options: readonly ProductionStream[],
  ownDefault: ProductionStream | null,
): ProductionStream | null {
  const inCatalog = (candidate: ProductionStream | null) =>
    candidate
      ? options.find(
          s => s.branch.id === candidate.branch.id && s.activity === candidate.activity,
        ) ?? null
      : null

  const key = rememberedStreamKey()
  const fromSession = key
    ? options.find(s => streamKey(s.branch.id, s.activity) === key) ?? null
    : null
  const resolved = fromSession ?? inCatalog(ownDefault)
  rememberStream(resolved)
  return resolved
}
