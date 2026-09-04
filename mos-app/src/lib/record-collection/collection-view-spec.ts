// Persisted Work-view contract — a typed, schema-versioned, discriminated VIEW DEFINITION only.
// It stores NO result rows, SQL, executable code, HTML, arbitrary record shape, or universal record.
// The database persistence (mos.user_views DAL, migration, pgTAP) is Issue-6 DB work that is
// DEFERRED (see report "Skipped — DB persistence"); this module is the pure validator/serializer.
import type { TaskStatus } from '@/lib/db/tasks.types'
import type { Attention, SignalCategory } from '@/lib/db/signals.types'
import { SIGNAL_CATEGORIES } from '@/lib/db/signals.types'
import type {
  TaskCollectionGroup,
  TaskCollectionPresentation,
  TaskCollectionQuery,
  TaskCollectionSort,
} from '@/components/tasks/task-collection-query'
import type {
  SignalCollectionGroup,
  SignalCollectionPresentation,
  SignalCollectionQuery,
  SignalCollectionSort,
} from '@/components/signals/signal-collection-adapter'

export const COLLECTION_VIEW_SPEC_VERSION = 1 as const
export type CollectionViewCollection = 'tasks' | 'signals' | 'events'
export type CollectionViewScope = 'private' | 'shared_team'
export type CollectionViewLayout = { density: 'compact' | 'comfortable' }

export type TaskCollectionVisibleField =
  | 'title' | 'status' | 'pic' | 'supervisor' | 'due' | 'businessUnit'
  | 'workline' | 'objective' | 'activity'
export type SignalCollectionVisibleField =
  | 'message' | 'author' | 'team' | 'occurredAt' | 'attention' | 'category' | 'retracted'
export type EventCollectionVisibleField = 'title' | 'time' | 'venue' | 'outbound' | 'businessUnit' | 'coordinator'

export type TaskCollectionSavedQuery = Pick<
  TaskCollectionQuery,
  'view' | 'q' | 'businessUnitId' | 'status' | 'picId' | 'supervisorId'
  | 'includeArchived' | 'overdueOnly' | 'occurrenceId'
>
export type SignalCollectionSavedQuery = Pick<
  SignalCollectionQuery,
  'view' | 'q' | 'attention' | 'category' | 'teamId' | 'showRetracted'
>

export type CollectionViewSpec =
  | {
      kind: 'collection'
      version: typeof COLLECTION_VIEW_SPEC_VERSION
      collectionId: 'tasks'
      domain: 'tasks'
      presentation: TaskCollectionPresentation
      visibleFields: readonly TaskCollectionVisibleField[]
      query: TaskCollectionSavedQuery
      sort: { field: TaskCollectionSort; direction: 'ascending' | 'descending' }
      grouping: { field: TaskCollectionGroup } | null
      layout: CollectionViewLayout
    }
  | {
      kind: 'collection'
      version: typeof COLLECTION_VIEW_SPEC_VERSION
      collectionId: 'events'
      domain: 'events'
      presentation: 'calendar'
      visibleFields: readonly EventCollectionVisibleField[]
      query: { month: string }
      sort: { field: 'startsAt'; direction: 'ascending' }
      grouping: null
      layout: CollectionViewLayout
    }
  | {
      kind: 'collection'
      version: typeof COLLECTION_VIEW_SPEC_VERSION
      collectionId: 'signals'
      domain: 'signals'
      presentation: SignalCollectionPresentation
      visibleFields: readonly SignalCollectionVisibleField[]
      query: SignalCollectionSavedQuery
      sort: { field: SignalCollectionSort; direction: 'ascending' | 'descending' }
      grouping: { field: SignalCollectionGroup } | null
      layout: CollectionViewLayout
    }

