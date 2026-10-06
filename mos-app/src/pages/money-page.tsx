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
import { useMemo, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { canViewMargin } from '@/lib/capabilities'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { latestBy } from '@/lib/db/reporting-shared'
import { buildBranchTable, readMoneyView, withMoneyView, type MoneyView } from '@/lib/money-branch-table'
import { useMoneyRows } from '@/lib/use-money-rows'
import { BranchTable } from '@/components/money/branch-table'
import { MoneyFreshness, PeriodControl } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { EmptyState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import './money-page.css'

export function MoneyPage() {
  const t = useT()
  useDocumentTitle(t('money.documentTitle'))
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canSeeMargin = canViewMargin(accessRoles)
  const [searchParams, setSearchParams] = useSearchParams()
  const view = readMoneyView(searchParams, { canSeeMargin })
  const setView = (next: MoneyView) => setSearchParams(withMoneyView(searchParams, next), { replace: true })

  const { load, read } = useMoneyRows(canSeeMargin)

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

  if (!data) return frame(<MoneyLoadError tooMany={load.tooMany} onRetry={() => void read()} />, 'error')

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

  return frame(
    <div className="money-body">
      {periodControl()}
      {load.status === 'error' && <MoneyLoadError kept tooMany={load.tooMany} onRetry={() => void read()} />}
      {load.status === 'ready' && data.marginFailed && <MoneyLoadError margin onRetry={() => void read()} />}
      <BranchTable
        data={table}
        period={view.period}
        sort={view.sort}
        onSortChange={(sort) => setView({ ...view, sort })}
      />
    </div>,
    undefined,
    <MoneyFreshness latestDate={table.latestDate} syncedAt={syncedAt} />,
  )
}
