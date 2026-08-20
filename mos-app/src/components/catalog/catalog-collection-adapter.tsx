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
import {
  buildCountRollup, buildObjectiveBranches,
  type BranchLabels, type CountRollup, type ObjectiveBranch,
} from '@/lib/cascade/count-rollup'
// clarify (2026-07-28): a collection descriptor's `load()` runs outside React, so `useT()` is
// unavailable — which is exactly why the FR-422 trace strings were left as English template
// literals and shipped untranslated onto the Indonesian Objectives page ("3 tasks · …").
// `translateFor` closes that seam without faking a hook outside a render.
import { translateFor, type Translate } from '@/i18n/use-t'
import { readPersistedLocale } from '@/i18n/I18nProvider'
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
/**
 * OD-V4-1 H7 fix: a "does this record have any linked work" filter. Objectives is the only
 * descriptor that exposes it in the toolbar today (Projects/Processes already had the `type`
 * filter); the field is shared on the query type so either descriptor could opt in later.
 */
export type CatalogCoverageFilter = 'all' | 'has-tasks' | 'no-tasks'
export type CatalogPresentation = 'list'
export type CatalogAction = never

export interface CatalogCollectionQuery {
  layout: CatalogPresentation
  view: CatalogView
  q: string
  /** Work-line type filter. Objectives never populate it (their descriptor omits the filter). */
  type: CatalogTypeFilter
  /** Task-coverage filter (OD-V4-1 H7). Projects/Processes never populate it today. */
  coverage: CatalogCoverageFilter
  savedViewId: string | null
}

/** One related record a catalog row links to — a real drill target, never inert text. */
export interface CatalogRelationGroup {
  id: string
  name: string
  taskCount: number
  done: number
  total: number
  synthetic?: 'unlinked' | 'no-work-line'
  tasks?: readonly CatalogRelationTask[]
}

/** One task a catalog row links to directly (real record door: /work/tasks/:id). */
export interface CatalogRelationTask {
  id: string
  title: string
}

/**
 * OD-V4-1 H4 fix: the bidirectional relations a row can drill into, "on the records themselves"
 * (not a separate cascade page/route — docs/v4-inheritance.md INC-1). An Objective's `groups` are
 * its child Projects/Processes; a Project/Process's `groups` are its parent Objective(s). `tasks`
 * is the row's own tasks either way, each a real link to the existing /work/tasks/:id record door.
 */
export interface CatalogRelations {
  groups: readonly CatalogRelationGroup[]
  tasks: readonly CatalogRelationTask[]
}

/** Which side of the Objective ⇄ Project/Process relation a catalog's rows sit on. */
export type CatalogRelationsKind = 'objective' | 'work_line'

/** Display context the list presentation reads — the FR-422 trace line + the relations per row id. */
export interface CatalogCollectionContext {
  traceById: ReadonlyMap<string, string>
  relationsById: ReadonlyMap<string, CatalogRelations>
  relationsKind: CatalogRelationsKind
  /** Count-only roll-up per row id — `done` and `total`, never a target or a percentage. */
  progressById: ReadonlyMap<string, CountRollup>
}

/** A projection group — a catalog renders a single flat group (the active view). */
export interface CatalogRenderGroup {
  key: string
  label: string | null
  rows: readonly CatalogRow[]
}

const CATALOG_QUERY_KEYS: readonly QueryKey<CatalogCollectionQuery>[] = [
  'layout', 'view', 'q', 'type', 'coverage', 'savedViewId',
]

const CATALOG_NEUTRAL_QUERY: CatalogCollectionQuery = {
  layout: 'list',
  view: 'active',
  q: '',
  type: 'all',
  coverage: 'all',
  savedViewId: null,
}

const VIEWS: readonly CatalogView[] = ['active', 'archived']
const TYPE_FILTERS: readonly CatalogTypeFilter[] = ['all', 'project', 'process']
const COVERAGE_FILTERS: readonly CatalogCoverageFilter[] = ['all', 'has-tasks', 'no-tasks']

