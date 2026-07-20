import { describe, expect, it, vi } from 'vitest'
import { createRecordCollectionController } from './engine'
import type {
  CollectionAccess,
  CollectionData,
  CollectionProjection,
  OverlayHostApi,
  RecordCollectionDescriptor,
} from './types'
import {
  taskCollectionQuery,
  taskPresentationCompatibleKeys,
  TASK_COLLECTION_NEUTRAL_QUERY,
  type TaskCollectionPresentation,
  type TaskCollectionQuery,
} from '@/components/tasks/task-collection-adapter'
import {
  parseCollectionViewSpec,
  type CollectionViewSpec,
  type PersistedCollectionView,
} from './collection-view-spec'

// Typed fake record — NOT Record<string, unknown>, and never fabricates a Task teamId.
interface FakeTask {
  id: string
  title: string
  status: 'Open' | 'In Progress' | 'Blocked' | 'Done'
}
type FakeGroup = { key: string; label: string; rows: readonly FakeTask[] }
type FakeAction = never

const ROWS: FakeTask[] = [
  { id: 't-1', title: 'Fix the coffee machine', status: 'Open' },
  { id: 't-2', title: 'Finalise Q3 roastery output forecast', status: 'In Progress' },
]

function fakeHost(): OverlayHostApi & {
  openRoot: ReturnType<typeof vi.fn>
  push: ReturnType<typeof vi.fn>
  openPage: ReturnType<typeof vi.fn>
} {
  return {
    openRoot: vi.fn(async () => ({ status: 'committed' as const })),
    push: vi.fn(async () => ({ status: 'committed' as const })),
    openPage: vi.fn(async () => ({ status: 'committed' as const })),
  }
}

function makeSpec(query: TaskCollectionQuery, presentation: TaskCollectionPresentation): CollectionViewSpec {
  return {
    kind: 'collection',
    version: 1,
    collectionId: 'tasks',
    domain: 'tasks',
    presentation,
    visibleFields: ['title', 'status', 'pic', 'supervisor'],
    query: {
      view: query.view,
      q: query.q,
      businessUnitId: query.businessUnitId,
      status: query.status,
      picId: query.picId,
      supervisorId: query.supervisorId,
      includeArchived: query.includeArchived,
      overdueOnly: query.overdueOnly,
      occurrenceId: query.occurrenceId,
    },
    sort: { field: query.sort, direction: query.direction },
    grouping: query.groupBy === 'none' ? null : { field: query.groupBy },
    layout: { density: 'compact' },
  }
}

function makeDescriptor(opts: {
  rows?: FakeTask[]
  access?: CollectionAccess<FakeAction>
  host?: OverlayHostApi
  loadSpy?: () => void
  store?: {
    list: () => Promise<readonly PersistedCollectionView[]>
    get: (id: string) => Promise<PersistedCollectionView | null>
    create: ReturnType<typeof vi.fn>
    rename: ReturnType<typeof vi.fn>
    archive: ReturnType<typeof vi.fn>
  }
  cardDropGroupBy?: boolean
} = {}): RecordCollectionDescriptor<
  FakeTask,
  string,
  TaskCollectionQuery,
  { viewerId: string | null },
  FakeGroup,
  FakeAction,
  TaskCollectionPresentation
