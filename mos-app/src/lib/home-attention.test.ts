// home-attention.ts tests — TDD (AC-501..504, Step 5 Track P).
// Pure attention selectors over existing TaskListRow/NotificationRow shapes — no I/O, no Date.now()
// (WIB "today" is always an injected string). Mirrors home-kpis.test.ts's fixture conventions.

import { describe, it, expect } from 'vitest'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { NotificationRow } from '@/lib/db/notifications'
import { formatDate } from '@/components/tasks/task-formatters'
import { overdueTasks, dueTodayTasks, unreadMentions, attentionCount, wibToday } from './home-attention'

const VIEWER = '40000000-0000-0000-0000-000000000001'
const OTHER = '40000000-0000-0000-0000-000000000002'
const TODAY = '2026-07-16'

function task(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 't-1',
    org_id: 'org-1',
    title: 'Task 1',
    business_unit_id: 'bu-1',
    status: 'In Progress',
    responsible_person_id: VIEWER,
    accountable_person_id: OTHER,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: null,
    objective_id: null,
    work_line_id: null,
    last_activity_at: '2026-06-30T00:00:00Z',
    archived_at: null,
    created_by: 'x',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-30T00:00:00Z',
    ...overrides,
  }
}

describe('AC-501: overdueTasks — owned, non-Done, strictly-before-today tasks', () => {
  it('returns only the owned overdue task, mapped to /work/tasks/<id>', () => {
    const overdueOwned = task({ id: 'overdue-owned', due_date: '2026-07-10', status: 'In Progress' })
    const doneOverdueOwned = task({ id: 'done-overdue', due_date: '2026-07-10', status: 'Done' })
    const futureOwned = task({ id: 'future-owned', due_date: '2026-07-20', status: 'In Progress' })
    const nullDueOwned = task({ id: 'null-due-owned', due_date: null, status: 'In Progress' })
    const overdueNotOwned = task({
      id: 'overdue-not-owned',
      due_date: '2026-07-10',
      status: 'In Progress',
      responsible_person_id: OTHER,
      accountable_person_id: OTHER,
    })
    const tasks = [overdueOwned, doneOverdueOwned, futureOwned, nullDueOwned, overdueNotOwned]

    const result = overdueTasks(tasks, VIEWER, TODAY)

    expect(result).toEqual([
      { id: 'overdue-owned', title: 'Task 1', meta: formatDate('2026-07-10'), route: '/work/tasks/overdue-owned' },
    ])
  })

  // RI-3 (design fix wave) — the item meta must use the app's shared humanized date format
  // (the My-tasks table's "Thu, 16 Jul" convention, `formatDate` in task-formatters), never
  // a raw ISO string — and it must be locale-aware, exactly like every other formatDate call site.
  it('RI-3: meta is the shared humanized date, not a raw ISO string, and is locale-aware', () => {
    const overdueOwned = task({ id: 'overdue-owned', due_date: '2026-07-10', status: 'In Progress' })

    const en = overdueTasks([overdueOwned], VIEWER, TODAY, 'en')
    const id = overdueTasks([overdueOwned], VIEWER, TODAY, 'id')

    expect(en[0].meta).toBe(formatDate('2026-07-10', 'en'))
    expect(en[0].meta).not.toBe('2026-07-10')
    expect(id[0].meta).toBe(formatDate('2026-07-10', 'id'))
  })
})

describe('AC-502: dueTodayTasks — owned, non-Done tasks due exactly today', () => {
  it('returns only the owned due-today task, excluding the overdue one', () => {
    const overdueOwned = task({ id: 'overdue-owned', due_date: '2026-07-10', status: 'In Progress' })
    const dueTodayOwned = task({ id: 'due-today-owned', due_date: TODAY, status: 'In Progress' })
    const dueTodayDone = task({ id: 'due-today-done', due_date: TODAY, status: 'Done' })
    const tasks = [overdueOwned, dueTodayOwned, dueTodayDone]

    const result = dueTodayTasks(tasks, VIEWER, TODAY)

    expect(result).toEqual([
      { id: 'due-today-owned', title: 'Task 1', meta: formatDate(TODAY), route: '/work/tasks/due-today-owned' },
    ])
  })
})

