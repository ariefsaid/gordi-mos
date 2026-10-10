// MoneyBranchPage — /money/branch/:code, opened from a branch row on the Money page
// (OD-2026-10-06-MONEY-BUILD). A day chart of the branch's revenue against the same weekday a week
// earlier; for the margin tier, margin and COGS against the recipe budget for the period in the
// URL, the branch's Café items without a recipe, and "Ask {branch} lead", which creates a Task that
// carries a link to this view and never a figure (mos.ask_branch_lead builds its text).
//
// Same two gates as /money: the route admits the revenue roles (router.tsx); below the margin tier
// the margin query is never issued and the margin, uncovered and ask pieces are absent. Postgres is
// the boundary. ?period=7|30|60 and ?d=YYYY-MM-DD (the chosen day) live in the URL.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { isoDaysBefore } from '@/lib/trailing-window'
import { Pill } from '@/components/ui/pill'
import { useMoneyRows } from '@/lib/use-money-rows'
import { buildBranchPage, readBranchView, type BranchPage } from '@/lib/money-branch-page'
import { MONEY_FETCH_DAYS, type MarginFigures, type MoneyPeriod } from '@/lib/money-branch-table'
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

function MarginPanel({ margin, period }: { margin: MarginFigures; period: MoneyPeriod }) {
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
          <span className="absolute -top-1 h-[18px] border-l-2" aria-hidden="true" style={{ left: `${bullet.marker}%`, borderColor: 'var(--text-tertiary)' }} />
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

function DaysTable({ page, period }: { page: BranchPage; period: MoneyPeriod }) {
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
                <td className="tabular">{d.value === null ? t('money.table.notReceived') : formatIDR(d.value)}</td>
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
                  <td className="tabular">{d.marginPct == null ? t('money.table.notReceived') : formatPercent(d.marginPct, 1)}</td>
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
  const view = readBranchView(searchParams)
  const { load, read } = useMoneyRows(canSeeMargin)
  const data = load.data
  const page = useMemo(
    () => (data ? buildBranchPage(data.revenue, data.margin, code, view.period, data.branchNames) : null),
    [data, code, view.period],
  )
  const syncedAt = useMemo(() => (data ? latestBy(data.revenue, (r) => r.snapshot_as_of) : null), [data])
  // A supervisor who sees one branch was sent here from /money; a link back would send them here again.
  const onlyBranch = !canSeeMargin && data !== null && new Set(data.revenue.map((r) => r.branch_code)).size === 1
  const [ask, setAsk] = useState<Ask>({ status: 'idle' })
  const askStatusRef = useRef<HTMLDivElement>(null)
  // The result is announced and takes focus, so a keyboard user lands on the Task link.
  useEffect(() => {
    if (ask.status === 'done' || ask.status === 'failed') askStatusRef.current?.focus()
  }, [ask.status])

  const name = page?.name ?? code
  useDocumentTitle(t('money.branch.documentTitle', { branch: name }))
  useSetBreadcrumbTitle(name)

  const setView = (period: MoneyPeriod, day: string | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('period', String(period))
    // A chosen day outside the new period is dropped rather than kept in the URL unseen.
    if (day && (!page || day >= isoDaysBefore(page.latestDate, period - 1))) next.set('d', day)
    else next.delete('d')
    setSearchParams(next, { replace: true })
    // An answer about the previous view no longer describes this one.
    setAsk({ status: 'idle' })
  }
  // The branch's own latest received day: the page opens on it and its freshness names it.
  const lastReceived = page ? [...page.days].reverse().find((d) => d.value !== null)?.date ?? page.latestDate : ''
  const lastDay = page ? [...page.days].reverse().find((d) => d.value !== null) : undefined
  const selected = page && view.day && page.days.some((d) => d.date === view.day) ? view.day : lastReceived
  const selectedText = selected ? formatWeekdayDayMonth(selected, locale) : ''
  const canAsk = canSeeMargin && page !== null && !page.isB2B && page.branchId !== null && ASKABLE_CODE.test(page.code)
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
          <Link to={`/money?period=${view.period}`} className="money-branch__back">
            <span aria-hidden="true">←</span>{t('money.branch.back')}
          </Link>
        )}
        {children}
      </div>
    </PageFamilyFrame>
  )
  const periodControl = (disabled = false) => (
    <PeriodControl period={view.period} onChange={(period) => setView(period, view.day)} disabled={disabled} />
  )

  if (!data && load.status === 'loading') {
    return frame(
      <>
        {periodControl(true)}
        <div role="status" aria-label={t('common.loading')} aria-busy="true" className="money-branch__skeleton">
          <div className="skeleton-bar money-branch__skeleton-chart" />
          <SkeletonRows count={3} />
        </div>
      </>,
      'loading',
    )
  }
  if (!data) return frame(<MoneyLoadError tooMany={load.tooMany} onRetry={() => void read()} />, 'error')
  if (!page) {
    return frame(
      <EmptyState variant="awaiting" title={t('money.branch.notFound.title')} copy={t('money.branch.notFound.copy', { days: String(MONEY_FETCH_DAYS) })} />,
      'empty',
    )
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
      {periodControl()}
      {load.status === 'error' && <MoneyLoadError kept tooMany={load.tooMany} onRetry={() => void read()} />}
      {askStatus && <div ref={askStatusRef} tabIndex={-1} className="money-branch__ask-result">{askStatus}</div>}
      <div className={`money-branch__kpis grid min-w-0 grid-cols-2 gap-2 ${page.margin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
        <KPITile valueVariant="proportional" label={t('money.overview.revenue', { days: String(view.period) })} value={formatIDRCompact(page.total)} delta={moneyKpiDelta(page.vsPrevious, t)} sub={t('money.table.col.vsPrevious')} />
        <KPITile valueVariant="proportional" label={t('money.overview.latest')} value={lastDay ? formatIDRCompact(lastDay.value!) : t('money.table.notReceived')} delta={moneyKpiDelta(lastDay?.compare ? lastDay.value! / lastDay.compare - 1 : null, t)} sub={t('money.table.col.vsWeekday')} />
        {page.margin && <KPITile valueVariant="proportional" label={t('money.overview.margin')} value={page.margin.pct === null ? t('money.table.notReceived') : formatPercent(page.margin.pct, 1)} />}
        {page.margin && <KPITile valueVariant="proportional" label={t('money.table.col.coverage')} value={page.margin.coverage === null ? t('money.table.notReceived') : formatPercent(page.margin.coverage, 0)} />}
      </div>
      <div className={`money-branch__grid${page.margin || (data.marginFailed && !page.isB2B) ? '' : ' money-branch__grid--single'}`}>
        <section className="money-branch__panel money-branch__panel--chart" aria-labelledby="money-branch-chart">
          <div className="money-branch__panel-head">
            <h2 id="money-branch-chart" className="money-branch__h2">{t('money.branch.chart.title')}</h2>
            <span className="money-branch__total tabular">
              {missingDays === 0
                ? t('money.branch.total', { value: formatIDRCompact(page.total), days: String(view.period) })
                : t(missingDays === 1 ? 'money.branch.total.missingOne' : 'money.branch.total.missingOther', {
                  value: formatIDRCompact(page.total), days: String(view.period), count: String(missingDays),
                })}
            </span>
          </div>
          <DayRevenueChart
            days={page.days}
            selected={selected}
            onSelect={(day) => setView(view.period, day)}
            label={t('money.chart.label', { branch: page.name })}
          />
          {page.margin && <section className="money-branch__margin-chart mt-3 grid gap-2 border-t border-border pt-3" aria-labelledby="money-branch-margin-chart">
            <h2 id="money-branch-margin-chart" className="money-branch__h2">{t('money.branch.marginChart.title')}</h2>
            <DayRevenueChart days={page.days} selected={selected} onSelect={(day) => setView(view.period, day)} label={t('money.chart.margin.label', { branch: page.name })} mode="margin" budget={page.margin.budgetBasis ? 1 - page.margin.budgetBasis.budgetShare : null} />
          </section>}
          <DaysTable page={page} period={view.period} />
          {canSeeMargin && page.isB2B && <p className="money-branch__note">{t('money.note.b2b')}</p>}
        </section>
        {page.margin && (
          <div className="money-branch__side">
            <MarginPanel margin={page.margin} period={view.period} />
            <UncoveredPanel branchId={page.branchId} />
          </div>
        )}
        {data.marginFailed && !page.isB2B && (
          <div className="money-branch__side">
            <MoneyLoadError margin onRetry={() => void read()} />
          </div>
        )}
      </div>
    </>,
    undefined,
    <MoneyFreshness latestDate={lastReceived} syncedAt={syncedAt} />,
    askButton,
  )
}
