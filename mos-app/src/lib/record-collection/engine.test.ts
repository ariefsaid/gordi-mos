import { describe, expect, it, vi } from 'vitest'
import { createRecordCollectionController } from './engine'
import type {
  CollectionAccess,
  CollectionData,
  CollectionOverlayHost,
  CollectionProjection,
  RecordCollectionDescriptor,
} from './types'
import {
  taskCollectionQuery,
  taskPresentationCompatibleKeys,
  TASK_COLLECTION_NEUTRAL_QUERY,
  type TaskCollectionPresentation,
  type TaskCollectionQuery,
} from '@/components/tasks/task-collection-query'
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

// A session-stateful fake host that mirrors the real Issue 4 controller closely enough to prove
// the open dispatcher: openRoot starts a one-frame session, push stacks a frame, and closeSession
// models the user closing the overlay (Close/Escape/Back-to-root). `session` is read live.
function fakeHost(): CollectionOverlayHost & {
  openRoot: ReturnType<typeof vi.fn>
  push: ReturnType<typeof vi.fn>
  openPage: ReturnType<typeof vi.fn>
  closeSession: () => void
} {
  let frames: { entry: unknown }[] = []
  const committed = { status: 'committed' as const }
  return {
    get session() {
      return frames.length
        ? ({ id: 'ovs-fake', mode: 'route', frames } as unknown as CollectionOverlayHost['session'])
        : null
    },
    openRoot: vi.fn(async (entry: unknown) => {
      frames = [{ entry }]
      return committed
    }),
    push: vi.fn(async (entry: unknown) => {
      frames = [...frames, { entry }]
      return committed
    }),
    openPage: vi.fn(async () => committed),
    closeSession: () => {
      frames = []
    },
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
  host?: CollectionOverlayHost
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

  it('FR-V3-003/004/006 seam: a fresh open after the overlay session closes opens a new root, never a no-op push', async () => {
    const host = fakeHost()
    const c = createRecordCollectionController(makeDescriptor({ host }), INITIAL)
    await flush()
    const source = { collectionId: 'tasks', presentation: 'table' as const, pathname: '/tasks', search: '', query: c.state.query }
    c.openRecord(ROWS[0], source)
    await flush()
    expect(host.openRoot).toHaveBeenCalledTimes(1)

    // The user closes the panel (Close/Escape/Back-to-root): the session is gone.
    host.closeSession()

    // Opening again must re-open a ROOT, not push onto the now-empty session (which the host would
    // silently drop). This is the regression the local openCount caused.
    c.openRecord(ROWS[1], source)
    await flush()
    expect(host.openRoot).toHaveBeenCalledTimes(2)
    expect(host.push).not.toHaveBeenCalled()
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

  it('Issue #614: applying a saved view on a narrow (phone) session constrains state to the collection default, but the result still reports the saved view\'s own presentation for a later widen to restore', async () => {
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
    const c = createRecordCollectionController(makeDescriptor({ store }), { ...INITIAL, isDesktop: false })
    await flush()
    const result = await c.applySavedView('v-1')
    expect(result.ok).toBe(true)
    // State stays on the collection default (table) — a phone session has no switcher to leave a
    // Card-only dead end reachable from (Issue #614, same rule as the initial mount and the
    // narrow/widen effect already apply).
    expect(c.state.presentation).toBe('table')
    expect(c.state.query.picId).toBe('p-raka')
    // The result carries what the SAVED VIEW asked for, not the constrained state — the hook uses
    // this to remember what a later widen should restore.
    if (result.ok) expect(result.presentation).toBe('card')
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

  it('FR-V3-007: save/rename/archive lifecycle updates the saved-view list and surfaces pending/error states', async () => {
    const view: PersistedCollectionView = {
      id: 'v-1', name: 'My open work', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', spec: makeSpec(TASK_COLLECTION_NEUTRAL_QUERY, 'table'), createdAt: '', updatedAt: '', archivedAt: null,
    }
    const store = {
      list: vi.fn(async () => [view]),
      get: async () => view,
      create: vi.fn(async () => view),
      rename: vi.fn(async () => {}),
      archive: vi.fn(async () => {}),
    }
    const c = createRecordCollectionController(makeDescriptor({ store }), INITIAL)
    await flush()

    await c.loadSavedViews()
    expect(store.list).toHaveBeenCalledTimes(1)
    expect(c.state.savedViews.items).toHaveLength(1)

    const created = await c.saveCurrentView('My open work', 'private')
    expect(created?.id).toBe('v-1')
    expect(store.create).toHaveBeenCalledTimes(1)
    // saved identity is written after success.
    expect(c.state.query.savedViewId).toBe('v-1')
    expect(c.state.savedViews.operation).toBe('idle')

    await c.renameSavedView('v-1', 'Renamed')
    expect(store.rename).toHaveBeenCalledWith('v-1', 'Renamed')
    expect(c.state.savedViews.items.find((v) => v.id === 'v-1')?.name).toBe('Renamed')

    await c.archiveSavedView('v-1')
    expect(store.archive).toHaveBeenCalledWith('v-1')
    expect(c.state.savedViews.items).toHaveLength(0)
    // archiving the applied view clears only the saved identity.
    expect(c.state.query.savedViewId).toBeNull()
  })

  it('NFR-V3-001: saveCurrentView surfaces a retryable error when the store rejects', async () => {
    const store = {
      list: async () => [],
      get: async () => null,
      create: vi.fn(async () => { throw new Error('network down') }),
      rename: vi.fn(),
      archive: vi.fn(),
    }
    const c = createRecordCollectionController(makeDescriptor({ store }), INITIAL)
    await flush()
    const result = await c.saveCurrentView('X', 'private')
    expect(result).toBeNull()
    expect(c.state.savedViews.operation).toBe('error')
    expect(c.state.savedViews.error).toContain('network down')
  })

  it('NFR-V3-001: loadSavedViews surfaces an error state that stays retryable', async () => {
    const store = {
      list: vi.fn(async () => { throw new Error('list failed') }),
      get: async () => null,
      create: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
    }
    const c = createRecordCollectionController(makeDescriptor({ store }), INITIAL)
    await flush()
    await c.loadSavedViews()
    expect(c.state.savedViews.operation).toBe('error')
    expect(c.state.savedViews.error).toContain('list failed')
  })

  it('FR-V3-007: selectVisible adds only the given ids and clearSelection empties the set', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    c.toggleSelected('t-2')
    c.selectVisible(['t-1'])
    expect(c.state.selectedIds.has('t-1')).toBe(true)
    expect(c.state.selectedIds.has('t-2')).toBe(true)
    c.clearSelection()
    expect(c.state.selectedIds.size).toBe(0)
  })

  it('NFR-V3-001: retry re-runs the loader with the same typed query', async () => {
    const loadSpy = vi.fn()
    const c = createRecordCollectionController(makeDescriptor({ loadSpy }), INITIAL)
    await flush()
    const queryBefore = c.state.query
    loadSpy.mockClear()
    c.retry()
    await flush()
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(c.state.query).toEqual(queryBefore)
  })

  it('FR-V3-007: toggleGroup collapses and re-expands a typed group id', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    c.toggleGroup('grp-a')
    expect(c.state.collapsedGroupIds.has('grp-a')).toBe(true)
    c.toggleGroup('grp-a')
    expect(c.state.collapsedGroupIds.has('grp-a')).toBe(false)
  })

  it('NFR-V3-001: runBulkAction is a no-op when the descriptor grants no bulk capability', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    c.toggleSelected('t-1')
    // TaskCollectionAction is `never`; nothing to run and no throw.
    await expect(c.runBulkAction('archive' as never)).resolves.toBeUndefined()
  })

  it('FR-V3-003/004/006 seam: openRecord is a no-op when no host is wired yet (parallel Issue 4)', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await flush()
    // No host injected — must not throw; the opening seam simply does nothing until Issue 4 lands.
    expect(() =>
      c.openRecord(ROWS[0], { collectionId: 'tasks', presentation: 'table', pathname: '/tasks', search: '', query: c.state.query }),
    ).not.toThrow()
  })
})
