// SalesDashboardPage — /mos/sales, finance/admin only (route-gated in router.tsx via
// RequireAccessRole anyOf={['finance','admin']}, FR-001/AC-001/002). The sales-specific
// composition wiring the reusable dashboard kit (KPITile/ChartFrame/DataTable/
// FreshnessLabel/CutToggle) to reporting.sales_daily_revenue. Reads via the reporting
// DAL only (FR-002/AC-003); RLS is the security boundary. Never queries the warehouse
// directly, never writes financial data.
//
// Design authority: docs/plans/2026-07-02-sales-dashboard-design.md.
// States: loading skeleton, empty (FR-011/AC-008 — no KPI tiles, names the source),
// error+retry (FR-012/AC-009 — non-secret), populated (FR-005..010).
// Reporting-day window anchors to latestReportingDate(rows), never Date.now() (FR-004).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { listSalesDailyRevenue, latestSnapshotAsOf, latestReportingDate } from '@/lib/db/reporting'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import {
  computeSalesKpis,
  dailySeries,
  revenueTableRows,
  sortRevenueRows,
  formatDelta,
  formatIDRCompact,
  type DashboardCut,
  type RevenueTableSort,
} from '@/lib/sales-dashboard'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { ChartFrame } from '@/components/dashboard/chart-frame'
import { DataTable, type DataTableSort } from '@/components/dashboard/data-table'
import { FreshnessLabel } from '@/components/dashboard/freshness-label'
import { CutToggle } from '@/components/dashboard/cut-toggle'
import { DailyRevenueChart } from '@/components/sales/daily-revenue-chart'
import { revenueColumns } from '@/components/sales/revenue-columns'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import './sales-dashboard-page.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

const CUT_OPTIONS: DashboardCut[] = ['Branch', 'Activity']

export function SalesDashboardPage() {
  useDocumentTitle('Sales — Gordi MOS')
  const isDesktop = useIsDesktop()

  const [rows, setRows] = useState<SalesDailyRevenueRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [cut, setCut] = useState<DashboardCut>('Branch')
  // Default matches revenueTableRows' own revenue-desc order (FR-009).
  const [sort, setSort] = useState<RevenueTableSort>({ key: 'revenue', dir: 'desc' })

  const fetchRows = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      // Trailing 60 days covers the 30d window + its equal-length prior window (AC-005).
      const data = await listSalesDailyRevenue({ sinceDays: 60 })
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows, retryKey])

  const snapshotAsOf = useMemo(() => latestSnapshotAsOf(rows), [rows])
  const latestDate = useMemo(() => latestReportingDate(rows), [rows])
  const kpis = useMemo(
    () => (latestDate ? computeSalesKpis(rows, latestDate) : null),
    [rows, latestDate],
  )
  const series = useMemo(() => dailySeries(rows), [rows])
  const tableRows = useMemo(
    () => sortRevenueRows(revenueTableRows(rows, cut), sort),
    [rows, cut, sort],
  )

  if (load.kind === 'loading') {
    return (
      <PageFrame variant="data">
        <div role="status" aria-label="Loading" aria-busy="true">
          <SkeletonRows count={4} />
        </div>
      </PageFrame>
    )
  }

  if (load.kind === 'error') {
    return (
      <PageFrame variant="data">
        <PageHead title="Sales" />
        <ErrorState
          message="Couldn't load sales reporting. Try again."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      </PageFrame>
    )
  }

  if (rows.length === 0 || !kpis || !latestDate) {
    return (
      <PageFrame variant="data">
        <PageHead title="Sales" />
        <EmptyState
          title="No sales snapshot data yet"
          copy="No sales snapshot rows are available yet. The next warehouse snapshot will populate this page."
        />
      </PageFrame>
    )
  }

  const delta7d = formatDelta(kpis.trailing7d)
  const delta30d = formatDelta(kpis.trailing30d)

  return (
    <PageFrame variant="data">
      <div className="sdp-head">
        <PageHead title="Sales" />
        {snapshotAsOf && <FreshnessLabel asOf={snapshotAsOf} />}
      </div>

      <div className="sdp-kpi-grid">
        <KPITile
          label="Trailing 7-day revenue"
          value={formatIDRCompact(kpis.trailing7d.current)}
          delta={{ text: delta7d.text, tone: delta7d.tone }}
        />
        <KPITile
          label="Trailing 30-day revenue"
          value={formatIDRCompact(kpis.trailing30d.current)}
          delta={{ text: delta30d.text, tone: delta30d.tone }}
        />
        <KPITile
          label="Latest reporting-day revenue"
          value={formatIDRCompact(kpis.latestDayRevenue)}
          sub={kpis.latestReportingDate}
        />
        <KPITile label="Channel mix" value={kpis.channelMix} />
      </div>

      <ChartFrame
        title="Daily revenue"
        ariaLabel="Daily revenue chart"
        freshness={snapshotAsOf ? <FreshnessLabel asOf={snapshotAsOf} /> : undefined}
        controls={
          <CutToggle options={CUT_OPTIONS} value={cut} onChange={v => setCut(v as DashboardCut)} ariaLabel="Branch or Activity" />
        }
        tableFallback={
          <table>
            <caption>Daily revenue by channel</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Channel</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap(point =>
                Object.entries(point.byChannel).map(([channel, amount]) => (
                  <tr key={`${point.date}-${channel}`}>
                    <td>{point.date}</td>
                    <td>{channel}</td>
                    <td>{formatIDRCompact(amount)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        }
      >
        <DailyRevenueChart series={series} />
      </ChartFrame>

      <DataTable
        columns={revenueColumns(cut)}
        rows={tableRows}
        sort={sort as DataTableSort}
        onSortChange={s => setSort(s as RevenueTableSort)}
        isDesktop={isDesktop}
        caption={`Revenue by ${cut.toLowerCase()} and channel`}
        emptyLabel="No rows for this cut."
      />
    </PageFrame>
  )
}
