// use-company-finance-kpis.ts — the shared revenue/margin KPI hook for the Home compositions.
// Extracted verbatim from HomePage (Home v1) so BOTH Home v1 and the stacked-union money-position
// section (company scope) render the SAME existing tiles — reuse, not a tile rewrite
// (docs/specs/home-v1.spec.md §2.2, home-stacked-union.spec.md §2.10).
//
// Role-guarded: when canSeeFinance is false the reporting fetch is skipped entirely (a member never
// issues the query) → tiles absent, never a misleading zero. RLS is the hard boundary.
import { useState, useEffect, useMemo } from 'react'
import { listSalesDailyRevenue, latestSnapshotAsOf, latestReportingDate } from '@/lib/db/reporting'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import {
  listSalesMarginDaily,
  latestMarginSnapshotAsOf,
  latestMarginReportingDate,
} from '@/lib/db/reporting-margin'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { trailingWindow, formatDelta } from '@/lib/sales-dashboard'
import { trailingMargin, formatMarginKpi } from '@/lib/home-kpis'

export type FinanceFetchState = 'loading' | 'ready' | 'error'

export interface CompanyFinanceKpis {
  revenueState: FinanceFetchState
  revenueWindow: ReturnType<typeof trailingWindow> | null
  revenueDelta: ReturnType<typeof formatDelta> | null
  marginState: FinanceFetchState
  marginDisplay: ReturnType<typeof formatMarginKpi> | null
  marginLatestPct: number | null
  /** the freshest "as of" snapshot timestamp across revenue + margin rows (or null) */
  snapshotAsOf: string | null
}

/**
 * Fetch + derive the company revenue/margin KPIs. Skips the revenue fetch when `canSeeRevenue` is
 * false, and skips the margin fetch when `canSeeMargin` is false (ADR-0051 D4 — a supervisor sees
 * revenue but not margin; the margin fetch is never issued for them, never an empty/`—` panel).
 * Pure-derived display values are returned (formatted by the existing `sales-dashboard` /
 * `home-kpis` selectors); the caller renders the `KPITile`s.
 */
export function useCompanyFinanceKpis(
  canSeeRevenue: boolean,
  canSeeMargin: boolean = canSeeRevenue,
): CompanyFinanceKpis {
  const [revenueRows, setRevenueRows] = useState<SalesDailyRevenueRow[]>([])
  const [revenueState, setRevenueState] = useState<FinanceFetchState>('loading')
  const [marginRows, setMarginRows] = useState<SalesMarginDailyRow[]>([])
  const [marginState, setMarginState] = useState<FinanceFetchState>('loading')

  useEffect(() => {
    if (!canSeeRevenue) return
    let cancelled = false
    setRevenueState('loading')
    listSalesDailyRevenue({ sinceDays: 60 })
      .then((rows) => {
        if (cancelled) return
        setRevenueRows(rows)
        setRevenueState('ready')
      })
      .catch(() => {
        if (!cancelled) setRevenueState('error')
      })
    return () => {
      cancelled = true
    }
  }, [canSeeRevenue])

  useEffect(() => {
    if (!canSeeMargin) return
    let cancelled = false
    setMarginState('loading')
    listSalesMarginDaily({ sinceDays: 60 })
      .then((rows) => {
        if (cancelled) return
        setMarginRows(rows)
        setMarginState('ready')
      })
      .catch(() => {
        if (!cancelled) setMarginState('error')
      })
    return () => {
      cancelled = true
    }
  }, [canSeeMargin])

  const revenueLatestDate = useMemo(() => latestReportingDate(revenueRows), [revenueRows])
  const revenueWindow = useMemo(
    () => (revenueLatestDate ? trailingWindow(revenueRows, revenueLatestDate, 7) : null),
    [revenueRows, revenueLatestDate],
  )
  const revenueDelta = revenueWindow ? formatDelta(revenueWindow) : null

  const marginLatestDate = useMemo(() => latestMarginReportingDate(marginRows), [marginRows])
  const marginWindow = useMemo(
    () => (marginLatestDate ? trailingMargin(marginRows, marginLatestDate, 7) : null),
    [marginRows, marginLatestDate],
  )
  const marginLatestPct = useMemo(() => {
    if (!marginLatestDate) return null
    const latestRow = marginRows.find((r) => r.margin_date === marginLatestDate)
    return latestRow?.margin_interim_pct ?? null
  }, [marginRows, marginLatestDate])
  const marginDisplay = marginWindow ? formatMarginKpi(marginWindow, marginLatestPct) : null

  const snapshotAsOf = useMemo(() => {
    const revenueFresh = latestSnapshotAsOf(revenueRows)
    const marginFresh = latestMarginSnapshotAsOf(marginRows)
    if (revenueFresh && marginFresh) return revenueFresh > marginFresh ? revenueFresh : marginFresh
    return revenueFresh ?? marginFresh
  }, [revenueRows, marginRows])

  return {
    revenueState,
    revenueWindow,
    revenueDelta,
    marginState,
    marginDisplay,
    marginLatestPct,
    snapshotAsOf,
  }
}
