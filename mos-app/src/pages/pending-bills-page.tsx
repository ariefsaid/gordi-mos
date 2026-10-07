// PendingBillsPage — Finance's list and MOS record of deferred-payment bills (#1465).
// The nightly reporting copy stays read-only; payments and reversals use the append-only MOS RPC.
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/use-auth'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { PendingBillPaymentForm, type PendingBillPaymentSaved } from '@/components/money/pending-bill-payment-form'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { ModalShell } from '@/components/ui/modal-shell'
import { Pill } from '@/components/ui/pill'
import { useReportingRead } from '@/hooks/useReportingRead'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import {
  latestPendingBillSnapshot,
  listPendingBills,
} from '@/lib/db/reporting-pending-bills'
import {
  listPendingBillPaymentAmounts,
  listPendingBillPaymentHistory,
  type PendingBillPaymentAmountRow,
  type PendingBillPaymentHistoryEntry,
} from '@/lib/db/pending-bill-payments'
import { formatDayMonthYear, formatWibWeekdayTime } from '@/lib/format/date'
import { formatIDR } from '@/lib/format/money'
import { isPendingBillCopyStale, summarizePendingBills, toPendingBillViews, type PendingBillState, type PendingBillView } from '@/lib/pending-bills'
import { wibToday } from '@/lib/home-attention'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsWideOverlayWidth } from '@/shell/use-is-wide-overlay-width'
import './pending-bills-page.css'

const loadPendingBills = () =>
  Promise.all([listPendingBills(), latestPendingBillSnapshot(), listPendingBillPaymentAmounts()])
    .then(([bills, snapshot, payments]) => ({ bills, snapshot, payments }))

type T = ReturnType<typeof useT>
type PaymentFormMode = { kind: 'payment' } | { kind: 'reverse'; entry: PendingBillPaymentHistoryEntry }

const STATE_LABEL: Record<PendingBillState, MessageKey> = {
  open: 'pendingBills.state.open',
  partial: 'pendingBills.state.partial',
  settled: 'pendingBills.state.settled',
  overpaid: 'pendingBills.state.overpaid',
  void: 'pendingBills.state.void',
  missing: 'pendingBills.state.missing',
}

function ageText(days: number, t: T): string {
  if (days <= 0) return t('pendingBills.age.today')
  return days === 1 ? t('pendingBills.age.one') : t('pendingBills.age.other', { count: String(days) })
}

function statePill(bill: PendingBillView, t: T): ReactNode {
  const tone = bill.state === 'settled' ? 'success'
    : bill.state === 'partial' || bill.state === 'overpaid' || bill.state === 'void' || bill.state === 'missing' ? 'warning'
      : 'neutral'
  return <Pill tone={tone}>{t(STATE_LABEL[bill.state])}</Pill>
}

function branch(bill: PendingBillView, t: T): ReactNode {
  if (bill.branchKnown && bill.branchName) return bill.branchName
  const code = <span className="pending-bills__code">{bill.branchCode}</span>
  if (bill.branchKnown) return code
  return <>{code} <span className="pending-bills__muted">{t('pendingBills.branch.unknown')}</span></>
}

function columns(
  t: T,
  locale: ReturnType<typeof useI18n>['locale'],
  onOpen: (bill: PendingBillView) => void,
): DataTableColumn<PendingBillView>[] {
  return [
    { key: 'date', header: t('pendingBills.col.date'), render: (bill) => <span className="tabular pending-bills__nowrap">{formatDayMonthYear(bill.billDate, locale)}</span> },
    { key: 'age', header: t('pendingBills.col.age'), numeric: true, render: (bill) => ageText(bill.ageDays, t) },
    { key: 'branch', header: t('pendingBills.col.branch'), render: (bill) => branch(bill, t) },
    { key: 'owes', header: t('pendingBills.col.owes'), render: (bill) => <span className="pending-bills__owes">{bill.counterpartyNote ?? <span className="pending-bills__muted">{t('pendingBills.owes.none')}</span>}</span> },
    { key: 'state', header: t('pendingBills.col.state'), render: (bill) => statePill(bill, t) },
    { key: 'bill', header: t('pendingBills.col.billNo'), render: (bill) => (
      <button type="button" className="pending-bills__record-trigger" onClick={() => onOpen(bill)} aria-label={t('pendingBills.openBill', { billNo: bill.billNo })}>
        <span className="pending-bills__code">{bill.billNo}</span>
      </button>
    ) },
    { key: 'amount', header: t('pendingBills.col.amount'), numeric: true, render: (bill) => formatIDR(bill.amount) },
    { key: 'balance', header: t('pendingBills.col.balance'), numeric: true, render: (bill) => formatIDR(bill.balance) },
  ]
}

