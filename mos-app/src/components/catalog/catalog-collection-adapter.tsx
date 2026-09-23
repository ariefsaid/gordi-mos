// Catalog adapters for the V3 RecordCollection engine — Projects & Processes and Objectives.
//
// These two management surfaces used to render a pre-redesign bespoke inline-add list (New X / Add X
// / Rename / Archive rows). They now speak the same V3 collection grammar every other collection uses:
// one typed descriptor per domain owns load / filter (view + name search + type) / a single `list`
// presentation, and the shared RecordCollectionSurface + CollectionToolbar render it. Catalog rows
// open their canonical record document through the page-owned shared overlay seam; the descriptor
// itself remains focused on loading and projecting collection data.
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
  buildCascadeGroups, buildCatalogRelationProjection, rollUpCounts,
  type CascadeGroupLabels, type CountRollup, type CatalogRelationship,
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
import { getBusinessUnits, getPeople, type BusinessUnitOption, type PersonOption } from '@/lib/db/directory'
import { listProcessCollectionFacts, type ProcessCollectionFact } from '@/lib/db/work-records'
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
  objectiveId?: string | null
  businessUnitId?: string | null
  accountablePersonId?: string | null
  responsiblePersonId?: string | null
  periodYear?: number | null
  cadenceKind?: ProcessCollectionFact['cadence_kind']
  cadenceActive?: boolean | null
  nextDueDate?: string | null
  currentOccurrence?: ProcessCollectionFact['current_occurrence']
}

export type CatalogView = 'active' | 'archived' | 'all'
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
  /** Stored parent links and Task contributions are presented as distinct relationships. */
  relationship?: CatalogRelationship
  entity?: 'work-line' | 'task' | 'objective'
  objectiveId?: string | null
  workLineId?: string | null
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
  status?: TaskListRow['status']
  lastActivityAt?: string
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
  /** Latest existing Task activity for the row. Optional for compatibility with pure relation tests. */
  lastActivityById?: ReadonlyMap<string, string | null>
  /** Resolved names for the existing BU/person foreign keys; missing values remain honest. */
  businessUnitsById?: ReadonlyMap<string, string>
  peopleById?: ReadonlyMap<string, string>
  businessUnits?: readonly BusinessUnitOption[]
  objectiveOptions?: readonly { value: string; label: string }[]
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

