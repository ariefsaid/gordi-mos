import { supabase } from '@/lib/supabase'
import { TASK_EVENTS_PAGE_SIZE, taskDoneRecentCutoff } from './task-paging'
import { containsPattern } from './like-pattern'
import { announceOpenTaskCountChanged } from '@/lib/open-task-count-store'
import { getReadScope, sharePending } from '@/lib/scoped-reads'
import type { ReadLease } from '@/lib/scoped-reads'
import type {
  TaskStatus, TaskRow, TaskListRow, ChecklistItemRow, TaskEventRow,
} from './tasks.types'

// Data layer for mos.tasks (P2-1). Reads/writes mos via supabase.schema('mos') on the existing
// client (ADR-0004 D1) — one auth session, one token-refresh path; the global client stays pinned
// to `shared`. RLS is the authority: this layer NEVER sends org_id (the DB default stamps it, §8)
// and throws on any non-null PostgREST error so the UI can surface failures.
//
// CAVEAT (D5): PostgREST has no client-side transaction. Mutations here are multi-statement — the
// field UPDATE/INSERT, then the task_event INSERT — as separate REST calls. A torn write (the data
// change lands but the event INSERT fails) leaves last_activity_at slightly stale but never corrupts
// data; we throw on the event error so the UI surfaces it. A future hardening is a SECURITY DEFINER
// RPC wrapping both in one txn — out of scope for P2-1.

const mos = () => supabase.schema('mos')

// Raw mos.tasks columns only — no cross-schema FK embeds.
// PostgREST CANNOT FK-embed across schemas (mos→shared) under the mos profile (PGRST200).
// Display-name resolution is client-side via directory.ts (Fix C1).
// LIST_SELECT is exported for processes.ts rollup reuse (Rule 11 — never re-implement task fetching).
export const LIST_SELECT = [
  'id', 'org_id', 'title', 'business_unit_id', 'team_id', 'status',
  'responsible_person_id', 'accountable_person_id', 'consulted_person_ids',
  'informed_person_ids', 'due_date', 'objective_id', 'work_line_id',
  'last_activity_at', 'archived_at', 'created_by', 'completed_at',
  'process_run_id', 'generated_from_task_def_id',
].join(',')
const DETAIL_SELECT = `${LIST_SELECT},description,created_at,updated_at`
const CHECKLIST_COLUMNS = 'id,org_id,task_id,label,is_done,position,created_at,updated_at'
const EVENT_COLUMNS = 'id,org_id,task_id,actor_person_id,event_type,from_value,to_value,created_at'

export interface TaskListFilters {
  businessUnitId?: string
  status?: TaskStatus
  // NOTE: personId is NOT sent to the server as a query filter. The server only knows
  // responsible_person_id; RACI membership (R/A/C/I) is a client-side predicate applied
  // over the org-readable set after load. Keeping this field here for API surface consistency
  // but it is handled entirely by raciMember() + caller-side filtering.
  // Use responsiblePersonId if you need a server-side responsible-only filter (e.g. future perf).
  includeArchived?: boolean
}

export const TASKS_LIST_MAX_ROWS = 1000
export const TASKS_OLDER_DONE_PAGE_SIZE = 50

function taskListReadKey(filters: TaskListFilters, cutoff: string): string {
  return `mos.tasks:list:${JSON.stringify({
    select: LIST_SELECT,
    businessUnitId: filters.businessUnitId || null,
    status: filters.status ?? null,
    includeArchived: Boolean(filters.includeArchived),
    recentDoneSince: cutoff,
    order: ['due_date', 'asc', 'nulls_last'],
  })}`
}

