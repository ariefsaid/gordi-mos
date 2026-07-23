// DashboardPage — the Money page at /mos/money, finance/admin only (route-gated in router.tsx
// via RequireAccessRole anyOf={['finance','admin']}, FR-002/AC-002/003). /dashboard is a legacy
// redirect alias only (SearchRedirect → /money). The analytical KPI hub composition (Variant B
// Tabs) replacing the sales-only dashboard. Reads BOTH
// reporting.sales_daily_revenue + reporting.sales_margin_daily via the reporting DAL
// (FR-003/AC-004); RLS is the security boundary. Never queries the warehouse directly.
//
// Design authority: docs/specs/dashboard.spec.md + docs/plans/2026-07-07-dashboard.md
// + signed-off mockup docs/design-mockups/dashboard-B-tabs.html (OD-DASH-6).
// States: loading skeleton (FR-022/AC-022), empty (FR-021/AC-021 — names the source),
// error+retry (FR-023/AC-023 — non-secret), DQ (FR-024/AC-024), NULL-margin (error-table).
// Reporting-day window anchors to latestReportingDate(rows), never Date.now() (FR-005).
// Layout: GlobalToolbar (cut + window + freshness) → ViewTabs (Summary/Detail) → pane.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { listSalesDailyRevenue, latestReportingDate } from '@/lib/db/reporting'
import { listSalesMarginDaily, latestMarginReportingDate } from '@/lib/db/reporting-margin'
import { latestBy } from '@/lib/db/reporting-shared'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import {
  computeRevenueKpis,
  computeGrossMarginKpis,
  aggregateByCut,
  resolveWindow,
  availableWindowBounds,
  basisLabel,
  formatGrossMarginValue,
  formatMarginPct,
  DEFAULT_WINDOW,
  type WindowSpec,
} from '@/lib/dashboard'
import { formatIDRCompact, formatDelta, dailySeries, type DashboardCut } from '@/lib/sales-dashboard'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { ChartFrame } from '@/components/dashboard/chart-frame'
import { DataTable, type DataTableSort } from '@/components/dashboard/data-table'
import { GlobalToolbar } from '@/components/dashboard/global-toolbar'
import { ViewTabs } from '@/components/ui/view-tabs'
import { WhatsComingStrip } from '@/components/dashboard/whats-coming-strip'
import { FreshnessLabel } from '@/components/dashboard/freshness-label'
import { DailyRevenueChart } from '@/components/sales/daily-revenue-chart'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import './dashboard-page.css'

type LoadState = 'loading' | 'ready' | 'error'

function windowFromQuery(value: string | null): WindowSpec {
  if (value === '7d') return { kind: 'preset', days: 7 }
  if (value === '60d') return { kind: 'preset', days: 60 }
  return DEFAULT_WINDOW
}

function cutFromQuery(value: string | null): DashboardCut {
  if (value === 'channel') return 'Channel'
  if (value === 'activity') return 'Activity'
  return 'Branch'
}

function windowQueryValue(spec: WindowSpec): string {
  return spec.kind === 'preset' ? `${spec.days}d` : 'custom'
}

interface DashboardTableRow {
  id: string
  dimension: string
  revenue: string
  transactions: number
  sharePct: string
  avgCheck: string
  cogsInterim: string
  grossMargin: string
  marginPct: string
  // Raw numeric values for correct sorting (display cols hold formatted strings).
  marginPctRaw: number | null
  revenueRaw: number
  sharePctRaw: number
  avgCheckRaw: number
  cogsInterimRaw: number | null
  grossMarginRaw: number | null
}

