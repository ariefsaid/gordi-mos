// MoneyBranchPage — /money/branch/:code, opened from a branch row on the Money page
// (OD-2026-10-06-MONEY-BUILD). A day chart of the branch's revenue against the same weekday a week
// earlier; for the margin tier, margin and COGS against the recipe budget for the period in the
// URL, the branch's Café items without a recipe, and "Ask {branch} lead", which creates a Task that
// carries a link to this view and never a figure (mos.ask_branch_lead builds its text).
//
// Same two gates as /money: the route admits the revenue roles (router.tsx); below the margin tier
// the margin query is never issued and the margin, uncovered and ask pieces are absent. Postgres is
// the boundary. ?period=7|30|60 and ?d=YYYY-MM-DD (the chosen day) live in the URL.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { formatPercent, formatPoints } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { formatIDRCompact, signedChange } from '@/lib/sales-dashboard'
import { useMoneyRows } from '@/lib/use-money-rows'
import { buildBranchPage, readBranchView, type BranchPage } from '@/lib/money-branch-page'
import type { MarginFigures, MoneyPeriod } from '@/lib/money-branch-table'
import {
  askBranchLead,
  listUncoveredCafeItems,
  type AskBranchLeadResult,
  type UncoveredCafeItem,
} from '@/lib/db/money-branch'
import { MoneyFreshness, PeriodControl } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { DayRevenueChart } from '@/components/money/day-revenue-chart'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { streamKey } from '@/lib/kitchen-action-label'
import './money-page.css'
import './money-branch-page.css'

type Ask = { status: 'idle' | 'pending' | 'failed' } | { status: 'done'; result: AskBranchLeadResult }

function cafeItemHref(item: UncoveredCafeItem, branchId: string): string {
  const params = new URLSearchParams({ q: item.name, stream: streamKey(branchId, item.activities[0]) })
  return `/cafe/items?${params.toString()}`
}

