import { supabase } from '@/lib/supabase'
import type {
  TaskStatus, TaskListRow, ChecklistItemRow, TaskEventRow,
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
const LIST_SELECT = '*'

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

/** List tasks with BU/status/archived filters (FR-024/025/026). Person-membership is
 * client-side via raciMember() — the full org set is loaded (org-readable; ~15 people / dozens
 * of tasks at Gordi scale). BU + status + archived are server-side for server-side sorting. */
export async function listTasks(f: TaskListFilters = {}): Promise<TaskListRow[]> {
  let q = mos().from('tasks').select(LIST_SELECT)
  if (!f.includeArchived) q = q.is('archived_at', null)
  if (f.businessUnitId) q = q.eq('business_unit_id', f.businessUnitId)
  if (f.status) q = q.eq('status', f.status)
  q = q.order('due_date', { ascending: true, nullsFirst: false })
  const { data, error } = await q
  if (error) throw new Error(`listTasks failed — ${error.message}`)
  return (data ?? []) as unknown as TaskListRow[]
}

export interface TaskDetail {
  task: TaskListRow
  checklist: ChecklistItemRow[]
  events: TaskEventRow[]
}

/** Read one task plus its checklist (position asc) and events (created_at desc, FR-034). */
export async function getTask(id: string): Promise<TaskDetail> {
  const { data: task, error: taskErr } = await mos()
    .from('tasks').select(LIST_SELECT).eq('id', id).single()
  if (taskErr) throw new Error(`getTask failed — ${taskErr.message}`)

  const { data: checklist, error: clErr } = await mos()
    .from('task_checklist_items').select('*').eq('task_id', id)
    .order('position', { ascending: true })
  if (clErr) throw new Error(`getTask checklist failed — ${clErr.message}`)

  const { data: events, error: evErr } = await mos()
    .from('task_events').select('*').eq('task_id', id)
    .order('created_at', { ascending: false })
  if (evErr) throw new Error(`getTask events failed — ${evErr.message}`)

  return {
    task: task as unknown as TaskListRow,
    checklist: (checklist ?? []) as unknown as ChecklistItemRow[],
    events: (events ?? []) as unknown as TaskEventRow[],
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
  const { data, error } = await mos().from('tasks').insert({
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
  }).select('id').single()
  if (error) throw new Error(`createTask failed — ${error.message}`)
  const id = (data as { id: string }).id
  await logEvent(id, input.createdBy, 'created')
  return id
}

async function updateTask(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await mos().from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(`updateTask failed — ${error.message}`)
}

/** Change status, then log a `status_changed` event recording from→to (FR-031/055). */
export async function updateTaskStatus(
  id: string, from: TaskStatus, to: TaskStatus, actor: string,
): Promise<void> {
  await updateTask(id, { status: to })
  await logEvent(id, actor, 'status_changed', from, to)
}

export type TaskFieldsPatch = Partial<Pick<
  TaskListRow, 'title' | 'description' | 'due_date' | 'business_unit_id'
  | 'responsible_person_id' | 'accountable_person_id'
  | 'objective_id' | 'work_line_id'
>>

/** Edit non-RACI/non-status fields, then log a `field_edited` event (FR-055). */
export async function updateTaskFields(
  id: string, patch: TaskFieldsPatch, actor: string,
): Promise<void> {
  await updateTask(id, patch)
  await logEvent(id, actor, 'field_edited')
}

export type TaskRaciPatch = Partial<Pick<
  TaskListRow, 'consulted_person_ids' | 'informed_person_ids'
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
export async function getTaskTitlesByIds(ids: string[]): Promise<TaskTitleRef[]> {
  if (ids.length === 0) return []
  const { data, error } = await mos()
    .from('tasks')
    .select('id,title,status')
    .in('id', ids)
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
    .ilike('title', `%${term}%`)
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