export function DashboardPage({ defaultTab = 'summary' }: { defaultTab?: 'summary' | 'detail' }) {
  useDocumentTitle('Money — Gordi MOS')
  const t = useT()
  const isDesktop = useIsDesktop()
  const [searchParams, setSearchParams] = useSearchParams()

  // ?tab= wins; the /money/detail route passes defaultTab="detail" (AC-017) so a
  // bare visit there opens the Detail tab even without a query string (AC-015).
  const tabParam = searchParams.get('tab')
  const tab = tabParam === 'detail' || tabParam === 'summary'
    ? tabParam
    : defaultTab
  const setTab = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (id === defaultTab && (tabParam === null)) {
      // restoring the route default → no query string needed
    } else if (id === 'summary' && defaultTab === 'summary') {
      next.delete('tab')
    } else {
      next.set('tab', id)
    }
    setSearchParams(next, { replace: true })
  }

  const [revenueRows, setRevenueRows] = useState<SalesDailyRevenueRow[]>([])
  const [marginRows, setMarginRows] = useState<SalesMarginDailyRow[]>([])
  const [load, setLoad] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)

  const [cut, setCut] = useState<DashboardCut>(() => cutFromQuery(searchParams.get('cut')))
  const [windowSpec, setWindowSpec] = useState<WindowSpec>(() => windowFromQuery(searchParams.get('window')))
  const [sort, setSort] = useState<DataTableSort>({ key: 'revenue', dir: 'desc' })

  const fetchRows = useCallback(async () => {
    setLoad('loading')
    try {
      // Trailing 60 days covers the 30d window + its equal-length prior window (AC-005).
      const [rev, marg] = await Promise.all([
        listSalesDailyRevenue({ sinceDays: 60 }),
        listSalesMarginDaily({ sinceDays: 60 }),
      ])
      setRevenueRows(rev)
      setMarginRows(marg)
      setLoad('ready')
    } catch {
      setLoad('error')
    }
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows, retryKey])

  // ── Reporting-day anchors (FR-005 — never Date.now()) ──────────────────────────
  const latestDate = useMemo(() => {
    const r = latestReportingDate(revenueRows)
    const m = latestMarginReportingDate(marginRows)
    // The latest reporting day across both read-models (max of the two).
    return [r, m].filter((x): x is string => x != null).sort().at(-1) ?? null
  }, [revenueRows, marginRows])

  const snapshotAsOf = useMemo(() => {
    const r = latestBy(revenueRows, row => row.snapshot_as_of)
    const m = latestBy(marginRows, row => row.snapshot_as_of)
    return [r, m].filter((x): x is string => x != null).sort().at(-1) ?? null
  }, [revenueRows, marginRows])

  const bounds = useMemo(() => availableWindowBounds(revenueRows), [revenueRows])

  // ── KPI computations (memoised on rows + window) ───────────────────────────────
  // The 7d/30d tiles are fixed-window filter-in-place drivers (FR-006); latestDay/
  // avgCheck/channelMix/GM follow the active window. Computing all three windows
  // here keeps the tiles always-meaningful regardless of the global window.
  const rev7d = useMemo(
    () => (latestDate ? computeRevenueKpis(revenueRows, { kind: 'preset', days: 7 }, latestDate) : null),
    [revenueRows, latestDate],
  )
  const rev30d = useMemo(
    () => (latestDate ? computeRevenueKpis(revenueRows, { kind: 'preset', days: 30 }, latestDate) : null),
    [revenueRows, latestDate],
  )
  const revKpis = useMemo(
    () => (latestDate ? computeRevenueKpis(revenueRows, windowSpec, latestDate) : null),
    [revenueRows, windowSpec, latestDate],
  )
  const gmKpis = useMemo(
    () => (latestDate ? computeGrossMarginKpis(marginRows, windowSpec, latestDate) : null),
    [marginRows, windowSpec, latestDate],
  )
  const { start, end } = latestDate
    ? resolveWindow(windowSpec, latestDate)
    : { start: '', end: '' }
  const cutRows = useMemo(
    () => (latestDate ? aggregateByCut(revenueRows, marginRows, cut, start, end) : []),
    [revenueRows, marginRows, cut, start, end, latestDate],
  )
  const chartSeries = useMemo(() => {
    if (!latestDate) return []
    const windowed = revenueRows.filter(
      r => r.revenue_date >= start && r.revenue_date <= end,
    )
    return dailySeries(windowed)
  }, [revenueRows, start, end, latestDate])

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (load === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title="Money" jobSentence={t('job.money')} state="loading">
        <DashboardChrome
          cut={cut} onCut={setCut}
          windowSpec={windowSpec} onWindow={setWindowSpec}
          bounds={bounds} snapshotAsOf={snapshotAsOf}
          tab={tab} onTab={setTab}
        />
        {/* The `.dash-loading` wrapper is THE single page-level loading status; the
            placeholder tile grid + SkeletonRows are decorative skeletons, so they are
            aria-hidden — otherwise each tile's own LoadingShell status (cohesion item
            #3) would nest inside this one. */}
        <div role="status" aria-label="Loading" aria-busy="true" className="dash-loading">
          <div className="dash-kpi-grid" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <KPITile key={`r${i}`} label="Loading" value="" state="loading" />
            ))}
          </div>
          <SkeletonRows count={4} />
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (load === 'error') {
    return (
      <PageFamilyFrame family="workspace" title="Money" jobSentence={t('job.money')} state="error">
        <DashboardChrome
          cut={cut} onCut={setCut}
          windowSpec={windowSpec} onWindow={setWindowSpec}
          bounds={bounds} snapshotAsOf={snapshotAsOf}
          tab={tab} onTab={setTab}
        />
        <ErrorState
          message="Couldn't load sales reporting. Try again."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      </PageFamilyFrame>
    )
  }

  // ── Empty (no snapshot rows) ─────────────────────────────────────────────────
  if (revenueRows.length === 0 || !latestDate || !rev7d || !rev30d || !revKpis) {
    return (
      <PageFamilyFrame family="workspace" title="Money" jobSentence={t('job.money')} count={0} state="empty">
        <DashboardChrome
          cut={cut} onCut={setCut}
          windowSpec={windowSpec} onWindow={setWindowSpec}
          bounds={bounds} snapshotAsOf={snapshotAsOf}
          tab={tab} onTab={setTab}
        />
        <EmptyState
          variant="awaiting"
          title="No sales snapshot data yet"
          copy="No sales snapshot rows are available yet. The next warehouse snapshot will populate this page."
          className="dash-empty-fill"
        />
      </PageFamilyFrame>
    )
  }

  // ── Populated ─────────────────────────────────────────────────────────────────
  const delta7d = rev7d ? formatDelta(rev7d.trailing) : null
  const delta30d = rev30d ? formatDelta(rev30d.trailing) : null
  const basis = basisLabel('interim-stock-movement')
  const gmDelta = gmKpis?.delta
  const tableRows = toTableRows(cutRows)
  const sortedRows = sortRows(tableRows, sort)

  // Filter-in-place: clicking a revenue preset tile sets the window to that tile.
  const tileWindow = (days: 7 | 30 | 60): WindowSpec => ({ kind: 'preset', days })
  const activePresetDays = windowSpec.kind === 'preset' ? windowSpec.days : null

  const windowLabel = windowSpec.kind === 'preset' ? `${windowSpec.days}d` : 'custom'
  const detailParams = new URLSearchParams(searchParams)
  detailParams.delete('tab')
  detailParams.set('window', windowQueryValue(windowSpec))
  detailParams.set('cut', cut.toLowerCase())
  const detailHref = `/money/detail?${detailParams.toString()}`

  return (
    <PageFamilyFrame
      family="workspace"
      title="Money"
      jobSentence={t('job.money')}
      count={cutRows.length}
      meta={snapshotAsOf ? <FreshnessLabel asOf={snapshotAsOf} /> : undefined}
    >

      <DashboardChrome
        cut={cut} onCut={setCut}
        windowSpec={windowSpec} onWindow={setWindowSpec}
        bounds={bounds} snapshotAsOf={snapshotAsOf}
        tab={tab} onTab={setTab}
        trailing={<span>Applies to both: <b>{cut}</b> · <b>{windowLabel}</b></span>}
      />

      {tab === 'summary' ? (
        <div className="dash-pane" role="tabpanel" aria-label="Summary">
          {/* Revenue KPI row — 7d/30d are fixed-window filter-in-place drivers (FR-006);
              latestDay/avgCheck/channelMix follow the active window. */}
          <div className="dash-kpi-grid">
            <KPITile
              label="Trailing 7-day revenue"
              value={rev7d ? formatIDRCompact(rev7d.trailing.current) : '—'}
              delta={delta7d ? { text: delta7d.text, tone: delta7d.tone } : undefined}
              onClick={() => setWindowSpec(tileWindow(7))}
              selected={activePresetDays === 7}
              help="Sum of clean revenue over the 7 days ending on the latest reporting day. WoW = prior 7-day window."
            />
            <KPITile
              label="Trailing 30-day revenue"
              value={rev30d ? formatIDRCompact(rev30d.trailing.current) : '—'}
              delta={delta30d ? { text: delta30d.text, tone: delta30d.tone } : undefined}
              onClick={() => setWindowSpec(tileWindow(30))}
              selected={activePresetDays === 30}
              help="Sum over 30 days ending on the latest reporting day. MoM = prior 30-day window."
            />
            <KPITile
              label="Latest reporting-day revenue"
              value={formatIDRCompact(revKpis.latestDay)}
              sub={latestDate}
            />
            <KPITile
              label="Avg check"
              value={revKpis.avgCheck != null ? formatIDRCompact(revKpis.avgCheck) : '—'}
              sub="revenue ÷ transactions"
              help="Trailing-window revenue ÷ transactions."
            />
            <KPITile
              label="Channel mix"
              value={revKpis.channelMix}
              sub="trailing window"
              help="Share of trailing-window revenue by channel."
            />
          </div>

          {/* Gross margin / COGS row — basis-labelled (AC-008) */}
          <div className="dash-kpi-grid dash-kpi-grid--gm">
            <KPITile
              label="Gross margin %"
              value={formatMarginPct(gmKpis?.marginPct ?? null)}
              basis={{ label: basis }}
              dq={gmKpis?.dq}
              help="Gross margin ÷ revenue over the active window. Basis = interim stock-movement."
            />
            <KPITile
              label="Gross margin amt"
              value={formatGrossMarginValue(gmKpis?.marginAmount ?? null)}
              delta={gmDelta ? { text: gmDelta.text, tone: gmDelta.tone } : undefined}
              basis={{ label: basis }}
              help="Revenue − interim COGS over the window."
            />
            <KPITile
              label="Interim COGS"
              value={formatGrossMarginValue(gmKpis?.cogsAmount ?? null)}
              basis={{ label: basis }}
              help="Cost of goods sold, stock-movement-derived, not GL-certified."
            />
            <KPITile
              label="BOM coverage"
              value={gmKpis?.bomCoveragePct != null ? formatMarginPct(gmKpis.bomCoveragePct) : '—'}
              dq={gmKpis?.dq}
              help="Share of COGS backed by a bill-of-materials basis over the window."
            />
          </div>

          <p className="dash-footnote">
            <b>Interim</b> = not-yet-reconciled, POS-only, mid-month. COGS is
            stock-movement-derived, <b>not GL-certified</b>.
          </p>

          <WhatsComingStrip />

          <ChartFrame
            title="Daily revenue"
            ariaLabel="Daily revenue chart"
            freshness={snapshotAsOf ? <FreshnessLabel asOf={snapshotAsOf} /> : undefined}
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
                  {chartSeries.flatMap(point =>
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
            <DailyRevenueChart series={chartSeries} />
          </ChartFrame>

          {/* FR-018: condensed detail table reflecting the current filter (top 5 rows). */}
          <DataTable
            columns={detailColumns(cut)}
            rows={sortedRows.slice(0, 5)}
            sort={undefined}
            onSortChange={undefined}
            isDesktop={isDesktop}
            caption={`Top ${Math.min(5, sortedRows.length)} by revenue — switch to Detail for the full table`}
            emptyLabel="No rows for this cut."
          />
          <div className="dash-detail-door">
            <Link to={detailHref} className="btn btn-outline">View full detail</Link>
          </div>
        </div>
      ) : (
        <div className="dash-pane" role="tabpanel" aria-label="Detail">
          <DataTable
            columns={detailColumns(cut)}
            rows={sortedRows}
            sort={sort}
            onSortChange={setSort}
            isDesktop={isDesktop}
            caption="Revenue breakdown"
            emptyLabel="No rows for this cut."
          />
          <p className="dash-footnote">
            <b>Interim</b> = not-yet-reconciled, POS-only, mid-month. COGS is
            stock-movement-derived, <b>not GL-certified</b>.
          </p>
        </div>
      )}
    </PageFamilyFrame>
  )
}

// ── The persistent chrome (toolbar + tabs) — renders in every state so the user sees
//    structure even in loading/empty/error (mockup STATE NOTES, FR-011/AC-011). ─────
interface DashboardChromeProps {
  cut: DashboardCut
  onCut: (c: DashboardCut) => void
  windowSpec: WindowSpec
  onWindow: (w: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
  snapshotAsOf: string | null
  tab: string
  onTab: (id: string) => void
  trailing?: React.ReactNode
}

function DashboardChrome(props: DashboardChromeProps) {
  return (
    <>
      <GlobalToolbar
        cut={props.cut}
        onCutChange={props.onCut}
        window={props.windowSpec}
        onWindowChange={props.onWindow}
        bounds={props.bounds}
        snapshotAsOf={props.snapshotAsOf}
      />
      <ViewTabs
        ariaLabel="Money view"
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'detail', label: 'Detail' },
        ]}
        active={props.tab}
        onChange={props.onTab}
        trailing={props.trailing}
      />
      {SHOW_FOLLOWUPS && (
        <div className="dash-queue-entry">
          <Link to="/money/follow-ups" className="btn btn-outline">Follow-up queue</Link>
        </div>
      )}
    </>
  )
}

