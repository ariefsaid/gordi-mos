// Task adapter for the V3 RecordCollection engine — PURE query contract portion (Issue 6, Task 3).
// The full descriptor (load/project/presentations/viewer) is layered on in the migration task; this
// module owns the typed Task query <-> URL schema and the vocabulary guard (PIC / Supervisor /
// Business Unit — never RACI, never a role-free `person`, never a Team before Issue 8's team_id).
import { listTasks, type TaskListFilters } from '@/lib/db/tasks'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { ProcessRunRollup } from '@/lib/db/processes.types'
import { listRunRollups, listTaskDefs } from '@/lib/db/processes'
import { getBusinessUnits, getPeople, listRoleNames } from '@/lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { isOverdue } from '@/lib/due-status'
import { STATUS_ORDER } from './task-formatters'
import { groupTasksByOccurrence } from '@/lib/processes/occurrence-grouping'
import { TaskCardPresentation, TaskTablePresentation } from './task-collection-presentation'
import {
  createCollectionView,
  getCollectionView,
  listCollectionViews,
  renameCollectionView,
  archiveCollectionView,
} from '@/lib/db/user-views-collection'
import {
  parseCollectionViewSpec,
  COLLECTION_VIEW_SPEC_VERSION,
  type CollectionViewSpec,
  type TaskCollectionVisibleField,
} from '@/lib/record-collection/collection-view-spec'
import type {
  CollectionAccess,
  CollectionData,
  CollectionPresentationDescriptor,
  CollectionProjection,
  CollectionQueryIssue,
  CollectionQueryParse,
  CollectionQuerySchema,
  CollectionSavedViewDescriptor,
  CollectionViewStore,
  QueryKey,
  RecordCollectionDescriptor,
  RecordViewerOpeningContract,
} from '@/lib/record-collection/types'

export type TaskCollectionPresentation = 'table' | 'card'
export type TaskCollectionGroup = 'none' | 'status' | 'pic' | 'bu' | 'workline' | 'occurrence'
export type TaskCollectionUnsupportedGroup = 'supervisor'
export type TaskCollectionSort = 'task' | 'status' | 'pic' | 'supervisor' | 'due' | 'activity'
export type TaskCollectionAction = never

// §Task-11 (Issue-8 gate): there is NO `team` view. The legacy Team-work chip is removed from the
// Task descriptor and `view=team` is rejected until Issue 8's real Task team_id contract lands.
export type TaskCollectionView =
  | 'all' | 'my-work' | 'my-pic' | 'my-supervisor' | 'overdue' | 'followups'

export interface TaskCollectionQuery {
  layout: TaskCollectionPresentation
  view: TaskCollectionView
  q: string
  businessUnitId: string | null
  status: TaskStatus | null
  picId: string | null
  supervisorId: string | null
  /** The single "Person" filter (adopted mockup): matches a person as PIC *or* Supervisor. */
  personId: string | null
  groupBy: TaskCollectionGroup
  sort: TaskCollectionSort
  direction: 'ascending' | 'descending'
  includeArchived: boolean
  overdueOnly: boolean
  occurrenceId: string | null
  savedViewId: string | null
}

const LAYOUTS: readonly TaskCollectionPresentation[] = ['table', 'card']
const VIEWS: readonly TaskCollectionView[] = [
  'all', 'my-work', 'my-pic', 'my-supervisor', 'overdue', 'followups',
]
const GROUPS: readonly TaskCollectionGroup[] = ['none', 'status', 'pic', 'bu', 'workline', 'occurrence']
const SORTS: readonly TaskCollectionSort[] = ['task', 'status', 'pic', 'supervisor', 'due', 'activity']

/** Legacy Task saved-view chip aliases that must be rewritten canonically, never kept raw. */
const VIEW_ALIASES: Readonly<Record<string, TaskCollectionView>> = { mine: 'my-work' }

/** URL slug <-> TaskStatus. The DB stores capitalized status; the URL uses a stable slug. */
const STATUS_BY_SLUG: Readonly<Record<string, TaskStatus>> = {
  open: 'Open',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}
const SLUG_BY_STATUS: Readonly<Record<TaskStatus, string>> = {
  Open: 'open',
  'In Progress': 'in-progress',
  Blocked: 'blocked',
  Done: 'done',
}

