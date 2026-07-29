// home-stream.ts — the Home "consequence-ranked stream" model (owner redirect 2026-07-22:
// "Home = ONE consequence-ranked stream", replacing the ported three-section E7 layout).
//
// Pure, no I/O. Builds a SINGLE prioritised flow ranked ACROSS record types out of the same
// tasks/notifications/failed-check projections HomePage already fetches (Rule 11 — no new data
// path; this is presentation over the existing home-attention selectors + tasks projection).
//
// Rank order (owner: "overdue → due today → blocked → mentions/asks → today's open work"):
//   1. overdue        — owned tasks past their due date            reason "Overdue · Nd"
//   2. due-today      — owned tasks due exactly today               reason "Due today"
//   3. blocked        — owned tasks status=Blocked, not yet overdue reason "Blocked"
//   4. failed-checks  — the viewer's rejected café logs (RATIFY-3)  reason "Check failed"
//   5. mentions       — unread @-mentions / asks                    reason "Mentions you"
//   6. my-work        — the rest of the viewer's open work today (off-track first, capped)
//
// Bands 0–5 are the "attention" group; band 6 is "my work". The OD-18 order preference reorders
// those two GROUPS within the one stream (attention-first vs my-work-first) — it never removes a
// band.
//
// Signals refinement (OD-REDESIGN-84.1 / Luna P0-1, A12 RE-EXPRESSED): attention-worthy Signals
// (Urgent / Needs attention) ARE attention, so they lead the attention group as band 0 (E7 puts
// the exception first). Only FYI Signals stay ambient — they remain the SignalFeedSection tail.
// This does not add a data path: HomePage reads the ONE shared signal collection and splits it.

import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { Attention, SignalRow } from '@/lib/db/signals.types'
import { raciOwner } from '@/lib/raci-member'
import { formatDate } from '@/components/tasks/task-formatters'
import type { Locale } from '@/i18n/messages'
import { wibToday, type AttentionDirectory, type AttentionItem, type AttentionPic } from '@/lib/home-attention'

export type { AttentionDirectory } from '@/lib/home-attention'

export type StreamBandKind = 'signals' | 'overdue' | 'due-today' | 'blocked' | 'failed-checks' | 'mentions' | 'my-work'
export type StreamBandState = 'loading' | 'ready' | 'error'

/** The tone a reason chip carries — drives its i18n label + colour token. `days` is set for overdue. */
export type StreamReasonTone = 'urgent' | 'attention' | 'overdue' | 'due' | 'blocked' | 'check' | 'mention'
export interface StreamReason {
  tone: StreamReasonTone
  /** Whole days overdue (tone === 'overdue' only). */
  days?: number
}

/** One row in the stream. Superset of AttentionItem with the ranking-legibility reason chip + the
 *  task status (for the trailing status pill on task rows). */
export interface StreamItem {
  id: string
  title: string
  route: string
  /** Formatted due date, shown in the meta subline (task rows). */
  meta?: string
  /** Responsible person decoration (task rows, when the directory is supplied). */
  pic?: AttentionPic
  /** Owning Team/BU caption (task rows, when the directory is supplied). */
  caption?: string
  /** The ranking-legibility chip ("Overdue · 9d", "Due today", …). Absent on plain on-track rows. */
  reason?: StreamReason
  /** Task lifecycle, for the trailing StatusPill. Absent on non-task rows (mentions, failed checks). */
  status?: TaskStatus
}

/** One rank band = a labelled slice of the one stream (a divider, never a boxed section). */
export interface StreamBand {
  kind: StreamBandKind
  state: StreamBandState
  items: StreamItem[]
  /** Re-fetch the ONE projection this band reads (shared across bands that read the same fetch). */
  onRetry?: () => void
}

