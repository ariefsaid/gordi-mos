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
import { Select } from '@/components/ui/select'
import { listRecipeFindings, type RecipeFindingsData } from '@/lib/db/recipe-findings'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { canViewMargin, canViewRevenue } from '@/lib/capabilities'
import { CancelVoidRegister } from '@/components/money/cancel-void-register'
import { BranchCancelVoidPage } from '@/components/money/branch-cancel-void-page'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { latestBy } from '@/lib/db/reporting-shared'
import { formatIDR } from '@/lib/format/money'
import { formatPercent } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import { useMoneyRows } from '@/lib/use-money-rows'
import { useNormalizeMoneyRange } from '@/lib/use-normalize-money-range'
import { buildBranchPage, readBranchView, type BranchPage, type BranchView } from '@/lib/money-branch-page'
import { displayBranchName, resolveMoneyWindow, withMoneyView, type MoneyView } from '@/lib/money-branch-table'
import {
  askBranchLead,
  listUncoveredCafeItems,
  type AskBranchLeadResult,
  type UncoveredCafeItem,
} from '@/lib/db/money-branch'
import { MoneyFreshness, PeriodControl } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { BranchDayWorkbench } from '@/components/money/branch-day-workbench'
import { RecipeFindingsWorkspace } from '@/components/money/recipe-findings-workspace'
import { MoneyFigure, MoneyFigures } from '@/components/money/money-figures'
import { MoneyDelta } from '@/components/money/money-delta'
import { MoneyFilterChips, type MoneyChip } from '@/components/money/money-filter-chips'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
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
      <h3 id="money-branch-uncovered" className="money-branch__h2">{t('money.branch.uncovered.title')}</h3>
      {body}
    </section>
  )
}