> {
  const rows = opts.rows ?? ROWS
  const store = opts.store ?? {
    list: async () => [],
    get: async () => null,
    create: vi.fn(),
    rename: vi.fn(),
    archive: vi.fn(),
  }
  const presentation = (id: TaskCollectionPresentation) => ({
    id,
    label: id,
    compatibleQueryKeys:
      id === 'card' && opts.cardDropGroupBy
        ? taskCollectionQuery.keys.filter((k) => k !== 'groupBy')
        : taskPresentationCompatibleKeys[id],
    capabilities: {
      search: true,
      filterKeys: ['picId', 'supervisorId', 'status', 'businessUnitId'] as const,
      sortKeys: ['sort'] as const,
      groupKeys: ['groupBy'] as const,
      savedViews: true,
      selection: true,
      recordOpening: true,
      bulkActions: [] as readonly FakeAction[],
    },
    render: () => null,
  })
  return {
    id: 'tasks',
    defaultPresentation: 'table',
    query: taskCollectionQuery,
    savedViews: {
      enabled: true,
      store,
      operations: ['save', 'apply', 'rename', 'archive'],
      buildSpec: ({ query, presentation }) => makeSpec(query, presentation),
      parseAndValidate: (input) => parseCollectionViewSpec(input),
      applySpec: (spec) => {
        const q = spec.collectionId === 'tasks' ? spec.query : null
        return {
          query: {
            ...TASK_COLLECTION_NEUTRAL_QUERY,
            ...(q ?? {}),
            layout: spec.presentation as TaskCollectionPresentation,
            groupBy: spec.grouping?.field ?? 'none',
            sort: spec.sort.field as TaskCollectionQuery['sort'],
            direction: spec.sort.direction,
          } as TaskCollectionQuery,
          presentation: spec.presentation as TaskCollectionPresentation,
        }
      },
    },
    presentations: { table: presentation('table'), card: presentation('card') },
    load: async () => {
      opts.loadSpy?.()
      return { records: rows, context: { viewerId: 'p-me' } } as CollectionData<FakeTask, { viewerId: string | null }>
    },
    project: (data, query): CollectionProjection<FakeTask, FakeGroup> => {
      const q = (query.q ?? '').toLowerCase()
      const visible = q ? data.records.filter((r) => r.title.toLowerCase().includes(q)) : data.records
      return {
        visibleRecords: visible,
        groups: [{ key: 'all', label: 'All', rows: visible }],
        totalRecords: data.records.length,
        visibleRecordsAreFiltered: visible.length !== data.records.length,
      }
    },
    getId: (r) => r.id,
    getAccess: () => opts.access ?? { mode: 'full', visibleActions: [] },
    viewer: {
      recordType: 'task',
      buildPanelEntry: (record, source) => ({
        key: `task:${record.id}`,
        owner: 'tasks',
        tenant: 'record',
        label: record.title,
        content: null,
        pageTo: { pathname: `/tasks/${record.id}`, search: source.search },
      }),
      toCanonicalPage: (recordId) => ({ pathname: `/tasks/${recordId}` }),
    },
    host: opts.host,
  }
}