export const TASK_COLLECTION_NEUTRAL_QUERY: TaskCollectionQuery = {
  layout: 'table',
  view: 'all',
  q: '',
  businessUnitId: null,
  status: null,
  picId: null,
  supervisorId: null,
  personId: null,
  groupBy: 'none',
  sort: 'due',
  direction: 'ascending',
  includeArchived: false,
  overdueOnly: false,
  occurrenceId: null,
  savedViewId: null,
}

const TASK_QUERY_KEYS: readonly QueryKey<TaskCollectionQuery>[] = [
  'layout', 'view', 'q', 'businessUnitId', 'status', 'picId', 'supervisorId', 'personId',
  'groupBy', 'sort', 'direction', 'includeArchived', 'overdueOnly', 'occurrenceId', 'savedViewId',
]

function parseTaskQuery(params: URLSearchParams): CollectionQueryParse<TaskCollectionQuery> {
  const issues: CollectionQueryIssue[] = []
  const query: TaskCollectionQuery = { ...TASK_COLLECTION_NEUTRAL_QUERY }

  // Pre-Issue-8 Team guard: a Task has business_unit_id, never team_id. Reject before it can
  // enter collection state, and never alias it to Business Unit.
  const teamRaw = params.get('team') ?? params.get('teamId')
  if (teamRaw !== null) {
    issues.push({ key: 'team', code: 'invalid-value', value: teamRaw })
  }

  const layout = params.get('layout')
  if (layout !== null) {
    if (LAYOUTS.includes(layout as TaskCollectionPresentation)) query.layout = layout as TaskCollectionPresentation
    else issues.push({ key: 'layout', code: 'invalid-value', value: layout })
  }

  const view = params.get('view')
  if (view !== null) {
    const aliased = VIEW_ALIASES[view] ?? view
    if (VIEWS.includes(aliased as TaskCollectionView)) query.view = aliased as TaskCollectionView
    else issues.push({ key: 'view', code: 'invalid-value', value: view })
  }

  const q = params.get('q')
  if (q !== null) query.q = q

  query.businessUnitId = params.get('bu')
  query.picId = params.get('pic')
  query.supervisorId = params.get('supervisor')
  query.personId = params.get('person')
  query.occurrenceId = params.get('occurrence')
  query.savedViewId = params.get('saved')

  // Arriving with `?occurrence=<runId>` (the Café panel deep-link, FR-704) lands on the Occurrence
  // grouping so the run's caption is in view — reusing the same group-by, not a new mechanism. An
  // explicit `group` param below still wins (parsed after this).
  if (query.occurrenceId) query.groupBy = 'occurrence'

  const status = params.get('status')
  if (status !== null) {
    const mapped = STATUS_BY_SLUG[status.toLowerCase()]
    if (mapped) query.status = mapped
    else issues.push({ key: 'status', code: 'invalid-value', value: status })
  }

  const group = params.get('group')
  if (group !== null) {
    if (group === 'supervisor') {
      // Supervisor grouping is an explicit unsupported capability until a typed renderer exists.
      issues.push({ key: 'group', code: 'unsupported-by-presentation', value: 'supervisor' })
    } else if (GROUPS.includes(group as TaskCollectionGroup)) {
      query.groupBy = group as TaskCollectionGroup
    } else {
      issues.push({ key: 'group', code: 'invalid-value', value: group })
    }
  }

  const sort = params.get('sort')
  if (sort !== null) {
    if (SORTS.includes(sort as TaskCollectionSort)) query.sort = sort as TaskCollectionSort
    else issues.push({ key: 'sort', code: 'invalid-value', value: sort })
  }

  const dir = params.get('dir')
  if (dir !== null) {
    if (dir === 'ascending' || dir === 'descending') query.direction = dir
    else issues.push({ key: 'direction', code: 'invalid-value', value: dir })
  }

  if (params.get('archived') === '1') query.includeArchived = true
  if (params.get('overdue') === '1') query.overdueOnly = true

  if (issues.length > 0) return { ok: false, query, issues }
  return { ok: true, query }
}

