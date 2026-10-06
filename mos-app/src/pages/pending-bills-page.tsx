// PendingBillsPage — /money/pending-bills, Finance's list of deferred-payment bills copied nightly
// from the tills (#1464). Read-only in this ticket: no payment, settle, search or totals.
//
// The route admits Finance only (router.tsx); the boundary is reporting.pending_bills' read policy.
// The as-of time is the latest copy run's, never the clock's. A bill the source voided or stopped
// sending keeps its row and says so in its State cell.
import type { ReactNode } from 'react'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { latestPendingBillSnapshot, listPendingBills } from '@/lib/db/reporting-pending-bills'
import { useReportingRead } from '@/hooks/useReportingRead'
import { isPendingBillCopyStale, toPendingBillViews, type PendingBillState, type PendingBillView } from '@/lib/pending-bills'
import { wibToday } from '@/lib/home-attention'
import { formatIDR } from '@/lib/format/money'
import { formatDayMonthYear, formatWibWeekdayTime } from '@/lib/format/date'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import './pending-bills-page.css'

const loadPendingBills = () =>
  Promise.all([listPendingBills(), latestPendingBillSnapshot()]).then(([bills, snapshot]) => ({ bills, snapshot }))

const STATE_LABEL: Record<PendingBillState, MessageKey> = {
  open: 'pendingBills.state.open',
  void: 'pendingBills.state.void',
  missing: 'pendingBills.state.missing',
}

type T = ReturnType<typeof useT>

function ageText(days: number, t: T): string {
  if (days <= 0) return t('pendingBills.age.today')
  return days === 1 ? t('pendingBills.age.one') : t('pendingBills.age.other', { count: String(days) })
}

function owes(bill: PendingBillView, t: T): ReactNode {
  return bill.counterpartyNote ?? <span className="pending-bills__muted">{t('pendingBills.owes.none')}</span>
}

function branch(bill: PendingBillView): ReactNode {
  return bill.branchName ?? <span className="pending-bills__code">{bill.branchCode}</span>
}

function statePill(bill: PendingBillView, t: T): ReactNode {
  return <Pill tone={bill.state === 'open' ? 'neutral' : 'warning'}>{t(STATE_LABEL[bill.state])}</Pill>
}

function columns(t: T, locale: ReturnType<typeof useI18n>['locale']): DataTableColumn<PendingBillView>[] {
  return [
    { key: 'date', header: t('pendingBills.col.date'), render: (b) => <span className="tabular pending-bills__nowrap">{formatDayMonthYear(b.billDate, locale)}</span> },
    { key: 'branch', header: t('pendingBills.col.branch'), render: branch },
    { key: 'owes', header: t('pendingBills.col.owes'), render: (b) => <span className="pending-bills__owes">{owes(b, t)}</span> },
    { key: 'bill', header: t('pendingBills.col.billNo'), render: (b) => <span className="pending-bills__code">{b.billNo}</span> },
    { key: 'amount', header: t('pendingBills.col.amount'), numeric: true, render: (b) => formatIDR(b.amount) },
    { key: 'balance', header: t('pendingBills.col.balance'), numeric: true, render: (b) => formatIDR(b.balance) },
    { key: 'age', header: t('pendingBills.col.age'), numeric: true, render: (b) => ageText(b.ageDays, t) },
    { key: 'state', header: t('pendingBills.col.state'), render: (b) => statePill(b, t) },
  ]
}

/** The phone card: who owes and the amount; date · branch · bill no.; then age, state, balance. */
function BillCard({ bill }: { bill: PendingBillView }) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <div className="pending-bill-card">
      <div className="pending-bill-card__title">{owes(bill, t)}</div>
      <div className="pending-bill-card__amount tabular">{formatIDR(bill.amount)}</div>
      <div className="pending-bill-card__meta">
        <span className="tabular">{formatDayMonthYear(bill.billDate, locale)}</span>
        {' · '}{branch(bill)}{' · '}
        <span className="pending-bills__code">{bill.billNo}</span>
      </div>
      <div className="pending-bill-card__status">
        <span className="tabular">{ageText(bill.ageDays, t)}</span>
        {statePill(bill, t)}
      </div>
      <div className="pending-bill-card__balance">
        {t('pendingBills.col.balance')} <span className="tabular">{formatIDR(bill.balance)}</span>
      </div>
    </div>
  )
}

export function PendingBillsPage() {
  const t = useT()
  const { locale } = useI18n()
  const isDesktop = useIsDesktop()
  useDocumentTitle(t('pendingBills.documentTitle'))
  const { status, data, tooMany, reload } = useReportingRead(loadPendingBills)

  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', meta?: ReactNode) => (
    <PageFamilyFrame family="workspace" title={t('nav.money.pendingBills')} meta={meta} state={state}>
      {children}
    </PageFamilyFrame>
  )
  const refresh = (
    <Button variant="outline" onClick={reload} disabled={status === 'loading'}>
      {t('pendingBills.refresh')}
    </Button>
  )

  if (!data && status === 'loading') return frame(<LoadingShell count={5} className="pending-bills-loading" />, 'loading')
  if (!data) {
    return frame(<ErrorState message={t(tooMany ? 'pendingBills.error.tooMany' : 'pendingBills.error')} onRetry={reload} />, 'error')
  }

  const kept = status === 'error'
    ? <ErrorState message={t(tooMany ? 'pendingBills.error.tooMany' : 'pendingBills.error.kept')} onRetry={reload} />
    : null

  if (!data.snapshot) {
    return frame(
      <div className="pending-bills-body">
        {kept}
        <EmptyState variant="awaiting" title={t('pendingBills.none.title')} copy={t('pendingBills.none.copy')}>
          {refresh}
        </EmptyState>
      </div>,
      'empty',
    )
  }

  const copiedAt = formatWibWeekdayTime(data.snapshot.snapshot_as_of, locale)
  const asOf = <span className="ch-meta-line pending-bills-freshness">{t('pendingBills.asOf', { time: copiedAt })}</span>
  const bills = toPendingBillViews(data.bills, wibToday())

  if (bills.length === 0) {
    return frame(
      <div className="pending-bills-body">
        {kept}
        <EmptyState variant="awaiting" title={t('pendingBills.empty.title')}>{refresh}</EmptyState>
      </div>,
      'empty',
      asOf,
    )
  }

  return frame(
    <div className="pending-bills-body">
      {kept}
      {isPendingBillCopyStale(data.snapshot.snapshot_as_of, new Date()) && (
        <div className="pending-bills-stale">
          <p className="pending-bills-stale__text">{t('pendingBills.stale', { time: copiedAt })}</p>
          {refresh}
        </div>
      )}
      <div className="pending-bills-scroll">
        <DataTable
          columns={columns(t, locale)}
          rows={bills}
          isDesktop={isDesktop}
          caption={t('pendingBills.table.caption')}
          renderCard={(bill) => <BillCard bill={bill} />}
        />
      </div>
    </div>,
    undefined,
    asOf,
  )
}
