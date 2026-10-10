import { supabase } from '@/lib/supabase'
import { daysAgoIsoDate, latestBy, readAllPages, REPORTING_WINDOW_DAYS } from '@/lib/db/reporting-shared'

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
  /** Link to shared.branches; null until a human confirms the ERP code's mapping. */
  branch_id: string | null
  transactions: number
  clean_revenue: number
  snapshot_as_of: string
  source_contract_version: string
}

const SELECT =
  'revenue_date,channel,esb_code,branch_code,branch_name,branch_id,transactions,clean_revenue,snapshot_as_of,source_contract_version'

export interface SalesDailyRevenueFilters {
  /** Only include rows with revenue_date >= (today − sinceDays). */
  sinceDays?: number
  fromDate?: string
  toDate?: string
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
  const since = daysAgoIsoDate(f.sinceDays ?? REPORTING_WINDOW_DAYS)
  return readAllPages<SalesDailyRevenueRow>('listSalesDailyRevenue', (from, to) => {
    let query = reporting().from('sales_daily_revenue').select(SELECT)
    query = query.gte('revenue_date', f.fromDate ?? since)
    if (f.toDate) query = query.lte('revenue_date', f.toDate)
    return query.order('revenue_date', { ascending: true })
      .order('channel', { ascending: true })
      .order('esb_code', { ascending: true })
      .order('branch_code', { ascending: true })
      .range(from, to)
  })
}

/** Reporting-day window (FR-004): the latest `revenue_date` across the given rows, or null if
 * empty. Current-period metrics must key off this, not the browser's local calendar date. */
export function latestReportingDate(rows: SalesDailyRevenueRow[]): string | null {
  return latestBy(rows, r => r.revenue_date)
}

/** Latest date visible through the caller's reporting RLS, independent of the selected history window. */
export async function latestSalesReportingDate(): Promise<string | null> {
  const { data, error } = await reporting().from('sales_daily_revenue').select('revenue_date')
    .order('revenue_date', { ascending: false }).limit(1)
  if (error) throw new Error(`latestSalesReportingDate failed — ${error.message}`)
  return (data as { revenue_date: string }[] | null)?.[0]?.revenue_date ?? null
}
