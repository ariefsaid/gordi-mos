import { describe, expect, it } from 'vitest'
import { isOpenTask } from './task-open'
import { openTaskCount } from './home-stream'
import type { TaskListRow } from '@/lib/db/tasks.types'

const VIEWER = 'viewer-1'
const task = (over: Partial<TaskListRow>): TaskListRow => ({
  id: 't', title: 'T', status: 'Open', archived_at: null, due_date: null,
  responsible_person_id: VIEWER, accountable_person_id: 'other',
  ...over,
} as TaskListRow)

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
      task({ id: 'a' }),
      task({ id: 'b', status: 'Done' }),
      task({ id: 'c', archived_at: '2026-01-01T00:00:00Z' }),
    ], VIEWER)).toBe(1)
  })
})
