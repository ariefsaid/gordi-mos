// Catalog adapters for the V3 RecordCollection engine — Projects & Processes and Objectives.
//
// These two management surfaces used to render a pre-redesign bespoke inline-add list (New X / Add X
// / Rename / Archive rows). They now speak the same V3 collection grammar every other collection uses:
// one typed descriptor per domain owns load / filter (view + name search + type) / a single `list`
// presentation, and the shared RecordCollectionSurface + CollectionToolbar render it. A catalog row
// has NO record panel, so record-opening stays dormant and the row's inline management actions remain
// its primary interaction (supplied by the page through the CatalogCollectionActions context).
//
// Project/Process share ONE collection keyed off `work_lines.type` (the physical table is mos.work_lines
// — ADR-0015); Objectives are a separate collection. Both carry the FR-422 up/down trace, computed once
// in `load()` over existing cascade data (no schema change) and rendered under each active row.
import {
  listObjectivesAll, createObjective, renameObjective, setObjectiveArchived,
} from '@/lib/db/objectives'
import {
  listWorkLinesAll, createWorkLine, renameWorkLine, setWorkLineArchived,
} from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { ObjectiveAdminRow } from '@/lib/db/objectives'
import type { WorkLineAdminRow } from '@/lib/db/work-lines'
import type {
  CollectionData,
  CollectionProjection,
  CollectionQueryParse,
  CollectionQuerySchema,
  CollectionSavedViewDescriptor,
  QueryKey,
  RecordCollectionDescriptor,
  RecordViewerOpeningContract,
} from '@/lib/record-collection/types'
import { CatalogListPresentation } from './catalog-list-presentation'

// ── Shared types ─────────────────────────────────────────────────────────────────────────────────

export type CatalogType = 'project' | 'process'

/** A managed catalog row: id + name + soft-archive flag, plus the work-line type where it applies. */
export interface CatalogRow {
  id: string
  name: string
  archived_at: string | null
  type?: CatalogType
}

export type CatalogView = 'active' | 'archived'
export type CatalogTypeFilter = 'all' | CatalogType
export type CatalogPresentation = 'list'
export type CatalogAction = never

export interface CatalogCollectionQuery {
  layout: CatalogPresentation
  view: CatalogView
  q: string
  /** Work-line type filter. Objectives never populate it (their descriptor omits the filter). */
  type: CatalogTypeFilter
  savedViewId: string | null
}

/** Display context the list presentation reads — the FR-422 trace line per row id. */
export interface CatalogCollectionContext {
  traceById: ReadonlyMap<string, string>
}

/** A projection group — a catalog renders a single flat group (the active view). */
export interface CatalogRenderGroup {
  key: string
  label: string | null
  rows: readonly CatalogRow[]
}

const CATALOG_QUERY_KEYS: readonly QueryKey<CatalogCollectionQuery>[] = [
  'layout', 'view', 'q', 'type', 'savedViewId',
]

const CATALOG_NEUTRAL_QUERY: CatalogCollectionQuery = {
  layout: 'list',
  view: 'active',
  q: '',
  type: 'all',
  savedViewId: null,
}

const VIEWS: readonly CatalogView[] = ['active', 'archived']
const TYPE_FILTERS: readonly CatalogTypeFilter[] = ['all', 'project', 'process']

function parseCatalogQuery(params: URLSearchParams): CollectionQueryParse<CatalogCollectionQuery> {
  const query: CatalogCollectionQuery = { ...CATALOG_NEUTRAL_QUERY }

  const view = params.get('view')
  if (view !== null && VIEWS.includes(view as CatalogView)) query.view = view as CatalogView

  const q = params.get('q')
  if (q !== null) query.q = q

  const type = params.get('type')
  if (type !== null && TYPE_FILTERS.includes(type as CatalogTypeFilter)) query.type = type as CatalogTypeFilter

  query.savedViewId = params.get('saved')

  return { ok: true, query }
}

function serializeCatalogQuery(query: CatalogCollectionQuery): URLSearchParams {
  const p = new URLSearchParams()
  p.set('layout', query.layout)
  if (query.view !== 'active') p.set('view', query.view)
  if (query.q) p.set('q', query.q)
  if (query.type !== 'all') p.set('type', query.type)
  if (query.savedViewId) p.set('saved', query.savedViewId)
  return p
}

export const catalogCollectionQuery: CollectionQuerySchema<CatalogCollectionQuery> = {
  keys: CATALOG_QUERY_KEYS,
  neutral: CATALOG_NEUTRAL_QUERY,
  parse: parseCatalogQuery,
  serialize: serializeCatalogQuery,
  normalize: (query) => query,
}