function serializeTaskQuery(query: TaskCollectionQuery): URLSearchParams {
  const p = new URLSearchParams()
  // Table is the neutral live presentation; omit it from the route so canonical Task links stay
  // `/work/tasks/:id` while Card remains shareable as an explicit layout.
  if (query.layout !== TASK_COLLECTION_NEUTRAL_QUERY.layout) p.set('layout', query.layout)
  if (query.view !== 'all') p.set('view', query.view)
  if (query.q) p.set('q', query.q)
  if (query.businessUnitId) p.set('bu', query.businessUnitId)
  if (query.status) p.set('status', SLUG_BY_STATUS[query.status])
  if (query.picId) p.set('pic', query.picId)
  if (query.supervisorId) p.set('supervisor', query.supervisorId)
  if (query.personId) p.set('person', query.personId)
  if (query.groupBy !== 'none') p.set('group', query.groupBy)
  if (query.sort !== TASK_COLLECTION_NEUTRAL_QUERY.sort) p.set('sort', query.sort)
  if (query.direction !== TASK_COLLECTION_NEUTRAL_QUERY.direction) p.set('dir', query.direction)
  if (query.includeArchived) p.set('archived', '1')
  if (query.overdueOnly) p.set('overdue', '1')
  if (query.occurrenceId) p.set('occurrence', query.occurrenceId)
  if (query.savedViewId) p.set('saved', query.savedViewId)
  return p
}

export const taskCollectionQuery: CollectionQuerySchema<TaskCollectionQuery> = {
  keys: TASK_QUERY_KEYS,
  neutral: TASK_COLLECTION_NEUTRAL_QUERY,
  parse: (params) => parseTaskQuery(params),
  serialize: serializeTaskQuery,
  normalize: (query) => query,
}

// Task Table and Card are fully compatible: both expose group, sort, PIC, Supervisor,
// and saved-view. There is no disabled Board/Calendar presentation.
export const taskPresentationCompatibleKeys: Readonly<
  Record<TaskCollectionPresentation, readonly QueryKey<TaskCollectionQuery>[]>
> = {
  table: TASK_QUERY_KEYS,
  card: TASK_QUERY_KEYS,
}

// ── Typed collection record (Issue 6) ────────────────────────────────────────────────────────────
// The Task collection UI contract speaks in PIC / Supervisor, never the raw storage columns. The
// raw `responsible_person_id`/`accountable_person_id` names are adapted EXACTLY ONCE here, in
// `toTaskCollectionRecord`, and never leave this boundary (plan §Domain contracts — Tasks).
export interface TaskCollectionRecord {
  id: string
  title: string
  status: TaskStatus
  picId: string
  supervisorId: string
  businessUnitId: string
  dueDate: string | null
  workLineId: string | null
  objectiveId: string | null
  lastActivityAt: string
  archivedAt: string | null
  processRunId: string | null
  generatedFromTaskDefinitionId: string | null
}

/** The ONE raw-column mapping: `responsible_person_id → picId`, `accountable_person_id → supervisorId`.
 *  Business Unit is rendered honestly from `business_unit_id`; NO Task `team_id` is fabricated
 *  (Issue 8 owns the real Team contract). */
export function toTaskCollectionRecord(row: TaskListRow): TaskCollectionRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    picId: row.responsible_person_id,
    supervisorId: row.accountable_person_id,
    businessUnitId: row.business_unit_id,
    dueDate: row.due_date,
    workLineId: row.work_line_id,
    objectiveId: row.objective_id,
    lastActivityAt: row.last_activity_at,
    archivedAt: row.archived_at,
    processRunId: row.process_run_id ?? null,
    generatedFromTaskDefinitionId: row.generated_from_task_def_id ?? null,
  }
}

/**
 * Display + projection context for the Task collection. Owned by `load()` (the descriptor owns
 * data). Beyond the plan's baseline (business units, people, work-line/objective maps, viewerId,
 * statusOverrides, refresh) it carries the occurrence roll-ups + PIC provenance the pure projector
 * needs to caption occurrence groups — fetched by `load()` only when `groupBy === 'occurrence'`
 * (Director ruling 1, 2026-07-21). The assign-dialog interaction stays in the workspace and is
 * wired to `refresh`.
 */
export interface TaskCollectionContext {
  businessUnits: readonly BusinessUnitOption[]
  people: readonly PersonOption[]
  businessUnitNamesById: ReadonlyMap<string, string>
  personNamesById: ReadonlyMap<string, string>
  workLinesById: ReadonlyMap<string, string>
  workLineTypeById: ReadonlyMap<string, 'project' | 'process'>
  objectivesById: ReadonlyMap<string, string>
  /** Occurrence roll-ups keyed by process_run_id (only populated for occurrence grouping). */
  runRollupsByRunId: ReadonlyMap<string, ProcessRunRollup>
  /** task_def_id → binding pic_role NAME, backing the "via <role>" PIC provenance line. */
  provenanceByTaskDefId: ReadonlyMap<string, string>
  /* upgrade path: goes away when the render stack converts to TaskCollectionRecord and the table moves into presentations.render (per the standing technical RATIFY) — until then this is the sanctioned bridge keeping one loader */
  rowsById: ReadonlyMap<string, TaskListRow>
  viewerId: string | null
  /** Optimistic per-row status overrides fed by an open drawer (AC-103). */
  statusOverrides: ReadonlyMap<string, TaskStatus>
  /** The reference clock for overdue computation (kept in context so `project` stays pure). */
  now: Date
  refresh: () => void
}

