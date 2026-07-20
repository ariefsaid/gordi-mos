// Task adapter for the V3 RecordCollection engine — PURE query contract portion (Issue 6, Task 3).
// The full descriptor (load/project/presentations/viewer) is layered on in the migration task; this
// module owns the typed Task query <-> URL schema and the vocabulary guard (PIC / Supervisor /
// Business Unit — never RACI, never a role-free `person`, never a Team before Issue 8's team_id).
import type { TaskStatus } from '@/lib/db/tasks.types'
import type {
  CollectionQueryIssue,
  CollectionQueryParse,
  CollectionQuerySchema,
  QueryKey,
} from '@/lib/record-collection/types'

export type TaskCollectionPresentation = 'table' | 'card'
export type TaskCollectionGroup = 'none' | 'status' | 'pic' | 'bu' | 'workline' | 'occurrence'
export type TaskCollectionUnsupportedGroup = 'supervisor'
export type TaskCollectionSort = 'task' | 'status' | 'pic' | 'supervisor' | 'due' | 'activity'
export type TaskCollectionAction = never

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
  groupBy: 'none',
  sort: 'due',
  direction: 'ascending',
  includeArchived: false,
  overdueOnly: false,
  occurrenceId: null,
  savedViewId: null,
}

const TASK_QUERY_KEYS: readonly QueryKey<TaskCollectionQuery>[] = [
  'layout', 'view', 'q', 'businessUnitId', 'status', 'picId', 'supervisorId',
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
  query.occurrenceId = params.get('occurrence')
  query.savedViewId = params.get('saved')

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
  p.set('layout', query.layout)
  if (query.view !== 'all') p.set('view', query.view)
  if (query.q) p.set('q', query.q)
  if (query.businessUnitId) p.set('bu', query.businessUnitId)
  if (query.status) p.set('status', SLUG_BY_STATUS[query.status])
  if (query.picId) p.set('pic', query.picId)
  if (query.supervisorId) p.set('supervisor', query.supervisorId)
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

// Task Table and Card are fully compatible: both expose group, sort, PIC, Supervisor, saved-view,
// and selection. There is no disabled Board/Calendar presentation.
export const taskPresentationCompatibleKeys: Readonly<
  Record<TaskCollectionPresentation, readonly QueryKey<TaskCollectionQuery>[]>
> = {
  table: TASK_QUERY_KEYS,
  card: TASK_QUERY_KEYS,
}
