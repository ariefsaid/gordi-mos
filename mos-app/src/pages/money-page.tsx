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
// Period and sort live in the URL (?period=7|30|60&sort=<column>.<dir>), read on load and written
// on change. Every window anchors to the latest reporting day in the rows, never to the clock.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { canViewMargin } from '@/lib/capabilities'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { latestBy, ReportingRowCapError } from '@/lib/db/reporting-shared'
import { formatWeekdayDayMonth, formatWibWeekdayTime } from '@/lib/format/date'
import {
  MONEY_FETCH_DAYS,
  MONEY_PERIODS,
  buildBranchTable,
  readMoneyView,
  withMoneyView,
  type MoneyPeriod,
  type MoneyView,
} from '@/lib/money-branch-table'
import { BranchTable } from '@/components/money/branch-table'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import './money-page.css'

interface Loaded {
  revenue: SalesDailyRevenueRow[]
  /** Null for a viewer below the margin tier: the query was not issued. */
  margin: SalesMarginDailyRow[] | null
}

interface Load {
  status: 'loading' | 'ready' | 'error'
  /** The last rows read, kept through a later refresh's loading or failure. */
  data: Loaded | null
  /** The failure was the read's row ceiling, not the service. */
  tooMany?: boolean
}

/** The nightly sync runs once a day; a snapshot older than this missed at least one run. */
const STALE_AFTER_MS = 30 * 3600_000

function PeriodControl({ period, onChange, disabled }: { period: MoneyPeriod; onChange: (p: MoneyPeriod) => void; disabled?: boolean }) {
  const t = useT()
  return (
    <div className="money-period" role="group" aria-label={t('money.period.label')}>
      {MONEY_PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className="money-period__option"
          aria-pressed={p === period}
          disabled={disabled}
          onClick={() => onChange(p)}
        >
          {t('money.period.days', { days: String(p) })}
        </button>
      ))}
    </div>
  )
}

export function MoneyPage() {
  const t = useT()
  const { locale } = useI18n()
  useDocumentTitle(t('money.documentTitle'))
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canSeeMargin = canViewMargin(accessRoles)
  const [searchParams, setSearchParams] = useSearchParams()
  const view = readMoneyView(searchParams, { canSeeMargin })
  const setView = (next: MoneyView) => setSearchParams(withMoneyView(searchParams, next), { replace: true })

  const [load, setLoad] = useState<Load>({ status: 'loading', data: null })
  const dataRef = useRef<Loaded | null>(null)
  // Reads can overlap (a Retry, a tab coming back); only the latest one may land.
  const latestRead = useRef(0)
  const read = useCallback(async () => {
    const id = ++latestRead.current
    setLoad({ status: 'loading', data: dataRef.current })
    try {
      const [revenue, margin] = await Promise.all([
        listSalesDailyRevenue({ sinceDays: MONEY_FETCH_DAYS }),
        canSeeMargin ? listSalesMarginDaily({ sinceDays: MONEY_FETCH_DAYS }) : Promise.resolve(null),
      ])
      if (id !== latestRead.current) return
      dataRef.current = { revenue, margin }
      setLoad({ status: 'ready', data: dataRef.current })
    } catch (error) {
      if (id !== latestRead.current) return
      setLoad({ status: 'error', data: dataRef.current, tooMany: error instanceof ReportingRowCapError })
    }
  }, [canSeeMargin])

  useEffect(() => {
    void read()
    // A tab left open overnight reads again when the viewer comes back to it.
    const onVisible = () => { if (document.visibilityState === 'visible') void read() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [read])

  const data = load.data
  const table = useMemo(
    () => (data ? buildBranchTable(data.revenue, data.margin, view.period) : null),
    [data, view.period],
  )
  const syncedAt = useMemo(() => (data ? latestBy(data.revenue, (r) => r.snapshot_as_of) : null), [data])

  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', meta?: ReactNode) => (
    <PageFamilyFrame
      family="workspace"
      title={t('dest.money')}
      meta={meta}
      state={state}
      action={SHOW_FOLLOWUPS ? <Link to="/money/follow-ups" className="btn btn-outline">{t('money.followUpQueue')}</Link> : undefined}
    >
      {children}
    </PageFamilyFrame>
  )
  const periodControl = (disabled = false) => (
    <PeriodControl period={view.period} onChange={(period) => setView({ ...view, period })} disabled={disabled} />
  )

  // A supervisor granted one branch has no table to choose from: open that branch.
  if (!canSeeMargin && table && table.branches.length + table.b2b.length === 1) {
    const only = table.branches[0] ?? table.b2b[0]
    return <Navigate to={`/money/branch/${encodeURIComponent(only.code)}?period=${view.period}`} replace />
  }

  if (!data && load.status === 'loading') {
    return frame(
      <div className="money-body">
        {periodControl(true)}
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

  if (!data) return frame(<ErrorState message={t(load.tooMany ? 'money.error.tooMany' : 'money.error')} onRetry={() => void read()} />, 'error')

  if (!table) {
    return frame(
      <EmptyState variant="awaiting" title={t('money.empty.title')} copy={t('money.empty.copy')}>
        <Button variant="outline" onClick={() => void read()} disabled={load.status === 'loading'}>
          {t('money.empty.refresh')}
        </Button>
      </EmptyState>,
      'empty',
    )
  }

  const stale = syncedAt !== null && Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS
  const freshness = (
    <span className={`ch-meta-line money-freshness${stale ? ' money-freshness--stale' : ''}`}>
      {t(stale ? 'money.freshness.stale' : 'money.freshness', {
        through: formatWeekdayDayMonth(table.latestDate, locale),
        synced: syncedAt ? formatWibWeekdayTime(syncedAt, locale) : '',
      })}
    </span>
  )

  return frame(
    <div className="money-body">
      {periodControl()}
      {load.status === 'error' && <ErrorState message={t(load.tooMany ? 'money.error.tooMany' : 'money.error.kept')} onRetry={() => void read()} />}
      <BranchTable
        data={table}
        period={view.period}
        sort={view.sort}
        onSortChange={(sort) => setView({ ...view, sort })}
      />
    </div>,
    undefined,
    freshness,
  )
}