function parseCatalogQuery(params: URLSearchParams): CollectionQueryParse<CatalogCollectionQuery> {
  const query: CatalogCollectionQuery = { ...CATALOG_NEUTRAL_QUERY }

  const view = params.get('view')
  if (view !== null && VIEWS.includes(view as CatalogView)) query.view = view as CatalogView

  const q = params.get('q')
  if (q !== null) query.q = q

  const type = params.get('type')
  if (type !== null && TYPE_FILTERS.includes(type as CatalogTypeFilter)) query.type = type as CatalogTypeFilter

  const coverage = params.get('coverage')
  if (coverage !== null && COVERAGE_FILTERS.includes(coverage as CatalogCoverageFilter)) {
    query.coverage = coverage as CatalogCoverageFilter
  }

  query.savedViewId = params.get('saved')

  return { ok: true, query }
}

function serializeCatalogQuery(query: CatalogCollectionQuery): URLSearchParams {
  const p = new URLSearchParams()
  p.set('layout', query.layout)
  if (query.view !== 'active') p.set('view', query.view)
  if (query.q) p.set('q', query.q)
  if (query.type !== 'all') p.set('type', query.type)
  if (query.coverage !== 'all') p.set('coverage', query.coverage)
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

// ── FR-422 trace builders ─────────────────────────────────────────────────────────────────────
//
// Both read the SHARED branch projection (#204). They used to walk the raw tasks themselves, which
// made them two more constructions of the Objective → Project/Process relation — and once the
// roll-up started counting through `work_lines.objective_id`, the trace and the count sat on the
// same row disagreeing ("2 tasks" beside "1 / 4 done"). One projection, one answer.

/** `n tasks`, in the viewer's locale. */
function traceTaskCount(t: Translate) {
  return (n: number) => t(n === 1 ? 'catalog.trace.taskCount.one' : 'catalog.trace.taskCount.other', { count: n })
}

/**
 * Objective DOWN-trace: for each objective, its child work_lines + per-work_line task count, rendered
 * "<total> tasks · W1 (n1), W2 (n2)". An objective with zero tasks gets NO entry (no false zero).
 */
function buildObjectiveDownTrace(
  branches: readonly ObjectiveBranch<TaskListRow>[],
  t: Translate,
): Map<string, string> {
  const taskCount = traceTaskCount(t)
  const byObjective = new Map<string, ObjectiveBranch<TaskListRow>[]>()
  for (const branch of branches) {
    if (!branch.objectiveId) continue
    byObjective.set(branch.objectiveId, [...(byObjective.get(branch.objectiveId) ?? []), branch])
  }
  const map = new Map<string, string>()
  for (const [objectiveId, list] of byObjective) {
    const total = list.reduce((sum, branch) => sum + branch.total, 0)
    if (total === 0) continue
    // A child with no work yet is named on the row itself, never in the trace — the trace counts
    // tasks, and "(0)" there would read as a task figure rather than as an empty child.
    const named = list
      .filter((branch) => branch.workLineId !== null && branch.total > 0)
      .map((branch) => `${branch.workLineName} (${branch.total})`)
    map.set(objectiveId, named.length > 0 ? `${taskCount(total)} · ${named.join(', ')}` : taskCount(total))
  }
  return map
}

/**
 * Work-line UP-trace: each work_line's parent objective(s), rendered "Under: Obj (n), … · N tasks".
 * Tasks under a work_line that resolve to NO objective are surfaced as "no parent objective (n)"
 * rather than dropped (FR-422 edge case).
 */
function buildWorkLineUpTrace(
  branches: readonly ObjectiveBranch<TaskListRow>[],
  t: Translate,
): Map<string, string> {
  const taskCount = traceTaskCount(t)
  const byWorkLine = new Map<string, ObjectiveBranch<TaskListRow>[]>()
  for (const branch of branches) {
    if (!branch.workLineId) continue
    byWorkLine.set(branch.workLineId, [...(byWorkLine.get(branch.workLineId) ?? []), branch])
  }
  const map = new Map<string, string>()
  for (const [workLineId, list] of byWorkLine) {
    const withWork = list.filter((branch) => branch.total > 0)
    if (withWork.length === 0) continue
    const segments = withWork.map((branch) => branch.syntheticObjective
      ? t('catalog.trace.noParent', { count: branch.total })
      : `${branch.objectiveName} (${branch.total})`)
    // Census R2 DO-20(a) (objectives F3): the up-trace units its counts exactly like the sibling
    // down-trace ("3 tasks · Menu launch (2)") — a trailing "· N tasks" total gives the bare
    // per-objective "(n)" figures their noun instead of leaving naked numbers (GUARD-R2 class).
    const total = withWork.reduce((sum, branch) => sum + branch.total, 0)
    map.set(workLineId, t('catalog.trace.under', { segments: segments.join(', '), total: taskCount(total) }))
  }
  return map
}

// ── OD-V4-1 H4 relations (bidirectional, on the records themselves — NOT a separate cascade
// route: docs/v4-inheritance.md INC-1). Computed independently from the trace builders above
// (deliberate duplication, not a refactor of them) so the existing FR-422 trace-string tests keep
// asserting the exact literal copy they already pin, unaffected by this additive feature. ───────────

/** Synthetic branch copy, localized once and handed to the ONE shared projection. */
function branchLabels(t: Translate): BranchLabels {
  return { unlinked: t('rollup.branch.unlinked'), noWorkLine: t('rollup.branch.noWorkLine') }
}

const relationTask = (task: { id: string; title: string }) => ({ id: task.id, title: task.title })

/**
 * Objective → its child Projects/Processes via the direct work-line edge + its own tasks.
 *
 * Both this and the Tasks Objective grouping read `buildObjectiveBranches` — the same construction,
 * so the count a catalog row shows and the group a Tasks list shows cannot disagree.
 */
function buildObjectiveRelations(
  branches: readonly ObjectiveBranch<TaskListRow>[],
  objectives: readonly ObjectiveAdminRow[],
): Map<string, CatalogRelations> {
  const map = new Map<string, CatalogRelations>(
    objectives.map((objective) => [objective.id, { groups: [], tasks: [] }]),
  )
  for (const branch of branches) {
    if (branch.objectiveId === null) continue // the (Unlinked) bucket belongs to no catalog row
    const existing = map.get(branch.objectiveId) ?? { groups: [], tasks: [] }
    map.set(branch.objectiveId, {
      groups: [...existing.groups, {
        id: branch.workLineId ?? branch.key,
        name: branch.workLineName,
        taskCount: branch.total,
        done: branch.done,
        total: branch.total,
        ...(branch.syntheticWorkLine ? { synthetic: 'no-work-line' as const } : {}),
        tasks: branch.tasks.map(relationTask),
      }],
      tasks: [...existing.tasks, ...branch.tasks.map(relationTask)],
    })
  }
  return map
}

/** Project/Process → its parent Objective (from the direct work-line edge) + its own tasks. */
function buildWorkLineRelations(
  branches: readonly ObjectiveBranch<TaskListRow>[],
  workLines: readonly WorkLineAdminRow[],
): Map<string, CatalogRelations> {
  const map = new Map<string, CatalogRelations>(
    workLines.map((workLine) => [workLine.id, { groups: [], tasks: [] }]),
  )
  for (const branch of branches) {
    if (branch.workLineId === null) continue // an Objective's own tasks are not a work line's parent
    // A work line with neither a parent Objective nor any task has nothing to drill into — it gets
    // the empty state, not an "(Unlinked)" branch announcing zero of zero.
    if (branch.syntheticObjective && branch.total === 0) continue
    const existing = map.get(branch.workLineId) ?? { groups: [], tasks: [] }
    map.set(branch.workLineId, {
      groups: [...existing.groups, {
        id: branch.objectiveId ?? branch.key,
        name: branch.objectiveName,
        taskCount: branch.total,
        done: branch.done,
        total: branch.total,
        ...(branch.syntheticObjective ? { synthetic: 'unlinked' as const } : {}),
        tasks: branch.tasks.map(relationTask),
      }],
      tasks: [...existing.tasks, ...branch.tasks.map(relationTask)],
    })
  }
  return map
}

// ── Projection (view + name search + work-line type + task coverage; single flat group) ─────────────

function isFiltered(query: CatalogCollectionQuery, visible: number, total: number): boolean {
  // Anything hidden by the current view/search/type/coverage narrows the set — an empty result is
  // then "filtered-empty" (clearable), never the teaching "empty" reserved for a truly empty catalog.
  return visible < total || query.q.trim() !== '' || query.type !== 'all'
    || query.coverage !== 'all' || query.view !== 'active'
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
    if (query.coverage !== 'all') {
      const hasTasks = (data.context.relationsById.get(row.id)?.tasks.length ?? 0) > 0
      if (query.coverage === 'has-tasks' && !hasTasks) return false
      if (query.coverage === 'no-tasks' && hasTasks) return false
    }
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

// ── Descriptor scaffolding (saved views are dormant for a catalog) ─────────────────────────────────

// A catalog has no persisted saved views and no record panel (D-A7: catalog rows manage inline —
// Rename/Archive — with no record door). The engine's descriptor type still requires the saved-view
// seam structurally, so it is present but inert: the toolbar never exposes saved views, so
// buildSpec/applySpec are never reached. The opening seam (`viewer`) is simply omitted — the
// presentations declare `recordOpening: false` and the engine treats a viewer-less descriptor as
// door-less (D-A6 cleanup: the previous inert buildPanelEntry/toCanonicalPage fossil was deleted).
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
  }
}