function notification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    severity: 'info',
    title: 'Someone mentioned you',
    body: null,
    metadata: {},
    read_at: null,
    created_at: '2026-07-16T00:00:00Z',
    ...overrides,
  }
}

describe('AC-503: unreadMentions — unread notifications, safe route or /inbox fallback', () => {
  it('returns only unread rows, routed via notificationRoute or the /inbox fallback', () => {
    const unreadWithRoute = notification({
      id: 'n-route',
      title: 'Mentioned on a Signal',
      metadata: { entity: { type: 'signal', id: 'abc', route: '/work/signals?record=abc' } },
    })
    const unreadNoRoute = notification({ id: 'n-noroute', title: 'Mentioned somewhere' })
    const readRow = notification({ id: 'n-read', read_at: '2026-07-15T00:00:00Z' })
    const rows = [unreadWithRoute, unreadNoRoute, readRow]

    const result = unreadMentions(rows)

    expect(result).toEqual([
      { id: 'n-route', title: 'Mentioned on a Signal', meta: undefined, route: '/work/signals?record=abc' },
      { id: 'n-noroute', title: 'Mentioned somewhere', meta: undefined, route: '/inbox' },
    ])
  })
})

describe('AC-504: attentionCount — summed item count across lanes', () => {
  it('sums items across four lanes', () => {
    const a = { id: 'a', title: 'a', route: '/x' }
    const b = { id: 'b', title: 'b', route: '/x' }
    const c = { id: 'c', title: 'c', route: '/x' }
    const d = { id: 'd', title: 'd', route: '/x' }

    const total = attentionCount([{ items: [a, b] }, { items: [c] }, { items: [] }, { items: [d] }])

    expect(total).toBe(4)
  })
})

describe('Home decision-context — overdue/due-today items carry the PIC + owning-BU caption (Luna J01/J02)', () => {
  const people = new Map<string, string>([[VIEWER, 'Rara Owner'], [OTHER, 'Sam Supervisor']])
  const bus = new Map<string, string>([['bu-1', 'Café']])
  const dir = { people, businessUnits: bus }

  it('overdueTasks attaches the Responsible person NAME (no initials — the disc is retired) and the BU caption from the directory', () => {
    const rows = [task({ id: 'o1', due_date: '2026-07-10' })]
    const [item] = overdueTasks(rows, VIEWER, TODAY, 'en', dir)

    expect(item.pic).toEqual({ name: 'Rara Owner' })
    expect(item.caption).toBe('Café')
    // The one compact meta line still keeps the humanized due date.
    expect(item.meta).toBe(formatDate('2026-07-10', 'en'))
  })

  it('dueTodayTasks attaches the same PIC + caption decision context', () => {
    const rows = [task({ id: 'd1', due_date: TODAY })]
    const [item] = dueTodayTasks(rows, VIEWER, TODAY, 'en', dir)

    expect(item.pic).toEqual({ name: 'Rara Owner' })
    expect(item.caption).toBe('Café')
  })

  it('omits pic/caption when the directory is absent (backward-compatible — no enrichment, no crash)', () => {
    const rows = [task({ id: 'o1', due_date: '2026-07-10' })]
    const [item] = overdueTasks(rows, VIEWER, TODAY, 'en')

    expect(item.pic).toBeUndefined()
    expect(item.caption).toBeUndefined()
    expect(item.title).toBe('Task 1')
  })
})

describe('wibToday — WIB calendar date from an injected clock', () => {
  it('formats a UTC instant as its Asia/Jakarta (UTC+7) calendar date', () => {
    // 2026-07-15T18:00:00Z is 2026-07-16 01:00 WIB — crosses the UTC day boundary.
    expect(wibToday(new Date('2026-07-15T18:00:00Z'))).toBe('2026-07-16')
  })
})