/** A typed Task collection group — the projected grouping shape (never the raw-row group). */
export interface TaskRenderGroup {
  key: string
  label: string
  rows: readonly TaskCollectionRecord[]
  overdue: number
  /** The "+ Add task" create-route prefill (e.g. "r=<personId>", "bu=<buId>"). */
  prefillParam: string
  /** Only for `groupBy === 'workline'`: the type tag; null = the "No work-line" trailing group. */
  workLineType?: 'project' | 'process' | null
  /** Only for a spawned occurrence group: its derived roll-up counts. */
  occurrenceRollup?: { total: number; done: number; overdue: number; pendingUnresolved: number }
}

// ── Pure projector ───────────────────────────────────────────────────────────────────────────────
// Reproduces the current TasksWorkspace filtering + sorting + grouping (incl. occurrence roll-ups,
// empty-group injection, and the person-filtered work-line suppression) as ONE pure function over
// loaded rows + context. `groupBy === 'pic'` is the explicit mapping of the legacy one-person
// renderer; `groupBy === 'supervisor'` is rejected on parse (never reaches here).

/** The overdue shape `isOverdue` needs, derived from a typed collection record. */
function isRecordOverdue(r: TaskCollectionRecord, now: Date): boolean {
  return isOverdue({ status: r.status, due_date: r.dueDate, archived_at: r.archivedAt }, now)
}

/** Client-side filter predicate (view scope · PIC · Supervisor · BU · Status · search · overdue). */
function matchesTaskFilters(r: TaskCollectionRecord, query: TaskCollectionQuery, viewerId: string | null, now: Date): boolean {
  if (query.view === 'my-work' && viewerId && r.picId !== viewerId && r.supervisorId !== viewerId) return false
  if (query.view === 'my-pic' && viewerId && r.picId !== viewerId) return false
  if (query.view === 'my-supervisor' && viewerId && r.supervisorId !== viewerId) return false
  if (query.picId && r.picId !== query.picId) return false
  if (query.supervisorId && r.supervisorId !== query.supervisorId) return false
  // The single "Person" filter matches PIC *or* Supervisor (the person's whole involvement).
  if (query.personId && r.picId !== query.personId && r.supervisorId !== query.personId) return false
  if (query.businessUnitId && r.businessUnitId !== query.businessUnitId) return false
  if (query.status && r.status !== query.status) return false
  if (query.q && !r.title.toLowerCase().includes(query.q.toLowerCase())) return false
  const overdueOnly = query.overdueOnly || query.view === 'overdue'
  if (overdueOnly && !isRecordOverdue(r, now)) return false
  return true
}

/** True when any client-side filter is populated (drives empty vs filtered-empty). */
function taskFiltersAreActive(query: TaskCollectionQuery): boolean {
  return (
    query.q !== '' ||
    query.businessUnitId !== null ||
    query.status !== null ||
    query.picId !== null ||
    query.supervisorId !== null ||
    query.personId !== null ||
    query.overdueOnly ||
    query.view === 'my-work' ||
    query.view === 'my-pic' ||
    query.view === 'my-supervisor' ||
    query.view === 'overdue' ||
    query.view === 'followups'
  )
}

