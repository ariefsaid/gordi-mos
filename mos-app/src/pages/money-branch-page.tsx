// MoneyBranchPage — /money/branch/:code, opened from a branch row on the Money page. A day chart
// of the branch's revenue against the same weekday a week
// earlier; for the margin tier, margin and COGS against the recipe budget for the period in the
// URL, the branch's Café items without a recipe, and "Ask {branch} lead", which creates a Task that
// carries a link to this view and never a figure (mos.ask_branch_lead builds its text).
//
// Same two gates as /money: the route admits the revenue roles (router.tsx); below the margin tier
// the margin query is never issued and the margin, uncovered and ask pieces are absent. Postgres is
// the boundary. Period, range, filters, sort and ?d=YYYY-MM-DD (the chosen day) live in the URL.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getCoreRowModel, getSortedRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table'
import { MoneyTableShell } from '@/components/money/money-table-shell'
import { Select } from '@/components/ui/select'
import { listRecipeFindings, type RecipeFindingsData } from '@/lib/db/recipe-findings'
import { FINDING_CLASSES, FINDING_RULES, FINDING_COLUMNS, FINDING_SORT, findingKey, findingComparison, filterRecipeFindings } from '@/lib/recipe-findings'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { canViewMargin } from '@/lib/capabilities'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { latestBy } from '@/lib/db/reporting-shared'
import { formatIDR } from '@/lib/format/money'
import { formatPercent, formatPoints, formatSignedPoints } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { formatIDRCompact, moneyKpiDelta, signedChange } from '@/lib/sales-dashboard'
import { Pill } from '@/components/ui/pill'
import { useMoneyRows } from '@/lib/use-money-rows'
import { useNormalizeMoneyRange } from '@/lib/use-normalize-money-range'
import { buildBranchPage, readBranchView, type BranchPage, type BranchView } from '@/lib/money-branch-page'
import { resolveMoneyWindow, withMoneyView, type MarginFigures, type MoneyView } from '@/lib/money-branch-table'
import {
  askBranchLead,
  listUncoveredCafeItems,
  type AskBranchLeadResult,
  type UncoveredCafeItem,
} from '@/lib/db/money-branch'
import { MoneyFreshness, PeriodControl } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { DayRevenueChart } from '@/components/money/day-revenue-chart'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { bulletGeometry } from '@/components/money/day-chart-geometry'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { streamKey } from '@/lib/kitchen-action-label'
import './money-page.css'
import './money-branch-page.css'

/** The branch codes the ask function accepts in its link; any other code gets no Ask. */
const ASKABLE_CODE = /^[A-Za-z0-9_-]{1,40}$/

/** `day` is the asked day as shown: an answer that lands after the view moved still names it. */
type Ask = { status: 'idle' | 'pending' | 'failed' } | { status: 'done'; result: AskBranchLeadResult; day: string }

function cafeItemHref(item: UncoveredCafeItem, branchId: string): string {
  const params = new URLSearchParams({ q: item.name, stream: streamKey(branchId, item.activities[0]) })
  return `/cafe/items?${params.toString()}`
}

