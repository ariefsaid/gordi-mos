// Pure projector for the V3 Task collection (Issue 6, Task 11). Reproduces every legacy
// TasksWorkspace filter/sort/group/occurrence-rollup/empty-group branch with realistic data
// ("Fix the coffee machine", "Café Opening · 17 Jul 2026", distinct PIC/Supervisor, Café
// Operations / B2B Sales Business Units) — never a fabricated Team.
import { describe, it, expect } from 'vitest'
import type { ProcessRunRollup } from '@/lib/db/processes.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import type { CollectionData } from '@/lib/record-collection/types'
import {
  TASK_COLLECTION_NEUTRAL_QUERY,
  NO_OCCURRENCE_GROUP_KEY,
  NO_WORKLINE_GROUP_KEY,
  buildTaskGroups,
  projectTaskCollection,
  toTaskCollectionRecord,
  type TaskCollectionContext,
  type TaskCollectionQuery,
  type TaskCollectionRecord,
} from './task-collection-adapter'

// A fixed reference clock; due dates below are relative to it.
const NOW = new Date('2026-07-21T03:00:00Z') // 2026-07-21 10:00 WIB

const BU_CAFE = 'bu-cafe'
const BU_B2B = 'bu-b2b'
const P_RAKA = 'p-raka'
const P_SARI = 'p-sari'
const P_ADI = 'p-adi'
const WL_ROASTERY = 'wl-roastery'
const WL_SOP = 'wl-sop'
const RUN_CAFE_OPENING = 'run-cafe-opening'

function rawTask(over: Partial<TaskListRow> & Pick<TaskListRow, 'id' | 'title'>): TaskListRow {
  return {
    id: over.id,
    org_id: 'org-1',
    title: over.title,
    business_unit_id: over.business_unit_id ?? BU_CAFE,
    status: over.status ?? 'Open',
    responsible_person_id: over.responsible_person_id ?? P_RAKA,
    accountable_person_id: over.accountable_person_id ?? P_SARI,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: over.due_date ?? null,
    objective_id: over.objective_id ?? null,
    work_line_id: over.work_line_id ?? null,
    last_activity_at: over.last_activity_at ?? '2026-07-20T00:00:00Z',
    archived_at: over.archived_at ?? null,
    created_by: P_SARI,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    process_run_id: over.process_run_id ?? null,
    generated_from_task_def_id: over.generated_from_task_def_id ?? null,
  }
}

// Realistic fixture rows.
const RAW: TaskListRow[] = [
  rawTask({ id: 't-1', title: 'Fix the coffee machine', status: 'Open', responsible_person_id: P_RAKA, accountable_person_id: P_SARI, business_unit_id: BU_CAFE, due_date: '2026-07-10', process_run_id: RUN_CAFE_OPENING, generated_from_task_def_id: 'def-1' }),
  rawTask({ id: 't-2', title: 'Finalise Q3 roastery output forecast', status: 'In Progress', responsible_person_id: P_SARI, accountable_person_id: P_ADI, business_unit_id: BU_B2B, work_line_id: WL_ROASTERY, due_date: '2026-08-30' }),
  rawTask({ id: 't-3', title: 'SOP stock opname mingguan', status: 'Open', responsible_person_id: P_RAKA, accountable_person_id: P_ADI, business_unit_id: BU_CAFE, work_line_id: WL_SOP, due_date: '2026-07-11', process_run_id: RUN_CAFE_OPENING, generated_from_task_def_id: 'def-1' }),
]

const PEOPLE: PersonOption[] = [
  { id: P_RAKA, full_name: 'Raka' } as PersonOption,
  { id: P_SARI, full_name: 'Sari' } as PersonOption,
  { id: P_ADI, full_name: 'Adi' } as PersonOption,
]
const BUS: BusinessUnitOption[] = [
  { id: BU_CAFE, name: 'Café Operations' } as BusinessUnitOption,
  { id: BU_B2B, name: 'B2B Sales' } as BusinessUnitOption,
]

const CAFE_OPENING_ROLLUP: ProcessRunRollup = {
  process_run_id: RUN_CAFE_OPENING,
  caption: 'Café Opening · 17 Jul 2026',
  scheduled_date: '2026-07-17',
  status: 'active' as ProcessRunRollup['status'],
  total: 2, open: 2, in_progress: 0, blocked: 0, done: 0, overdue: 2, pending_unresolved: 1,
  completion_pct: 0,
}