function sortTaskRecords(
  rows: readonly TaskCollectionRecord[],
  query: TaskCollectionQuery,
  personNamesById: ReadonlyMap<string, string>,
): TaskCollectionRecord[] {
  const dir = query.direction === 'descending' ? -1 : 1
  const name = (id: string) => personNamesById.get(id) ?? ''
  const cmp = (a: TaskCollectionRecord, b: TaskCollectionRecord): number => {
    switch (query.sort) {
      case 'task': return a.title.localeCompare(b.title)
      case 'status': return a.status.localeCompare(b.status)
      case 'pic': return name(a.picId).localeCompare(name(b.picId))
      case 'supervisor': return name(a.supervisorId).localeCompare(name(b.supervisorId))
      // Activity's natural order is most-recent-first (matches the legacy TanStack sortingFn).
      case 'activity': return b.lastActivityAt.localeCompare(a.lastActivityAt)
      case 'due':
      default: {
        const ad = a.dueDate, bd = b.dueDate
        if (!ad && !bd) return 0
        if (!ad) return 1
        if (!bd) return -1
        return ad < bd ? -1 : ad > bd ? 1 : 0
      }
    }
  }
  return [...rows].sort((a, b) => dir * cmp(a, b))
}

function countOverdue(rows: readonly TaskCollectionRecord[], now: Date): number {
  return rows.filter((r) => isRecordOverdue(r, now)).length
}

/**
 * Build the ordered, typed group list from the filtered + sorted rows, reproducing every legacy
 * branch: flat, status (fixed 4-status order), pic (empty groups from the full people directory),
 * bu (empty groups from the full BU directory), workline (alpha + trailing "No work-line", with
 * zero-count suppression under an explicit PIC filter), and occurrence (run-captioned roll-up
 * groups + the ad-hoc catch-all tail).
 */
export function buildTaskGroups(
  rows: readonly TaskCollectionRecord[],
  query: TaskCollectionQuery,
  ctx: TaskCollectionContext,
): TaskRenderGroup[] {
  const now = ctx.now
  const mk = (
    key: string,
    label: string,
    prefillParam: string,
    groupRows: readonly TaskCollectionRecord[],
    extra?: Pick<TaskRenderGroup, 'workLineType' | 'occurrenceRollup'>,
  ): TaskRenderGroup => ({
    key,
    label,
    rows: groupRows,
    overdue: countOverdue(groupRows, now),
    prefillParam,
    ...extra,
  })

  if (query.groupBy === 'none') {
    return [mk('__flat__', '', '', rows)]
  }

  if (query.groupBy === 'occurrence') {
    const captionByRunId: Record<string, string> = {}
    for (const [runId, rollup] of ctx.runRollupsByRunId) captionByRunId[runId] = rollup.caption
    const groupable = rows.map((r) => ({ ...r, process_run_id: r.processRunId }))
    const { groups: occGroups, ungrouped } = groupTasksByOccurrence(groupable, captionByRunId)
    const named: TaskRenderGroup[] = occGroups.map((g) => {
      const rollup = ctx.runRollupsByRunId.get(g.runId)
      const groupRows = g.tasks.map(stripGroupable)
      return mk(g.runId, g.caption, '', groupRows, {
        occurrenceRollup: rollup
          ? { total: rollup.total, done: rollup.done, overdue: rollup.overdue, pendingUnresolved: rollup.pending_unresolved }
          : undefined,
      })
    })
    if (ungrouped.length > 0) {
      // Ad-hoc Tasks (no run) keep a trailing catch-all group; the consumer localizes its label
      // off the stable key (never forced under an occurrence caption — B5 / OD-P3-6).
      named.push(mk(NO_OCCURRENCE_GROUP_KEY, '', '', ungrouped.map(stripGroupable)))
    }
    return named
  }

  if (query.groupBy === 'status') {
    // Status label is the raw status; the consumer localizes it. Fixed 4-status order (OD-P3-6).
    const byStatus = partition(rows, (r) => r.status)
    return STATUS_ORDER.map((s) => mk(s, s, '', byStatus.get(s) ?? []))
  }

  if (query.groupBy === 'pic') {
    const byPic = partition(rows, (r) => r.picId)
    return ctx.people.map((p) => mk(p.id, p.full_name, `r=${p.id}`, byPic.get(p.id) ?? []))
  }

  if (query.groupBy === 'bu') {
    const byBu = partition(rows, (r) => r.businessUnitId)
    return ctx.businessUnits.map((b) => mk(b.id, b.name, `bu=${b.id}`, byBu.get(b.id) ?? []))
  }

  // workline
  const byWl = partition(rows, (r) => r.workLineId ?? NO_WORKLINE_GROUP_KEY)
  const suppressZeroWhenPic = query.picId !== null || query.personId !== null
  const named: TaskRenderGroup[] = []
  for (const [id, name] of ctx.workLinesById) {
    const groupRows = byWl.get(id) ?? []
    if (suppressZeroWhenPic && groupRows.length === 0) continue
    named.push(mk(id, name, '', groupRows, { workLineType: ctx.workLineTypeById.get(id) ?? null }))
  }
  const noGroupRows = byWl.get(NO_WORKLINE_GROUP_KEY) ?? []
  if (!suppressZeroWhenPic || noGroupRows.length > 0) {
    // Label localized by the consumer off the stable key; type tag null (no tag rendered).
    named.push(mk(NO_WORKLINE_GROUP_KEY, '', '', noGroupRows, { workLineType: null }))
  }
  return named
}