export interface PersistedCollectionView {
  id: string
  name: string
  scope: CollectionViewScope
  kind: 'collection'
  context: 'work'
  lifecycle: 'active' | 'archived'
  spec: CollectionViewSpec
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CollectionViewValidationIssue {
  path: string
  code:
    | 'invalid-shape' | 'unsupported-version' | 'invalid-kind' | 'unknown-collection'
    | 'domain-mismatch' | 'invalid-presentation' | 'invalid-visible-field'
    | 'unsupported-domain-field'
    | 'invalid-query' | 'invalid-sort' | 'invalid-grouping' | 'unsupported-grouping'
    | 'invalid-layout'
  detail: string
}

export type CollectionViewValidationResult =
  | { ok: true; spec: CollectionViewSpec }
  | { ok: false; issues: readonly CollectionViewValidationIssue[] }

// --- valid value sets ----------------------------------------------------------------------------

const TASK_PRESENTATIONS: readonly TaskCollectionPresentation[] = ['table', 'card']
const TASK_SORTS: readonly TaskCollectionSort[] = ['task', 'status', 'pic', 'supervisor', 'due', 'activity']
const TASK_GROUP_FIELDS: readonly TaskCollectionGroup[] = ['status', 'pic', 'bu', 'workline', 'objective', 'occurrence']
const TASK_VISIBLE: readonly TaskCollectionVisibleField[] = [
  'title', 'status', 'pic', 'supervisor', 'due', 'businessUnit', 'workline', 'objective', 'activity',
]
const TASK_VIEWS = ['all', 'my-work', 'my-pic', 'my-supervisor', 'overdue', 'followups']
const TASK_STATUSES: readonly TaskStatus[] = ['Open', 'In Progress', 'Blocked', 'Done']

const SIGNAL_PRESENTATIONS: readonly SignalCollectionPresentation[] = ['feed', 'table']
const SIGNAL_SORTS: readonly SignalCollectionSort[] = ['occurredAt', 'attention']
const SIGNAL_GROUP_FIELDS: readonly SignalCollectionGroup[] = ['team', 'attention', 'category']
const SIGNAL_VISIBLE: readonly SignalCollectionVisibleField[] = [
  'message', 'author', 'team', 'occurredAt', 'attention', 'category', 'retracted',
]
const EVENT_VISIBLE: readonly EventCollectionVisibleField[] = ['title', 'time', 'venue', 'outbound', 'businessUnit', 'coordinator']
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

const SIGNAL_VIEWS = ['all', 'needs-attention', 'retracted']
const SIGNAL_ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']
const DIRECTIONS = ['ascending', 'descending']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLayout(value: unknown): value is CollectionViewLayout {
  return isRecord(value) && (value.density === 'compact' || value.density === 'comfortable')
}

/** Parse and validate an untrusted persisted spec into a typed CollectionViewSpec, or typed issues. */
export function parseCollectionViewSpec(input: unknown): CollectionViewValidationResult {
  const issues: CollectionViewValidationIssue[] = []
  const push = (code: CollectionViewValidationIssue['code'], path: string, detail: string) =>
    issues.push({ code, path, detail })

  if (!isRecord(input)) {
    return { ok: false, issues: [{ code: 'invalid-shape', path: '', detail: 'spec must be an object' }] }
  }
  if (input.kind !== 'collection') {
    return { ok: false, issues: [{ code: 'invalid-kind', path: 'kind', detail: `unexpected kind ${String(input.kind)}` }] }
  }
  if (input.version !== COLLECTION_VIEW_SPEC_VERSION) {
    return {
      ok: false,
      issues: [{ code: 'unsupported-version', path: 'version', detail: `unsupported version ${String(input.version)}` }],
    }
  }
  const collectionId = input.collectionId
  if (collectionId !== 'tasks' && collectionId !== 'signals' && collectionId !== 'events') {
    return { ok: false, issues: [{ code: 'unknown-collection', path: 'collectionId', detail: String(collectionId) }] }
  }
  if (input.domain !== collectionId) {
    push('domain-mismatch', 'domain', `domain ${String(input.domain)} != collectionId ${collectionId}`)
  }
  // Reject any extra result/code/HTML fields — a view definition carries no rows or executable payload.
  for (const forbidden of ['rows', 'results', 'sql', 'html', 'code', 'record', 'data']) {
    if (forbidden in input) push('invalid-shape', forbidden, `forbidden field ${forbidden}`)
  }
  if (!isLayout(input.layout)) push('invalid-layout', 'layout', 'invalid layout')

  if (collectionId === 'tasks') validateTaskSpec(input, push)
  else if (collectionId === 'signals') validateSignalSpec(input, push)
  else validateEventSpec(input, push)

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, spec: input as unknown as CollectionViewSpec }
}

type Push = (code: CollectionViewValidationIssue['code'], path: string, detail: string) => void

function validateTaskSpec(input: Record<string, unknown>, push: Push): void {
  if (!TASK_PRESENTATIONS.includes(input.presentation as TaskCollectionPresentation)) {
    push('invalid-presentation', 'presentation', String(input.presentation))
  }
  // Visible fields: reject unknown fields, and reject Team before Issue 8's team_id contract.
  const visible = input.visibleFields
  if (!Array.isArray(visible)) {
    push('invalid-visible-field', 'visibleFields', 'must be an array')
  } else {
    for (const f of visible) {
      if (f === 'team' || f === 'teamId') push('unsupported-domain-field', 'visibleFields', 'Task Team field is not supported before Issue 8')
      else if (!TASK_VISIBLE.includes(f as TaskCollectionVisibleField)) push('invalid-visible-field', 'visibleFields', String(f))
    }
  }
  // Query
  const query = input.query
  if (!isRecord(query)) {
    push('invalid-query', 'query', 'query must be an object')
  } else {
    if ('teamId' in query || 'team' in query) push('unsupported-domain-field', 'query.teamId', 'Task Team query is not supported before Issue 8')
    if (query.view !== undefined && !TASK_VIEWS.includes(query.view as string)) push('invalid-query', 'query.view', String(query.view))
    if (query.status != null && !TASK_STATUSES.includes(query.status as TaskStatus)) push('invalid-query', 'query.status', String(query.status))
  }
  // Sort
  const sort = input.sort
  if (!isRecord(sort) || !TASK_SORTS.includes(sort.field as TaskCollectionSort) || !DIRECTIONS.includes(sort.direction as string)) {
    push('invalid-sort', 'sort', 'invalid task sort')
  }
  // Grouping: null is allowed; Supervisor grouping is explicitly unsupported (never aliased to PIC).
  const grouping = input.grouping
  if (grouping !== null) {
    if (!isRecord(grouping)) {
      push('invalid-grouping', 'grouping', 'grouping must be an object or null')
    } else if (grouping.field === 'supervisor') {
      push('unsupported-grouping', 'grouping.field', 'Supervisor grouping has no typed renderer yet')
    } else if (grouping.field === 'team') {
      push('unsupported-domain-field', 'grouping.field', 'Task Team grouping is not supported before Issue 8')
    } else if (!TASK_GROUP_FIELDS.includes(grouping.field as TaskCollectionGroup)) {
      push('invalid-grouping', 'grouping.field', String(grouping.field))
    }
  }
}

