// Equivalence oracle for the Tasks table sort order (issue #998). Every sort x direction is
// pinned to literal expected ids over one fixture with undated, Done, archived and unnamed-person
// rows, so any change to where or how ordering runs shows up as a reordered id list.
import { describe, it, expect } from 'vitest'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { CollectionData } from '@/lib/record-collection/types'
import {
  TASK_COLLECTION_NEUTRAL_QUERY,
  projectTaskCollection,
  toTaskCollectionRecord,
  type TaskCollectionContext,
  type TaskCollectionQuery,
  type TaskCollectionRecord,
} from './task-collection-adapter'

const NOW = new Date('2026-07-21T03:00:00Z')
const P_ADI = 'p-adi'
const P_RAKA = 'p-raka'
const P_SARI = 'p-sari'
// Not in the people directory: its display name resolves to ''.
const P_UNNAMED = 'p-unnamed'

function rawTask(over: Partial<TaskListRow> & Pick<TaskListRow, 'id' | 'title'>): TaskListRow {
  return {
    id: over.id,
    org_id: 'org-1',
    title: over.title,
    business_unit_id: 'bu-cafe',
    status: over.status ?? 'Open',
    responsible_person_id: over.responsible_person_id ?? P_RAKA,
    accountable_person_id: over.accountable_person_id ?? P_SARI,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: over.due_date ?? null,
    objective_id: null,
    work_line_id: null,
    last_activity_at: over.last_activity_at ?? '2026-07-01T00:00:00Z',
    archived_at: over.archived_at ?? null,
    created_by: P_SARI,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    team_id: null,
    completed_at: null,
    process_run_id: null,
    generated_from_task_def_id: null,
  }
}

// Input order is a, b, c, d, e, f, g — ties keep it (stable sort, direction never reverses ties).
const ROWS: TaskListRow[] = [
  rawTask({ id: 'a', title: 'Banana', status: 'Open', responsible_person_id: P_RAKA, accountable_person_id: P_SARI, due_date: '2026-07-10', last_activity_at: '2026-07-01T00:00:00Z' }),
  rawTask({ id: 'b', title: 'apple', status: 'In Progress', responsible_person_id: P_ADI, accountable_person_id: P_RAKA, due_date: '2026-07-20', last_activity_at: '2026-07-05T00:00:00Z' }),
  rawTask({ id: 'c', title: 'Cherry', status: 'Blocked', responsible_person_id: P_UNNAMED, accountable_person_id: P_ADI, due_date: null, last_activity_at: '2026-07-03T00:00:00Z' }),
  rawTask({ id: 'd', title: 'Durian', status: 'Done', responsible_person_id: P_SARI, accountable_person_id: P_UNNAMED, due_date: '2026-07-01', last_activity_at: '2026-07-09T00:00:00Z' }),
  rawTask({ id: 'e', title: 'Elder', status: 'Open', responsible_person_id: P_RAKA, accountable_person_id: P_RAKA, due_date: '2026-07-15', archived_at: '2026-07-18T00:00:00Z', last_activity_at: '2026-07-02T00:00:00Z' }),
  rawTask({ id: 'f', title: 'fig', status: 'Done', responsible_person_id: P_ADI, accountable_person_id: P_SARI, due_date: null, last_activity_at: '2026-07-04T00:00:00Z' }),
  rawTask({ id: 'g', title: 'Grape', status: 'Open', responsible_person_id: P_SARI, accountable_person_id: P_ADI, due_date: '2026-07-12', last_activity_at: '2026-07-06T00:00:00Z' }),
]

const PEOPLE = [
  { id: P_ADI, full_name: 'Adi' },
  { id: P_RAKA, full_name: 'Raka' },
  { id: P_SARI, full_name: 'Sari' },
]