/** List active tasks and Done tasks completed within 30 days; older Done records are explicit. */
export async function listTasks(
  f: TaskListFilters = {}, readLease?: ReadLease, cutoff = taskDoneRecentCutoff(),
): Promise<TaskListRow[]> {
  const load = async (): Promise<TaskListRow[]> => {
    let q = mos().from('tasks').select(LIST_SELECT)
    if (!f.includeArchived) q = q.is('archived_at', null)
    if (f.businessUnitId) q = q.eq('business_unit_id', f.businessUnitId)
    if (f.status) q = q.eq('status', f.status)
    q = q.or(`status.neq.Done,completed_at.gte.${cutoff}`)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(TASKS_LIST_MAX_ROWS)
    const { data, error } = await q
    if (error) throw new Error(`listTasks failed — ${error.message}`)
    if ((data ?? []).length === TASKS_LIST_MAX_ROWS) {
      throw new Error('listTasks exceeded the safe row limit; narrow the task filters')
    }
    return (data ?? []) as unknown as TaskListRow[]
  }

  const key = taskListReadKey(f, cutoff)
  if (readLease) return readLease.read(key, load)
  const scope = getReadScope()
  return scope ? sharePending(scope, key, load) : load()
}

export type TaskEventsCursor = Pick<TaskEventRow, 'created_at' | 'id'>

