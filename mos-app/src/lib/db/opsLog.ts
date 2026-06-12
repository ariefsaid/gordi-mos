import { supabase } from '../supabase'
import { wibDayRange } from '../week'
import type { LogEntryRow, LogEventType } from './opsLog.types'

// The ops data layer reaches ops via the PostgREST `ops` profile. RLS stamps org_id + created_by;
// the client NEVER sends them (NFR-002). No cross-schema embed — names resolved client-side (NFR-006).
const ops = () => supabase.schema('ops')
const LIST_SELECT = '*' // raw columns only — names resolved client-side (NFR-006).

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

export type LogEntryPatch = Partial<
  Pick<
    LogEntryRow,
    | 'title'
    | 'detail'
    | 'event_type'
    | 'business_unit_id'
    | 'occurred_at'
    | 'needs_attention'
    | 'linked_task_id'
  >
>

export async function editLogEntry(id: string, patch: LogEntryPatch): Promise<void> {
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
  const { data, error } = await ops().from('log_entries').select('*').eq('id', id).single()
  if (error) throw new Error(`getLogEntry failed — ${error.message}`)
  return data as unknown as LogEntryRow
}