function makeData(): CollectionData<TaskCollectionRecord, TaskCollectionContext> {
  return {
    records: ROWS.map(toTaskCollectionRecord),
    context: {
      businessUnits: [],
      people: PEOPLE,
      businessUnitNamesById: new Map(),
      personNamesById: new Map(PEOPLE.map((p) => [p.id, p.full_name])),
      workLinesById: new Map(),
      workLineTypeById: new Map(),
      objectivesById: new Map(),
      runRollupsByRunId: new Map(),
      provenanceByTaskDefId: new Map(),
      rowsById: new Map(),
      viewerId: P_RAKA,
      statusOverrides: new Map(),
      now: NOW,
      refresh: () => {},
    } as unknown as TaskCollectionContext,
  }
}

function order(over: Partial<TaskCollectionQuery>): string[] {
  const query = { ...TASK_COLLECTION_NEUTRAL_QUERY, includeArchived: true, ...over }
  return projectTaskCollection(makeData(), query).visibleRecords.map((r) => r.id)
}

describe('Tasks table sort order — every sort, both directions', () => {
  it('task: display title via localeCompare, case-insensitive primary order', () => {
    expect(order({ sort: 'task', direction: 'ascending' })).toEqual(['b', 'a', 'c', 'd', 'e', 'f', 'g'])
    expect(order({ sort: 'task', direction: 'descending' })).toEqual(['g', 'f', 'e', 'd', 'c', 'a', 'b'])
  })

  it('status: status text; ties keep input order in both directions', () => {
    expect(order({ sort: 'status', direction: 'ascending' })).toEqual(['c', 'd', 'f', 'b', 'a', 'e', 'g'])
    expect(order({ sort: 'status', direction: 'descending' })).toEqual(['a', 'e', 'g', 'b', 'd', 'f', 'c'])
  })

  it('pic: display name, missing name sorts as the empty string', () => {
    expect(order({ sort: 'pic', direction: 'ascending' })).toEqual(['c', 'b', 'f', 'a', 'e', 'd', 'g'])
    expect(order({ sort: 'pic', direction: 'descending' })).toEqual(['d', 'g', 'a', 'e', 'b', 'f', 'c'])
  })

  it('supervisor: display name, missing name sorts as the empty string', () => {
    expect(order({ sort: 'supervisor', direction: 'ascending' })).toEqual(['d', 'c', 'g', 'b', 'e', 'a', 'f'])
    expect(order({ sort: 'supervisor', direction: 'descending' })).toEqual(['a', 'f', 'b', 'e', 'c', 'g', 'd'])
  })

  it('activity: ascending is most recent first', () => {
    expect(order({ sort: 'activity', direction: 'ascending' })).toEqual(['d', 'g', 'b', 'f', 'c', 'e', 'a'])
    expect(order({ sort: 'activity', direction: 'descending' })).toEqual(['a', 'e', 'c', 'f', 'b', 'g', 'd'])
  })

  it('due ascending: open work by due date with undated after dated, then Done, then archived', () => {
    expect(order({ sort: 'due', direction: 'ascending' })).toEqual(['a', 'g', 'b', 'c', 'd', 'f', 'e'])
  })

  it('due descending: open work latest first, Done then archived still trail', () => {
    expect(order({ sort: 'due', direction: 'descending' })).toEqual(['c', 'b', 'g', 'a', 'f', 'd', 'e'])
  })

  it('due keeps the Done/archived trail under a filter, in both directions', () => {
    expect(order({ picId: P_RAKA, sort: 'due', direction: 'ascending' })).toEqual(['a', 'e'])
    expect(order({ picId: P_RAKA, sort: 'due', direction: 'descending' })).toEqual(['a', 'e'])
    expect(order({ picId: P_ADI, sort: 'due', direction: 'ascending' })).toEqual(['b', 'f'])
    expect(order({ picId: P_ADI, sort: 'due', direction: 'descending' })).toEqual(['b', 'f'])
  })

  it('a non-due sort applies no Done/archived trail: archived e sorts by title', () => {
    const ids = order({ sort: 'task', direction: 'ascending' })
    expect(ids.indexOf('e')).toBeLessThan(ids.indexOf('f'))
  })
})