function MarginPanel({ margin, period }: { margin: MarginFigures; period: MoneyPeriod }) {
  const t = useT()
  const basis = margin.budgetBasis
  return (
    <section className="money-branch__panel" aria-labelledby="money-branch-margin">
      <h2 id="money-branch-margin" className="money-branch__h2">{t('money.branch.margin.title', { days: String(period) })}</h2>
      <p className="money-branch__sentence tabular">
        {basis && margin.cogsVsBudget !== null
          ? t(margin.cogsVsBudget > 0 ? 'money.branch.margin.over' : 'money.branch.margin.under', {
            cogs: formatPercent(basis.cogsShare, 1),
            budget: formatPercent(basis.budgetShare, 1),
            points: formatPoints(margin.cogsVsBudget),
          })
          : t('money.branch.margin.noBudget')}
      </p>
      <dl className="money-branch__figures">
        <div>
          <dt>{t('money.table.col.margin')}</dt>
          <dd className="tabular">{margin.pct === null ? t('money.table.notReceived') : formatPercent(margin.pct, 1)}</dd>
        </div>
        <div>
          <dt>{t('money.table.col.coverage')}</dt>
          <dd className="tabular">{margin.coverage === null ? t('money.table.notReceived') : formatPercent(margin.coverage, 0)}</dd>
        </div>
      </dl>
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
              <th scope="col">{t('money.chart.legend.compare')}</th>
              <th scope="col">{t('money.branch.days.col.change')}</th>
            </tr>
          </thead>
          <tbody>
            {[...page.days].reverse().map((d) => (
              <tr key={d.date}>
                <th scope="row">{formatWeekdayDayMonth(d.date, locale)}</th>
                <td className="tabular">{d.value === null ? t('money.table.notReceived') : formatIDR(d.value)}</td>
                <td className="tabular">{d.compare === null ? t('money.table.notReceived') : formatIDR(d.compare)}</td>
                <td className="tabular">
                  {d.value !== null && d.compare ? signedChange(d.value / d.compare - 1).text : t('money.delta.noComparison')}
                </td>
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
    () => (data ? buildBranchPage(data.revenue, data.margin, code, view.period) : null),
    [data, code, view.period],
  )
  const syncedAt = useMemo(() => (data ? latestBy(data.revenue, (r) => r.snapshot_as_of) : null), [data])
  // A supervisor who sees one branch was sent here from /money; a link back would send them here again.
  const onlyBranch = !canSeeMargin && data !== null && new Set(data.revenue.map((r) => r.branch_code)).size === 1
  const [ask, setAsk] = useState<Ask>({ status: 'idle' })

  const name = page?.name ?? code
  useDocumentTitle(t('money.branch.documentTitle', { branch: name }))
  useSetBreadcrumbTitle(name)

  const setView = (period: MoneyPeriod, day: string | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('period', String(period))
    if (day) next.set('d', day)
    else next.delete('d')
    setSearchParams(next, { replace: true })
  }
  const selected = page && view.day && page.days.some((d) => d.date === view.day) ? view.day : page?.latestDate ?? ''
  const canAsk = canSeeMargin && page !== null && !page.isB2B

  const onAsk = async () => {
    if (!page) return
    setAsk({ status: 'pending' })
    try {
      const result = await askBranchLead({ code: page.code, period: view.period, day: selected, locale: locale === 'id' ? 'id' : 'en' })
      setAsk({ status: 'done', result })
    } catch {
      setAsk({ status: 'failed' })
    }
  }

  const askButton = canAsk ? (
    <Button variant="primary" onClick={() => void onAsk()} disabled={ask.status === 'pending'}>
      {ask.status === 'pending' ? t('money.branch.ask.pending') : t('money.branch.ask', { branch: name })}
    </Button>
  ) : undefined

  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', meta?: ReactNode, action?: ReactNode) => (
    <PageFamilyFrame family="workspace" title={name} meta={meta} state={state} action={action}>
      <div className="money-body money-branch">
        {!onlyBranch && (
          <Link to={`/money?period=${view.period}`} className="money-branch__back">
            <span aria-hidden="true">← </span>{t('money.branch.back')}
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
      <EmptyState variant="awaiting" title={t('money.branch.notFound.title')} copy={t('money.branch.notFound.copy')} />,
      'empty',
    )
  }

  let askStatus: ReactNode = null
  if (ask.status === 'failed') {
    askStatus = <ErrorState message={t('money.branch.ask.failed')} onRetry={() => void onAsk()} />
  } else if (ask.status === 'done' && ask.result.kind === 'created') {
    askStatus = (
      <p role="status" className="money-branch__ask-status">
        {t('money.branch.ask.created', { branch: page.name })}{' '}
        <Link to={`/work/tasks/${ask.result.taskId}`}>{t('money.branch.ask.open')}</Link>
      </p>
    )
  } else if (ask.status === 'done') {
    askStatus = <p role="status" className="money-branch__ask-status">{t('money.branch.ask.noLead', { branch: page.name })}</p>
  }

  return frame(
    <>
      {periodControl()}
      {load.status === 'error' && <MoneyLoadError kept tooMany={load.tooMany} onRetry={() => void read()} />}
      {askStatus}
      <div className={`money-branch__grid${page.margin === undefined || page.margin === null ? ' money-branch__grid--single' : ''}`}>
        <section className="money-branch__panel money-branch__panel--chart" aria-labelledby="money-branch-chart">
          <div className="money-branch__panel-head">
            <h2 id="money-branch-chart" className="money-branch__h2">{t('money.branch.chart.title')}</h2>
            <span className="money-branch__total tabular">
              {t('money.branch.total', { value: formatIDRCompact(page.total), days: String(view.period) })}
            </span>
          </div>
          <DayRevenueChart
            days={page.days}
            selected={selected}
            onSelect={(day) => setView(view.period, day)}
            label={t('money.chart.label', { branch: page.name })}
          />
          <DaysTable page={page} period={view.period} />
        </section>
        {page.margin && (
          <div className="money-branch__side">
            <MarginPanel margin={page.margin} period={view.period} />
            <UncoveredPanel branchId={page.branchId} />
          </div>
        )}
      </div>
    </>,
    undefined,
    <MoneyFreshness latestDate={page.latestDate} syncedAt={syncedAt} />,
    askButton,
  )
}
