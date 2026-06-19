// raciMember — shared RACI-membership predicate for client-side person filtering (P2-1b).
//
// Director ruling: the Person dropdown filter = tasks where the chosen person is involved
// in ANY RACI role (R, A, C, or I). This is a pure client-side predicate over the
// org-readable set (~15 people / dozens of tasks at Gordi scale — trivial).
//
// Three segmented-control semantics build on this:
//   "Mine"          = viewer is R or A
//   "RACI-involved" = viewer is R, A, C, or I  (i.e. raciMember(task, viewerId) === true)
//   "All"           = no person constraint (every org-readable row passes)

import type { TaskRow } from './db/tasks.types'

/** Returns true when personId appears in any RACI role on the task (R, A, C, or I). */
export function raciMember(task: Pick<TaskRow,
  'responsible_person_id' | 'accountable_person_id' |
  'consulted_person_ids' | 'informed_person_ids'
>, personId: string): boolean {
  return (
    task.responsible_person_id === personId ||
    task.accountable_person_id === personId ||
    task.consulted_person_ids.includes(personId) ||
    task.informed_person_ids.includes(personId)
  )
}

/** Returns true when personId is Responsible OR Accountable (the "Mine" segment). */
export function raciOwner(task: Pick<TaskRow,
  'responsible_person_id' | 'accountable_person_id'
>, personId: string): boolean {
  return (
    task.responsible_person_id === personId ||
    task.accountable_person_id === personId
  )
}