function validateEventSpec(input: Record<string, unknown>, push: Push): void {
  if (input.presentation !== 'calendar') push('invalid-presentation', 'presentation', String(input.presentation))
  if (!Array.isArray(input.visibleFields) || input.visibleFields.some((field) => !EVENT_VISIBLE.includes(field as EventCollectionVisibleField))) {
    push('invalid-visible-field', 'visibleFields', 'invalid event field')
  }
  if (!isRecord(input.query) || typeof input.query.month !== 'string' || !MONTH_KEY.test(input.query.month)) {
    push('invalid-query', 'query.month', 'month must be YYYY-MM')
  }
  if (!isRecord(input.sort) || input.sort.field !== 'startsAt' || input.sort.direction !== 'ascending') push('invalid-sort', 'sort', 'Events calendar has no sort control')
  if (input.grouping !== null) push('unsupported-grouping', 'grouping', 'Events calendar has no grouping')
}

function validateSignalSpec(input: Record<string, unknown>, push: Push): void {
  const presentation = input.presentation
  if (!SIGNAL_PRESENTATIONS.includes(presentation as SignalCollectionPresentation)) {
    push('invalid-presentation', 'presentation', String(presentation))
  }
  const visible = input.visibleFields
  if (!Array.isArray(visible)) {
    push('invalid-visible-field', 'visibleFields', 'must be an array')
  } else {
    for (const f of visible) {
      if (!SIGNAL_VISIBLE.includes(f as SignalCollectionVisibleField)) push('invalid-visible-field', 'visibleFields', String(f))
    }
  }
  const query = input.query
  if (!isRecord(query)) {
    push('invalid-query', 'query', 'query must be an object')
  } else {
    if (query.view !== undefined && !SIGNAL_VIEWS.includes(query.view as string)) push('invalid-query', 'query.view', String(query.view))
    if (query.attention != null && !SIGNAL_ATTENTIONS.includes(query.attention as Attention)) push('invalid-query', 'query.attention', String(query.attention))
    if (query.category != null && !(SIGNAL_CATEGORIES as readonly string[]).includes(query.category as SignalCategory)) push('invalid-query', 'query.category', String(query.category))
  }
  const sort = input.sort
  const sortValid = isRecord(sort) && SIGNAL_SORTS.includes(sort.field as SignalCollectionSort) && DIRECTIONS.includes(sort.direction as string)
  if (!sortValid) {
    push('invalid-sort', 'sort', 'invalid signal sort')
  }
  const grouping = input.grouping
  // Feed is chronological/flat: reject any grouping and attention sort on feed.
  if (presentation === 'feed') {
    if (isRecord(sort) && sort.field === 'attention') push('invalid-sort', 'sort.field', 'Feed does not support attention sort')
    if (grouping !== null) push('unsupported-grouping', 'grouping', 'Feed does not support grouping')
  }
  if (grouping !== null) {
    if (!isRecord(grouping)) push('invalid-grouping', 'grouping', 'grouping must be an object or null')
    else if (!SIGNAL_GROUP_FIELDS.includes(grouping.field as SignalCollectionGroup)) push('invalid-grouping', 'grouping.field', String(grouping.field))
  }
}

/** Emit a stable key-ordered JSON string so URL/DB conformance tests are deterministic. */
export function serializeCollectionViewSpec(spec: CollectionViewSpec): string {
  const ordered = {
    kind: spec.kind,
    version: spec.version,
    collectionId: spec.collectionId,
    domain: spec.domain,
    presentation: spec.presentation,
    visibleFields: [...spec.visibleFields],
    query: sortObjectKeys(spec.query as Record<string, unknown>),
    sort: { field: spec.sort.field, direction: spec.sort.direction },
    grouping: spec.grouping ? { field: spec.grouping.field } : null,
    layout: { density: spec.layout.density },
  }
  return JSON.stringify(ordered)
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) out[key] = obj[key]
  return out
}
