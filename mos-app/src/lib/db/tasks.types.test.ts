import { describe, it, expect } from 'vitest'
import type { TaskStatus, TaskEventType, TaskRow } from './tasks.types'

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
})