// ── Objectives (down-trace; no type filter) ────────────────────────────────────────────────────────

export const objectivesCollectionDescriptor = makeCatalogDescriptor({
  id: 'objectives',
  // OD-V4-1 H7: 'coverage' (Has tasks / No tasks) is the one filter dimension Objectives has
  // data for — mirrors Projects/Processes' existing 'type' filter (same CollectionToolbar
  // `filters` mechanism, no second filter grammar).
  filterKeys: ['coverage'],
  load: async () => {
    const [objectives, tasks, workLines] = await Promise.all([
      listObjectivesAll(), listTasks({}), listWorkLinesAll(),
    ])
    const t = translateFor(readPersistedLocale())
    const labels = branchLabels(t)
    const rollup = buildCountRollup({ objectives, workLines, tasks, labels })
    const branches = buildObjectiveBranches({ objectives, workLines, tasks, labels, includeEmptyWorkLines: true })
    return {
      records: objectives.map((o) => ({ id: o.id, name: o.name, archived_at: o.archived_at })),
      context: {
        traceById: buildObjectiveDownTrace(branches, t),
        relationsById: buildObjectiveRelations(branches, objectives),
        relationsKind: 'objective',
        progressById: new Map(rollup.objectives.map((row) => [row.id, row])),
      },
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
    const t = translateFor(readPersistedLocale())
    const labels = branchLabels(t)
    const rollup = buildCountRollup({ objectives, workLines, tasks, labels })
    const branches = buildObjectiveBranches({ objectives, workLines, tasks, labels, includeEmptyWorkLines: true })
    return {
      records: workLines.map((w) => ({ id: w.id, name: w.name, archived_at: w.archived_at, type: w.type })),
      context: {
        traceById: buildWorkLineUpTrace(branches, t),
        relationsById: buildWorkLineRelations(branches, workLines),
        relationsKind: 'work_line',
        progressById: new Map(rollup.workLines.map((row) => [row.id, row])),
      },
    }
  },
})

export const projectsProcessesCatalogActions = {
  create: (name: string, type: CatalogType) => createWorkLine(name, type),
  rename: (id: string, name: string) => renameWorkLine(id, name),
  setArchived: (id: string, archived: boolean) => setWorkLineArchived(id, archived),
}
