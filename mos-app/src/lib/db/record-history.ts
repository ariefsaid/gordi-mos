import { supabase } from '@/lib/supabase'

// Reads shared.record_history directly; RLS gates it through the source table's own read rule.
const shared = () => supabase.schema('shared')

export type HistoryChannel = 'app' | 'api' | 'agent'

export type RecordHistoryEntry = {
  id: string
  action: 'insert' | 'update' | 'delete'
  field: string | null
  oldValue: string | null
  newValue: string | null
  occurredAt: string
  channel: HistoryChannel
  actorName: string | null
}

export type RecordHistory = {
  entries: RecordHistoryEntry[]
  // id -> display name for every person / Business Unit / Objective a value points at.
  names: ReadonlyMap<string, string>
}

// The last entry already shown; the next page is everything strictly older.
export type HistoryCursor = { occurredAt: string; id: string }

export const HISTORY_PAGE = 50

// Columns whose stored value is another record's id, and where that record lives.
export const HISTORY_REFERENCE_FIELDS = {
  accountable_person_id: 'people',
  responsible_person_id: 'people',
  business_unit_id: 'business_units',
  objective_id: 'objectives',
} as const

type HistoryRow = {
  id: string
  action: RecordHistoryEntry['action']
  field_name: string | null
  old_value: string | null
  new_value: string | null
  occurred_at: string
  channel: HistoryChannel
  actor: { full_name: string } | null
}

async function lookupNames(
  kind: 'people' | 'business_units' | 'objectives',
  ids: string[],
): Promise<Array<[string, string]>> {
  if (ids.length === 0) return []
  // Unfiltered on purpose: archived people and Objectives still name a past value.
  const query = kind === 'objectives'
    ? supabase.schema('mos').from('objectives').select('id,name').in('id', ids)
    : shared().from(kind).select(kind === 'people' ? 'id,full_name' : 'id,name').in('id', ids)
  const { data, error } = await query
  if (error) throw new Error(`record history names failed — ${error.message}`)
  return ((data ?? []) as unknown as Array<{ id: string; name?: string; full_name?: string }>)
    .map((r) => [r.id, (r.full_name ?? r.name) as string])
}

export async function loadRecordHistory(
  table: 'objectives' | 'work_lines',
  recordId: string,
  before?: HistoryCursor,
): Promise<RecordHistory> {
  let query = shared()
    .from('record_history')
    .select('id,action,field_name,old_value,new_value,occurred_at,channel,actor:people!actor_person_id(full_name)')
    .eq('schema_name', 'mos')
    .eq('table_name', table)
    .eq('record_key', recordId)
  if (before) {
    // Keyset, not offset or a growing limit: the API's row cap would otherwise hide older pages.
    query = query.or(`occurred_at.lt.${before.occurredAt},and(occurred_at.eq.${before.occurredAt},id.lt.${before.id})`)
  }
  const { data, error } = await query
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(HISTORY_PAGE)
  if (error) throw new Error(`record history failed — ${error.message}`)

  const rows = (data ?? []) as unknown as HistoryRow[]
  const wanted = { people: new Set<string>(), business_units: new Set<string>(), objectives: new Set<string>() }
  for (const row of rows) {
    const kind = HISTORY_REFERENCE_FIELDS[row.field_name as keyof typeof HISTORY_REFERENCE_FIELDS]
    if (!kind) continue
    for (const value of [row.old_value, row.new_value]) if (value) wanted[kind].add(value)
  }
  const resolved = await Promise.all(
    (Object.keys(wanted) as Array<keyof typeof wanted>).map((kind) => lookupNames(kind, [...wanted[kind]])),
  )

  return {
    entries: rows.map((row) => ({
      id: row.id,
      action: row.action,
      field: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
      occurredAt: row.occurred_at,
      channel: row.channel,
      actorName: row.actor?.full_name ?? null,
    })),
    names: new Map(resolved.flat()),
  }
}