// ── Detail-table column defs (AC-018 — the full mandated column set) ──────────────
function detailColumns(cut: DashboardCut) {
  return [
    { key: 'dimension', header: cut, cardLabel: '' },
    {
      key: 'revenue', header: 'Revenue', numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.revenue,
    },
    { key: 'transactions', header: 'Txns', numeric: true, sortable: true },
    {
      key: 'sharePct', header: 'Share', numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.sharePct,
    },
    {
      key: 'avgCheck', header: 'Avg check', numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.avgCheck,
    },
    {
      key: 'cogsInterim', header: 'Interim COGS', numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.cogsInterim,
    },
    {
      key: 'grossMargin', header: 'Gross margin', numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.grossMargin,
    },
    {
      key: 'marginPct', header: 'Margin %', numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.marginPct,
    },
  ]
}

// ── Row shaping: CutRow (numbers) → display-ready strings (AC-018, AC-008 basis) ──
function toTableRows(cutRows: ReturnType<typeof aggregateByCut>): DashboardTableRow[] {
  return cutRows.map(r => ({
    id: r.id,
    dimension: r.dimension,
    revenue: formatIDRCompact(r.revenue),
    transactions: r.transactions,
    sharePct: `${r.sharePct}%`,
    avgCheck: formatIDRCompact(r.avgCheck),
    cogsInterim: r.cogsInterim != null ? formatIDRCompact(r.cogsInterim) : '—',
    grossMargin: r.grossMargin != null ? formatIDRCompact(r.grossMargin) : '—',
    marginPct: formatMarginPct(r.marginPct),
    marginPctRaw: r.marginPct,
    revenueRaw: r.revenue,
    sharePctRaw: r.sharePct,
    avgCheckRaw: r.avgCheck,
    cogsInterimRaw: r.cogsInterim,
    grossMarginRaw: r.grossMargin,
  }))
}

// Pure sort — sorts on raw numeric values (display cols hold formatted strings).
// Every sortable column maps to its raw field; nulls sort last in both directions.
function sortRows(rows: DashboardTableRow[], sort: DataTableSort): DashboardTableRow[] {
  const factor = sort.dir === 'asc' ? 1 : -1
  const rawField: Partial<Record<string, keyof DashboardTableRow>> = {
    revenue: 'revenueRaw',
    transactions: 'transactions',
    sharePct: 'sharePctRaw',
    avgCheck: 'avgCheckRaw',
    cogsInterim: 'cogsInterimRaw',
    grossMargin: 'grossMarginRaw',
    marginPct: 'marginPctRaw',
  }
  const field = rawField[sort.key]
  if (!field) return [...rows].sort((a, b) => String(a.dimension).localeCompare(String(b.dimension)) * factor)
  return [...rows].sort((a, b) => {
    const av = a[field] as number | null
    const bv = b[field] as number | null
    if (av == null && bv == null) return 0
    if (av == null) return 1 // nulls last regardless of dir
    if (bv == null) return -1
    return (av - bv) * factor
  })
}