export const NO_WORKLINE_GROUP_KEY = '__no_workline__'
export const NO_OCCURRENCE_GROUP_KEY = '__no_occurrence__'

function stripGroupable(r: TaskCollectionRecord & { process_run_id: string | null }): TaskCollectionRecord {
  const { process_run_id: _drop, ...rest } = r
  void _drop
  return rest
}

function partition<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const item of items) {
    const k = keyOf(item)
    const arr = m.get(k)
    if (arr) arr.push(item)
    else m.set(k, [item])
  }
  return m
}

/**
 * The typed Task collection projection: filter → sort → group. `visibleRecordsAreFiltered` is true
 * when any client filter is active, so the engine derives filtered-empty (a filter hid every row)
 * distinctly from empty (no rows at all).
 */
export function projectTaskCollection(
  data: CollectionData<TaskCollectionRecord, TaskCollectionContext>,
  query: TaskCollectionQuery,
): CollectionProjection<TaskCollectionRecord, TaskRenderGroup> {
  const ctx = data.context
  const withOverrides = ctx.statusOverrides.size === 0
    ? data.records
    : data.records.map((r) => (ctx.statusOverrides.has(r.id) ? { ...r, status: ctx.statusOverrides.get(r.id)! } : r))
  const filtered = withOverrides.filter((r) => matchesTaskFilters(r, query, ctx.viewerId, ctx.now))
  const sorted = sortTaskRecords(filtered, query, ctx.personNamesById)
  const groups = buildTaskGroups(sorted, query, ctx)
  return {
    visibleRecords: sorted,
    groups,
    totalRecords: data.records.length,
    visibleRecordsAreFiltered: taskFiltersAreActive(query),
  }
}

// ── Persisted saved-view mapping (Work context) ───────────────────────────────────────────────────
// Built-in chips live in the URL `view` key (owned by the query schema); the persisted DAL lifecycle
// below is wired but has NO save/apply UI in this slice (the later saved-views.tsx run owns that).
const TASK_VISIBLE_FIELDS: readonly TaskCollectionVisibleField[] = [
  'title', 'status', 'pic', 'supervisor', 'due', 'businessUnit', 'workline', 'objective', 'source', 'activity',
]

/** A CollectionViewStore backed by the typed `mos.user_views` collection DAL (Tasks 8/9). */
const taskCollectionViewStore: CollectionViewStore = {
  list: (collectionId) => listCollectionViews(collectionId),
  get: (id) => getCollectionView(id),
  create: ({ name, scope, spec }) => createCollectionView({ name, scope, spec }),
  rename: (id, name) => renameCollectionView(id, name),
  archive: (id) => archiveCollectionView(id),
}

