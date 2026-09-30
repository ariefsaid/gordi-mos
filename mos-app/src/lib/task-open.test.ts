import { describe, expect, it } from 'vitest'
import { isOpenTask } from './task-open'
import { openTaskCount } from './home-stream'
import type { TaskListRow } from '@/lib/db/tasks.types'

const VIEWER = 'viewer-1'
function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 't-1',
    org_id: 'org-1',
    title: 'Task',
    business_unit_id: 'bu-1',
    status: 'In Progress',
    responsible_person_id: VIEWER,
    accountable_person_id: 'other-1',
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: null,
    objective_id: null,
    work_line_id: null,
    last_activity_at: '2026-06-30T00:00:00Z',
    archived_at: null,
    created_by: VIEWER,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-30T00:00:00Z',
    ...overrides,
  }
}

describe('isOpenTask — the one open-task definition (#1030)', () => {
  it('is open unless Done or archived', () => {
    expect(isOpenTask({ status: 'Open' })).toBe(true)
    expect(isOpenTask({ status: 'In Progress', archived_at: null })).toBe(true)
    expect(isOpenTask({ status: 'Blocked' })).toBe(true)
    expect(isOpenTask({ status: 'Done' })).toBe(false)
    expect(isOpenTask({ status: 'Open', archived_at: '2026-01-01T00:00:00Z' })).toBe(false)
  })

  it("Home's open count follows it: an archived task the viewer owns is not open", () => {
    expect(openTaskCount([
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', status: 'Done' }),
      makeTask({ id: 'c', archived_at: '2026-01-01T00:00:00Z' }),
    ], VIEWER)).toBe(1)
  })
})
