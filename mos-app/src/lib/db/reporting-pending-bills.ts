import { supabase } from '@/lib/supabase'
import { readAllPages } from '@/lib/db/reporting-shared'

// Data layer for reporting.pending_bills and reporting.pending_bill_snapshots (#1464). RLS admits
// Finance only and scopes to the caller's org; this layer never sends org_id. Read-only.

const reporting = () => supabase.schema('reporting')

/** One copied deferred-payment bill, as the nightly copy left it. */
export interface PendingBillRow {
  esb_code: string
  branch_code: string
  bill_no: string
  sales_no: string | null
  bill_date: string
  branch_name: string | null
  branch_id: string | null
  /** Who owes, as written on the bill at the till. */
  counterparty_note: string | null
  amount: number
  source_state: 'present' | 'void' | 'missing'
  source_state_at: string | null
  snapshot_as_of: string
}

/** The latest copy run: its time is the list's as-of. */
export interface PendingBillSnapshot {
  snapshot_as_of: string
  bill_count: number
}

const BILL_SELECT =
  'esb_code,branch_code,bill_no,sales_no,bill_date,branch_name,branch_id,counterparty_note,amount,source_state,source_state_at,snapshot_as_of'

export async function listPendingBills(): Promise<PendingBillRow[]> {
  return readAllPages<PendingBillRow>('listPendingBills', (from, to) =>
    reporting().from('pending_bills').select(BILL_SELECT)
      .order('bill_date', { ascending: true })
      .order('esb_code', { ascending: true })
      .order('branch_code', { ascending: true })
      .order('bill_no', { ascending: true })
      .range(from, to))
}

/** The newest copy run, or null when no copy has run yet. */
export async function latestPendingBillSnapshot(): Promise<PendingBillSnapshot | null> {
  const { data, error } = await reporting().from('pending_bill_snapshots')
    .select('snapshot_as_of,bill_count')
    .order('snapshot_as_of', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`latestPendingBillSnapshot failed — ${error.message}`)
  return (data as PendingBillSnapshot | null) ?? null
}
