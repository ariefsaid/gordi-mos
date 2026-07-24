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
import { useT, type Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
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
import { formatPercent } from '@/lib/format/percent'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { ChartFrame } from '@/components/dashboard/chart-frame'
import { DataTable, type DataTableSort } from '@/components/dashboard/data-table'
import { GlobalToolbar } from '@/components/dashboard/global-toolbar'
import { ViewTabs } from '@/components/ui/view-tabs'
import { WhatsComingStrip } from '@/components/dashboard/whats-coming-strip'
import { FreshnessLabel } from '@/components/dashboard/freshness-label'
import { DailyRevenueChart } from '@/components/sales/daily-revenue-chart'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
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

// GUARD-R2 (census DO-7 · Money): the page head never renders a naked count pill. The
// cut row-count folds into ONE labeled meta sentence ("5 branches · as of …"), matching
// the Tasks head ("14 tasks · 2 blocked") — a digit with no attached noun carries no
// meaning. Loading / empty / error show the "—" placeholder, never a stale bare digit.
// I18N-1: the noun routes through the catalog (singular/plural keys, resolved per locale).
function cutNoun(cut: DashboardCut, n: number, t: Translate): string {
  const stem = cut === 'Channel' ? 'channel' : cut === 'Activity' ? 'activity' : 'branch'
  return t(`money.cut.${stem}.${n === 1 ? 'one' : 'other'}` as MessageKey)
}

// I18N-1: the cut's display label (Branch/Channel/Activity) — used in the head meta, the
// "applies to both" line, and the detail table's dimension column header.
function cutLabel(cut: DashboardCut, t: Translate): string {
  const stem = cut === 'Channel' ? 'channel' : cut === 'Activity' ? 'activity' : 'branch'
  return t(`money.cut.${stem}` as MessageKey)
}

const HEAD_META_PLACEHOLDER = <span className="ch-meta-line tabular-nums">—</span>

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
  const t = useT()
  useDocumentTitle(t('money.documentTitle'))
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
      <PageFamilyFrame family="workspace" title={t('dest.money')} jobSentence={t('job.money')} meta={HEAD_META_PLACEHOLDER} state="loading">
        <DashboardChrome
          cut={cut} onCut={setCut}
          windowSpec={windowSpec} onWindow={setWindowSpec}
          bounds={bounds}
          tab={tab} onTab={setTab}
          t={t}
        />
        {/* The `.dash-loading` wrapper is THE single page-level loading status; the
            placeholder tile grid + SkeletonRows are decorative skeletons, so they are
            aria-hidden — otherwise each tile's own LoadingShell status (cohesion item
            #3) would nest inside this one. */}
        <div role="status" aria-label={t('common.loading')} aria-busy="true" className="dash-loading">
          <div className="dash-kpi-grid" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <KPITile key={`r${i}`} label={t('common.loading')} value="" state="loading" />
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
      <PageFamilyFrame family="workspace" title={t('dest.money')} jobSentence={t('job.money')} meta={HEAD_META_PLACEHOLDER} state="error">
        <DashboardChrome
          cut={cut} onCut={setCut}
          windowSpec={windowSpec} onWindow={setWindowSpec}
          bounds={bounds}
          tab={tab} onTab={setTab}
          t={t}
        />
        <ErrorState
          message={t('money.error')}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      </PageFamilyFrame>
    )
  }

  // ── Empty (no snapshot rows) ─────────────────────────────────────────────────
  if (revenueRows.length === 0 || !latestDate || !rev7d || !rev30d || !revKpis) {
    return (
      <PageFamilyFrame family="workspace" title={t('dest.money')} jobSentence={t('job.money')} meta={HEAD_META_PLACEHOLDER} state="empty">
        <DashboardChrome
          cut={cut} onCut={setCut}
          windowSpec={windowSpec} onWindow={setWindowSpec}
          bounds={bounds}
          tab={tab} onTab={setTab}
          t={t}
        />
        <EmptyState
          variant="awaiting"
          title={t('money.empty.title')}
          copy={t('money.empty.copy')}
          className="dash-empty-fill"
        >
          {/* F11 (OD-REDESIGN-91 #24): the awaiting-sync ↻ is a REAL refresh, not a decorative
              badge. It re-fetches the snapshot (retryKey → fetchRows); the page flips to its
              loading branch while it runs and to the honest error branch if the fetch fails, so
              the affordance never lies about pending/success. */}
          <Button variant="outline" onClick={() => setRetryKey(k => k + 1)}>
            {t('money.empty.refresh')}
          </Button>
        </EmptyState>
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
      title={t('dest.money')}
      jobSentence={t('job.money')}
      meta={
        <span className="ch-meta-line tabular-nums">
          {cutRows.length} {cutNoun(cut, cutRows.length, t)}
          {snapshotAsOf && <> · <FreshnessLabel asOf={snapshotAsOf} /></>}
        </span>
      }
    >

      <DashboardChrome
        cut={cut} onCut={setCut}
        windowSpec={windowSpec} onWindow={setWindowSpec}
        bounds={bounds}
        tab={tab} onTab={setTab}
        t={t}
        trailing={<span>{t('money.appliesToBoth')} <b>{cutLabel(cut, t)}</b> · <b>{windowLabel}</b></span>}
      />

      {tab === 'summary' ? (
        <div className="dash-pane" role="tabpanel" aria-label={t('money.tab.summary')}>
          {/* Revenue KPI row — 7d/30d are fixed-window filter-in-place drivers (FR-006);
              latestDay/avgCheck/channelMix follow the active window. */}
          <div className="dash-kpi-grid">
            <KPITile
              label={t('money.kpi.rev7d')}
              value={rev7d ? formatIDRCompact(rev7d.trailing.current) : '—'}
              delta={delta7d ? { text: delta7d.text, tone: delta7d.tone } : undefined}
              onClick={() => setWindowSpec(tileWindow(7))}
              selected={activePresetDays === 7}
              help={t('money.kpi.rev7d.help')}
            />
            <KPITile
              label={t('money.kpi.rev30d')}
              value={rev30d ? formatIDRCompact(rev30d.trailing.current) : '—'}
              delta={delta30d ? { text: delta30d.text, tone: delta30d.tone } : undefined}
              onClick={() => setWindowSpec(tileWindow(30))}
              selected={activePresetDays === 30}
              help={t('money.kpi.rev30d.help')}
            />
            <KPITile
              label={t('money.kpi.latestDay')}
              value={formatIDRCompact(revKpis.latestDay)}
              sub={latestDate}
            />
            <KPITile
              label={t('money.kpi.avgCheck')}
              value={revKpis.avgCheck != null ? formatIDRCompact(revKpis.avgCheck) : '—'}
              sub={t('money.kpi.avgCheck.sub')}
              help={t('money.kpi.avgCheck.help')}
            />
            <KPITile
              label={t('money.kpi.channelMix')}
              value={revKpis.channelMix}
              sub={t('money.kpi.channelMix.sub')}
              help={t('money.kpi.channelMix.help')}
              className="dash-kpi-tile--mix"
            />
          </div>

          {/* Gross margin / COGS row — basis-labelled (AC-008) */}
          <div className="dash-kpi-grid dash-kpi-grid--gm">
            <KPITile
              label={t('money.kpi.gmPct')}
              value={formatMarginPct(gmKpis?.marginPct ?? null)}
              basis={{ label: basis }}
              dq={gmKpis?.dq}
              help={t('money.kpi.gmPct.help')}
            />
            <KPITile
              label={t('money.kpi.gmAmt')}
              value={formatGrossMarginValue(gmKpis?.marginAmount ?? null)}
              delta={gmDelta ? { text: gmDelta.text, tone: gmDelta.tone } : undefined}
              basis={{ label: basis }}
              help={t('money.kpi.gmAmt.help')}
            />
            <KPITile
              label={t('money.kpi.cogs')}
              value={formatGrossMarginValue(gmKpis?.cogsAmount ?? null)}
              basis={{ label: basis }}
              help={t('money.kpi.cogs.help')}
            />
            <KPITile
              label={t('money.kpi.bomCoverage')}
              value={gmKpis?.bomCoveragePct != null ? formatMarginPct(gmKpis.bomCoveragePct) : '—'}
              dq={gmKpis?.dq}
              help={t('money.kpi.bomCoverage.help')}
            />
          </div>

          <MoneyFootnote t={t} />

          <WhatsComingStrip />

          <ChartFrame
            title={t('money.chart.title')}
            ariaLabel={t('money.chart.ariaLabel')}
            freshness={snapshotAsOf ? <FreshnessLabel asOf={snapshotAsOf} /> : undefined}
            tableFallback={
              <table>
                <caption>{t('money.chart.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('money.chart.col.date')}</th>
                    <th scope="col">{t('money.chart.col.channel')}</th>
                    <th scope="col">{t('money.chart.col.revenue')}</th>
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
            columns={detailColumns(cut, t)}
            rows={sortedRows.slice(0, 5)}
            sort={undefined}
            onSortChange={undefined}
            isDesktop={isDesktop}
            caption={t('money.table.captionSummary', { count: Math.min(5, sortedRows.length) })}
            emptyLabel={t('money.table.empty')}
          />
          <div className="dash-detail-door">
            <Link to={detailHref} className="btn btn-outline">{t('money.viewFullDetail')}</Link>
          </div>
        </div>
      ) : (
        <div className="dash-pane" role="tabpanel" aria-label={t('money.tab.detail')}>
          <DataTable
            columns={detailColumns(cut, t)}
            rows={sortedRows}
            sort={sort}
            onSortChange={setSort}
            isDesktop={isDesktop}
            caption={t('money.table.captionDetail')}
            emptyLabel={t('money.table.empty')}
          />
          <MoneyFootnote t={t} />
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
  tab: string
  onTab: (id: string) => void
  trailing?: React.ReactNode
  t: Translate
}

function DashboardChrome(props: DashboardChromeProps) {
  const { t } = props
  return (
    <>
      <GlobalToolbar
        cut={props.cut}
        onCutChange={props.onCut}
        window={props.windowSpec}
        onWindowChange={props.onWindow}
        bounds={props.bounds}
      />
      <ViewTabs
        ariaLabel={t('money.tabs.ariaLabel')}
        tabs={[
          { id: 'summary', label: t('money.tab.summary') },
          { id: 'detail', label: t('money.tab.detail') },
        ]}
        active={props.tab}
        onChange={props.onTab}
        trailing={props.trailing}
      />
      {SHOW_FOLLOWUPS && (
        <div className="dash-queue-entry">
          <Link to="/money/follow-ups" className="btn btn-outline">{t('money.followUpQueue')}</Link>
        </div>
      )}
    </>
  )
}

// I18N-1: the interim/GL-certified footnote, reconstructed from catalog fragments so the two
// bold emphases survive translation (a single interpolated string can't carry <b> spans).
function MoneyFootnote({ t }: { t: Translate }) {
  return (
    <p className="dash-footnote">
      <b>{t('money.footnote.interim')}</b>{t('money.footnote.body')}<b>{t('money.footnote.notCertified')}</b>.
    </p>
  )
}

// ── Detail-table column defs (AC-018 — the full mandated column set) ──────────────
function detailColumns(cut: DashboardCut, t: Translate) {
  return [
    { key: 'dimension', header: cutLabel(cut, t), cardLabel: '' },
    {
      key: 'revenue', header: t('money.table.col.revenue'), numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.revenue,
    },
    { key: 'transactions', header: t('money.table.col.txns'), numeric: true, sortable: true },
    {
      key: 'sharePct', header: t('money.table.col.share'), numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.sharePct,
    },
    {
      key: 'avgCheck', header: t('money.table.col.avgCheck'), numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.avgCheck,
    },
    {
      key: 'cogsInterim', header: t('money.table.col.cogs'), numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.cogsInterim,
    },
    {
      key: 'grossMargin', header: t('money.table.col.gm'), numeric: true, sortable: true,
      render: (row: DashboardTableRow) => row.grossMargin,
    },
    {
      key: 'marginPct', header: t('money.table.col.marginPct'), numeric: true, sortable: true,
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
    // sharePct is already ×100 (23.1) — back to a fraction for the ONE canonical
    // locale-aware percent formatter (r5 F-2: no raw-period "23.1%" beside "36,7%").
    sharePct: formatPercent(r.sharePct / 100, 1),
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