/** Newest-first page of task history. */
export async function listTaskEvents(
  taskId: string, before?: TaskEventsCursor,
): Promise<TaskEventRow[]> {
  let q = mos().from('task_events').select(EVENT_COLUMNS).eq('task_id', taskId)
  if (before) {
    q = q.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`)
  }
  const { data, error } = await q.order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(TASK_EVENTS_PAGE_SIZE)
  if (error) throw new Error(`listTaskEvents failed — ${error.message}`)
  return (data ?? []) as unknown as TaskEventRow[]
}

export type OlderDoneTaskCursor = Pick<TaskListRow, 'completed_at' | 'id'>
export type OlderDoneTaskPage = {
  rows: TaskListRow[]
  nextCursor: OlderDoneTaskCursor | null
  hasMore: boolean
}

/** Fetch older completed Tasks only when the operator asks to show completion history. */
export async function listOlderDoneTasks(
  filters: Pick<TaskListFilters, 'businessUnitId' | 'includeArchived'> = {},
  before?: OlderDoneTaskCursor | null,
  cutoff = taskDoneRecentCutoff(),
): Promise<OlderDoneTaskPage> {
  let q = mos().from('tasks').select(LIST_SELECT).eq('status', 'Done')
  if (!filters.includeArchived) q = q.is('archived_at', null)
  if (filters.businessUnitId) q = q.eq('business_unit_id', filters.businessUnitId)
  if (before?.completed_at) {
    q = q.or(`completed_at.lt.${before.completed_at},and(completed_at.eq.${before.completed_at},id.lt.${before.id}),completed_at.is.null`)
  } else if (before) {
    q = q.is('completed_at', null).lt('id', before.id)
  } else {
    q = q.or(`completed_at.lt.${cutoff},completed_at.is.null`)
  }
  const { data, error } = await q.order('completed_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).limit(TASKS_OLDER_DONE_PAGE_SIZE + 1)
  if (error) throw new Error(`listOlderDoneTasks failed — ${error.message}`)
  const fetched = (data ?? []) as unknown as TaskListRow[]
  const rows = fetched.slice(0, TASKS_OLDER_DONE_PAGE_SIZE)
  return {
    rows,
    nextCursor: fetched.length > TASKS_OLDER_DONE_PAGE_SIZE && rows.length > 0
      ? { completed_at: rows.at(-1)!.completed_at ?? null, id: rows.at(-1)!.id }
      : null,
    hasMore: fetched.length > TASKS_OLDER_DONE_PAGE_SIZE,
  }
}

export interface TaskDetail {
  task: TaskRow
  checklist: ChecklistItemRow[]
  events: TaskEventRow[]
}

/** A PostgREST error carries a `code` (e.g. `PGRST116` — `.single()` matched 0 or >1 rows) the UI
 * needs to tell "this record doesn't exist" apart from a transport failure; a plain `Error` drops
 * it, so callers that must distinguish (task-surface.tsx's isMissingTaskError) read it back off. */
export interface DbError extends Error {
  code?: string
}

function dbError(message: string, code?: string): DbError {
  const err = new Error(message) as DbError
  if (code) err.code = code
  return err
}

/** Read one task plus its checklist (position asc) and events (created_at desc, FR-034). The
 * three reads share only the id — issued together, not as a waterfall (#1359). */
export async function getTask(id: string): Promise<TaskDetail> {
  const [taskRes, checklistRes, eventsRes] = await Promise.all([
    mos().from('tasks').select(DETAIL_SELECT).eq('id', id).single(),
    mos().from('task_checklist_items').select(CHECKLIST_COLUMNS).eq('task_id', id)
      .order('position', { ascending: true }),
    listTaskEvents(id),
  ])
  if (taskRes.error) throw dbError(`getTask failed — ${taskRes.error.message}`, taskRes.error.code)
  if (checklistRes.error) throw new Error(`getTask checklist failed — ${checklistRes.error.message}`)
  return {
    task: taskRes.data as unknown as TaskRow,
    checklist: (checklistRes.data ?? []) as unknown as ChecklistItemRow[],
    events: eventsRes,
  }
}

// ── event helper ────────────────────────────────────────────────────────────────
type EventType = TaskEventRow['event_type']
async function logEvent(
  taskId: string, actor: string, eventType: EventType,
  fromValue: string | null = null, toValue: string | null = null,
): Promise<void> {
  const { error } = await mos().from('task_events').insert({
    task_id: taskId, actor_person_id: actor, event_type: eventType,
    from_value: fromValue, to_value: toValue,
  })
  if (error) throw new Error(`task event (${eventType}) failed — ${error.message}`)
}

export interface CreateTaskInput {
  title: string
  businessUnitId: string
  /** Canonical owning Team; omitted only for a legacy/repair-state row. */
  teamId?: string | null
  responsiblePersonId: string
  accountablePersonId: string
  createdBy: string
  description?: string
  dueDate?: string | null
  consultedPersonIds?: string[]
  informedPersonIds?: string[]
  objectiveId?: string | null
  workLineId?: string | null
}

/** Insert a task (org_id stamped by DB), then its `created` event (FR-010/013/014). Returns the id. */
export async function createTask(input: CreateTaskInput): Promise<string> {
  const taskInsert: Record<string, unknown> = {
    title: input.title,
    business_unit_id: input.businessUnitId,
    responsible_person_id: input.responsiblePersonId,
    accountable_person_id: input.accountablePersonId,
    created_by: input.createdBy,
    description: input.description ?? null,
    due_date: input.dueDate ?? null,
    consulted_person_ids: input.consultedPersonIds ?? [],
    informed_person_ids: input.informedPersonIds ?? [],
    objective_id: input.objectiveId ?? null,
    work_line_id: input.workLineId ?? null,
  }
  // Preserve the legacy repair-state payload when no Team has been selected. Sending an
  // explicit null would be semantically equivalent in SQL, but omitting it keeps old callers
  // and generated inserts stable while the owner-ratification migration is in flight.
  if (input.teamId !== undefined) taskInsert.team_id = input.teamId
  const { data, error } = await mos().from('tasks').insert({
    ...taskInsert,
  }).select('id').single()
  if (error) throw new Error(`createTask failed — ${error.message}`)
  announceOpenTaskCountChanged()
  const id = (data as { id: string }).id
  await logEvent(id, input.createdBy, 'created')
  return id
}

async function updateTask(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await mos().from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(`updateTask failed — ${error.message}`)
  announceOpenTaskCountChanged()
}

/** Change status, then log a `status_changed` event recording from→to (FR-031/055). */
export async function updateTaskStatus(
  id: string, from: TaskStatus, to: TaskStatus, actor: string,
): Promise<void> {
  await updateTask(id, { status: to })
  await logEvent(id, actor, 'status_changed', from, to)
}

export type TaskFieldsPatch = Partial<Pick<
  TaskRow, 'title' | 'description' | 'due_date' | 'business_unit_id'
  | 'team_id'
  | 'responsible_person_id' | 'accountable_person_id'
  | 'objective_id' | 'work_line_id'
>>

/** Edit non-RACI/non-status fields, then log a `field_edited` event (FR-055). */
export async function updateTaskFields(
  id: string, patch: TaskFieldsPatch, actor: string, fromValue: string | null = null,
): Promise<void> {
  await updateTask(id, patch)
  const [field] = Object.keys(patch)
  const toValue = field ? patch[field as keyof TaskFieldsPatch] : null
  await logEvent(id, actor, 'field_edited', fromValue, toValue == null ? null : String(toValue))
}

export type TaskRaciPatch = Partial<Pick<
  TaskRow, 'consulted_person_ids' | 'informed_person_ids'
>>

/** Edit Consulted/Informed arrays, then log a `raci_edited` event (FR-033/055). */
export async function updateTaskRaci(
  id: string, patch: TaskRaciPatch, actor: string,
): Promise<void> {
  await updateTask(id, patch)
  await logEvent(id, actor, 'raci_edited')
}

/** Soft-archive (set archived_at), then log an `archived` event (FR-051/054). */
export async function archiveTask(id: string, actor: string): Promise<void> {
  await updateTask(id, { archived_at: new Date().toISOString() })
  await logEvent(id, actor, 'archived')
}

export interface TaskTitleRef {
  id: string
  title: string
  status: TaskStatus
}

/**
 * Batch-fetch title + status for a set of task IDs (client-side linked-task resolution,
 * NFR-006). Returns only the ids that are visible to the caller (org-readable set from RLS).
 * Never embeds cross-schema FKs — the ops data layer stays raw and name-resolution is here.
 */
export async function getTaskTitlesByIds(
  ids: string[], options: { includeArchived?: boolean } = {},
): Promise<TaskTitleRef[]> {
  if (ids.length === 0) return []
  let query = mos()
    .from('tasks')
    .select('id,title,status')
    .in('id', ids)
  if (options.includeArchived === false) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw new Error(`getTaskTitlesByIds failed — ${error.message}`)
  return (data ?? []) as unknown as TaskTitleRef[]
}

// Search tasks by title for the command palette (ADR-0013 D4). RLS-governed read —
// reuses the org-visibility policy that governs listTasks; org_id is never sent.
export async function searchTasksByTitle(q: string, limit = 20): Promise<TaskTitleRef[]> {
  const term = q.trim()
  if (!term) return []
  const { data, error } = await mos()
    .from('tasks')
    .select('id,title,status')
    .ilike('title', containsPattern(term))
    .is('archived_at', null)
    .order('last_activity_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`searchTasksByTitle failed — ${error.message}`)
  return (data ?? []) as unknown as TaskTitleRef[]
}

/** Unarchive (clear archived_at), then log an `unarchived` event (FR-052/054). */
export async function unarchiveTask(id: string, actor: string): Promise<void> {
  await updateTask(id, { archived_at: null })
  await logEvent(id, actor, 'unarchived')
}

/** Add a checklist item at `position`, then log a `field_edited` event (FR-040). */
export async function addChecklistItem(
  taskId: string, label: string, position: number, actor: string,
): Promise<void> {
  const { error } = await mos().from('task_checklist_items')
    .insert({ task_id: taskId, label, position })
  if (error) throw new Error(`addChecklistItem failed — ${error.message}`)
  await logEvent(taskId, actor, 'field_edited')
}

/** Toggle a checklist item's done flag, then log a `field_edited` event (FR-041). */
export async function toggleChecklistItem(
  itemId: string, isDone: boolean, taskId: string, actor: string,
): Promise<void> {
  const { error } = await mos().from('task_checklist_items')
    .update({ is_done: isDone }).eq('id', itemId)
  if (error) throw new Error(`toggleChecklistItem failed — ${error.message}`)
  await logEvent(taskId, actor, 'field_edited')
}

/** Reorder a checklist item (update position). No event — ordering is not activity (FR-042). */
export async function reorderChecklistItem(itemId: string, position: number): Promise<void> {
  const { error } = await mos().from('task_checklist_items')
    .update({ position }).eq('id', itemId)
  if (error) throw new Error(`reorderChecklistItem failed — ${error.message}`)
}

/** Delete a checklist item, then log a `field_edited` event (FR-041). */
export async function deleteChecklistItem(
  itemId: string, taskId: string, actor: string,
): Promise<void> {
  const { error } = await mos().from('task_checklist_items')
    .delete().eq('id', itemId)
  if (error) throw new Error(`deleteChecklistItem failed — ${error.message}`)
  await logEvent(taskId, actor, 'field_edited')
}
