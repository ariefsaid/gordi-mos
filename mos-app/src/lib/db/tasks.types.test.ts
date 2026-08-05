import { describe, it, expect } from 'vitest'
import type { TaskStatus, TaskEventType, TaskRow } from './tasks.types'
import type { OccurrenceGroupableTask } from '@/lib/processes/occurrence-grouping'

// Compile-time fidelity: the literals must be assignable to the union types (NFR-007).
// If a status literal drifts from the migration's CHECK set, this file fails typecheck.
describe('tasks.types', () => {
  it('exposes the lean-4 status set and the event-type set as literal unions', () => {
    const statuses: TaskStatus[] = ['Open', 'In Progress', 'Blocked', 'Done']
    const events: TaskEventType[] = [
      'created', 'status_changed', 'field_edited', 'raci_edited', 'archived', 'unarchived',
    ]
    const row: Pick<TaskRow, 'consulted_person_ids' | 'informed_person_ids'> = {
      consulted_person_ids: [],
      informed_person_ids: [],
    }
    expect(statuses).toHaveLength(4)
    expect(events).toHaveLength(6)
    expect(row.consulted_person_ids).toEqual([])
  })

  // Step 6 (ADR-0051 D10) typing seam: process_run_id/generated_from_task_def_id are OPTIONAL on
  // TaskRow so every pre-existing ad-hoc-task literal (no such keys) still typechecks, while a
  // generated Task can carry them. Proves both a bare ad-hoc row AND a generated row structurally
  // satisfy TaskRow with no `as` cast anywhere.
  it('process_run_id/generated_from_task_def_id are optional — an ad-hoc task literal (no such keys) still satisfies TaskRow', () => {
    const adhoc: Pick<TaskRow, 'id' | 'process_run_id' | 'generated_from_task_def_id'> = { id: 'task-1' }
    const generated: Pick<TaskRow, 'id' | 'process_run_id' | 'generated_from_task_def_id'> = {
      id: 'task-2', process_run_id: 'run-1', generated_from_task_def_id: 'def-1',
    }
    expect(adhoc.process_run_id).toBeUndefined()
    expect(generated.process_run_id).toBe('run-1')
    expect(generated.generated_from_task_def_id).toBe('def-1')
  })

  // The seam this unblocks: a TaskRow (after normalizing process_run_id to `string | null`, since
  // TaskRow's is optional/possibly-undefined and OccurrenceGroupableTask requires it present)
  // structurally satisfies OccurrenceGroupableTask with NO cast — the shape B5's grouping helper needs.
  it('a TaskRow, once process_run_id is normalized to string|null, satisfies OccurrenceGroupableTask with no cast', () => {
    const row: TaskRow = {
      id: 'task-3', org_id: 'org', title: 'Open the café', business_unit_id: 'bu-1', status: 'Open',
      responsible_person_id: 'p1', accountable_person_id: 'p1',
      consulted_person_ids: [], informed_person_ids: [],
      description: null, due_date: null, objective_id: null, work_line_id: null,
      last_activity_at: '2026-07-17T00:00:00Z', archived_at: null, created_by: 'p1',
      created_at: '2026-07-17T00:00:00Z', updated_at: '2026-07-17T00:00:00Z',
      // process_run_id / generated_from_task_def_id intentionally omitted (ad-hoc row).
    }
    const groupable: OccurrenceGroupableTask = { ...row, process_run_id: row.process_run_id ?? null }
    expect(groupable.process_run_id).toBeNull()
  })
})