function DaysTable({ page, period }: { page: BranchPage; period: number }) {
  const t = useT()
  const { locale } = useI18n()
  const isDesktop = useIsDesktop()
  const budgetMargin = page.margin?.budgetBasis ? 1 - page.margin.budgetBasis.budgetShare : null
  if (!isDesktop) {
    // Phone: one card per day, the figures on one muted line.
    return (
      <details className="money-branch__days" open={period === 7} key={period}>
        <summary><span>{t('money.branch.days.show')}</span><span className="money-disclosure__chevron" aria-hidden="true" /></summary>
        <ul className="money-branch__day-cards" aria-label={t('money.branch.days.caption', { branch: page.name, days: String(period), date: formatWeekdayDayMonth(page.latestDate, locale) })}>
          {[...page.days].reverse().map((d) => (
            <li key={d.date} className="money-branch__day-card">
              <div className="money-branch__day-head">
                <strong>{formatWeekdayDayMonth(d.date, locale)}</strong>
                <span className="tabular">{d.value === null ? t('money.branch.days.noSales') : formatIDR(d.value)}</span>
              </div>
              <p className="money-branch__day-meta">
                {d.value !== null && d.compare ? <MoneyDelta value={d.value / d.compare - 1} t={t} /> : <span>{t('money.delta.noComparison')}</span>}
                <span>{t('money.chart.legend.compare')} <span className="tabular">{d.compare === null ? t('money.table.notReceived') : formatIDR(d.compare)}</span></span>
              </p>
              {page.margin && <p className="money-branch__day-meta">
                <span>{t('money.chart.legend.margin')} <span className="tabular">{d.value === null ? t('money.branch.days.noSales') : d.marginPct == null ? t('money.table.notReceived') : formatPercent(d.marginPct, 1)}</span></span>
                <span>{t('money.chart.legend.budget')} <span className="tabular">{budgetMargin === null ? t('money.table.notReceived') : formatPercent(budgetMargin, 1)}</span></span>
              </p>}
            </li>
          ))}
        </ul>
      </details>
    )
  }
  return (
    <details className="money-branch__days" open={period === 7} key={period}>
      <summary><span>{t('money.branch.days.show')}</span><span className="money-disclosure__chevron" aria-hidden="true" /></summary>
      <div className="money-branch__days-scroll">
        <table className="money-branch__days-table">
          <caption className="money-branch__caption">
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
                    ? <MoneyDelta value={d.value / d.compare - 1} t={t} />
                    : <span className="money-branch__muted">{t('money.delta.noComparison')}</span>}
                </td>
                <td className="tabular">{d.compare === null ? t('money.table.notReceived') : formatIDR(d.compare)}</td>
                {page.margin && <>
                  <td className="tabular">{d.value === null ? t('money.branch.days.noSales') : d.marginPct == null ? t('money.table.notReceived') : formatPercent(d.marginPct, 1)}</td>
                  <td className="tabular">{budgetMargin === null ? t('money.table.notReceived') : formatPercent(budgetMargin, 1)}</td>
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
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  return !canViewRevenue(roles) && roles.includes('ops_lead') ? <BranchCancelVoidPage /> : <RevenueMoneyBranchPage />
}

function RevenueMoneyBranchPage() {
  const t = useT()
  const { locale } = useI18n()
  const { code = '' } = useParams()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canSeeMargin = canViewMargin(accessRoles)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
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
  const registerWindow = data?.latestDate ? resolveMoneyWindow(displayView, data.latestDate) : null
  const canReview = accessRoles.some(role => ['finance', 'manager', 'ops_lead'].includes(role)) && displayView.channel !== 'B2B' && !page?.isB2B
  const register = canReview && registerWindow ? <CancelVoidRegister key={code} branch={code} start={registerWindow.from} end={registerWindow.to} /> : null
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
  const [ask, setAsk] = useState<Ask>({ status: 'idle' })
  const askStatusRef = useRef<HTMLDivElement>(null)
  // The result is announced and takes focus, so a keyboard user lands on the Task link.
  useEffect(() => {
    if (ask.status === 'done' || ask.status === 'failed') askStatusRef.current?.focus()
  }, [ask.status])

  const knownRow = data?.revenue.find((r) => r.branch_code === code)
  const name = page?.name ?? (knownRow ? displayBranchName(knownRow.branch_name ?? code, knownRow.branch_id ? data?.branchNames.get(knownRow.branch_id) : null) : code)
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
  const chips: MoneyChip[] = view.channel === 'all' ? [] : [{ id: 'channel', label: `${t('money.filter.channel')}: ${view.channel === 'POS' ? t('money.filter.pos') : t('money.filter.b2b')}`, onRemove: () => writeView({ ...view, channel: 'all' }, view.day) }]
  const filterWindow = data?.latestDate ? resolveMoneyWindow(displayView, data.latestDate) : null
  const filters = <div className="money-filter-controls">
    {periodControl(!data)}
    <details className="money-scope" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
      <summary><span>{t('money.filter.scope')}</span><span className="money-scope__applied">{view.channel === 'all' ? t('money.filter.allChannels') : view.channel}</span><span className="money-scope__chevron" aria-hidden="true" /></summary>
      <div className="money-filter-row">
      <label className="money-filter-select">{t('money.filter.channel')}<Select id="money-branch-channel-filter" value={view.channel} disabled={!data} onChange={(event) => writeView({ ...view, channel: event.target.value as MoneyView['channel'] }, view.day)}>
        <option value="all">{t('money.filter.allChannels')}</option><option value="POS">{t('money.filter.pos')}</option><option value="B2B">{t('money.filter.b2b')}</option>
      </Select></label>
      </div>
    </details>
    {filterWindow && <p className="money-scope__window">{formatWeekdayDayMonth(filterWindow.from, locale)} – {formatWeekdayDayMonth(filterWindow.to, locale)}</p>}
  </div>
  // The branch's own latest received day: the page opens on it and its freshness names it.
  const lastReceived = page ? [...page.days].reverse().find((d) => d.value !== null)?.date ?? page.latestDate : ''
  const lastDay = page ? [...page.days].reverse().find((d) => d.value !== null) : undefined
  const selected = page && view.day && page.days.some((d) => d.date === view.day) ? view.day : lastReceived
  const selectedText = selected ? formatWeekdayDayMonth(selected, locale) : ''
  const canAskBase = canSeeMargin && page !== null && !page.isB2B && page.branchId !== null && ASKABLE_CODE.test(page.code)
  const offline = useIsOffline()
  const canAsk = canAskBase && load.status === 'ready' && !view.range && view.period !== 90 && !offline
  const missingDays = page ? page.days.filter((day) => day.value === null).length : 0

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

  // Ask is the page's one filled action. It stays visible when it cannot run, with the reason beside it.
  const askReason = canAskBase ? (offline ? t('money.branch.ask.offline') : view.range || view.period === 90 ? t('money.branch.ask.rangeUnavailable') : undefined) : undefined
  const askButton = canAskBase ? (
    <Button variant="primary" onClick={() => void onAsk()} disabled={ask.status === 'pending' || !canAsk} aria-describedby={askReason ? 'money-ask-reason' : undefined}>
      {ask.status === 'pending' ? t('money.branch.ask.pending') : t('money.branch.ask', { branch: name, day: selectedText })}
    </Button>
  ) : undefined
  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', freshness?: ReactNode, action?: ReactNode, actionReason?: ReactNode) => (
    <PageFamilyFrame
      family="workspace"
      title={name}
      freshness={freshness}
      state={state}
      action={action}
      actionReason={actionReason}
      back={onlyBranch ? undefined : { to: `/money?${withMoneyView(new URLSearchParams(), view)}`, label: t('record.backToCollection', { collection: t('dest.money') }) }}
    >
      <div className="money-body money-branch">
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
    </EmptyState>{register}</>, 'empty')
  }

  let askStatus: ReactNode = null
  if (ask.status === 'failed') {
    askStatus = <ErrorState message={t('money.branch.ask.failed')} />
  } else if (ask.status === 'done' && ask.result.kind === 'created') {
    askStatus = (
      <Notice tone="success" action={<Link to={`/work/tasks/${ask.result.taskId}`}>{t('money.branch.ask.open')}</Link>}>
        {t('money.branch.ask.created', { branch: page.name, day: ask.day })}
      </Notice>
    )
  } else if (ask.status === 'done') {
    askStatus = <Notice tone="info">{t('money.branch.ask.noLead', { branch: page.name })}</Notice>
  }

  return frame(
    <>
      {filters}
      <MoneyFilterChips chips={chips} />
      <div className="money-results" aria-busy={load.status === 'loading' ? 'true' : undefined}>
      {askStatus && <div ref={askStatusRef} tabIndex={-1} className="money-branch__ask-result">{askStatus}</div>}
      {load.status === 'error' && <MoneyLoadError kept tooMany={load.tooMany} onRetry={() => void read()} />}
      <MoneyFigures label={t('money.overview.figures')} className="money-branch__figures">
        <MoneyFigure lead label={t('money.overview.revenue', { days: String(page.daysCount) })} value={formatIDRCompact(page.total)} delta={<MoneyDelta value={page.vsPrevious} t={t} />} basis={t('money.table.col.vsPrevious')} />
        <MoneyFigure
          label={t('money.overview.latestOn', { date: formatWeekdayDayMonth(lastReceived, locale) })}
          value={lastDay ? formatIDRCompact(lastDay.value!) : t('money.table.notReceived')}
          delta={<MoneyDelta value={lastDay?.compare ? lastDay.value! / lastDay.compare - 1 : null} t={t} />}
          basis={t('money.table.col.vsWeekday')}
        />
      </MoneyFigures>
      {!page.margin && canSeeFindings && <a href="#recipe-findings" className="money-branch__link">{t('money.findings.view')}</a>}
      <BranchDayWorkbench
        plotView={page.margin && searchParams.get('plot') === 'margin' ? 'margin' : 'revenue'}
        onPlotViewChange={(next) => {
          const params = new URLSearchParams(window.location.search)
          if (next === 'margin') params.set('plot', 'margin'); else params.delete('plot')
          setSearchParams(params, { replace: true })
        }}
        page={page}
        selected={selected}
        onSelect={setDay}
        missingDays={missingDays}
        findingsLink={page.margin && canSeeFindings ? <a href="#recipe-findings" className="money-branch__link">{t('money.findings.view')}</a> : undefined}
      />
      <DaysTable page={page} period={page.daysCount} />
      {register}
      {canSeeMargin && page.isB2B && <Notice tone="info">{t('money.note.b2b')}</Notice>}
      {data.marginFailed && !page.isB2B && <MoneyLoadError margin onRetry={() => void read()} />}
      {canSeeFindings && <div className="money-check-basis">
        <RecipeFindingsWorkspace data={findingData} status={findingStatus} onRetry={() => setFindingAttempt((n) => n + 1)} start={findingStart} end={findingEnd} />
        {page.margin && <UncoveredPanel branchId={page.branchId} />}
      </div>}
      </div>
    </>,
    undefined,
    <MoneyFreshness latestDate={lastReceived} syncedAt={syncedAt} />,
    askButton,
    askReason ? <span id="money-ask-reason">{askReason}</span> : undefined,
  )
}
