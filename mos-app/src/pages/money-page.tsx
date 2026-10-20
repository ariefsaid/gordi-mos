// MoneyPage — /money is one branch table (OD-2026-10-06-MONEY-BUILD). /dashboard, /sales and the
// retired /money/detail redirect here (router.tsx).
//
// Two gates, and this page owns the second:
//   READ — the route admits REVENUE_VIEW_ROLES (finance, manager, supervisor scoped by RLS to their
//          own grants). The gate lives in router.tsx.
//   COST — margin, COGS and recipe coverage are a narrower tier (canViewMargin). Below it the
//          margin query is never issued, so no hidden figure reaches the browser, and the margin
//          columns are absent rather than blank.
// Both are affordance; the boundary is Postgres — the reporting policies refuse the rows.
//
// The period, custom dates, branch/channel filters and sort live in the URL and round-trip through
// shared links. Every window anchors to the latest reporting day visible through RLS, not the clock.
import { TrendIcon } from '@/shell/icons'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { canViewMargin } from '@/lib/capabilities'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { Notice } from '@/components/ui/notice'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { latestBy } from '@/lib/db/reporting-shared'
import { buildBranchTable, displayBranchName, moneyBranchHref, moneyHeadline, readMoneyView, withMoneyView, type MoneyView } from '@/lib/money-branch-table'
import { formatIDRCompact, signedChange } from '@/lib/sales-dashboard'
import { formatPercent, formatSignedPoints } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useMoneyRows } from '@/lib/use-money-rows'
import { useNormalizeMoneyRange } from '@/lib/use-normalize-money-range'
import { BranchTable } from '@/components/money/branch-table'
import { CogsMeter, MoneyFigure, MoneyFigures } from '@/components/money/money-figures'
import { MoneyDelta, MoneyPoints } from '@/components/money/money-delta'
import { MoneyFilterChips, type MoneyChip } from '@/components/money/money-filter-chips'
import { MoneySpark } from '@/components/money/money-spark'
import { Pill } from '@/components/ui/pill'
import { MoneyFreshness, PeriodControl } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { EmptyState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import './money-page.css'

export function MoneyPage() {
  const t = useT()
  const { locale } = useI18n()
  const isDesktop = useIsDesktop()
  useDocumentTitle(t('money.documentTitle'))
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canSeeMargin = canViewMargin(accessRoles)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const requestedView = readMoneyView(searchParams, { canSeeMargin })
  const { load, read } = useMoneyRows(canSeeMargin, requestedView)
  const data = load.data
  const view = readMoneyView(searchParams, { canSeeMargin, latestDate: data?.latestDate ?? undefined })
  useNormalizeMoneyRange({ searchParams, setSearchParams, ready: Boolean(data) && load.status !== 'loading', view })
  const applied = data && load.status !== 'ready'
    ? { period: data.period, range: data.range, branchCode: data.branchCode, channel: data.channel }
    : view
  const resultView = { ...view, ...applied }
  const setView = (next: MoneyView) => setSearchParams(withMoneyView(searchParams, next))
  const resultRangeFrom = resultView.range?.from
  const resultRangeTo = resultView.range?.to
  const table = useMemo(
    () => (data ? buildBranchTable(data.revenue, data.margin, resultView.period, data.branchNames, {
      latestDate: data.latestDate ?? undefined,
      range: resultRangeFrom && resultRangeTo ? { from: resultRangeFrom, to: resultRangeTo } : null,
      branchCode: resultView.branchCode, channel: resultView.channel,
    }) : null),
    [data, resultView.period, resultRangeFrom, resultRangeTo, resultView.branchCode, resultView.channel],
  )
  const syncedAt = useMemo(() => (data ? latestBy(data.revenue, (r) => r.snapshot_as_of) : null), [data])

  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', meta?: ReactNode) => (
    <PageFamilyFrame
      family="workspace"
      title={t('dest.money')}
      freshness={meta}
      state={state}
      action={SHOW_FOLLOWUPS ? <Link to="/money/follow-ups" className="btn btn-outline">{t('money.followUpQueue')}</Link> : undefined}
    >
      {children}
    </PageFamilyFrame>
  )
  const options = data ? [...new Map(data.revenue.map((row) => [row.branch_code, displayBranchName(row.branch_name ?? row.branch_code, row.branch_id ? data.branchNames.get(row.branch_id) : null)])).entries()] : []
  if (view.branchCode && !options.some(([code]) => code === view.branchCode)) options.push([view.branchCode, view.branchCode])
  const chips: MoneyChip[] = []
  if (view.branchCode) chips.push({ id: 'branch', label: `${t('money.filter.branch')}: ${options.find(([code]) => code === view.branchCode)?.[1] ?? view.branchCode}`, onRemove: () => setView({ ...view, branchCode: null }) })
  if (view.channel !== 'all') chips.push({ id: 'channel', label: `${t('money.filter.channel')}: ${view.channel === 'POS' ? t('money.filter.pos') : t('money.filter.b2b')}`, onRemove: () => setView({ ...view, channel: 'all' }) })
  const branchLink = (code: string) => moneyBranchHref(code, { ...resultView, sort: view.sort })
  const periodControl = (disabled = false) => <PeriodControl period={view.period} range={view.range} latestDate={data?.latestDate ?? null}
    onChange={(period) => setView({ ...view, period, range: null })}
    onRangeChange={(range) => setView({ ...view, range })} disabled={disabled} />
  const windowFrom = resultView.range?.from ?? (data?.latestDate ? new Date(Date.parse(`${data.latestDate}T12:00:00Z`) - (resultView.period - 1) * 86400000).toISOString().slice(0, 10) : null)
  const filters = <>
    <div className="money-filter-controls">
      {periodControl(!data)}
      <details className="money-scope" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
        <summary><span>{t('money.filter.scope')}</span><span className="money-scope__applied">{`${resultView.branchCode ? (options.find(([code]) => code === resultView.branchCode)?.[1] ?? resultView.branchCode) : t('money.filter.allBranches')} · ${resultView.channel === 'all' ? t('money.filter.allChannels') : resultView.channel}`}</span><span className="money-scope__chevron" aria-hidden="true" /></summary>
        <div className="money-filter-row">
      <label className="money-filter-select">{t('money.filter.branch')}<Select id="money-branch-filter" value={view.branchCode ?? ''} disabled={!data} onChange={(event) => setView({ ...view, branchCode: event.target.value || null })}>
        <option value="">{t('money.filter.allBranches')}</option>{options.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </Select></label>
      <label className="money-filter-select">{t('money.filter.channel')}<Select id="money-channel-filter" value={view.channel} disabled={!data} onChange={(event) => setView({ ...view, channel: event.target.value as MoneyView['channel'] })}>
        <option value="all">{t('money.filter.allChannels')}</option><option value="POS">{t('money.filter.pos')}</option><option value="B2B">{t('money.filter.b2b')}</option>
      </Select></label>
        </div>
      </details>
      {data?.latestDate && windowFrom && <p className="money-scope__window">{formatWeekdayDayMonth(windowFrom, locale)} – {formatWeekdayDayMonth(resultView.range?.to ?? data.latestDate, locale)}</p>}
    </div>
  </>

  // A supervisor granted one branch has no table to choose from: open that branch.
  if (!canSeeMargin && table && table.branches.length + table.b2b.length === 1) {
    const only = table.branches[0] ?? table.b2b[0]
    return <Navigate to={branchLink(only.code)} replace />
  }

  if (!data && load.status === 'loading') {
    return frame(
      <div className="money-body" aria-busy="true">
        {filters}
        <div role="status" aria-label={t('common.loading')} aria-busy="true">
          <SkeletonRows
            count={5}
            className="money-skeleton"
            row={(i) => (
              <div key={i} className="money-skeleton__row">
                <div className="skeleton-bar skeleton-bar--line" />
                <div className="skeleton-bar skeleton-bar--line" />
                <div className="skeleton-bar skeleton-bar--line" />
              </div>
            )}
          />
        </div>
      </div>,
      'loading',
    )
  }

  if (!data) return frame(<div className="money-body">{filters}<MoneyLoadError tooMany={load.tooMany} onRetry={() => void read()} /></div>, 'error')

  if (!table) {
    const filtered = Boolean(view.range || view.branchCode || view.channel !== 'all')
    return frame(<div className="money-body">{filters}<EmptyState variant={filtered ? 'quiet' : 'awaiting'} title={filtered ? t('money.filter.empty.title') : t('money.empty.title')} copy={filtered ? t('money.filter.empty.copy') : t('money.empty.copy')}>
      {filtered ? <Button variant="outline" onClick={() => setView({ ...view, period: 30, range: null, branchCode: null, channel: 'all' })}>{t('money.filter.clear')}</Button>
        : <Button variant="outline" onClick={() => void read()} disabled={load.status === 'loading'}>{t('money.empty.refresh')}</Button>}
    </EmptyState></div>, 'empty')
  }

  const headline = moneyHeadline(table, table.daysCount, t, applied.range, locale)
  const margin = table.company.margin
  const basis = margin?.budgetBasis ?? null
  const cogsPoints = margin?.cogsVsBudget ?? null
  const cogsTone = cogsPoints === null ? null : formatPercent(Math.abs(cogsPoints), 1) === formatPercent(0, 1) ? 'neutral' as const : cogsPoints > 0 ? 'warning' as const : 'success' as const
  const cogsWord = cogsTone === 'warning' ? t('money.cogs.over') : cogsTone === 'success' ? t('money.cogs.under') : t('money.cogs.on')
  const figures = <>
    <MoneyFigures label={t('money.overview.figures')}>
      <MoneyFigure
        lead
        label={t('money.overview.revenue', { days: String(table.daysCount) })}
        value={formatIDRCompact(table.company.revenue)}
        delta={<MoneyDelta value={table.company.vsPrevious} t={t} />}
        basis={t('money.table.col.vsPrevious')}
        extra={<MoneySpark values={table.company.trend} width={120} height={28} />}
      />
      <MoneyFigure
        label={t('money.overview.latestOn', { date: formatWeekdayDayMonth(table.latestDate, locale) })}
        value={table.company.latestDay === null ? t('money.table.notReceived') : formatIDRCompact(table.company.latestDay)}
        delta={<MoneyDelta value={table.company.vsWeekday} t={t} />}
        basis={t('money.table.col.vsWeekday')}
      />
      {margin && <MoneyFigure
        label={t('money.overview.margin')}
        value={margin.pct === null ? t('money.table.notReceived') : formatPercent(margin.pct, 1)}
        delta={table.marginVsPrevious === null ? <span className="money-muted">{t('money.delta.noComparison')}</span> : <MoneyPoints value={table.marginVsPrevious} t={t} />}
        basis={table.marginVsPrevious === null ? undefined : t('money.table.col.vsPrevious')}
      />}
      {margin && <MoneyFigure
        label={t('money.overview.cogs')}
        value={cogsPoints === null ? t('money.table.notReceived') : t('money.table.points', { value: formatSignedPoints(cogsPoints) })}
        delta={cogsTone && <Pill tone={cogsTone} dot={false}><TrendIcon direction={cogsPoints! > 0 ? 'up' : cogsPoints! < 0 ? 'down' : 'flat'} /> {cogsWord}</Pill>}
        extra={basis && <CogsMeter cogsShare={basis.cogsShare} budgetShare={basis.budgetShare} />}
      />}
    </MoneyFigures>
    {margin && <p className="money-position__basis">{t('money.overview.posBasis')}</p>}
  </>
  return frame(
    <div className="money-body">
      {filters}
      <MoneyFilterChips chips={chips} />
      <div className="money-results" aria-busy={load.status === 'loading' ? 'true' : undefined}>
      {load.status === 'error' && <MoneyLoadError kept tooMany={load.tooMany} onRetry={() => void read()} />}
      {load.status === 'ready' && data.marginFailed && <MoneyLoadError margin onRetry={() => void read()} />}
      {headline.missing.length > 0 && (
        <Notice tone="attention">
          <strong>{t('money.overview.missing')}</strong>
          {headline.missing.map((row, i) => <span key={row.code}>{i > 0 && ', '}<Link aria-label={t('money.overview.openBranch', { branch: row.name })} to={branchLink(row.code)}>{row.name}</Link></span>)}
          . {t('money.overview.missingImpact')}
        </Notice>
      )}
      {isDesktop && figures}
      <section className="money-compare" aria-labelledby="money-compare-title">
        <div className="money-compare__heading">
          <div className="money-compare__title-row"><h2 id="money-compare-title">{t('money.overview.compareBranches')}</h2><span className="money-compare__count tabular">{t(table.branches.length === 1 ? 'money.table.count.one' : 'money.table.count.other', { count: String(table.branches.length) })}</span></div>
          <p className="money-compare__summary">{headline.sentence}</p>
        </div>
        <BranchTable data={table} selection={resultView} sort={view.sort} onSortChange={(sort) => setView({ ...view, sort })} />
      </section>
      {!isDesktop && figures}
      <details className="money-more">
        <summary><span>{t('money.overview.moverAndLenses')}</span><span className="money-disclosure__chevron" aria-hidden="true" /></summary>
        <div className="money-more__body">
          {headline.mover && <p>{t('money.overview.mover')}<Link aria-label={t('money.overview.openBranch', { branch: headline.mover.name })} to={branchLink(headline.mover.code)}>{headline.mover.name}</Link>{t('money.overview.moverSuffix', { change: signedChange(headline.mover.vsPrevious!).text })}</p>}
          {headline.missing.length === 0 && <p>{t('money.overview.noMissing')}</p>}
          <p><strong>{t('money.overview.availableLenses')}</strong><br />{margin ? t('money.overview.availableMargin') : t('money.overview.availableRevenue')}</p>
          <p className="money-more__unavailable">{t('money.overview.unavailableLenses')}</p>
        </div>
      </details>
      </div>
    </div>,
    undefined,
    <MoneyFreshness latestDate={data.latestDate ?? table.latestDate} syncedAt={syncedAt} />,
  )
}