const VIEWS: readonly CatalogView[] = ['active', 'archived', 'all']
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
// Both read the SHARED group projection (#204). They used to walk the raw tasks themselves, which
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
  projection: ReturnType<typeof buildCatalogRelationProjection<TaskListRow>>,
  t: Translate,
): Map<string, string> {
  const taskCount = traceTaskCount(t)
  const map = new Map<string, string>()
  for (const [objectiveId, list] of projection.byObjectiveId) {
    const uniqueTasks = new Set(list.flatMap((group) => group.tasks.map((task) => task.id)))
    const total = uniqueTasks.size
    if (total === 0) continue
    // A child with no work yet is named on the row itself, never in the trace — the trace counts
    // tasks, and "(0)" there would read as a task figure rather than as an empty child.
    const named = list
      .filter((group) => group.entity === 'work-line' && group.total > 0)
      .map((group) => group.relationship === 'contribution'
        ? t('catalog.trace.viaTask', { name: group.name, count: group.total })
        : `${group.name} (${group.total})`)
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
  projection: ReturnType<typeof buildCatalogRelationProjection<TaskListRow>>,
  t: Translate,
): Map<string, string> {
  const taskCount = traceTaskCount(t)
  const map = new Map<string, string>()
  for (const [workLineId, list] of projection.byWorkLineId) {
    const withWork = list.filter((group) => group.total > 0)
    if (withWork.length === 0) continue
    const segments = withWork.map((group) => group.relationship === 'unlinked'
      ? t('catalog.trace.noParent', { count: group.total })
      : group.relationship === 'contribution'
        ? t('catalog.trace.viaTask', { name: group.name, count: group.total })
        : `${group.name} (${group.total})`)
    // Census R2 DO-20(a) (objectives F3): the up-trace units its counts exactly like the sibling
    // down-trace ("3 tasks · Menu launch (2)") — a trailing "· N tasks" total gives the bare
    // per-objective "(n)" figures their noun instead of leaving naked numbers (GUARD-R2 class).
    const total = new Set(withWork.flatMap((group) => group.tasks.map((task) => task.id))).size
    map.set(workLineId, t('catalog.trace.under', { segments: segments.join(', '), total: taskCount(total) }))
  }
  return map
}

// ── OD-V4-1 H4 relations (bidirectional, on the records themselves — NOT a separate cascade
// route: docs/v4-inheritance.md INC-1). Built from the SAME `buildCascadeGroups` projection the
// trace builders above read (#204). An earlier version of this comment declared the two a
// "deliberate duplication, not a refactor" — that was true before #204 and is the opposite of the
// shipped code now, so it is corrected here rather than left for the next reader to preserve: the
// duplication WAS the drift, and re-introducing it puts the trace and the count back to
// disagreeing on the same row ("2 tasks" beside "1 / 4 done"). The FR-422 trace strings are
// unaffected — they are still assembled by the trace builders, off the shared groups. ─────────────

/** Synthetic group copy, localized once and handed to the ONE shared projection. */
function cascadeLabels(t: Translate): CascadeGroupLabels {
  return { unlinked: t('rollup.group.unlinked'), noWorkLine: t('rollup.group.noWorkLine') }
}

const relationTask = (task: Pick<TaskListRow, 'id' | 'title' | 'status' | 'last_activity_at'>) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  lastActivityAt: task.last_activity_at,
})

function catalogRelationsFromProjection(
  projection: ReturnType<typeof buildCatalogRelationProjection<TaskListRow>>,
  ids: readonly string[],
  side: 'objective' | 'work-line',
): Map<string, CatalogRelations> {
  const source = side === 'objective' ? projection.byObjectiveId : projection.byWorkLineId
  return new Map(ids.map((id) => {
    const projected = source.get(id) ?? []
    const groups: CatalogRelationGroup[] = projected.flatMap((item) => {
      // Empty direct children are useful on an Objective; an empty unlinked bucket is not.
      if (item.relationship === 'unlinked' && item.total === 0) return []
      return [{
        id: item.id,
        name: item.name,
        relationship: item.relationship,
        entity: item.entity,
        objectiveId: item.objectiveId,
        workLineId: item.workLineId,
        taskCount: item.total,
        done: item.done,
        total: item.total,
        ...(item.synthetic ? { synthetic: item.synthetic } : {}),
        tasks: item.tasks.map(relationTask),
      }]
    })
    const byId = new Map<string, CatalogRelationTask>()
    for (const item of projected) for (const task of item.tasks) byId.set(task.id, relationTask(task))
    return [id, { groups, tasks: [...byId.values()] }]
  }))
}

function latestActivityById(
  projection: ReturnType<typeof buildCatalogRelationProjection<TaskListRow>>,
  ids: readonly string[],
  kind: CatalogRelationsKind,
): Map<string, string | null> {
  const latest = new Map<string, string | null>(ids.map((id) => [id, null]))
  const related = kind === 'objective' ? projection.byObjectiveId : projection.byWorkLineId
  for (const [id, groups] of related) {
    if (!latest.has(id)) continue
    const current = latest.get(id) ?? null
    for (const group of groups) for (const task of group.tasks) {
      if (!current || task.last_activity_at > current) latest.set(id, task.last_activity_at)
    }
  }
  return latest
}

type ObjectiveCatalogSource = ObjectiveAdminRow & {
  business_unit_id?: string | null
  accountable_person_id?: string | null
  period_year?: number | null
}

type WorkLineCatalogSource = WorkLineAdminRow & {
  business_unit_id?: string | null
  accountable_person_id?: string | null
  responsible_person_id?: string | null
}

