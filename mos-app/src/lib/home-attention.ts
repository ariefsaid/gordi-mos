// home-attention.ts — pure attention selectors for the Home attention brief (Step 5, Track P).
// No I/O; "today" is always an injected WIB string (never Date.now() inside the selectors —
// FR-512). Reuses raciOwner (raci-member.ts) — the same ownership predicate the rest of the app
// already uses (Rule 11/NFR-504).

import type { TaskListRow } from '@/lib/db/tasks.types'
import type { NotificationRow } from '@/lib/db/notifications'
import { notificationRoute } from '@/lib/db/notifications'
import { raciOwner } from '@/lib/raci-member'
import { formatDate } from '@/components/tasks/task-formatters'
import type { Locale } from '@/i18n/messages'

export type AttentionLaneKind = 'overdue' | 'due-today' | 'mentions' | 'failed-checks'
export type LaneState = 'loading' | 'ready' | 'error'

/** The person-in-charge decoration on an attention row — avatar initials + full name (Luna J01/J02). */
export interface AttentionPic { name: string; initials: string }

export interface AttentionItem {
  id: string
  title: string
  meta?: string
  route: string
  /** Responsible person for a task row (decision context) — absent unless the directory is supplied. */
  pic?: AttentionPic
  /** Owning Team/BU caption for a task row — absent unless the directory is supplied. */
  caption?: string
}

/**
 * Optional display directory for enriching task attention rows with decision context (Luna J01/J02:
 * "what should I do next" must be answerable without clicking). Maps come from the SAME shared
 * directory (`getPeople` / `getBusinessUnits`) HomePage already loads for the personal canvas —
 * never a new read. Absent → rows render exactly as before (backward-compatible).
 */
export interface AttentionDirectory {
  /** personId → full name. */
  people?: ReadonlyMap<string, string>
  /** business_unit_id → name. */
  businessUnits?: ReadonlyMap<string, string>
}

/** Two-letter initials for the PIC avatar chip (mirrors the shared card/avatar grammar). */
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
export interface AttentionLane {
  kind: AttentionLaneKind
  state: LaneState
  items: AttentionItem[]
  /**
   * Re-fetch the ONE projection this lane's items come from (Home retry/projection
   * convergence). Overdue and due-today share the same underlying tasks fetch — both
   * lanes MUST be wired to the SAME function reference, never two independent fetches
   * of the same data, so a retry click is idempotent and never duplicates in-flight
   * work for one source (convergence-audit Home finding, 2026-07-21).
   */
  onRetry?: () => void
}

/** WIB (Asia/Jakarta) calendar date YYYY-MM-DD from an injected clock — never scattered Date.now() (FR-512). */
export function wibToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now)
}

// RI-3 (design fix wave) — reuses the app's ONE shared humanized date formatter (the My-tasks
// table's "Thu, 16 Jul" convention, task-formatters' `formatDate`), locale-aware. Never a raw
// ISO string — that read is fine in a data table but unreadable as bare prose in a brief.
const toTaskItem = (t: TaskListRow, locale: Locale, dir?: AttentionDirectory): AttentionItem => {
  const picName = dir?.people?.get(t.responsible_person_id)
  const caption = dir?.businessUnits?.get(t.business_unit_id)
  return {
    id: t.id,
    title: t.title,
    meta: t.due_date ? formatDate(t.due_date, locale) : undefined,
    route: `/work/tasks/${t.id}`,
    pic: picName ? { name: picName, initials: initialsOf(picName) } : undefined,
    caption: caption ?? undefined,
  }
}

/** Owned (R/A), non-Done tasks due strictly before `today` (YYYY-MM-DD WIB) — FR-502/512. */
export function overdueTasks(tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en', dir?: AttentionDirectory): AttentionItem[] {
  return tasks
    .filter(t => raciOwner(t, viewerId) && t.status !== 'Done' && t.due_date != null && t.due_date < today)
    .map(t => toTaskItem(t, locale, dir))
}

/** Owned (R/A), non-Done tasks due exactly `today` (YYYY-MM-DD WIB) — FR-503. */
export function dueTodayTasks(tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en', dir?: AttentionDirectory): AttentionItem[] {
  return tasks
    .filter(t => raciOwner(t, viewerId) && t.status !== 'Done' && t.due_date === today)
    .map(t => toTaskItem(t, locale, dir))
}

/** Unread notifications routed via the safe notificationRoute allow-list, else /inbox — FR-504. */
export function unreadMentions(notifications: NotificationRow[]): AttentionItem[] {
  return notifications
    .filter(n => n.read_at == null)
    .map(n => ({ id: n.id, title: n.title, meta: n.body ?? undefined, route: notificationRoute(n) ?? '/inbox' }))
}

/** Summed item count across lanes — the "Needs attention · N" header summary source (FR-509). */
export function attentionCount(lanes: { items: AttentionItem[] }[]): number {
  return lanes.reduce((sum, l) => sum + l.items.length, 0)
}