function makeContext(over: Partial<TaskCollectionContext> = {}): TaskCollectionContext {
  return {
    businessUnits: BUS,
    people: PEOPLE,
    businessUnitNamesById: new Map(BUS.map((b) => [b.id, b.name])),
    personNamesById: new Map(PEOPLE.map((p) => [p.id, p.full_name])),
    workLinesById: new Map([[WL_ROASTERY, 'Roastery output'], [WL_SOP, 'Weekly SOP']]),
    workLineTypeById: new Map([[WL_ROASTERY, 'project'], [WL_SOP, 'process']]),
    objectivesById: new Map(),
    runRollupsByRunId: new Map(),
    provenanceByTaskDefId: new Map(),
    rowsById: new Map(),
    viewerId: P_RAKA,
    statusOverrides: new Map(),
    now: NOW,
    refresh: () => {},
    ...over,
  }
}

function makeData(rows: TaskListRow[] = RAW, ctxOver: Partial<TaskCollectionContext> = {}): CollectionData<TaskCollectionRecord, TaskCollectionContext> {
  return { records: rows.map(toTaskCollectionRecord), context: makeContext(ctxOver) }
}

function q(over: Partial<TaskCollectionQuery> = {}): TaskCollectionQuery {
  return { ...TASK_COLLECTION_NEUTRAL_QUERY, ...over }
}

describe('toTaskCollectionRecord — raw columns map to PIC/Supervisor only inside the adapter', () => {
  it('maps responsible → picId and accountable → supervisorId; renders BU, never a Team', () => {
    const rec = toTaskCollectionRecord(RAW[0])
    expect(rec.picId).toBe(P_RAKA)
    expect(rec.supervisorId).toBe(P_SARI)
    expect(rec.businessUnitId).toBe(BU_CAFE)
    // No Team field exists on the typed record.
    const asRecord = rec as unknown as Record<string, unknown>
    expect(asRecord.teamId).toBeUndefined()
    expect(asRecord.team_id).toBeUndefined()
  })
})

describe('projectTaskCollection — filtering', () => {
  it('flat/no-filter: totalRecords is the full set and no filter flag', () => {
    const p = projectTaskCollection(makeData(), q())
    expect(p.totalRecords).toBe(3)
    expect(p.visibleRecords).toHaveLength(3)
    expect(p.visibleRecordsAreFiltered).toBe(false)
  })

  it('search q filters by title (case-insensitive) and marks the projection filtered', () => {
    const p = projectTaskCollection(makeData(), q({ q: 'coffee' }))
    expect(p.visibleRecords.map((r) => r.id)).toEqual(['t-1'])
    expect(p.visibleRecordsAreFiltered).toBe(true)
  })

  it('PIC and Supervisor are DISTINCT filters over distinct relationships', () => {
    // Raka is PIC on t-1 & t-3; Adi is Supervisor on t-2 & t-3.
    const byPic = projectTaskCollection(makeData(), q({ picId: P_RAKA }))
    expect(byPic.visibleRecords.map((r) => r.id).sort()).toEqual(['t-1', 't-3'])
    const bySup = projectTaskCollection(makeData(), q({ supervisorId: P_ADI }))
    expect(bySup.visibleRecords.map((r) => r.id).sort()).toEqual(['t-2', 't-3'])
  })

  it('view=my-work scopes to the viewer as PIC OR Supervisor', () => {
    // Viewer = Raka: PIC on t-1,t-3, Supervisor on none → t-1,t-3.
    const p = projectTaskCollection(makeData(), q({ view: 'my-work' }))
    expect(p.visibleRecords.map((r) => r.id).sort()).toEqual(['t-1', 't-3'])
    expect(p.visibleRecordsAreFiltered).toBe(true)
  })

  it('view=overdue keeps only genuinely-overdue rows', () => {
    // t-1 due 07-10, t-3 due 07-11 are before NOW (07-21); t-2 due 08-30 is future.
    const p = projectTaskCollection(makeData(), q({ view: 'overdue' }))
    expect(p.visibleRecords.map((r) => r.id).sort()).toEqual(['t-1', 't-3'])
  })

  it('optimistic statusOverrides are applied before filtering', () => {
    const p = projectTaskCollection(
      makeData(RAW, { statusOverrides: new Map([['t-1', 'Done']]) }),
      q({ status: 'Done' }),
    )
    expect(p.visibleRecords.map((r) => r.id)).toEqual(['t-1'])
  })

  it('a filter that hides every row is filtered (engine derives filtered-empty), not empty', () => {
    const p = projectTaskCollection(makeData(), q({ q: 'zzz-nothing' }))
    expect(p.totalRecords).toBe(3)
    expect(p.visibleRecords).toHaveLength(0)
    expect(p.visibleRecordsAreFiltered).toBe(true)
  })
})

