import { supabase } from '@/lib/supabase'
import { daysAgoIsoDate, latestBy } from '@/lib/db/reporting-shared'

// Data layer for reporting.sales_daily_revenue (sales dashboard, Issue 1 — OD-P4-2 / ADR-0010
// D5 / ADR-0017 D3). Reads via supabase.schema('reporting') on the existing client (mirrors the
// mos/ops pattern in tasks.ts / kitchen-logs.ts) — one auth session, one token-refresh path.
// RLS is the authority (finance/admin only, org-scoped): this layer NEVER sends org_id as a
// query filter (FR-002). Read-only — no writes to this reporting table from the app.

const reporting = () => supabase.schema('reporting')

/** Raw reporting.sales_daily_revenue columns (source-faithful — no dashboard-layer mapping here,
 * FR-008). Grain: org/date/channel/ESB/branch (one row per combination per snapshot run). */
export interface SalesDailyRevenueRow {
  revenue_date: string
  channel: string
  esb_code: string
  branch_code: string
  branch_name: string | null
  transactions: number
  clean_revenue: number
  snapshot_as_of: string
  source_contract_version: string
}

const SELECT =
  'revenue_date,channel,esb_code,branch_code,branch_name,transactions,clean_revenue,snapshot_as_of,source_contract_version'

export interface SalesDailyRevenueFilters {
  /** Only include rows with revenue_date >= (today − sinceDays). Omit for the full org-visible set. */
  sinceDays?: number
}

/**
 * List reporting.sales_daily_revenue rows ordered by revenue_date ascending (FR-002/AC-003).
 * RLS scopes rows to the caller's org + finance/admin access role — org_id is never sent.
 * B2B/Roastery and every other channel/branch combination pass through unchanged (AC-006);
 * any dashboard-layer grouping (e.g. Activity mapping) happens above this data layer.
 */
export async function listSalesDailyRevenue(
  f: SalesDailyRevenueFilters = {},
): Promise<SalesDailyRevenueRow[]> {
  let q = reporting().from('sales_daily_revenue').select(SELECT)
  if (f.sinceDays !== undefined) q = q.gte('revenue_date', daysAgoIsoDate(f.sinceDays))
  q = q.order('revenue_date', { ascending: true })
  const { data, error } = await q
  if (error) throw new Error(`listSalesDailyRevenue failed — ${error.message}`)
  return (data ?? []) as unknown as SalesDailyRevenueRow[]
}

/** Freshness (FR-003): the latest `snapshot_as_of` across the given rows, or null if empty. */
export function latestSnapshotAsOf(rows: SalesDailyRevenueRow[]): string | null {
  return latestBy(rows, r => r.snapshot_as_of)
}

/** Reporting-day window (FR-004): the latest `revenue_date` across the given rows, or null if
 * empty. Current-period metrics must key off this, not the browser's local calendar date. */
export function latestReportingDate(rows: SalesDailyRevenueRow[]): string | null {
  return latestBy(rows, r => r.revenue_date)
}
