// home-attention.ts tests — TDD (AC-501..504, Step 5 Track P).
// Pure attention selectors over existing TaskListRow/NotificationRow shapes — no I/O, no Date.now()
// (WIB "today" is always an injected string). Mirrors home-kpis.test.ts's fixture conventions.

import { describe, it, expect } from 'vitest'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { overdueTasks, wibToday } from './home-attention'

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
      { id: 'overdue-owned', title: 'Task 1', meta: '2026-07-10', route: '/work/tasks/overdue-owned' },
    ])
  })
})

describe('wibToday — WIB calendar date from an injected clock', () => {
  it('formats a UTC instant as its Asia/Jakarta (UTC+7) calendar date', () => {
    // 2026-07-15T18:00:00Z is 2026-07-16 01:00 WIB — crosses the UTC day boundary.
    expect(wibToday(new Date('2026-07-15T18:00:00Z'))).toBe('2026-07-16')
  })
})