async function loadDirectoryForRows(rows: readonly CatalogRow[]): Promise<{
  businessUnitsById: Map<string, string>
  peopleById: Map<string, string>
  businessUnits: BusinessUnitOption[]
}> {
  const businessUnitIds = new Set(rows.map((row) => row.businessUnitId).filter((id): id is string => Boolean(id)))
  const personIds = new Set(rows.flatMap((row) => [row.accountablePersonId, row.responsiblePersonId]).filter((id): id is string => Boolean(id)))
  const [businessUnits, people] = await Promise.all([
    businessUnitIds.size > 0 ? getBusinessUnits() : Promise.resolve([] as BusinessUnitOption[]),
    personIds.size > 0 ? getPeople() : Promise.resolve([] as PersonOption[]),
  ])
  return {
    businessUnitsById: new Map(businessUnits.map((unit) => [unit.id, unit.name])),
    peopleById: new Map(people.map((person) => [person.id, person.full_name])),
    businessUnits,
  }
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

// A catalog has no persisted saved views. The engine's descriptor type still requires the saved-view
// seam structurally, so it is present but inert: the toolbar never exposes saved views, and the page
// owns record opening through the shared Work overlay seam.
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
    // Catalog reads are org-wide; mutation affordances are resolved by the page/record runtime
    // authority seam and the database remains the final write boundary.
    getAccess: () => ({ mode: 'full', visibleActions: [] }),
  }
}

// ── Objectives (down-trace; no type filter) ────────────────────────────────────────────────────────

export const objectivesCollectionDescriptor = makeCatalogDescriptor({
  id: 'objectives',
  // OD-V4-1 H7: 'coverage' (Has tasks / No tasks) is the one filter dimension Objectives has
  // data for — mirrors Projects/Processes' existing 'type' filter (same CollectionToolbar
  // `filters` mechanism, no second filter grammar).
    filterKeys: ['view', 'coverage'],
  load: async () => {
    const [objectives, tasks, workLines] = await Promise.all([
      listObjectivesAll(), listTasks({}), listWorkLinesAll(),
    ])
    const t = translateFor(readPersistedLocale())
    const labels = cascadeLabels(t)
    // ONE construction per load (#204 review, finding 4): the groups are built once and everything
    // on the row — the trace, the relations panel, and the row's own count — is derived from them.
    // Building them twice and counting the tasks again separately is the drift this ticket exists
    // to remove, one layer down.
    const groups = buildCascadeGroups({ objectives, workLines, tasks, labels, includeEmptyWorkLines: true })
    const relationProjection = buildCatalogRelationProjection({ objectives, workLines, tasks, labels })
    const counts = rollUpCounts(groups, { objectives, workLines, labels })
    const records = objectives.map((objective) => {
      const source = objective as ObjectiveCatalogSource
      return {
        id: source.id,
        name: source.name,
        archived_at: source.archived_at,
        businessUnitId: source.business_unit_id ?? null,
        accountablePersonId: source.accountable_person_id ?? null,
        periodYear: source.period_year ?? null,
      }
    })
    const directory = await loadDirectoryForRows(records)
    return {
      records,
      context: {
        traceById: buildObjectiveDownTrace(relationProjection, t),
        relationsById: catalogRelationsFromProjection(relationProjection, objectives.map((row) => row.id), 'objective'),
        relationsKind: 'objective',
        progressById: new Map(counts.objectives.map((row) => [row.id, row])),
        lastActivityById: latestActivityById(relationProjection, objectives.map((row) => row.id), 'objective'),
        ...directory,
        objectiveOptions: objectives.map((objective) => ({ value: objective.id, label: objective.name })),
      },
    }
  },
})