function MarginPanel({ margin, period }: { margin: MarginFigures; period: number }) {
  const t = useT()
  const basis = margin.budgetBasis
  const bullet = basis ? bulletGeometry(basis.cogsShare, basis.budgetShare) : null
  return (
    <section className="money-branch__panel" aria-labelledby="money-branch-margin">
      <h2 id="money-branch-margin" className="money-branch__h2">{t('money.branch.margin.title', { days: String(period) })}</h2>
      <p className="money-branch__sentence tabular">
        {basis && margin.cogsVsBudget !== null
          ? t(
            formatPoints(margin.cogsVsBudget) === formatPoints(0) ? 'money.branch.margin.on'
              : margin.cogsVsBudget > 0 ? 'money.branch.margin.over' : 'money.branch.margin.under',
            {
              cogs: formatPercent(basis.cogsShare, 1),
              budget: formatPercent(basis.budgetShare, 1),
              points: formatPoints(margin.cogsVsBudget),
            },
          )
          : t('money.branch.margin.noBudget')}
      </p>
      {basis && bullet && <div className="flex items-center gap-3">
        <span className="relative block h-2.5 flex-1 rounded-full bg-secondary" role="meter" aria-label={t('money.branch.bullet.label')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bullet.fill)}>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${bullet.fill}%` }} />
          <span className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2" aria-hidden="true" style={{ left: `${bullet.marker}%`, background: 'var(--text-tertiary)' }} />
        </span>
        <strong className="whitespace-nowrap tabular">{t('money.table.points', { value: formatSignedPoints(margin.cogsVsBudget ?? 0) })}</strong>
      </div>}
      <p className="money-branch__note">{t('money.note.interim')}</p>
    </section>
  )
}

function UncoveredPanel({ branchId }: { branchId: string | null }) {
  const t = useT()
  const [items, setItems] = useState<UncoveredCafeItem[] | 'loading' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!branchId) return
    let live = true
    setItems('loading')
    listUncoveredCafeItems(branchId).then(
      (rows) => { if (live) setItems(rows) },
      () => { if (live) setItems('error') },
    )
    return () => { live = false }
  }, [branchId, attempt])

  let body: ReactNode
  if (!branchId) body = <p className="money-branch__muted">{t('money.branch.uncovered.unmapped')}</p>
  else if (items === 'loading') body = <div role="status" aria-label={t('common.loading')} aria-busy="true"><SkeletonRows count={3} /></div>
  else if (items === 'error') body = <ErrorState message={t('money.branch.uncovered.error')} onRetry={() => setAttempt((n) => n + 1)} />
  else if (items.length === 0) body = <p className="money-branch__muted">{t('money.branch.uncovered.empty')}</p>
  else {
    body = (
      <>
        <p className="money-branch__muted">{t('money.branch.uncovered.intro')}</p>
        <ul className="money-branch__items">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={cafeItemHref(item, branchId)} className="money-branch__item">{item.name}</Link>
            </li>
          ))}
        </ul>
      </>
    )
  }
  return (
    <section className="money-branch__panel" aria-labelledby="money-branch-uncovered">
      <h2 id="money-branch-uncovered" className="money-branch__h2">{t('money.branch.uncovered.title')}</h2>
      {body}
    </section>
  )
}

function DaysTable({ page, period }: { page: BranchPage; period: number }) {
  const t = useT()
  const { locale } = useI18n()
  const budgetMargin = page.margin?.budgetBasis ? 1 - page.margin.budgetBasis.budgetShare : null
  return (
    <details className="money-branch__days" open={period === 7} key={period}>
      <summary>{t('money.branch.days.show')}</summary>
      <div className="money-branch__days-scroll">
        <table className="money-branch__days-table">
          <caption className="sr-only">
            {t('money.branch.days.caption', { branch: page.name, days: String(period), date: formatWeekdayDayMonth(page.latestDate, locale) })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('money.branch.days.col.day')}</th>
              <th scope="col">{t('money.chart.legend.revenue')}</th>
              <th scope="col">{t('money.branch.days.col.change')}</th>
              <th scope="col">{t('money.chart.legend.compare')}</th>
              {page.margin && <>
                <th scope="col">{t('money.chart.legend.margin')}</th>
                <th scope="col">{t('money.chart.legend.budget')}</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {[...page.days].reverse().map((d) => (
              <tr key={d.date}>
                <th scope="row">{formatWeekdayDayMonth(d.date, locale)}</th>
                <td className="tabular">{d.value === null ? t('money.branch.days.noSales') : formatIDR(d.value)}</td>
                <td>
                  {d.value !== null && d.compare
                    ? (() => {
                      const { text, tone } = signedChange(d.value / d.compare - 1)
                      return <Pill tone={tone} dot={false} className="tabular">{text}</Pill>
                    })()
                    : <span className="money-branch__muted">{t('money.delta.noComparison')}</span>}
                </td>
                <td className="tabular">{d.compare === null ? t('money.table.notReceived') : formatIDR(d.compare)}</td>
                {page.margin && <>
                  <td className="tabular">{d.value === null ? t('money.branch.days.noSales') : d.marginPct == null ? t('money.table.notReceived') : formatPercent(d.marginPct, 1)}</td>
                  <td className="tabular">{budgetMargin === null ? t('money.table.notReceived') : formatPercent(budgetMargin, 0)}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function MoneyBranchPage() {
  const t = useT()
  const { locale } = useI18n()
  const { code = '' } = useParams()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canSeeMargin = canViewMargin(accessRoles)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = readBranchView(searchParams, { canSeeMargin })
  const { load, read } = useMoneyRows(canSeeMargin, requestedView)
  const data = load.data
  const view = readBranchView(searchParams, { canSeeMargin, latestDate: data?.latestDate ?? undefined })
  useNormalizeMoneyRange({ searchParams, setSearchParams, ready: Boolean(data) && load.status !== 'loading', view })
  const applied = data && load.status !== 'ready' ? { period: data.period, range: data.range, channel: data.channel } : view
  const displayView = { ...view, ...applied }
  const displayRangeFrom = displayView.range?.from
  const displayRangeTo = displayView.range?.to
  const page = useMemo(
    () => (data ? buildBranchPage(data.revenue, data.margin, code, displayView.period, data.branchNames, {
      latestDate: data.latestDate ?? undefined,
      range: displayRangeFrom && displayRangeTo ? { from: displayRangeFrom, to: displayRangeTo } : null,
      channel: displayView.channel,
    }) : null),
    [data, code, displayView.period, displayRangeFrom, displayRangeTo, displayView.channel],
  )
  const syncedAt = useMemo(() => (data ? latestBy(data.revenue, (r) => r.snapshot_as_of) : null), [data])
  // A supervisor who sees one branch was sent here from /money; a link back would send them here again.
  const onlyBranch = !canSeeMargin && data !== null && new Set(data.revenue.map((r) => r.branch_code)).size === 1
  const canSeeFindings = accessRoles.some(r => ['finance', 'manager', 'ops_lead'].includes(r)) && !page?.isB2B
  const findingStart = page?.days[0]?.date ?? ''
  const findingEnd = page?.latestDate ?? ''
  const companies = [...new Set(data?.revenue.filter(r => r.branch_code === code).map(r => r.esb_code))].sort().join(',')
  const findingScope = `${code}:${findingStart}:${findingEnd}:${companies}`
  const [findings, setFindings] = useState<{ scope: string; data: RecipeFindingsData } | null>(null)
  const [findingStatus, setFindingStatus] = useState('loading')
  const [findingAttempt, setFindingAttempt] = useState(0)
  useEffect(() => {
    if (!canSeeFindings || !findingStart) return
    let live = true
    setFindingStatus('loading')
    listRecipeFindings(code, findingStart, findingEnd, companies.split(',')).then(
      rows => { if (live) { setFindings({ scope: findingScope, data: rows }); setFindingStatus('ready') } },
      () => { if (live) setFindingStatus('error') },
    )
    return () => { live = false }
  }, [canSeeFindings, code, findingStart, findingEnd, companies, findingScope, findingAttempt])
  const findingData = findings?.scope === findingScope ? findings.data : null
  const findingTable = useReactTable({ data: filterRecipeFindings(findingData?.rows ?? [], searchParams), columns: FINDING_COLUMNS, state: { sorting: FINDING_SORT }, initialState: { pagination: { pageSize: 25 } }, autoResetPageIndex: false, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel() })
  useEffect(() => { findingTable.setPageIndex(0) }, [findingScope, findingTable])
  const setFindingFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'clear') for (const k of ['rf_class', 'rf_rule', 'rf_day', 'rf_all']) next.delete(k)
    else if (value) next.set(key, value)
    else next.delete(key)
    findingTable.setPageIndex(0)
    setSearchParams(next)
  }
  const [ask, setAsk] = useState<Ask>({ status: 'idle' })
  const askStatusRef = useRef<HTMLDivElement>(null)
  // The result is announced and takes focus, so a keyboard user lands on the Task link.
  useEffect(() => {
    if (ask.status === 'done' || ask.status === 'failed') askStatusRef.current?.focus()
  }, [ask.status])

  const name = page?.name ?? code
  useDocumentTitle(t('money.branch.documentTitle', { branch: name }))
  useSetBreadcrumbTitle(name)

  const writeView = (nextView: BranchView, day: string | null, replace = false) => {
    const next = withMoneyView(searchParams, nextView)
    const latest = data?.latestDate ?? page?.latestDate
    const window = latest ? resolveMoneyWindow(nextView, latest) : null
    if (day && window && day >= window.from && day <= window.to) next.set('d', day)
    else next.delete('d')
    setSearchParams(next, { replace })
    setAsk({ status: 'idle' })
  }
  const setDay = (day: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (day) next.set('d', day); else next.delete('d')
    setSearchParams(next, { replace: true })
    setAsk({ status: 'idle' })
  }
  const periodControl = (disabled = false) => <PeriodControl period={view.period} range={view.range} latestDate={data?.latestDate ?? null}
    onChange={(period) => writeView({ ...view, period, range: null }, view.day)}
    onRangeChange={(range) => writeView({ ...view, range }, view.day)} disabled={disabled} />
  const filters = <div className="money-filter-row">{periodControl(!data)}
    <label className="money-filter-select">{t('money.filter.channel')}<Select id="money-branch-channel-filter" value={view.channel} disabled={!data} onChange={(event) => writeView({ ...view, channel: event.target.value as MoneyView['channel'] }, view.day)}>
      <option value="all">{t('money.filter.allChannels')}</option><option value="POS">{t('money.filter.pos')}</option><option value="B2B">{t('money.filter.b2b')}</option>
    </Select></label>
  </div>
  // The branch's own latest received day: the page opens on it and its freshness names it.
  const lastReceived = page ? [...page.days].reverse().find((d) => d.value !== null)?.date ?? page.latestDate : ''
  const lastDay = page ? [...page.days].reverse().find((d) => d.value !== null) : undefined
  const selected = page && view.day && page.days.some((d) => d.date === view.day) ? view.day : lastReceived
  const selectedText = selected ? formatWeekdayDayMonth(selected, locale) : ''
  const canAskBase = canSeeMargin && page !== null && !page.isB2B && page.branchId !== null && ASKABLE_CODE.test(page.code)
  const canAsk = canAskBase && load.status === 'ready' && !view.range && view.period !== 90
  const missingDays = page ? page.days.filter((d) => d.value === null).length : 0

  const onAsk = async () => {
    if (!page) return
    const askedText = selectedText
    setAsk({ status: 'pending' })
    try {
      const result = await askBranchLead({ code: page.code, period: view.period, day: selected, locale: locale === 'id' ? 'id' : 'en' })
      setAsk({ status: 'done', result, day: askedText })
    } catch {
      setAsk({ status: 'failed' })
    }
  }

  const askButton = canAsk ? (
    <Button variant="primary" onClick={() => void onAsk()} disabled={ask.status === 'pending'}>
      {ask.status === 'pending' ? t('money.branch.ask.pending') : t('money.branch.ask', { branch: name, day: selectedText })}
    </Button>
  ) : undefined

  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', meta?: ReactNode, action?: ReactNode) => (
    <PageFamilyFrame family="workspace" title={name} meta={meta} state={state} action={action}>
      <div className="money-body money-branch">
        {!onlyBranch && (
          <Link to={`/money?${withMoneyView(new URLSearchParams(), view)}`} className="money-branch__back">
            <span aria-hidden="true">←</span>{t('money.branch.back')}
          </Link>
        )}
        {children}
      </div>
    </PageFamilyFrame>
  )
  if (!data && load.status === 'loading') {
    return frame(
      <>
        {filters}
        <div role="status" aria-label={t('common.loading')} aria-busy="true" className="money-branch__skeleton">
          <div className="skeleton-bar money-branch__skeleton-chart" />
          <SkeletonRows count={3} />
        </div>
      </>,
      'loading',
    )
  }
  if (!data) return frame(<>{filters}<MoneyLoadError tooMany={load.tooMany} onRetry={() => void read()} /></>, 'error')
  if (!page) {
    const filtered = Boolean(view.range || view.channel !== 'all')
    const days = view.range ? resolveMoneyWindow(view, view.range.to).days : view.period
    return frame(<>{filters}<EmptyState variant={filtered ? 'quiet' : 'awaiting'} title={filtered ? t('money.filter.empty.title') : t('money.branch.notFound.title')} copy={filtered ? t('money.filter.empty.copy') : t('money.branch.notFound.copy', { days: String(days) })}>
      {filtered && <Button variant="outline" onClick={() => writeView({ ...view, period: 30, range: null, channel: 'all' }, null)}>{t('money.filter.clear')}</Button>}
    </EmptyState></>, 'empty')
  }

  let askStatus: ReactNode = null
  if (ask.status === 'failed') {
    askStatus = <ErrorState message={t('money.branch.ask.failed')} />
  } else if (ask.status === 'done' && ask.result.kind === 'created') {
    askStatus = (
      <p role="status" className="money-branch__ask-status">
        {t('money.branch.ask.created', { branch: page.name, day: ask.day })}{' '}
        <Link to={`/work/tasks/${ask.result.taskId}`} className="money-branch__link">{t('money.branch.ask.open')}</Link>
      </p>
    )
  } else if (ask.status === 'done') {
    askStatus = <p role="status" className="money-branch__ask-status">{t('money.branch.ask.noLead', { branch: page.name })}</p>
  }

  return frame(
    <>
      {filters}
      <div className="money-results" aria-busy={load.status === 'loading' ? 'true' : undefined}>
      {canAskBase && (view.range || view.period === 90) && <p className="money-branch__note">{t('money.branch.ask.rangeUnavailable')}</p>}
      {load.status === 'error' && <MoneyLoadError kept tooMany={load.tooMany} onRetry={() => void read()} />}
      {askStatus && <div ref={askStatusRef} tabIndex={-1} className="money-branch__ask-result">{askStatus}</div>}
      <div className={`money-branch__kpis grid min-w-0 grid-cols-2 gap-2 ${page.margin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
        <KPITile valueVariant="proportional" label={t('money.overview.revenue', { days: String(page.daysCount) })} value={formatIDRCompact(page.total)} delta={moneyKpiDelta(page.vsPrevious, t)} sub={t('money.table.col.vsPrevious')} />
        <KPITile valueVariant="proportional" label={t('money.overview.latest')} value={lastDay ? formatIDRCompact(lastDay.value!) : t('money.table.notReceived')} delta={moneyKpiDelta(lastDay?.compare ? lastDay.value! / lastDay.compare - 1 : null, t)} sub={t('money.table.col.vsWeekday')} />
        {page.margin && <KPITile valueVariant="proportional" label={t('money.overview.margin')} value={page.margin.pct === null ? t('money.table.notReceived') : formatPercent(page.margin.pct, 1)} />}
        {page.margin && <KPITile valueVariant="proportional" label={t('money.table.col.coverage')} value={page.margin.coverage === null ? t('money.table.notReceived') : formatPercent(page.margin.coverage, 0)} />}
      </div>
      {canSeeFindings && <a href="#recipe-findings" className="money-branch__link">{t('money.findings.view')}</a>}
      <div className={`money-branch__grid${page.margin || (data.marginFailed && !page.isB2B) ? '' : ' money-branch__grid--single'}`}>
        <section className="money-branch__panel money-branch__panel--chart" aria-labelledby="money-branch-chart">
          <div className="money-branch__panel-head">
            <h2 id="money-branch-chart" className="money-branch__h2">{t('money.branch.chart.title')}</h2>
            <span className="money-branch__total tabular">
              {missingDays === 0
                ? t('money.branch.total', { value: formatIDRCompact(page.total), days: String(page.daysCount) })
                : t(missingDays === 1 ? 'money.branch.total.missingOne' : 'money.branch.total.missingOther', {
                  value: formatIDRCompact(page.total), days: String(page.daysCount), count: String(missingDays),
                })}
            </span>
          </div>
          <DayRevenueChart
            days={page.days}
            selected={selected}
            onSelect={setDay}
            label={t('money.chart.label', { branch: page.name })}
          />
          {page.margin && <section className="money-branch__margin-chart mt-3 grid gap-2 border-t border-border pt-3" aria-labelledby="money-branch-margin-chart">
            <h2 id="money-branch-margin-chart" className="money-branch__h2">{t('money.branch.marginChart.title')}</h2>
            <DayRevenueChart days={page.days} selected={selected} onSelect={setDay} label={t('money.chart.margin.label', { branch: page.name })} mode="margin" budget={page.margin.budgetBasis ? 1 - page.margin.budgetBasis.budgetShare : null} />
          </section>}
          <DaysTable page={page} period={page.daysCount} />
          {canSeeMargin && page.isB2B && <p className="money-branch__note">{t('money.note.b2b')}</p>}
        </section>
        {page.margin && (
          <div className="money-branch__side">
            <MarginPanel margin={page.margin} period={page.daysCount} />
            <UncoveredPanel branchId={page.branchId} />
          </div>
        )}
        {data.marginFailed && !page.isB2B && (
          <div className="money-branch__side">
            <MoneyLoadError margin onRetry={() => void read()} />
          </div>
        )}
      </div>
      {canSeeFindings && <section id="recipe-findings" className="money-findings" aria-labelledby="recipe-findings-title">
        <h2 id="recipe-findings-title" className="money-branch__h2">{t('money.findings.title')}</h2>
        <p className="money-branch__note">{t('money.findings.context')}</p>
        {findingStatus === 'error' && <ErrorState message={t('money.findings.error')} onRetry={() => setFindingAttempt(n => n + 1)} />}
        {!findingData && findingStatus === 'loading' && <div role="status" aria-label={t('common.loading')}><SkeletonRows count={3} /></div>}
        {findingData && <>
          <p className="money-branch__note">{findingData.receipts.length ? t('money.findings.received', { date: formatWeekdayDayMonth(findingData.receipts[0].snapshot_as_of.slice(0, 10), locale) }) : t('money.findings.notReceived')}</p>
          {findingData.receipts.some(r => !r.complete || r.window_start > findingStart || r.window_end < findingEnd) && <p role="status">{t('money.findings.incomplete')}</p>}
          {findingData.rows.length > 0 && <div className="flex flex-wrap gap-3 my-3">
            <Select label={t('money.findings.scope')} name="rf_all" value={searchParams.get('rf_all') ?? ''} onChange={e => setFindingFilter('rf_all', e.target.value)}><option value="">{t('money.findings.needsHuman')}</option><option value="1">{t('money.findings.all')}</option></Select>
            <Select label={t('money.findings.class')} name="rf_class" value={searchParams.get('rf_class') ?? ''} onChange={e => setFindingFilter('rf_class', e.target.value)}><option value="">{t('money.findings.all')}</option>{FINDING_CLASSES.map(c => <option key={c} value={c}>{t(findingKey('class', c))}</option>)}</Select>
            <Select label={t('money.findings.rule')} name="rf_rule" value={searchParams.get('rf_rule') ?? ''} onChange={e => setFindingFilter('rf_rule', e.target.value)}><option value="">{t('money.findings.all')}</option>{FINDING_RULES.map(r => <option key={r} value={r}>{t(findingKey('rule', r))}</option>)}</Select>
            <Select label={t('money.branch.days.col.day')} name="rf_day" value={searchParams.get('rf_day') ?? ''} onChange={e => setFindingFilter('rf_day', e.target.value)}><option value="">{t('money.findings.all')}</option>{[...new Set(findingData.rows.map(r => r.day))].sort().reverse().map(d => <option key={d} value={d}>{formatWeekdayDayMonth(d, locale)}</option>)}</Select>
            <Button variant="outline" onClick={() => setFindingFilter('clear', '')}>{t('money.findings.clear')}</Button>
          </div>}
          {findingTable.getFilteredRowModel().rows.length > 0 ? <>
            <MoneyTableShell><caption className="sr-only">{t('money.findings.title')}</caption><thead><tr>{(['money.findings.identity', 'money.findings.compare', 'money.findings.check'] as const).map(k => <th key={k} scope="col" className="money-table__head">{t(k)}</th>)}</tr></thead><tbody className="money-table__group">
              {findingTable.getRowModel().rows.map(({ original: r }) => <tr key={`${r.esb_code}:${r.finding_id}`} data-finding={r.finding_id} className="money-table__row">
                <th scope="row" className="money-table__cell"><span className="money-table__cell-label">{t('money.findings.identity')}</span><span>{formatWeekdayDayMonth(r.day, locale)}</span><strong className="block">{r.menu_name ?? t('money.findings.noMenu')}</strong><span>{r.expected_name ?? r.actual_name ?? t('money.findings.noIngredient')}</span></th>
                <td className="money-table__cell"><span className="money-table__cell-label">{t('money.findings.compare')}</span><p className="tabular">{findingComparison(r, t, locale)}</p><p className="tabular">{r.impact_idr === null ? t('money.findings.notQuantified') : `${formatIDR(r.impact_idr)} · ${t(findingKey('basis', r.impact_basis))}`}</p></td>
                <td className="money-table__cell"><Pill tone="neutral" dot={false}>{t(findingKey('class', r.classification))}</Pill><strong className="block">{t(findingKey('rule', r.rule))}</strong><p>{t('money.findings.likely', { cause: t(findingKey('cause', r.rule)) })}</p><p>{t('money.findings.nextCheck', { check: r.recommended_check })}</p>
                  <details><summary>{t('money.findings.evidence')}</summary><p>{r.recipe_versions ? t('money.findings.version', { version: String(r.recipe_versions.version), date: formatWeekdayDayMonth(r.recipe_versions.first_seen, locale) }) : t('money.findings.noHistory')}</p>
                    <p>{t('money.findings.recipeTiming', { edited: r.recipe_edited_at ?? t('money.findings.unknown'), observed: r.recipe_observed_at ?? t('money.findings.unknown') })}</p><p>{t('money.findings.source', { checked: r.source_checked_at })}</p><p>{t('money.findings.previousObservation', { time: r.prior_recipe_observed_at ?? t('money.findings.unknown'), sale: r.first_sale_at ?? t('money.findings.unknown') })}</p><p>{t('money.findings.confidence', { confidence: t(r.confidence === 'evidenced_warehouse_policy' ? 'money.findings.evidenced' : 'money.findings.candidate'), rule: r.rule })}</p>{r.replica_stale && <p>{t('money.findings.stale')}</p>}
                    <details><summary>{t('money.findings.unitEvidence')}</summary><pre className="whitespace-pre-wrap break-words">{r.recipe_version_hash}{'\n'}{JSON.stringify(r.conversion_evidence, null, 2)}</pre></details>
                  </details>
                </td>
              </tr>)}
            </tbody></MoneyTableShell>
            <div className="flex flex-wrap items-center gap-3 mt-3"><Button variant="outline" disabled={!findingTable.getCanPreviousPage()} onClick={() => findingTable.previousPage()}>{t('money.findings.previous')}</Button><span>{t('money.findings.count', { count: String(findingTable.getFilteredRowModel().rows.length), page: String(findingTable.getState().pagination.pageIndex + 1) })}</span><Button variant="outline" disabled={!findingTable.getCanNextPage()} onClick={() => findingTable.nextPage()}>{t('money.findings.next')}</Button></div>
          </> : findingData.receipts.length > 0 && findingData.receipts.every(r => r.complete && r.window_start <= findingStart && r.window_end >= findingEnd) && <EmptyState variant="awaiting" title={t(findingData.rows.length ? 'money.findings.filtered' : 'money.findings.empty')} copy={t('money.findings.noLossClaim')} />}
        </>}
      </section>}
      </div>
    </>,
    undefined,
    <MoneyFreshness latestDate={lastReceived} syncedAt={syncedAt} />,
    askButton,
  )
}
