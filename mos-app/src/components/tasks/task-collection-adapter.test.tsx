// Task collection descriptor (V3 Issue 6, Tasks 10/11) — load / access / viewer / saved-view mapping
// / presentation. The pure filter/sort/group projection is covered in task-collection-projector.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { CollectionData } from '@/lib/record-collection/types'

vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  listRoleNames: vi.fn(),
}))
vi.mock('@/lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({ listRunRollups: vi.fn(), listTaskDefs: vi.fn() }))
vi.mock('@/lib/db/user-views-collection', () => ({
  listCollectionViews: vi.fn(),
  getCollectionView: vi.fn(),
  createCollectionView: vi.fn(),
  renameCollectionView: vi.fn(),
  archiveCollectionView: vi.fn(),
}))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, listRoleNames } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listRunRollups, listTaskDefs } from '@/lib/db/processes'
import {
  TASK_COLLECTION_NEUTRAL_QUERY,
  taskCollectionDescriptor,
  taskCollectionSavedViews,
  toTaskCollectionRecord,
  type TaskCollectionContext,
  type TaskCollectionQuery,
  type TaskCollectionRecord,
} from './task-collection-adapter'

const mock = <T,>(fn: unknown) => fn as unknown as ReturnType<typeof vi.fn> & T

function rawTask(over: Partial<TaskListRow> & Pick<TaskListRow, 'id' | 'title'>): TaskListRow {
  return {
    id: over.id, org_id: 'org-1', title: over.title,
    business_unit_id: over.business_unit_id ?? 'bu-cafe',
    status: over.status ?? 'Open',
    responsible_person_id: over.responsible_person_id ?? 'p-raka',
    accountable_person_id: over.accountable_person_id ?? 'p-sari',
    consulted_person_ids: [], informed_person_ids: [], description: null,
    due_date: over.due_date ?? null, objective_id: over.objective_id ?? null,
    work_line_id: over.work_line_id ?? null,
    last_activity_at: over.last_activity_at ?? '2026-07-20T00:00:00Z',
    archived_at: over.archived_at ?? null, created_by: 'p-sari',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    process_run_id: over.process_run_id ?? null,
    generated_from_task_def_id: over.generated_from_task_def_id ?? null,
  }
}

function seedDirectory() {
  mock(getBusinessUnits).mockResolvedValue([{ id: 'bu-cafe', name: 'Café Operations' }, { id: 'bu-b2b', name: 'B2B Sales' }])
  mock(getPeople).mockResolvedValue([{ id: 'p-raka', full_name: 'Raka' }, { id: 'p-sari', full_name: 'Sari' }])
  mock(listObjectives).mockResolvedValue([{ id: 'o-1', name: 'Grow café revenue' }])
  mock(listWorkLines).mockResolvedValue([{ id: 'wl-1', name: 'Roastery output', type: 'project' }])
}