// Lazy wrappers, not direct binding refs: with per-domain module mocks in tests, reading a mutation
// export at module-eval throws when the sibling domain's mock omits it. Deferring to call-time means
// the Objectives page never touches the work-lines mutations, and vice-versa.
export const objectivesCatalogActions = {
  create: (name: string, businessUnitId?: string | null) => businessUnitId
    ? (createObjective as unknown as (value: string, ownership?: { business_unit_id?: string | null }) => Promise<unknown>)(name, { business_unit_id: businessUnitId })
    : (createObjective as unknown as (value: string) => Promise<unknown>)(name),
  rename: (id: string, name: string) => renameObjective(id, name),
  setArchived: (id: string, archived: boolean) => setObjectiveArchived(id, archived),
}

// ── Projects & Processes (up-trace; work-line type filter + tag) ───────────────────────────────────

export const projectsProcessesCollectionDescriptor = makeCatalogDescriptor({
  id: 'work_lines',
  filterKeys: ['view', 'type'],
  load: async () => {
    const [workLines, tasks, objectives] = await Promise.all([
      listWorkLinesAll(), listTasks({}), listObjectivesAll(),
    ])
    const t = translateFor(readPersistedLocale())
    const labels = cascadeLabels(t)
    // One construction per load — see the sibling Objectives descriptor above.
    const groups = buildCascadeGroups({ objectives, workLines, tasks, labels, includeEmptyWorkLines: true })
    const relationProjection = buildCatalogRelationProjection({ objectives, workLines, tasks, labels })
    const counts = rollUpCounts(groups, { objectives, workLines, labels })
    const records = workLines.map((workLine) => {
      const source = workLine as WorkLineCatalogSource
      return {
        id: source.id,
        name: source.name,
        archived_at: source.archived_at,
        type: source.type,
        objectiveId: source.objective_id ?? null,
        businessUnitId: source.business_unit_id ?? null,
        accountablePersonId: source.accountable_person_id ?? null,
        responsiblePersonId: source.responsible_person_id ?? null,
      }
    })
    const processIds = records.filter((record) => record.type === 'process').map((record) => record.id)
    const [directory, processFacts] = await Promise.all([
      loadDirectoryForRows(records),
      listProcessCollectionFacts(processIds),
    ])
    const factsById = new Map(processFacts.map((fact) => [fact.work_line_id, fact]))
    return {
      records: records.map((record) => {
        const fact = factsById.get(record.id)
        return {
          ...record,
          cadenceKind: fact?.cadence_kind ?? null,
          cadenceActive: fact?.cadence_active ?? null,
          nextDueDate: fact?.next_due_date ?? null,
          currentOccurrence: fact?.current_occurrence ?? null,
        }
      }),
      context: {
        traceById: buildWorkLineUpTrace(relationProjection, t),
        relationsById: catalogRelationsFromProjection(relationProjection, workLines.map((row) => row.id), 'work-line'),
        relationsKind: 'work_line',
        progressById: new Map(counts.workLines.map((row) => [row.id, row])),
        lastActivityById: latestActivityById(relationProjection, workLines.map((row) => row.id), 'work_line'),
        ...directory,
        objectiveOptions: objectives.map((objective) => ({ value: objective.id, label: objective.name })),
      },
    }
  },
})

export const projectsProcessesCatalogActions = {
  create: (name: string, type: CatalogType, metadata?: {
    objectiveId?: string | null
    businessUnitId?: string | null
    accountablePersonId?: string | null
    responsiblePersonId?: string | null
  }) => metadata
    ? (createWorkLine as unknown as (value: string, lineType: CatalogType, fields: Record<string, string | null | undefined>) => Promise<unknown>)(name, type, {
        objective_id: metadata.objectiveId,
        business_unit_id: metadata.businessUnitId,
        accountable_person_id: metadata.accountablePersonId,
        responsible_person_id: metadata.responsiblePersonId,
      })
    : (createWorkLine as unknown as (value: string, lineType: CatalogType) => Promise<unknown>)(name, type),
  rename: (id: string, name: string) => renameWorkLine(id, name),
  setArchived: (id: string, archived: boolean) => setWorkLineArchived(id, archived),
}
