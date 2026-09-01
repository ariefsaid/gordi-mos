import type { TriageNotificationRow } from './read-handled-semantics'

/**
 * nudge-semantics — the OD-WAY-86 re-nudge model (issue 141). PURE PRESENTATION: no stored nudge
 * state, no schema change. An item UNTRIAGED (never read AND never handled) for 2 whole
 * VIEWER-LOCAL calendar days re-surfaces at the top of the triage list with an age badge. Tier
 * and badge are derived only from created_at + the current date, bucketed by the viewer's LOCAL
 * calendar day (startOfLocalDay → whole calendar days), so an item nudged today stays nudged in
 * place for the whole local day — a re-render or optimistic update can never re-animate it, and
 * the notifications column-pin trigger (which permits only read_at/handled_at writes) is never
 * touched.
 *
 * The bucket is a calendar-day difference, NOT an elapsed-24h rolling window: the elapsed form
 * (floor(now - created_at)/DAY_MS) re-buckets a row every time its age crosses the next 24h from
 * ITS OWN creation instant, so order can flip mid-viewer-day and the stability claim (AC-141-3)
 * breaks. A local-day bucket re-evaluates once per local midnight for every row, keeping the
 * whole day stable.
 */

/** An item must sit untriaged this many whole local days before it re-surfaces (OD-WAY-86: 48h). */
export const NUDGE_AFTER_DAYS = 2

/**
 * A DST-immune serial for a calendar date in the viewer's local timezone: the count of local days
 * since the epoch. Two local dates always differ by exactly 1 per calendar day, so subtracting
 * these serials yields a true whole-day age even across a spring-forward/fall-back.
 */
function calendarDayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** Whole LOCAL calendar days since created_at — the day bucket behind both the tier and the badge. */
export function triageAgeDays(createdAt: string, now: Date): number {
  return Math.max(0, calendarDayIndex(now) - calendarDayIndex(new Date(createdAt)))
}

/**
 * The nudge: an untriaged row aged >= 2 local days returns its age in whole days (the badge count);
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
 * order. A pure function of (rows, now): the same day bucket gives the same tier on every render,
 * so a same-day re-render never re-orders the queue (AC-141-3). Created_at ties (equal timestamps)
 * fall through to a stable id tie-breaker; only a full tie (same timestamp AND id) returns 0, so
 * the comparator stays antisymmetric for sort.
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
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  // Equal timestamps: fall through to the stable id tie-breaker, not a constant -1.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}