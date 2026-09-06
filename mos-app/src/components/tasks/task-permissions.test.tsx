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

describe('task permission oracle (mirrors mos.can_edit_task / the archive clause)', () => {
  // The caller passes the viewer's already-loaded downline person ids; THIS helper derives the
  // chain fact — "the viewer is above the PIC" — from them (downlineIds.includes(PIC)). It never
  // receives a viewer-global isManager: a manager not above the PIC is a reader, exactly like the
  // DB's mos.can_edit_task narrows it (AC-061). The DB is authority; pgTAP
  // (mos_12_task_permissions.sql) proves the narrowing itself.
  it('AC-061: the PIC may edit but not archive', () => {
    expect(canEdit(t({}), 'r', [])).toBe(true)
    expect(canArchive(t({}), 'r', [])).toBe(false)
  })
  it('AC-061: the Supervisor may edit and archive', () => {
    expect(canEdit(t({}), 'a', [])).toBe(true)
    expect(canArchive(t({}), 'a', [])).toBe(true)
  })
  it('AC-061: a manager above the PIC (the PIC is in their downline) may edit and archive', () => {
    expect(canEdit(t({}), 'x', ['r'])).toBe(true)
    expect(canArchive(t({}), 'x', ['r'])).toBe(true)
  })
  it('AC-061: a manager NOT above the PIC (their downline excludes the PIC) may do neither', () => {
    expect(canEdit(t({}), 'x', ['someone-else'])).toBe(false)
    expect(canArchive(t({}), 'x', ['someone-else'])).toBe(false)
  })
  it('AC-061: a peer (no downline) may do neither', () => {
    expect(canEdit(t({}), 'x', [])).toBe(false)
    expect(canArchive(t({}), 'x', [])).toBe(false)
  })
  it('AC-060: draft PIC options are self plus downline and lock copy is localized by caller', () => {
    expect(picOptions('r', [{ id: 'r', full_name: 'R' }, { id: 'd', full_name: 'Downline' }, { id: 'p', full_name: 'Peer' }], ['d']).map(p => p.id)).toEqual(['r', 'd'])
    expect(picLockMessage(true)).toBeNull()
    expect(picLockMessage(false)).toBe('Only you can be PIC — a supervisor names others')
  })
})
