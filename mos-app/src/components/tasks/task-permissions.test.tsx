import { describe, it, expect } from 'vitest'
import { canEdit, canArchive } from './task-permissions'
import type { TaskListRow } from '@/lib/db/tasks.types'

const t = (o: Partial<TaskListRow>): TaskListRow => ({
  id: 'task-1', org_id: 'org', title: 'T', business_unit_id: 'bu-1',
  status: 'Open', responsible_person_id: 'r', accountable_person_id: 'a',
  consulted_person_ids: [], informed_person_ids: [],
  description: null, due_date: null, objective_id: null, work_line_id: null,
  last_activity_at: '2026-06-11T00:00:00Z',
  archived_at: null, created_by: 'r',
  created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  ...o,
})

describe('task permission oracle (mirrors mos.can_edit_task)', () => {
  it('R or A or manager can edit; nobody else', () => {
    expect(canEdit(t({}), 'r', false)).toBe(true)
    expect(canEdit(t({}), 'a', false)).toBe(true)
    expect(canEdit(t({}), 'x', true)).toBe(true)
    expect(canEdit(t({}), 'x', false)).toBe(false)
  })
  it('archive is A or manager only — not a bare R', () => {
    expect(canArchive(t({}), 'r', false)).toBe(false)
    expect(canArchive(t({}), 'a', false)).toBe(true)
    expect(canArchive(t({}), 'x', true)).toBe(true)
  })
})
