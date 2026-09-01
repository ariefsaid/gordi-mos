import type { TriageNotificationRow } from './read-handled-semantics'

/**
 * nudge-semantics — the OD-WAY-86 re-nudge model (issue 141). PURE PRESENTATION: no stored nudge
 * state, no schema change. An item UNTRIAGED (never read AND never handled) for 48h re-surfaces
 * at the top of the triage list with an age badge, once per day. Tier and badge are derived only
 * from created_at + the current date (day buckets), so an item nudged today stays nudged in place
 * today — a re-render can never re-animate it, and the notifications column-pin trigger (which
 * permits only read_at/handled_at writes) is never touched.
 */

/** An item must sit untriaged this many whole days before it re-surfaces (OD-WAY-86: 48h). */
export const NUDGE_AFTER_DAYS = 2

const DAY_MS = 86_400_000

/** Whole days since created_at, floored — the day bucket behind both the tier and the badge. */
export function triageAgeDays(createdAt: string, now: Date): number {
  const age = now.getTime() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(age / DAY_MS))
}

/**
 * The nudge: an untriaged row aged >= 48h returns its age in whole days (the badge count);
 * every other row returns null — read or handled rows are never nudged, never badged (AC-141-2).
 */
export function nudgeAgeDays(row: TriageNotificationRow, now: Date): number | null {
  if (row.read_at != null || row.handled_at != null) return null
  const days = triageAgeDays(row.created_at, now)
  return days >= NUDGE_AFTER_DAYS ? days : null
}

/**
 * The triage order (OD-WAY-86 layered on ADR-0019 D9): nudged untriaged rows first (longest-
 * waiting first — the most-starved row surfaces), then the existing unread-first/newest-first
 * order. A pure function of (rows, now): same inputs → same order, so a same-day re-render never
 * re-orders the queue (AC-141-3).
 */
export function compareTriage(a: TriageNotificationRow, b: TriageNotificationRow, now: Date): number {
  const an = nudgeAgeDays(a, now)
  const bn = nudgeAgeDays(b, now)
  if (an != null || bn != null) {
    if (an == null) return 1 // only b is nudged
    if (bn == null) return -1 // only a is nudged
    if (an !== bn) return bn - an // both nudged: oldest surfaces first
  }
  const au = a.read_at == null ? 0 : 1
  const bu = b.read_at == null ? 0 : 1
  if (au !== bu) return au - bu
  return a.created_at < b.created_at ? 1 : -1
}