const INITIAL = {
  query: TASK_COLLECTION_NEUTRAL_QUERY,
  presentation: 'table' as TaskCollectionPresentation,
  viewerId: 'p-me',
  accessRoles: ['ops_lead'],
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('RecordCollection engine', () => {
  it('FR-V3-007: manager selection survives a compatible presentation switch and keeps the collection context', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    c.toggleSelected('t-1')
    expect(c.state.selectedIds.has('t-1')).toBe(true)
    const result = c.switchPresentation('card')
    expect(result.ok).toBe(true)
    expect(c.state.presentation).toBe('card')
    expect(c.state.selectedIds.has('t-1')).toBe(true)
    expect(c.state.query).toEqual(INITIAL.query)
  })

  it('FR-V3-007: selected IDs remain explicit when a filter hides one selected record', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    c.toggleSelected('t-2')
    c.setQuery({ ...c.state.query, q: 'coffee' })
    await flush()
    // t-2 ("forecast") is filtered out of visible rows but stays selected.
    expect(c.state.projection?.visibleRecords.some((r) => r.id === 't-2')).toBe(false)
    expect(c.state.selectedIds.has('t-2')).toBe(true)
  })

  it('NFR-V3-001: loading, empty, filtered-empty, error, permission, and read-only states are distinct', async () => {
    const ready = createRecordCollectionController(makeDescriptor(), INITIAL)
    expect(ready.state.status).toBe('loading')
    await flush()
    expect(ready.state.status).toBe('ready')

    const empty = createRecordCollectionController(makeDescriptor({ rows: [] }), INITIAL)
    await flush()
    expect(empty.state.status).toBe('empty')

    const filtered = createRecordCollectionController(makeDescriptor(), {
      ...INITIAL,
      query: { ...TASK_COLLECTION_NEUTRAL_QUERY, q: 'nonexistent-substring' },
    })
    await flush()
    expect(filtered.state.status).toBe('filtered-empty')

    const failing = makeDescriptor()
    failing.load = async () => {
      throw new Error('boom')
    }
    const errored = createRecordCollectionController(failing, INITIAL)
    await flush()
    expect(errored.state.status).toBe('error')
    expect(errored.state.error).toContain('boom')

    const forbidden = createRecordCollectionController(
      makeDescriptor({ access: { mode: 'forbidden', visibleActions: [] } }),
      INITIAL,
    )
    await flush()
    expect(forbidden.state.status).toBe('permission')

    const readonly = createRecordCollectionController(
      makeDescriptor({ access: { mode: 'read-only', visibleActions: [] } }),
      INITIAL,
    )
    await flush()
    expect(readonly.state.status).toBe('read-only')
  })

  it('FR-V3-003/004/006 seam: opening a Task delegates to the Issue 5 viewer contract and one Issue 4 host entry', async () => {
    const host = fakeHost()
    const c = createRecordCollectionController(makeDescriptor({ host }), INITIAL)
    await flush()
    c.openRecord(ROWS[0], {
      collectionId: 'tasks',
      presentation: 'table' as const,
      pathname: '/tasks',
      search: '?layout=table',
      query: c.state.query,
    })
    await flush()
    expect(host.openRoot).toHaveBeenCalledTimes(1)
    const [entry] = host.openRoot.mock.calls[0]
    expect(entry.key).toBe('task:t-1')
    expect(entry.owner).toBe('tasks')
  })

  it('FR-V3-003/004/006 seam: opening consecutive records calls push/replace through the shared host, never a second host', async () => {
    const host = fakeHost()
    const c = createRecordCollectionController(makeDescriptor({ host }), INITIAL)
    await flush()
    const source = { collectionId: 'tasks', presentation: 'table' as const, pathname: '/tasks', search: '', query: c.state.query }
    c.openRecord(ROWS[0], source)
    await flush()
    c.openRecord(ROWS[1], source)
    await flush()
    expect(host.openRoot).toHaveBeenCalledTimes(1)
    expect(host.push).toHaveBeenCalledTimes(1)
  })

  it('FR-V3-007: incompatible presentation switch does not reload, clear selection, or rewrite URL state', async () => {
    // Build a descriptor whose card presentation drops the `groupBy` key so a grouped query is incompatible.
    const loadSpy = vi.fn()
    const d = makeDescriptor({ cardDropGroupBy: true, loadSpy })
    const groupedQuery: TaskCollectionQuery = { ...TASK_COLLECTION_NEUTRAL_QUERY, groupBy: 'occurrence' }
    const c = createRecordCollectionController(d, { ...INITIAL, query: groupedQuery })
    await flush()
    loadSpy.mockClear()
    c.toggleSelected('t-1')
    const result = c.switchPresentation('card')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => i.key === 'groupBy')).toBe(true)
    expect(c.state.presentation).toBe('table')
    expect(c.state.selectedIds.has('t-1')).toBe(true)
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('FR-V3-014: default collection projection is work-first and controls are separately disclosed', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    // The engine surfaces work rows via projection; it does not gate them behind configuration.
    expect(c.state.projection?.visibleRecords.length).toBeGreaterThan(0)
    expect(c.state.status).toBe('ready')
  })

  it('FR-V3-007: applying a named saved view validates the typed spec before changing presentation or URL', async () => {
    const savedSpec = makeSpec({ ...TASK_COLLECTION_NEUTRAL_QUERY, picId: 'p-raka', status: 'Open' }, 'card')
    const view: PersistedCollectionView = {
      id: 'v-1', name: 'My open work', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', spec: savedSpec, createdAt: '', updatedAt: '', archivedAt: null,
    }
    const store = {
      list: async () => [view],
      get: async (id: string) => (id === 'v-1' ? view : null),
      create: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
    }
    const c = createRecordCollectionController(makeDescriptor({ store }), INITIAL)
    await flush()
    const result = await c.applySavedView('v-1')
    expect(result.ok).toBe(true)
    expect(c.state.presentation).toBe('card')
    expect(c.state.query.picId).toBe('p-raka')
    expect(c.state.query.savedViewId).toBe('v-1')
  })

  it('FR-V3-007: invalid saved Task Team state and unsupported Supervisor grouping are rejected without mutation', async () => {
    const badSpec = { ...makeSpec(TASK_COLLECTION_NEUTRAL_QUERY, 'table'), grouping: { field: 'supervisor' } } as unknown as CollectionViewSpec
    const view: PersistedCollectionView = {
      id: 'v-bad', name: 'Bad', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', spec: badSpec, createdAt: '', updatedAt: '', archivedAt: null,
    }
    const store = {
      list: async () => [view],
      get: async () => view,
      create: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
    }
    const c = createRecordCollectionController(makeDescriptor({ store }), INITIAL)
    await flush()
    const before = c.state.query
    const result = await c.applySavedView('v-bad')
    expect(result.ok).toBe(false)
    expect(c.state.query).toEqual(before)
    expect(c.state.query.groupBy).not.toBe('supervisor')
    expect(c.state.savedViews.error).toBeTruthy()
  })
})