// ── FR-422 trace builders (ported verbatim from the pre-redesign pages) ────────────────────────────

/**
 * Objective DOWN-trace: for each objective, its child work_lines + per-work_line task count, rendered
 * "<total> tasks · W1 (n1), W2 (n2)". An objective with zero tasks gets NO entry (no false zero).
 */
function buildObjectiveDownTrace(
  tasks: readonly TaskListRow[],
  workLines: readonly WorkLineAdminRow[],
): Map<string, string> {
  const wlName = new Map(workLines.map((w) => [w.id, w.name]))
  // objectiveId → (workLineId → task count)
  const byObjective = new Map<string, Map<string, number>>()
  for (const task of tasks) {
    if (!task.objective_id) continue
    const inner = byObjective.get(task.objective_id) ?? new Map<string, number>()
    const wlKey = task.work_line_id ?? '__none__'
    inner.set(wlKey, (inner.get(wlKey) ?? 0) + 1)
    byObjective.set(task.objective_id, inner)
  }
  const map = new Map<string, string>()
  for (const [objectiveId, wlCounts] of byObjective) {
    const total = [...wlCounts.values()].reduce((sum, n) => sum + n, 0)
    if (total === 0) continue
    const named = [...wlCounts.entries()]
      .filter(([wlKey]) => wlKey !== '__none__' && wlName.has(wlKey))
      .map(([wlKey, n]) => `${wlName.get(wlKey)} (${n})`)
    map.set(objectiveId, named.length > 0
      ? `${total} task${total === 1 ? '' : 's'} · ${named.join(', ')}`
      : `${total} task${total === 1 ? '' : 's'}`)
  }
  return map
}

/**
 * Work-line UP-trace: work_lines has no objective_id column, so each work_line's parent objective(s)
 * are inferred from task linkage, rendered "Under: Obj (n), …". Tasks with a work_line but no parent
 * objective are surfaced as "no parent objective (n)" rather than dropped (FR-422 edge case).
 */
function buildWorkLineUpTrace(
  tasks: readonly TaskListRow[],
  objectives: readonly ObjectiveAdminRow[],
): Map<string, string> {
  const objName = new Map(objectives.map((o) => [o.id, o.name]))
  const NO_OBJ = ''
  // workLineId → (objectiveId | '' → task count)
  const byWorkLine = new Map<string, Map<string, number>>()
  for (const task of tasks) {
    if (!task.work_line_id) continue
    const key = task.objective_id ?? NO_OBJ
    const inner = byWorkLine.get(task.work_line_id) ?? new Map<string, number>()
    inner.set(key, (inner.get(key) ?? 0) + 1)
    byWorkLine.set(task.work_line_id, inner)
  }
  const map = new Map<string, string>()
  for (const [workLineId, objCounts] of byWorkLine) {
    const segments = [...objCounts.entries()]
      .filter(([objId]) => objId !== NO_OBJ && objName.has(objId))
      .map(([objId, n]) => `${objName.get(objId)} (${n})`)
    const orphan = objCounts.get(NO_OBJ) ?? 0
    if (orphan > 0) segments.push(`no parent objective (${orphan})`)
    if (segments.length === 0) continue
    map.set(workLineId, `Under: ${segments.join(', ')}`)
  }
  return map
}

// ── Projection (view + name search + work-line type; single flat group) ────────────────────────────

function isFiltered(query: CatalogCollectionQuery, visible: number, total: number): boolean {
  // Anything hidden by the current view/search/type narrows the set — an empty result is then
  // "filtered-empty" (clearable), never the teaching "empty" reserved for a truly empty catalog.
  return visible < total || query.q.trim() !== '' || query.type !== 'all' || query.view !== 'active'
}

function projectCatalog(
  data: CollectionData<CatalogRow, CatalogCollectionContext>,
  query: CatalogCollectionQuery,
): CollectionProjection<CatalogRow, CatalogRenderGroup> {
  const term = query.q.trim().toLowerCase()
  const visibleRecords = data.records.filter((row) => {
    if (query.view === 'active' && row.archived_at != null) return false
    if (query.view === 'archived' && row.archived_at == null) return false
    if (query.type !== 'all' && row.type !== query.type) return false
    if (term && !row.name.toLowerCase().includes(term)) return false
    return true
  })
  return {
    visibleRecords,
    groups: [{ key: query.view, label: null, rows: visibleRecords }],
    totalRecords: data.records.length,
    visibleRecordsAreFiltered: isFiltered(query, visibleRecords.length, data.records.length),
  }
}

// ── Descriptor scaffolding (saved views + record-opening are dormant for a catalog) ────────────────