function BillCard({ bill, onOpen }: { bill: PendingBillView; onOpen: (bill: PendingBillView) => void }) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <div className="pending-bill-card">
      <button
        type="button"
        className={`pending-bill-card__title${bill.counterpartyNote ? '' : ' pending-bill-card__title--none'}`}
        onClick={() => onOpen(bill)}
        aria-label={t('pendingBills.openBill', { billNo: bill.billNo })}
      >
        {bill.counterpartyNote ?? t('pendingBills.owes.none')}
      </button>
      <div className="pending-bill-card__amount tabular">{formatIDR(bill.amount)}</div>
      <div className="pending-bill-card__meta">
        <span className="tabular">{formatDayMonthYear(bill.billDate, locale)}</span>
        {' · '}{branch(bill, t)}{' · '}
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

function PaymentHistory({
  entries,
  status,
  onRetry,
  onReverse,
}: {
  entries: PendingBillPaymentHistoryEntry[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
  onReverse: (entry: PendingBillPaymentHistoryEntry) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  if (status === 'loading') return <p className="pending-bill-record__quiet" role="status">{t('pendingBills.history.loading')}</p>
  if (status === 'error') return (
    <div className="pending-bill-record__history-error" role="alert">
      <p>{t('pendingBills.history.error')}</p>
      <Button variant="outline" onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  )
  if (entries.length === 0) return <p className="pending-bill-record__quiet">{t('pendingBills.history.empty')}</p>

  const reversed = new Set(entries.flatMap((entry) => entry.reversalOf ? [entry.reversalOf] : []))
  return (
    <ol className="pending-bill-record__history" aria-label={t('pendingBills.history.title')}>
      {entries.map((entry) => {
        const isReversal = entry.entryKind === 'reversal'
        const hasReversal = reversed.has(entry.id)
        return (
          <li className="pending-bill-record__entry" key={entry.id}>
            <div className="pending-bill-record__entry-top">
              <span className="pending-bill-record__entry-kind">{t(isReversal ? 'pendingBills.history.reversal' : 'pendingBills.history.payment')}</span>
              <span className={`pending-bill-record__entry-amount${isReversal ? ' pending-bill-record__entry-amount--reversal' : ''}`}>
                {formatIDR(isReversal ? entry.amount : Math.abs(entry.amount))}
              </span>
            </div>
            <p className="pending-bill-record__entry-meta">
              {t('pendingBills.history.cashInDate', { date: formatDayMonthYear(entry.cashInDate, locale) })}
              {' · '}{entry.actorName ?? t('pendingBills.history.finance')}
              {' · '}{formatWibWeekdayTime(entry.createdAt, locale)}
            </p>
            {entry.note && <p className="pending-bill-record__entry-note">{entry.note}</p>}
            {entry.reversalReason && <p className="pending-bill-record__entry-note">{t('pendingBills.history.reason', { reason: entry.reversalReason })}</p>}
            {entry.proofUrl && <a className="pending-bill-record__proof" href={entry.proofUrl} target="_blank" rel="noopener noreferrer">{t('pendingBills.history.openProof')}</a>}
            {hasReversal && <p className="pending-bill-record__reversed">{t('pendingBills.history.reversed')}</p>}
            {!isReversal && !hasReversal && (
              <Button variant="ghost" className="pending-bill-record__reverse" onClick={() => onReverse(entry)}>
                {t('pendingBills.history.reverse')}
              </Button>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function RecordPanel({
  bill,
  entries,
  historyStatus,
  onRetryHistory,
  onStartPayment,
  onReverse,
  formMode,
  orgId,
  isDesktop,
  onCloseForm,
  onSaved,
}: {
  bill: PendingBillView
  entries: PendingBillPaymentHistoryEntry[]
  historyStatus: 'loading' | 'ready' | 'error'
  onRetryHistory: () => void
  onStartPayment: () => void
  onReverse: (entry: PendingBillPaymentHistoryEntry) => void
  formMode: PaymentFormMode | null
  orgId: string
  isDesktop: boolean
  onCloseForm: () => void
  onSaved: (saved: PendingBillPaymentSaved) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const canPay = (bill.state === 'open' || bill.state === 'partial') && bill.balance > 0
  const original = formMode?.kind === 'reverse' ? formMode.entry : null
  const form = formMode ? (
    <PendingBillPaymentForm
      key={formMode.kind === 'reverse' ? `reverse-${formMode.entry.id}` : 'payment'}
      bill={bill}
      orgId={orgId}
      reversePayment={original ? { id: original.id, amount: original.amount } : null}
      onCancel={onCloseForm}
      onSaved={onSaved}
    />
  ) : null
  const formTitle = original ? t('pendingBills.form.reverseTitle') : t('pendingBills.form.title')

  return (
    <div className="pending-bill-record">
      <div className="pending-bill-record__body">
        <section className="pending-bill-record__identity" aria-label={t('pendingBills.record.summary')}>
          <div className="pending-bill-record__status-line">
            {statePill(bill, t)}
            <span className="pending-bill-record__bill-no">{bill.billNo}</span>
          </div>
          <dl className="pending-bill-record__facts">
            <div><dt>{t('pendingBills.col.date')}</dt><dd>{formatDayMonthYear(bill.billDate, locale)}</dd></div>
            <div><dt>{t('pendingBills.col.branch')}</dt><dd>{branch(bill, t)}</dd></div>
            <div><dt>{t('pendingBills.col.owes')}</dt><dd>{bill.counterpartyNote ?? t('pendingBills.owes.none')}</dd></div>
            <div><dt>{t('pendingBills.col.amount')}</dt><dd>{formatIDR(bill.amount)}</dd></div>
            <div><dt>{t('pendingBills.record.recorded')}</dt><dd>{formatIDR(bill.recordedPaid)}</dd></div>
            <div className="pending-bill-record__balance"><dt>{t('pendingBills.col.balance')}</dt><dd>{formatIDR(bill.balance)}</dd></div>
          </dl>
          {bill.state === 'void' && <p className="pending-bill-record__mark">{t('pendingBills.record.voidMark')}</p>}
          {bill.state === 'missing' && <p className="pending-bill-record__mark">{t('pendingBills.record.missingMark')}</p>}
          {canPay && <Button variant="primary" className="pending-bill-record__record" onClick={onStartPayment}>{t('pendingBills.record.recordPayment')}</Button>}
        </section>

        {isDesktop && formMode && <div className="pending-bill-record__form-inline" aria-label={formTitle}>{form}</div>}

        <section className="pending-bill-record__history-section" aria-labelledby="pending-bill-history-title">
          <h2 id="pending-bill-history-title">{t('pendingBills.history.title')}</h2>
          <PaymentHistory entries={entries} status={historyStatus} onRetry={onRetryHistory} onReverse={onReverse} />
        </section>
      </div>
      {!isDesktop && (
        <ModalShell
          open={formMode !== null}
          onClose={onCloseForm}
          ariaLabel={formTitle}
          surface="sheet"
          phoneMode="centered"
          closeOnBackdrop
          className="pending-bill-payment-sheet"
        >
          {form}
        </ModalShell>
      )}
    </div>
  )
}

export function PendingBillsPage() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : ''
  const isDesktop = useIsDesktop()
  const isWide = useIsWideOverlayWidth()
  useDocumentTitle(t('pendingBills.documentTitle'))

  const { status, data, tooMany, reload } = useReportingRead(loadPendingBills)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [historyState, setHistoryState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; entries: PendingBillPaymentHistoryEntry[] }>({ status: 'idle', entries: [] })
  const [historyRequest, setHistoryRequest] = useState(0)
  const [panelFormMode, setPanelFormMode] = useState<PaymentFormMode | null>(null)
  const [phoneFormMode, setPhoneFormMode] = useState<PaymentFormMode | null>(null)
  const [optimisticPayments, setOptimisticPayments] = useState<PendingBillPaymentAmountRow[]>([])
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const basePayments = data?.payments ?? []
  const baseIds = new Set(basePayments.map((payment) => payment.id))
  const payments = [...basePayments, ...optimisticPayments.filter((payment) => !baseIds.has(payment.id))]
  const bills = data ? toPendingBillViews(data.bills, wibToday(), payments) : []
  const selectedBill = bills.find((bill) => bill.id === selectedId) ?? null
  const selectedBillId = selectedBill?.id
  const selectedBillEsbCode = selectedBill?.esbCode
  const selectedBillBranchCode = selectedBill?.branchCode
  const selectedBillNumber = selectedBill?.billNo

  useEffect(() => {
    if (!selectedBillId || !selectedBillEsbCode || !selectedBillBranchCode || !selectedBillNumber) {
      setHistoryState({ status: 'idle', entries: [] })
      return
    }
    let active = true
    setHistoryState({ status: 'loading', entries: [] })
    listPendingBillPaymentHistory({ esbCode: selectedBillEsbCode, branchCode: selectedBillBranchCode, billNo: selectedBillNumber }).then(
      (entries) => { if (active) setHistoryState({ status: 'ready', entries }) },
      () => { if (active) setHistoryState({ status: 'error', entries: [] }) },
    )
    return () => { active = false }
  }, [selectedBillId, selectedBillEsbCode, selectedBillBranchCode, selectedBillNumber, historyRequest])

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
  const stale = isPendingBillCopyStale(data.snapshot.snapshot_as_of, new Date()) && (
    <div className="pending-bills-stale">
      <p className="pending-bills-stale__text">{t('pendingBills.stale', { time: copiedAt })}</p>
      {refresh}
    </div>
  )
  if (bills.length === 0) {
    return frame(
      <div className="pending-bills-body">
        {kept}
        {stale}
        <EmptyState variant="quiet" title={t('pendingBills.empty.title')}>{!stale && refresh}</EmptyState>
      </div>,
      'empty',
      asOf,
    )
  }

  const summary = summarizePendingBills(bills)
  const selectedHistory = selectedBill && historyState.status !== 'idle' ? historyState : { status: 'loading' as const, entries: [] }
  const onFormSaved = (bill: PendingBillView, saved: PendingBillPaymentSaved) => {
    setOptimisticPayments((current) => [...current, {
      id: saved.paymentId,
      esb_code: bill.esbCode,
      branch_code: bill.branchCode,
      bill_no: bill.billNo,
      amount: saved.amount,
    }])
    setConfirmation(saved.reverseOf
      ? t('pendingBills.confirmation.reversed', { count: '1', total: formatIDR(Math.abs(saved.amount)) })
      : t('pendingBills.confirmation.recorded', { count: '1', total: formatIDR(saved.amount) }))
    setPanelFormMode(null)
    setPhoneFormMode(null)
    setHistoryRequest((current) => current + 1)
    reload()
  }
  const openForm = (mode: PaymentFormMode) => {
    if (isDesktop) setPanelFormMode(mode)
    else setPhoneFormMode(mode)
  }
  const recordPanel = selectedBill ? (
    <RecordPanelHost
      label={t('pendingBills.record.panelLabel', { billNo: selectedBill.billNo })}
      title={t('pendingBills.record.panelTitle', { billNo: selectedBill.billNo })}
      closeLabel={t('record.close')}
      rootClassName="pending-bill-record-panel"
      focusKey={selectedBill.id}
      onClose={() => { setSelectedId(null); setPanelFormMode(null); setPhoneFormMode(null) }}
    >
      <RecordPanel
        bill={selectedBill}
        entries={selectedHistory.entries}
        historyStatus={selectedHistory.status === 'idle' ? 'loading' : selectedHistory.status}
        onRetryHistory={() => setHistoryRequest((current) => current + 1)}
        onStartPayment={() => openForm({ kind: 'payment' })}
        onReverse={(entry) => openForm({ kind: 'reverse', entry })}
        formMode={isDesktop ? panelFormMode : phoneFormMode}
        orgId={orgId}
        isDesktop={isDesktop}
        onCloseForm={() => { setPanelFormMode(null); setPhoneFormMode(null) }}
        onSaved={(saved) => onFormSaved(selectedBill, saved)}
      />
    </RecordPanelHost>
  ) : null

  return frame(
    <div className="pending-bills-body">
      {kept}
      {confirmation && <p className="pending-bills-confirmation" role="status" aria-live="polite">{confirmation}</p>}
      {stale}
      <div className="pending-bills-summary" aria-live="polite">
        {t('pendingBills.summary', { count: String(summary.openCount), total: formatIDR(summary.openBalance) })}
      </div>
      <div className={selectedBill && isWide ? 'record-split' : undefined}>
        <div className="pending-bills-list-column">
          <div className="pending-bills-scroll" role="region" aria-label={t('pendingBills.table.scrollLabel')} tabIndex={0}>
            <DataTable
              columns={columns(t, locale, (bill) => { setSelectedId(bill.id); setPanelFormMode(null); setPhoneFormMode(null) })}
              rows={bills}
              isDesktop={isDesktop}
              caption={t('pendingBills.table.caption')}
              renderCard={(bill) => <BillCard bill={bill} onOpen={(selected) => { setSelectedId(selected.id); setPanelFormMode(null); setPhoneFormMode(null) }} />}
            />
          </div>
        </div>
        {recordPanel}
      </div>
    </div>,
    undefined,
    asOf,
  )
}
