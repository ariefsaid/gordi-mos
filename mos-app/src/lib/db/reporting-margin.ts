import { supabase } from '@/lib/supabase'
import { daysAgoIsoDate, latestBy } from '@/lib/db/reporting-shared'

// Data layer for reporting.sales_margin_daily (Home v1 margin KPI — ADR-0018 D6 prereq /
// ADR-0010 D5 / ADR-0019 D3). Reads via supabase.schema('reporting') on the existing
// client, mirroring lib/db/reporting.ts. RLS is the authority (finance/admin only,
// org-scoped) — this layer NEVER sends org_id as a query filter. Read-only.
//
// §7a AMENDMENT contract (Director, 2026-07-04 — supersedes the plan's original §3.2):
// POS-only grain (no `channel` column — COGS has no channel dimension upstream). Two
// COGS bases are carried distinctly per the finance doctrine (gordi-esb-bak
// COGS-REPORT-WORKFLOW.md): `cogs_interim_sm` (stock-movement, INTERIM/not GL-certified)
// and `cogs_budget_bom` (BOM/recipe, a budget — never an actual). `margin_interim`/
// `margin_interim_pct` are NULL (never a fake number) on a sync-gap day where COGS is
// missing — the dashboard must render "no data", never 0.

const reporting = () => supabase.schema('reporting')

/** Raw reporting.sales_margin_daily columns (source-faithful). Grain: org/date/ESB/branch
 * (POS-only today — no channel dimension; see §7a). */
export interface SalesMarginDailyRow {
  margin_date: string
  esb_code: string
  branch_code: string
  branch_name: string | null
  revenue: number
  /** stock-movement POS consumption — INTERIM basis, not GL-certified. Null = sync gap. */
  cogs_interim_sm: number | null
  /** BOM/recipe-cost COGS — a budget figure, never presented as an actual. */
  cogs_budget_bom: number | null
  /** revenue − cogs_interim_sm; null when cogs_interim_sm is null (never a fake margin). */
  margin_interim: number | null
  /** margin_interim/revenue; null when revenue <= 0 or margin_interim is null. */
  margin_interim_pct: number | null
  /** data-quality badge for low BOM-recipe-coverage days. */
  bom_coverage_pct: number | null
  snapshot_as_of: string
  source_contract_version: string
}

const SELECT =
  'margin_date,esb_code,branch_code,branch_name,revenue,cogs_interim_sm,cogs_budget_bom,margin_interim,margin_interim_pct,bom_coverage_pct,snapshot_as_of,source_contract_version'

export interface SalesMarginDailyFilters {
  /** Only include rows with margin_date >= (today − sinceDays). Omit for the full org-visible set. */
  sinceDays?: number
}

/**
 * List reporting.sales_margin_daily rows ordered by margin_date ascending. RLS scopes
 * rows to the caller's org + finance/admin access role — org_id is never sent.
 */
export async function listSalesMarginDaily(
  f: SalesMarginDailyFilters = {},
): Promise<SalesMarginDailyRow[]> {
  let q = reporting().from('sales_margin_daily').select(SELECT)
  if (f.sinceDays !== undefined) q = q.gte('margin_date', daysAgoIsoDate(f.sinceDays))
  q = q.order('margin_date', { ascending: true })
  const { data, error } = await q
  if (error) throw new Error(`listSalesMarginDaily failed — ${error.message}`)
  return (data ?? []) as unknown as SalesMarginDailyRow[]
}

/** Freshness: the latest `snapshot_as_of` across the given rows, or null if empty. */
export function latestMarginSnapshotAsOf(rows: SalesMarginDailyRow[]): string | null {
  return latestBy(rows, r => r.snapshot_as_of)
}

/** Reporting-day window: the latest `margin_date` across the given rows, or null if empty.
 * Current-period metrics must key off this, not the browser's local calendar date. */
export function latestMarginReportingDate(rows: SalesMarginDailyRow[]): string | null {
  return latestBy(rows, r => r.margin_date)
}