/** Map the live typed query + presentation into a persisted, schema-versioned Task view spec. */
function buildTaskViewSpec(args: {
  query: TaskCollectionQuery
  presentation: TaskCollectionPresentation
}): CollectionViewSpec {
  const { query, presentation } = args
  return {
    kind: 'collection',
    version: COLLECTION_VIEW_SPEC_VERSION,
    collectionId: 'tasks',
    domain: 'tasks',
    presentation,
    visibleFields: TASK_VISIBLE_FIELDS,
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

/** Reverse of buildTaskViewSpec: a validated spec → the typed query + presentation to apply. */
function applyTaskViewSpec(spec: CollectionViewSpec): {
  query: TaskCollectionQuery
  presentation: TaskCollectionPresentation
} {
  if (spec.collectionId !== 'tasks') {
    // The engine only ever hands a validated Tasks spec here; guard keeps the type narrow.
    return { query: { ...TASK_COLLECTION_NEUTRAL_QUERY }, presentation: 'table' }
  }
  const query: TaskCollectionQuery = {
    ...TASK_COLLECTION_NEUTRAL_QUERY,
    ...spec.query,
    layout: spec.presentation,
    groupBy: spec.grouping ? spec.grouping.field : 'none',
    sort: spec.sort.field,
    direction: spec.sort.direction,
  }
  return { query, presentation: spec.presentation }
}

export const taskCollectionSavedViews: CollectionSavedViewDescriptor<
  TaskCollectionQuery,
  TaskCollectionPresentation
> = {
  enabled: true,
  store: taskCollectionViewStore,
  operations: ['save', 'apply', 'rename', 'archive'],
  buildSpec: buildTaskViewSpec,
  parseAndValidate: (input) => parseCollectionViewSpec(input),
  applySpec: applyTaskViewSpec,
}

// ── Presentations ─────────────────────────────────────────────────────────────────────────────────
// The descriptor owns the real Task presentations. Their rendering delegates to the mature E7
// table/card stack through a typed runtime context; it never falls back to a generic collection
// row or a second query/loader implementation.

// Capability KEYS are query keys (like the Inbox fixture), not the value unions. `sort`/`groupBy`
// are the single sortable/groupable query keys; their supported VALUE sets live in the toolbar.
const TASK_CAPABILITIES = {
  search: true,
  filterKeys: ['businessUnitId', 'status', 'picId', 'supervisorId', 'overdueOnly'] as const,
  sortKeys: ['sort'] as const,
  groupKeys: ['groupBy'] as const,
  savedViews: true,
  selection: false,
  recordOpening: true,
  bulkActions: [] as const,
}

type TaskPresentationDescriptor = CollectionPresentationDescriptor<
  TaskCollectionRecord,
  string,
  TaskCollectionQuery,
  CollectionProjection<TaskCollectionRecord, TaskRenderGroup>,
  TaskCollectionContext,
  TaskCollectionAction,
  TaskCollectionPresentation
>

const taskTablePresentation: TaskPresentationDescriptor = {
  id: 'table',
  label: 'Table',
  compatibleQueryKeys: TASK_QUERY_KEYS,
  capabilities: {
    ...TASK_CAPABILITIES,
    filterKeys: [...TASK_CAPABILITIES.filterKeys],
    sortKeys: [...TASK_CAPABILITIES.sortKeys],
    groupKeys: [...TASK_CAPABILITIES.groupKeys],
    bulkActions: [...TASK_CAPABILITIES.bulkActions],
  },
  render: (props) => <TaskTablePresentation {...props} />,
}

const taskCardPresentation: TaskPresentationDescriptor = {
  id: 'card',
  label: 'Card',
  compatibleQueryKeys: TASK_QUERY_KEYS,
  capabilities: {
    ...TASK_CAPABILITIES,
    filterKeys: [...TASK_CAPABILITIES.filterKeys],
    sortKeys: [...TASK_CAPABILITIES.sortKeys],
    groupKeys: [...TASK_CAPABILITIES.groupKeys],
    bulkActions: [...TASK_CAPABILITIES.bulkActions],
  },
  render: (props) => <TaskCardPresentation {...props} />,
}

// ── Load ────────────────────────────────────────────────────────────────────────────────────────
function toNameMap<T extends { id: string }>(rows: readonly T[], nameOf: (r: T) => string): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of rows) m.set(r.id, nameOf(r))
  return m
}