describe('projectTaskCollection — sorting', () => {
  it('default due-ascending; nulls last', () => {
    const rows = [
      rawTask({ id: 'a', title: 'A', due_date: '2026-07-15' }),
      rawTask({ id: 'b', title: 'B', due_date: null }),
      rawTask({ id: 'c', title: 'C', due_date: '2026-07-05' }),
    ]
    const p = projectTaskCollection(makeData(rows), q())
    expect(p.visibleRecords.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('sort=pic uses the resolved display name, not the id', () => {
    const p = projectTaskCollection(makeData(), q({ sort: 'pic', direction: 'ascending' }))
    // PIC names: Raka(t-1,t-3), Sari(t-2) → Raka before Sari.
    const names = p.visibleRecords.map((r) => r.picId)
    expect(names[names.length - 1]).toBe(P_SARI)
  })
})

describe('buildTaskGroups — grouping branches', () => {
  it('none → one flat group, no header label', () => {
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'none' }), makeContext())
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('__flat__')
  })

  it('status → fixed 4-status order incl. empty groups', () => {
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'status' }), makeContext())
    expect(groups.map((g) => g.key)).toEqual(['In Progress', 'Blocked', 'Open', 'Done'])
    expect(groups.find((g) => g.key === 'Blocked')?.rows).toHaveLength(0)
    expect(groups.find((g) => g.key === 'Open')?.rows.map((r) => r.id).sort()).toEqual(['t-1', 't-3'])
  })

  it('pic → one group per person from the directory, empty groups injected, r= prefill', () => {
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'pic' }), makeContext())
    expect(groups.map((g) => g.key)).toEqual([P_RAKA, P_SARI, P_ADI])
    expect(groups.find((g) => g.key === P_ADI)?.rows).toHaveLength(0)
    expect(groups.find((g) => g.key === P_RAKA)?.prefillParam).toBe(`r=${P_RAKA}`)
    expect(groups.find((g) => g.key === P_RAKA)?.label).toBe('Raka')
  })

  it('bu → one group per Business Unit, bu= prefill, honest BU labels (no Team)', () => {
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'bu' }), makeContext())
    expect(groups.map((g) => g.label)).toEqual(['Café Operations', 'B2B Sales'])
    expect(groups[0].prefillParam).toBe(`bu=${BU_CAFE}`)
  })

  it('workline → alpha named groups + trailing No-work-line group', () => {
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'workline' }), makeContext())
    const keys = groups.map((g) => g.key)
    expect(keys).toContain(WL_ROASTERY)
    expect(keys).toContain(WL_SOP)
    expect(keys[keys.length - 1]).toBe(NO_WORKLINE_GROUP_KEY)
    expect(groups.find((g) => g.key === WL_ROASTERY)?.workLineType).toBe('project')
    // t-1 has no work-line → in the trailing group.
    expect(groups.find((g) => g.key === NO_WORKLINE_GROUP_KEY)?.rows.map((r) => r.id)).toEqual(['t-1'])
  })

  it('workline + explicit PIC filter suppresses zero-count work-line groups', () => {
    // With picId set, project() filters to Raka's rows first; group suppression drops empty WLs.
    const p = projectTaskCollection(makeData(), q({ groupBy: 'workline', picId: P_RAKA }))
    // Raka rows: t-1 (no WL), t-3 (WL_SOP). Roastery WL has 0 → suppressed.
    const keys = p.groups.map((g) => g.key)
    expect(keys).toContain(WL_SOP)
    expect(keys).not.toContain(WL_ROASTERY)
    expect(keys).toContain(NO_WORKLINE_GROUP_KEY)
  })

  it('occurrence → run-captioned group with roll-up + trailing ad-hoc catch-all', () => {
    const ctx = makeContext({ runRollupsByRunId: new Map([[RUN_CAFE_OPENING, CAFE_OPENING_ROLLUP]]) })
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'occurrence' }), ctx)
    const opening = groups.find((g) => g.key === RUN_CAFE_OPENING)
    expect(opening?.label).toBe('Café Opening · 17 Jul 2026')
    expect(opening?.rows.map((r) => r.id).sort()).toEqual(['t-1', 't-3'])
    expect(opening?.occurrenceRollup).toEqual({ total: 2, done: 0, overdue: 2, pendingUnresolved: 1 })
    // t-2 is ad-hoc (no run) → trailing catch-all group.
    const tail = groups.find((g) => g.key === NO_OCCURRENCE_GROUP_KEY)
    expect(tail?.rows.map((r) => r.id)).toEqual(['t-2'])
    expect(tail?.occurrenceRollup).toBeUndefined()
  })

  it('occurrence group counts its own overdue subtotal', () => {
    const ctx = makeContext({ runRollupsByRunId: new Map([[RUN_CAFE_OPENING, CAFE_OPENING_ROLLUP]]) })
    const groups = buildTaskGroups(RAW.map(toTaskCollectionRecord), q({ groupBy: 'occurrence' }), ctx)
    expect(groups.find((g) => g.key === RUN_CAFE_OPENING)?.overdue).toBe(2)
  })
})
