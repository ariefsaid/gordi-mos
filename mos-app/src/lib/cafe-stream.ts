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
// Cache per viewer. The optional viewer id preserves the old pure/module test API while every
// authenticated surface resolves and writes its stream in an identity-scoped slot.
const rememberedByViewer = new Map<string | null, string | null>()

// OD-CAFE-1: the slot is scoped by LOCATION as well as identity. A stream belongs to one
// branch's books, so "the stream I am working in" is only meaningful beside where I am working.
// One shared slot meant a choice made on Stock at one branch was read by Log at another, which
// then had to reject it and blame the reader for a choice they made on a different page. Scoping
// by location removes the collision at its source while keeping #440's point intact: every
// surface AT THE SAME LOCATION still follows one choice.
function storageKey(viewerId?: string | null, branchId?: string | null): string {
  const identity = viewerId ? `${STORAGE_KEY}.${viewerId}` : STORAGE_KEY
  return branchId ? `${identity}.${branchId}` : identity
}

function readStored(viewerId?: string | null, branchId?: string | null): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(viewerId, branchId))
  } catch {
    return null // private mode / storage disabled — the module still works, just per-page
  }
}

/** The remembered stream's key, or null when nothing has been chosen in this session. */
export function rememberedStreamKey(viewerId?: string | null, branchId?: string | null): string | null {
  const cacheKey = `${viewerId ?? ''}|${branchId ?? ''}`
  if (!rememberedByViewer.has(cacheKey)) rememberedByViewer.set(cacheKey, readStored(viewerId, branchId))
  return rememberedByViewer.get(cacheKey) ?? null
}

/**
 * Record the stream the person CHOSE, for every Café surface to fall back on (the ladder's
 * "used last" rung). Called on a switch only, never on an inferred default.
 */
export function rememberStream(stream: ProductionStream | null, viewerId?: string | null, branchId?: string | null): void {
  // Preserve the original no-argument reset contract used by the Café test harness and any
  // logout/cleanup caller: clearing without an identity clears every Café stream slot, while an
  // explicit viewer id remains scoped to that identity.
  if (!stream && viewerId === undefined) {
    rememberedByViewer.clear()
    try {
      for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = window.sessionStorage.key(i)
        if (key === STORAGE_KEY || key?.startsWith(`${STORAGE_KEY}.`)) {
          window.sessionStorage.removeItem(key)
        }
      }
    } catch {
      // storage unavailable — the in-memory cache is already clear
    }
    return
  }
  const remembered = stream ? streamKey(stream.branch.id, stream.activity) : null
  rememberedByViewer.set(`${viewerId ?? ''}|${branchId ?? ''}`, remembered)
  try {
    if (remembered) window.sessionStorage.setItem(storageKey(viewerId, branchId), remembered)
    else window.sessionStorage.removeItem(storageKey(viewerId, branchId))
  } catch {
    // storage unavailable — the in-memory value still serves this page load
  }
}

/**
 * The stream a Café surface should open on, resolved against ITS live catalog (OD-CAFE-6).
 *
 * Order:
 *   1. the person's own (home) stream — `shared.default_stream()`, resolved by the caller;
 *   2. otherwise their ONLY Café stream Team, resolved by the caller;
 *   3. otherwise the stream chosen elsewhere in the module this session (#440);
 *   4. otherwise null: no default, so the surface asks. A wrong default files production against
 *      books nobody chose; a missing one costs one tap.
 * Each candidate must be in the live catalog: a stale pair resolves to the next rung, never to a
 * guess.
 *
 * Pure. Only an explicit choice (`rememberStream`) writes the shared slot — an inferred default
 * recorded there would outrank the ladder's own rungs on every later surface.
 */
export function resolveCafeStream(
  options: readonly ProductionStream[],
  ownDefault: ProductionStream | null,
  viewerId?: string | null,
  branchId?: string | null,
  soleTeam: ProductionStream | null = null,
): ProductionStream | null {
  const inCatalog = (candidate: ProductionStream | null) =>
    candidate
      ? options.find(
          s => s.branch.id === candidate.branch.id && s.activity === candidate.activity,
        ) ?? null
      : null

  const key = rememberedStreamKey(viewerId, branchId)
  const fromSession = key
    ? options.find(s => streamKey(s.branch.id, s.activity) === key) ?? null
    : null
  return inCatalog(ownDefault) ?? inCatalog(soleTeam) ?? fromSession
}