async function loadTaskCollection(args: {
  query: TaskCollectionQuery
  viewerId: string | null
}): Promise<CollectionData<TaskCollectionRecord, TaskCollectionContext>> {
  // BU/Status filtering is client-side in the projector (honest empty-vs-filtered-empty); only
  // `includeArchived` is a server concern (archived rows are excluded by default).
  const filters: TaskListFilters = { includeArchived: args.query.includeArchived }
  const [rows, businessUnits, people, objectives, workLines] = await Promise.all([
    listTasks(filters),
    getBusinessUnits(),
    getPeople(),
    listObjectives().catch(() => []),
    listWorkLines().catch(() => []),
  ])
  const records = rows.map(toTaskCollectionRecord)

  // Occurrence roll-ups + PIC provenance are fetched ONLY for the occurrence grouping (Director
  // ruling 1) — the exact runs/defs in view, mirroring the legacy useOccurrenceGroups fetch scope.
  let runRollupsByRunId: ReadonlyMap<string, ProcessRunRollup> = new Map()
  let provenanceByTaskDefId: ReadonlyMap<string, string> = new Map()
  if (args.query.groupBy === 'occurrence') {
    const runIds = [...new Set(records.map((r) => r.processRunId).filter((id): id is string => Boolean(id)))].sort()
    if (runIds.length > 0) {
      const rollups = await listRunRollups(runIds).catch(() => [])
      runRollupsByRunId = new Map(rollups.map((r) => [r.process_run_id, r]))
    }
    const defIds = [...new Set(records.map((r) => r.generatedFromTaskDefinitionId).filter((id): id is string => Boolean(id)))].sort()
    if (defIds.length > 0) {
      const defs = await listTaskDefs(defIds).catch(() => [])
      const roleIds = [...new Set(defs.map((d) => d.pic_role_id).filter((id): id is string => Boolean(id)))]
      if (roleIds.length > 0) {
        const roles = await listRoleNames(roleIds).catch(() => [])
        const nameByRoleId = new Map(roles.map((role) => [role.id, role.name]))
        const provenance = new Map<string, string>()
        for (const def of defs) {
          const roleName = def.pic_role_id ? nameByRoleId.get(def.pic_role_id) : undefined
          if (roleName) provenance.set(def.id, roleName)
        }
        provenanceByTaskDefId = provenance
      }
    }
  }

  const context: TaskCollectionContext = {
    businessUnits,
    people,
    businessUnitNamesById: toNameMap(businessUnits, (b) => b.name),
    personNamesById: toNameMap(people, (p) => p.full_name),
    workLinesById: toNameMap(workLines, (w) => w.name),
    workLineTypeById: new Map(workLines.map((w) => [w.id, w.type])),
    objectivesById: toNameMap(objectives, (o) => o.name),
    runRollupsByRunId,
    provenanceByTaskDefId,
    rowsById: new Map(rows.map((row) => [row.id, row])),
    viewerId: args.viewerId,
    // Optimistic status overrides + refresh stay workspace-owned (Option B non-collection concerns);
    // load seeds them empty/no-op so the projection is a pure function of the fetched rows.
    statusOverrides: new Map(),
    now: new Date(),
    refresh: () => {},
  }
  return { records, context }
}

// ── Access + viewer opening seam ──────────────────────────────────────────────────────────────────
function getTaskAccess(): CollectionAccess<TaskCollectionAction> {
  // Tasks are org-readable and member-writable (RLS is the real gate). TaskCollectionAction = never,
  // so no collection-level bulk mutation is exposed.
  return { mode: 'full', visibleActions: [] }
}

/**
 * The Issue-5 opening seam. `toCanonicalPage` is the real full-page escalation (`/work/tasks/:id`
 * preserving the collection's search). `buildPanelEntry` yields the overlay entry; under Option B the
 * LIVE Task opening stays route/Link-based in the workspace this slice, so the entry's `content` is
 * null (the Issue-5 RecordViewer renderer owns panel content) and `pageTo` carries the canonical route.
 */
const taskViewerOpeningContract: RecordViewerOpeningContract<TaskCollectionRecord> = {
  recordType: 'task',
  buildPanelEntry: (record, source) => ({
    key: `task:${record.id}`,
    owner: 'tasks',
    tenant: 'record',
    label: record.title,
    pageTo: { pathname: `/work/tasks/${record.id}`, search: source.search },
    content: null,
  }),
  toCanonicalPage: (recordId, source) => ({ pathname: `/work/tasks/${recordId}`, search: source.search }),
}

// ── The descriptor ────────────────────────────────────────────────────────────────────────────────
export const taskCollectionDescriptor: RecordCollectionDescriptor<
  TaskCollectionRecord,
  string,
  TaskCollectionQuery,
  TaskCollectionContext,
  TaskRenderGroup,
  TaskCollectionAction,
  TaskCollectionPresentation
> = {
  id: 'tasks',
  defaultPresentation: 'table',
  query: taskCollectionQuery,
  savedViews: taskCollectionSavedViews,
  presentations: { table: taskTablePresentation, card: taskCardPresentation },
  // Only `includeArchived` (server-side row scope) and `groupBy` (occurrence roll-up/provenance
  // fetch) change what `load()` returns; every other filter/sort/view is applied client-side in the
  // projector, so those changes reproject the snapshot without refetching tasks and the lookup
  // tables (business units, people, objectives, work-lines).
  loadKeys: ['includeArchived', 'groupBy'],
  load: loadTaskCollection,
  project: (data, query) => projectTaskCollection(data, query),
  getId: (record) => record.id,
  getAccess: getTaskAccess,
  viewer: taskViewerOpeningContract,
}
