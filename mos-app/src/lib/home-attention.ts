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

export interface AttentionItem { id: string; title: string; meta?: string; route: string }
export interface AttentionLane { kind: AttentionLaneKind; state: LaneState; items: AttentionItem[] }

/** WIB (Asia/Jakarta) calendar date YYYY-MM-DD from an injected clock — never scattered Date.now() (FR-512). */
export function wibToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now)
}

// RI-3 (design fix wave) — reuses the app's ONE shared humanized date formatter (the My-tasks
// table's "Thu, 16 Jul" convention, task-formatters' `formatDate`), locale-aware. Never a raw
// ISO string — that read is fine in a data table but unreadable as bare prose in a brief.
const toTaskItem = (t: TaskListRow, locale: Locale): AttentionItem =>
  ({ id: t.id, title: t.title, meta: t.due_date ? formatDate(t.due_date, locale) : undefined, route: `/work/tasks/${t.id}` })

/** Owned (R/A), non-Done tasks due strictly before `today` (YYYY-MM-DD WIB) — FR-502/512. */
export function overdueTasks(tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en'): AttentionItem[] {
  return tasks
    .filter(t => raciOwner(t, viewerId) && t.status !== 'Done' && t.due_date != null && t.due_date < today)
    .map(t => toTaskItem(t, locale))
}

/** Owned (R/A), non-Done tasks due exactly `today` (YYYY-MM-DD WIB) — FR-503. */
export function dueTodayTasks(tasks: TaskListRow[], viewerId: string, today: string, locale: Locale = 'en'): AttentionItem[] {
  return tasks
    .filter(t => raciOwner(t, viewerId) && t.status !== 'Done' && t.due_date === today)
    .map(t => toTaskItem(t, locale))
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
