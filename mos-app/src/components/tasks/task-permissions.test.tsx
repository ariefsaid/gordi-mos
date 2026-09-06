import { describe, it, expect } from 'vitest'
import { canEdit, canArchive, picOptions, picLockMessage } from './task-permissions'
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
  // The caller passes isManager as an opaque boolean — it already means "the DB-narrowed relation
  // holds" (manager in the PIC's own reporting line, per AC-056/AC-061); this helper is the
  // optimistic UX gate only, so it does not re-derive which chain isManager came from — the DB is
  // authority and pgTAP (mos_12_task_permissions.sql) proves the narrowing itself.
  it('AC-061: PIC, Supervisor, or a caller-asserted manager can edit; nobody else', () => {
    expect(canEdit(t({}), 'r', false)).toBe(true)
    expect(canEdit(t({}), 'a', false)).toBe(true)
    expect(canEdit(t({}), 'x', true)).toBe(true)
    expect(canEdit(t({}), 'x', false)).toBe(false)
  })
  it('AC-061: archive is Supervisor or a caller-asserted manager, not the PIC alone', () => {
    expect(canArchive(t({}), 'r', false)).toBe(false)
    expect(canArchive(t({}), 'a', false)).toBe(true)
    expect(canArchive(t({}), 'x', true)).toBe(true)
  })
  it('AC-060: draft PIC options are self plus downline and lock copy is localized by caller', () => {
    expect(picOptions('r', [{ id: 'r', full_name: 'R' }, { id: 'd', full_name: 'Downline' }, { id: 'p', full_name: 'Peer' }], ['d']).map(p => p.id)).toEqual(['r', 'd'])
    expect(picLockMessage(true)).toBeNull()
    expect(picLockMessage(false)).toBe('Only you can be PIC — a supervisor names others')
  })
})
