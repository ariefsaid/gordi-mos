import { supabase } from '@/lib/supabase'
import { wibDayRange } from '@/lib/week'

// Read data layer for ops.log_entries. Reaches ops via the PostgREST `ops` profile (RLS stamps
// org_id + created_by; the client never sends them, NFR-002). No cross-schema embed (NFR-006).
//
// The write/list/edit path (listLogEntries/addLogEntry/editLogEntry/archive/unarchive/getLogEntry)
// was removed in the Step-11 decommission sweep — its only caller was ops-page.tsx / ops-add-form.tsx
// (the retired Daily Log screens, superseded by Home's attention brief + Café occurrence checks,
// OD-33). getTodayOpsSummary stays: it backs the surviving My Week panel (ADR-0019 D2 "component
// survives"). The table itself is preserved (data preservation is law) — the Café module's kitchen
// logs also live in ops.log_entries (origin='kitchen'), untouched by this sweep.
const ops = () => supabase.schema('ops')

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