function q(over: Partial<TaskCollectionQuery> = {}): TaskCollectionQuery {
  return { ...TASK_COLLECTION_NEUTRAL_QUERY, ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('load — DAL wiring and context', () => {
  it('FR-V3-007: legacy storage columns map to PIC/Supervisor only inside the adapter, BU rendered honestly', async () => {
    seedDirectory()
    mock(listTasks).mockResolvedValue([rawTask({ id: 't-1', title: 'Fix the coffee machine' })])
    const data = await taskCollectionDescriptor.load({ query: q(), viewerId: 'p-raka' })
    expect(data.records[0].picId).toBe('p-raka')
    expect(data.records[0].supervisorId).toBe('p-sari')
    expect(data.context.businessUnitNamesById.get('bu-cafe')).toBe('Café Operations')
    expect(data.context.personNamesById.get('p-raka')).toBe('Raka')
    expect(data.context.workLineTypeById.get('wl-1')).toBe('project')
    // Only includeArchived is a server filter; BU/Status stay client-side.
    expect(mock(listTasks)).toHaveBeenCalledWith({ includeArchived: false })
  })

  it('fetches occurrence roll-ups + PIC provenance ONLY when grouping by occurrence', async () => {
    seedDirectory()
    mock(listTasks).mockResolvedValue([
      rawTask({ id: 't-1', title: 'Fix the coffee machine', process_run_id: 'run-1', generated_from_task_def_id: 'def-1' }),
    ])
    mock(listRunRollups).mockResolvedValue([
      { process_run_id: 'run-1', caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17', status: 'active', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0, overdue: 0, pending_unresolved: 1, completion_pct: 0 },
    ])
    mock(listTaskDefs).mockResolvedValue([{ id: 'def-1', pic_role_id: 'role-1' }])
    mock(listRoleNames).mockResolvedValue([{ id: 'role-1', name: 'Cafe Ops Lead' }])

    const data = await taskCollectionDescriptor.load({ query: q({ groupBy: 'occurrence' }), viewerId: 'p-raka' })
    expect(data.context.runRollupsByRunId.get('run-1')?.caption).toBe('Café Opening · 17 Jul 2026')
    expect(data.context.provenanceByTaskDefId.get('def-1')).toBe('Cafe Ops Lead')
    expect(mock(listRunRollups)).toHaveBeenCalledWith(['run-1'])
  })

  it('does NOT fetch roll-ups when not grouping by occurrence', async () => {
    seedDirectory()
    mock(listTasks).mockResolvedValue([rawTask({ id: 't-1', title: 'x', process_run_id: 'run-1' })])
    await taskCollectionDescriptor.load({ query: q({ groupBy: 'status' }), viewerId: 'p-raka' })
    expect(mock(listRunRollups)).not.toHaveBeenCalled()
    expect(mock(listTaskDefs)).not.toHaveBeenCalled()
  })

  it('FR-V3-013: context.rowsById bridges each projected id back to its raw TaskListRow (single-loader render seam)', async () => {
    seedDirectory()
    const raw = rawTask({ id: 't-1', title: 'Fix the coffee machine', responsible_person_id: 'p-raka', accountable_person_id: 'p-sari' })
    mock(listTasks).mockResolvedValue([raw])
    const data = await taskCollectionDescriptor.load({ query: q(), viewerId: 'p-raka' })
    // The workspace maps a projected record id → the full raw row for its TaskListRow render stack,
    // so the descriptor stays the ONLY loader (no parallel listTasks fetch in the workspace).
    expect(data.context.rowsById.get('t-1')).toEqual(raw)
    expect(data.records[0].id).toBe('t-1')
  })
})

describe('NFR-V3-001: no typed bulk capability is granted', () => {
  it('access is full-but-actionless and both presentations expose an empty bulkActions slot', () => {
    expect(taskCollectionDescriptor.getAccess({ viewerId: 'p-raka', accessRoles: [] })).toEqual({ mode: 'full', visibleActions: [] })
    expect(taskCollectionDescriptor.presentations.table.capabilities.bulkActions).toEqual([])
    expect(taskCollectionDescriptor.presentations.card.capabilities.bulkActions).toEqual([])
    // Selection stays live even though no bulk action ships.
    expect(taskCollectionDescriptor.presentations.table.capabilities.selection).toBe(true)
  })
})

describe('FR-V3-003/004/006 seam: Task row opening', () => {
  it('preserves the collection query in the canonical route and tags the entry as the tasks owner', () => {
    const source = { collectionId: 'tasks', presentation: 'table', pathname: '/work/tasks', search: '?view=my-work&group=status' }
    const rec = toTaskCollectionRecord(rawTask({ id: 't-9', title: 'Fix the coffee machine' }))
    const to = taskCollectionDescriptor.viewer.toCanonicalPage('t-9', source)
    expect(to).toEqual({ pathname: '/work/tasks/t-9', search: '?view=my-work&group=status' })
    const entry = taskCollectionDescriptor.viewer.buildPanelEntry(rec, source)
    expect(entry.owner).toBe('tasks')
    expect(entry.tenant).toBe('record')
    expect(entry.pageTo).toEqual({ pathname: '/work/tasks/t-9', search: '?view=my-work&group=status' })
  })
})

describe('FR-V3-007: saved-view spec mapping', () => {
  it('buildSpec → applySpec round-trips the typed query and presentation', () => {
    const query = q({ view: 'my-work', status: 'Blocked', picId: 'p-raka', groupBy: 'status', sort: 'due', direction: 'descending', layout: 'card' })
    const spec = taskCollectionSavedViews.buildSpec({ query, presentation: 'card' })
    expect(taskCollectionSavedViews.parseAndValidate(spec).ok).toBe(true)
    const applied = taskCollectionSavedViews.applySpec(spec)
    expect(applied.presentation).toBe('card')
    expect(applied.query.view).toBe('my-work')
    expect(applied.query.status).toBe('Blocked')
    expect(applied.query.picId).toBe('p-raka')
    expect(applied.query.groupBy).toBe('status')
    expect(applied.query.direction).toBe('descending')
  })

  it('grouping is null in the spec when groupBy is none', () => {
    const spec = taskCollectionSavedViews.buildSpec({ query: q({ groupBy: 'none' }), presentation: 'table' })
    expect(spec.kind === 'collection' && spec.grouping).toBeNull()
    expect(taskCollectionSavedViews.applySpec(spec).query.groupBy).toBe('none')
  })

  it('FR-V3-007: unsupported Supervisor grouping is rejected, never mapped to PIC', () => {
    const supervisorGroupedSpec = {
      kind: 'collection', version: 1, collectionId: 'tasks', domain: 'tasks', presentation: 'table',
      visibleFields: ['title', 'status', 'pic', 'supervisor', 'due'],
      query: { view: 'all', q: '', businessUnitId: null, status: null, picId: null, supervisorId: null, includeArchived: false, overdueOnly: false, occurrenceId: null },
      sort: { field: 'due', direction: 'ascending' },
      grouping: { field: 'supervisor' },
      layout: { density: 'compact' },
    }
    const result = taskCollectionSavedViews.parseAndValidate(supervisorGroupedSpec)
    expect(result.ok).toBe(false)
  })

  it('FR-V3-007: a Task Team visible field / query key is rejected until Issue 8 supplies team_id', () => {
    const teamSpec = {
      kind: 'collection', version: 1, collectionId: 'tasks', domain: 'tasks', presentation: 'table',
      visibleFields: ['title', 'team'],
      query: { view: 'all', q: '', businessUnitId: null, status: null, picId: null, supervisorId: null, includeArchived: false, overdueOnly: false, occurrenceId: null },
      sort: { field: 'due', direction: 'ascending' },
      grouping: null,
      layout: { density: 'compact' },
    }
    expect(taskCollectionSavedViews.parseAndValidate(teamSpec).ok).toBe(false)
  })
})

describe('table presentation (shared-surface fallback renderer)', () => {
  function makeData(): CollectionData<TaskCollectionRecord, TaskCollectionContext> {
    const records = [
      toTaskCollectionRecord(rawTask({ id: 't-1', title: 'Fix the coffee machine', responsible_person_id: 'p-raka' })),
    ]
    const context: TaskCollectionContext = {
      businessUnits: [], people: [],
      businessUnitNamesById: new Map(), personNamesById: new Map([['p-raka', 'Raka'], ['p-sari', 'Sari']]),
      workLinesById: new Map(), workLineTypeById: new Map(), objectivesById: new Map(),
      runRollupsByRunId: new Map(), provenanceByTaskDefId: new Map(), rowsById: new Map(),
      viewerId: 'p-raka', statusOverrides: new Map(), now: new Date('2026-07-21T03:00:00Z'), refresh: () => {},
    }
    return { records, context }
  }

  it('renders the projected rows with the resolved PIC name and calls onOpenRecord', () => {
    const data = makeData()
    const projection = taskCollectionDescriptor.project(data, q(), 'table')
    const onOpenRecord = vi.fn()
    render(
      <I18nProvider><MemoryRouter>{taskCollectionDescriptor.presentations.table.render({
        query: q(), projection, context: data.context,
        selectedIds: new Set(), onToggleSelected: () => {}, onOpenRecord,
        onToggleGroup: () => {}, isGroupCollapsed: () => false,
      })}</MemoryRouter></I18nProvider>,
    )
    expect(screen.getByText('Fix the coffee machine')).toBeInTheDocument()
    expect(screen.getByText('Raka')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('row', { name: /Fix the coffee machine/ }))
    expect(onOpenRecord).toHaveBeenCalledTimes(1)
  })
})