// A catalog has no persisted saved views and no record panel. The engine's descriptor type requires
// both seams structurally, so they are present but inert: the toolbar never exposes saved views and
// no presentation opens a record, so buildSpec/applySpec and the viewer are never reached.
const inertSavedViews: CollectionSavedViewDescriptor<CatalogCollectionQuery, CatalogPresentation> = {
  enabled: true,
  store: {
    list: async () => [],
    get: async () => null,
    create: async () => { throw new Error('catalog has no persisted views') },
    rename: async () => {},
    archive: async () => {},
  },
  operations: [],
  buildSpec: () => { throw new Error('catalog has no persisted views') },
  parseAndValidate: () => ({ ok: false, issues: [] }),
  applySpec: () => { throw new Error('catalog has no persisted views') },
}

const inertViewer: RecordViewerOpeningContract<CatalogRow> = {
  recordType: 'catalog',
  buildPanelEntry: (row) => ({
    key: `catalog:${row.id}`,
    owner: 'shell',
    tenant: 'record',
    label: row.name,
    content: null,
  }),
  toCanonicalPage: (recordId) => ({ pathname: `/work/${recordId}` }),
}

function makeCatalogDescriptor(config: {
  id: string
  filterKeys: readonly QueryKey<CatalogCollectionQuery>[]
  load: () => Promise<CollectionData<CatalogRow, CatalogCollectionContext>>
}): RecordCollectionDescriptor<
  CatalogRow,
  string,
  CatalogCollectionQuery,
  CatalogCollectionContext,
  CatalogRenderGroup,
  CatalogAction,
  CatalogPresentation
> {
  return {
    id: config.id,
    defaultPresentation: 'list',
    query: catalogCollectionQuery,
    savedViews: inertSavedViews,
    // Everything is filtered client-side in project() over one snapshot, so no query change needs a
    // refetch — only an explicit retry() (after a create/rename/archive mutation) reloads.
    loadKeys: [],
    presentations: {
      list: {
        id: 'list',
        label: 'List',
        compatibleQueryKeys: CATALOG_QUERY_KEYS,
        capabilities: {
          search: true,
          filterKeys: config.filterKeys,
          sortKeys: [],
          groupKeys: [],
          savedViews: false,
          selection: false,
          recordOpening: false,
          bulkActions: [],
        },
        render: (props) => <CatalogListPresentation {...props} />,
      },
    },
    load: config.load,
    project: (data, query) => projectCatalog(data, query),
    getId: (row) => row.id,
    // The route is gated by RequireCapability (FR-424); a viewer who reaches the surface can manage it.
    getAccess: () => ({ mode: 'full', visibleActions: [] }),
    viewer: inertViewer,
  }
}

// ── Objectives (down-trace; no type filter) ────────────────────────────────────────────────────────

export const objectivesCollectionDescriptor = makeCatalogDescriptor({
  id: 'objectives',
  filterKeys: [],
  load: async () => {
    const [objectives, tasks, workLines] = await Promise.all([
      listObjectivesAll(), listTasks({}), listWorkLinesAll(),
    ])
    return {
      records: objectives.map((o) => ({ id: o.id, name: o.name, archived_at: o.archived_at })),
      context: { traceById: buildObjectiveDownTrace(tasks, workLines) },
    }
  },
})

// Lazy wrappers, not direct binding refs: with per-domain module mocks in tests, reading a mutation
// export at module-eval throws when the sibling domain's mock omits it. Deferring to call-time means
// the Objectives page never touches the work-lines mutations, and vice-versa.
export const objectivesCatalogActions = {
  create: (name: string) => createObjective(name),
  rename: (id: string, name: string) => renameObjective(id, name),
  setArchived: (id: string, archived: boolean) => setObjectiveArchived(id, archived),
}

// ── Projects & Processes (up-trace; work-line type filter + tag) ───────────────────────────────────

export const projectsProcessesCollectionDescriptor = makeCatalogDescriptor({
  id: 'work_lines',
  filterKeys: ['type'],
  load: async () => {
    const [workLines, tasks, objectives] = await Promise.all([
      listWorkLinesAll(), listTasks({}), listObjectivesAll(),
    ])
    return {
      records: workLines.map((w) => ({ id: w.id, name: w.name, archived_at: w.archived_at, type: w.type })),
      context: { traceById: buildWorkLineUpTrace(tasks, objectives) },
    }
  },
})

export const projectsProcessesCatalogActions = {
  create: (name: string, type: CatalogType) => createWorkLine(name, type),
  rename: (id: string, name: string) => renameWorkLine(id, name),
  setArchived: (id: string, archived: boolean) => setWorkLineArchived(id, archived),
}