/** Whole days between two YYYY-MM-DD (WIB) calendar dates — how overdue a row is. Never negative. */
export function daysOverdue(dueISO: string, todayISO: string): number {
  const due = Date.parse(`${dueISO}T00:00:00Z`)
  const today = Date.parse(`${todayISO}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(today)) return 0
  return Math.max(0, Math.round((today - due) / 86_400_000))
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

/** TaskListRow → StreamItem, decorating with the shared directory (PIC + owning-BU) when present. */
function toStreamTaskItem(
  t: TaskListRow, reason: StreamReason | undefined, locale: Locale, dir?: AttentionDirectory,
): StreamItem {
  const picName = dir?.people?.get(t.responsible_person_id)
  const caption = dir?.businessUnits?.get(t.business_unit_id)
  return {
    id: t.id,
    title: t.title,
    route: `/work/tasks/${t.id}`,
    meta: t.due_date ? formatDate(t.due_date, locale) : undefined,
    pic: picName ? { name: picName, initials: initialsOf(picName) } : undefined,
    caption: caption ?? undefined,
    reason,
    status: t.status,
  }
}

const isOwnedOpen = (t: TaskListRow, viewerId: string) => raciOwner(t, viewerId) && t.status !== 'Done'

/** Owned, non-Done tasks due strictly before `today` — reason "Overdue · Nd". */
export function overdueStreamItems(
  tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en', dir?: AttentionDirectory,
): StreamItem[] {
  return tasks
    .filter(t => isOwnedOpen(t, viewerId) && t.due_date != null && t.due_date < today)
    .map(t => toStreamTaskItem(t, { tone: 'overdue', days: daysOverdue(t.due_date as string, today) }, locale, dir))
}

/** Owned, non-Done tasks due exactly `today` — reason "Due today". */
export function dueTodayStreamItems(
  tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en', dir?: AttentionDirectory,
): StreamItem[] {
  return tasks
    .filter(t => isOwnedOpen(t, viewerId) && t.due_date === today)
    .map(t => toStreamTaskItem(t, { tone: 'due' }, locale, dir))
}

/** Owned Blocked tasks that are NOT already surfaced as overdue/due-today — reason "Blocked". */
export function blockedStreamItems(
  tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en', dir?: AttentionDirectory,
): StreamItem[] {
  return tasks
    .filter(t =>
      isOwnedOpen(t, viewerId) &&
      t.status === 'Blocked' &&
      !(t.due_date != null && t.due_date <= today))
    .map(t => toStreamTaskItem(t, { tone: 'blocked' }, locale, dir))
}

/** Decorate the pre-built failed-check items (café rejected logs) with the "Check failed" reason. */
export function failedCheckStreamItems(items: AttentionItem[]): StreamItem[] {
  return items.map(i => ({ ...i, reason: { tone: 'check' as const } }))
}

/** Decorate the pre-built mention items with the "Mentions you" reason. */
export function mentionStreamItems(items: AttentionItem[]): StreamItem[] {
  return items.map(i => ({ ...i, reason: { tone: 'mention' as const } }))
}

/** Owned, non-Done tasks NOT already surfaced in an attention band — the "my work today" band.
 *  Sorted off-track-first (Blocked first — though most blocked/overdue are already excluded),
 *  then by due date ascending (nulls last). No reason chip on plain rows; a Blocked leftover keeps
 *  its "Blocked" reason so the ranking stays legible. Caller caps the visible count. */
export function myWorkStreamItems(
  tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en',
  dir?: AttentionDirectory, excludeIds: ReadonlySet<string> = new Set(),
): StreamItem[] {
  const off = (t: TaskListRow) => t.status === 'Blocked' || (t.due_date != null && t.due_date <= today)
  return tasks
    .filter(t => isOwnedOpen(t, viewerId) && !excludeIds.has(t.id))
    .sort((a, b) => {
      const ao = off(a), bo = off(b)
      if (ao !== bo) return ao ? -1 : 1
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    })
    .map(t => toStreamTaskItem(t, t.status === 'Blocked' ? { tone: 'blocked' } : undefined, locale, dir))
}

/** True for a Signal that is attention-worthy (Urgent / Needs attention) — i.e. NOT ambient FYI. */
export function isAttentionSignal(signal: SignalRow): boolean {
  return signal.attention !== 'FYI'
}

const SIGNAL_ATTENTION_TONE: Record<Exclude<Attention, 'FYI'>, StreamReasonTone> = {
  Urgent: 'urgent',
  'Needs attention': 'attention',
}
const SIGNAL_ATTENTION_WEIGHT: Record<Attention, number> = { Urgent: 3, 'Needs attention': 2, FYI: 1 }

function firstLine(body: string): string {
  const line = body.split('\n', 1)[0].trim()
  return line || body.trim()
}

/** Attention-worthy Signals (Urgent / Needs attention) → StreamItems for the band-0 signals band,
 *  Urgent-first then most-recent-first. Retracted signals are already excluded upstream (the Home
 *  feed query is non-retracted). Author decorates the row as its PIC; the owning Team is the caption;
 *  the reason chip carries the attention level so the ranking reads at a glance. FYI is dropped here
 *  (it stays the ambient tail). `names` are the same author/team maps the shared feed already resolves. */
export function signalStreamItems(
  signals: readonly SignalRow[],
  names: { authors: ReadonlyMap<string, string>; teams: ReadonlyMap<string, string> } = { authors: new Map(), teams: new Map() },
): StreamItem[] {
  return signals
    .filter(isAttentionSignal)
    .slice()
    .sort((a, b) => {
      const w = SIGNAL_ATTENTION_WEIGHT[b.attention] - SIGNAL_ATTENTION_WEIGHT[a.attention]
      if (w !== 0) return w
      return a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0
    })
    .map((s) => {
      const authorName = names.authors.get(s.author_id)
      const teamName = names.teams.get(s.owning_team_id)
      return {
        id: s.id,
        title: firstLine(s.body),
        route: `/work/signals?record=${s.id}`,
        caption: teamName ?? undefined,
        pic: authorName ? { name: authorName, initials: initialsOf(authorName) } : undefined,
        reason: { tone: SIGNAL_ATTENTION_TONE[s.attention as Exclude<Attention, 'FYI'>] },
      }
    })
}

/** Count of the viewer's open (R/A, non-Done) tasks — the "All tasks · N" figure. */
export function openTaskCount(tasks: TaskListRow[], viewerId: string): number {
  return tasks.filter(t => isOwnedOpen(t, viewerId)).length
}

/**
 * Count of the viewer's own tasks that reached Done TODAY (WIB) — the "N handled" half of the
 * Home header's day state.
 *
 * Read from the SAME tasks projection Home already holds: the Home layout spec §2 puts new Home
 * reads out of scope, and this figure must not buy a second fetch. Ceiling, stated plainly: the
 * app has no `completed_at`, so "when it was handled" is approximated by `last_activity_at` on a
 * Done task. A Done task edited again today therefore counts as handled today. That is the most
 * honest reading available from the existing row shape; a precise figure needs a schema change,
 * not a client-side guess.
 */
export function handledTodayCount(tasks: TaskListRow[], viewerId: string, todayISO: string): number {
  return tasks.filter(t => {
    if (t.status !== 'Done' || !raciOwner(t, viewerId)) return false
    const at = new Date(t.last_activity_at)
    return !Number.isNaN(at.getTime()) && wibToday(at) === todayISO
  }).length
}

/** Summed item count across bands — the "Needs attention · N" summary source (FR-509 parity). */
export function bandItemCount(bands: { items: StreamItem[] }[]): number {
  return bands.reduce((sum, b) => sum + b.items.length, 0)
}
