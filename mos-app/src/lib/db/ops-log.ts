import { supabase } from '@/lib/supabase'
import { wibDayRange } from '@/lib/week'
import type { LogEntryRow, LogEventType } from './ops-log.types'

// The ops data layer reaches ops via the PostgREST `ops` profile. RLS stamps org_id + created_by;
// the client NEVER sends them (NFR-002). No cross-schema embed — names resolved client-side (NFR-006).
const ops = () => supabase.schema('ops')
// Raw columns only — names resolved client-side (NFR-006). Explicit list so the ops-log list read
// never drags a full row shape it does not use (#1359).
const LIST_SELECT = 'id,org_id,business_unit_id,origin,event_type,title,detail,occurred_at,needs_attention,linked_task_id,archived_at,created_by,created_at,updated_at'

export interface LogFilters {
  businessUnitId?: string
  eventType?: LogEventType
  includeArchived?: boolean
}

export async function listLogEntries(f: LogFilters = {}): Promise<LogEntryRow[]> {
  let q = ops().from('log_entries').select(LIST_SELECT)
  if (!f.includeArchived) q = q.is('archived_at', null)
  if (f.businessUnitId) q = q.eq('business_unit_id', f.businessUnitId)
  if (f.eventType) q = q.eq('event_type', f.eventType)
  q = q.order('occurred_at', { ascending: false })
  const { data, error } = await q
  if (error) throw new Error(`listLogEntries failed — ${error.message}`)
  return (data ?? []) as unknown as LogEntryRow[]
}

export interface CreateLogEntryInput {
  businessUnitId: string
  eventType: LogEventType
  title: string
  detail?: string | null
  occurredAt?: string // ISO; omit → DB default now()
  needsAttention?: boolean
  linkedTaskId?: string | null
}

export async function addLogEntry(input: CreateLogEntryInput): Promise<string> {
  const row: Record<string, unknown> = {
    business_unit_id: input.businessUnitId,
    event_type: input.eventType,
    title: input.title,
    origin: 'manual',
    detail: input.detail ?? null,
    needs_attention: input.needsAttention ?? false,
    linked_task_id: input.linkedTaskId ?? null,
  }
  if (input.occurredAt) row.occurred_at = input.occurredAt
  const { data, error } = await ops().from('log_entries').insert(row).select('id').single()
  if (error) throw new Error(`addLogEntry failed — ${error.message}`)
  return (data as { id: string }).id
}

// Edit accepts the SAME camelCase domain shape as create (a partial of it); the data layer is the
// snake/camel boundary (playbook §8) and maps to columns here. Only keys that are present are sent,
// so a partial patch never blanks untouched columns; an explicit `null` (e.g. linkedTaskId) clears.
export type EditLogEntryInput = Partial<CreateLogEntryInput>

export async function editLogEntry(id: string, input: EditLogEntryInput): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.businessUnitId !== undefined) patch.business_unit_id = input.businessUnitId
  if (input.eventType !== undefined) patch.event_type = input.eventType
  if (input.title !== undefined) patch.title = input.title
  if (input.detail !== undefined) patch.detail = input.detail
  if (input.occurredAt !== undefined) patch.occurred_at = input.occurredAt
  if (input.needsAttention !== undefined) patch.needs_attention = input.needsAttention
  if (input.linkedTaskId !== undefined) patch.linked_task_id = input.linkedTaskId
  const { error } = await ops().from('log_entries').update(patch).eq('id', id)
  if (error) throw new Error(`editLogEntry failed — ${error.message}`)
}

export async function archiveLogEntry(id: string): Promise<void> {
  const { error } = await ops()
    .from('log_entries')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`archiveLogEntry failed — ${error.message}`)
}

export async function unarchiveLogEntry(id: string): Promise<void> {
  const { error } = await ops().from('log_entries').update({ archived_at: null }).eq('id', id)
  if (error) throw new Error(`unarchiveLogEntry failed — ${error.message}`)
}

export interface TodayOpsSummary {
  count: number
  needsAttention: boolean
}

export async function getTodayOpsSummary(now: Date = new Date()): Promise<TodayOpsSummary> {
  const { startISO, endISO } = wibDayRange(now)
  const { data, error } = await ops()
    .from('log_entries')
    .select('needs_attention')
    .is('archived_at', null)
    .gte('occurred_at', startISO)
    .lt('occurred_at', endISO)
  if (error) throw new Error(`getTodayOpsSummary failed — ${error.message}`)
  const rows = (data ?? []) as { needs_attention: boolean }[]
  return { count: rows.length, needsAttention: rows.some((r) => r.needs_attention) }
}

/** Get a single log entry by id (for edit mode pre-fill) */
export async function getLogEntry(id: string): Promise<LogEntryRow> {
  const { data, error } = await ops().from('log_entries').select(LIST_SELECT).eq('id', id).single()
  if (error) throw new Error(`getLogEntry failed — ${error.message}`)
  return data as unknown as LogEntryRow
}
