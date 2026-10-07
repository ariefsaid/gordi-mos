// The Task collection's canonical query contract — the typed Task query <-> URL schema and its
// vocabulary guard (PIC / Supervisor / Business Unit — never RACI, never a role-free `person`,
// never a Team before Issue 8's team_id contract).
//
// The RecordCollection framework, Task data adapter, and query-state tests all share this module.
// `task-collection-adapter.tsx` owns loading, projection, presentation, and viewer access; it
// re-exports these query types and values only as a compatibility path for existing consumers.
import type { TaskStatus } from '@/lib/db/tasks.types'
import type { TaskCollectionVisibleField } from '@/lib/record-collection/collection-view-spec'
import type {
  CollectionQueryIssue,
  CollectionQueryParse,
  CollectionQuerySchema,
  QueryKey,
} from '@/lib/record-collection/types'

export type TaskCollectionPresentation = 'table' | 'card'
export type TaskCollectionGroup = 'none' | 'status' | 'pic' | 'bu' | 'workline' | 'objective' | 'occurrence'
export type TaskCollectionUnsupportedGroup = 'supervisor'
export type TaskCollectionSort = 'task' | 'status' | 'pic' | 'supervisor' | 'due' | 'activity'
export type TaskCollectionAction = never

export type TaskCollectionView =
  | 'all' | 'my-work' | 'team-work' | 'my-pic' | 'my-supervisor' | 'overdue'

export interface TaskCollectionQuery {
  layout: TaskCollectionPresentation
  /** Ordered visible table fields; decision columns are always present on desktop. */
  visibleFields: readonly TaskCollectionVisibleField[]
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
  'all', 'my-work', 'team-work', 'my-pic', 'my-supervisor', 'overdue',
]
const GROUPS: readonly TaskCollectionGroup[] = ['none', 'status', 'pic', 'bu', 'workline', 'objective', 'occurrence']
const SORTS: readonly TaskCollectionSort[] = ['task', 'status', 'pic', 'supervisor', 'due', 'activity']

/** Legacy Task view aliases that must be rewritten canonically, never kept raw.
 * `followups` is retired, and `completed` now uses the ordinary All + Done status filter. */
const VIEW_ALIASES: Readonly<Record<string, TaskCollectionView>> = {
  mine: 'my-work',
  team: 'team-work',
  followups: 'all',
  completed: 'all',
}

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

export const TASK_DECISION_FIELDS: readonly TaskCollectionVisibleField[] = ['title', 'pic', 'supervisor', 'status', 'due']

/** UI column ids of the desktop Tasks table's single column list (task-columns.tsx, #997).
 * The listed order is the rendered column order; the column-id to URL sort-key map lives in
 * task-columns.tsx. Column SET and ORDER live in TASK_COLUMN_DEFS — this union is
 * their type-level echo, exhaustive-checked by the per-row content dispatch in task-row.tsx. */
export type TaskColumnId =
  | 'task' | 'status' | 'owner' | 'supervisor'
  | 'businessUnit' | 'workline' | 'objective' | 'activity' | 'due'

export const TASK_COLLECTION_NEUTRAL_QUERY: TaskCollectionQuery = {
  layout: 'table',
  visibleFields: TASK_DECISION_FIELDS,
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
  'layout', 'visibleFields', 'view', 'q', 'businessUnitId', 'status', 'picId', 'supervisorId', 'personId',
  'groupBy', 'sort', 'direction', 'includeArchived', 'overdueOnly', 'occurrenceId', 'savedViewId',
]

function parseTaskQuery(params: URLSearchParams): CollectionQueryParse<TaskCollectionQuery> {
  const issues: CollectionQueryIssue[] = []
  const query: TaskCollectionQuery = { ...TASK_COLLECTION_NEUTRAL_QUERY }

  // Team is a record-owning relation, not an arbitrary toolbar filter. The canonical Team-work
  // scope is carried by `view`; reject ad hoc `team`/`teamId` query keys rather than letting them
  // become a second, unsaved filter state.
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
  const legacyCompleted = view === 'completed'
  if (view !== null) {
    const aliased = VIEW_ALIASES[view] ?? view
    if (VIEWS.includes(aliased as TaskCollectionView)) query.view = aliased as TaskCollectionView
    else issues.push({ key: 'view', code: 'invalid-value', value: view })
  }

  const q = params.get('q')
  if (q !== null) query.q = q

  const fields = params.get('fields')
  if (fields !== null) {
    const allowed: readonly TaskCollectionVisibleField[] = ['title', 'status', 'pic', 'supervisor', 'due', 'businessUnit', 'workline', 'objective', 'source', 'activity']
    const parsed = fields.split(',').filter((field): field is TaskCollectionVisibleField => allowed.includes(field as TaskCollectionVisibleField))
    query.visibleFields = [...new Set([...TASK_DECISION_FIELDS, ...parsed])]
  }

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
  if (legacyCompleted) query.status = 'Done'

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
  if (query.visibleFields.join(',') !== TASK_DECISION_FIELDS.join(',')) p.set('fields', query.visibleFields.join(','))
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
  urlKeys: ['layout', 'view', 'q', 'fields', 'bu', 'status', 'pic', 'supervisor', 'person', 'group', 'sort', 'dir', 'archived', 'overdue', 'occurrence', 'saved'],
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
