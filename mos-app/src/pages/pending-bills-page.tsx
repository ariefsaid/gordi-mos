// PendingBillsPage — Finance's list and MOS record of deferred-payment bills (#1465).
// The nightly reporting copy stays read-only; payments and reversals use the append-only MOS RPC.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/use-auth'
import { MoneyFreshness } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { MoneyTableShell } from '@/components/money/money-table-shell'
import { PendingBillPaymentForm, type PendingBillPaymentSaved } from '@/components/money/pending-bill-payment-form'
import { createPendingBillRecordAdapter, pendingBillAgeLabel, PENDING_BILL_STATE_LABEL } from '@/components/money/pending-bill-record-adapter'
import { Button } from '@/components/ui/button'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { RecordViewer } from '@/components/records/record-viewer'
import { Pill } from '@/components/ui/pill'
import { useReportingRead } from '@/hooks/useReportingRead'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
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
import { formatIDRExact } from '@/lib/format/money'
import { isPendingBillCopyStale, summarizePendingBills, toPendingBillViews, type PendingBillView } from '@/lib/pending-bills'
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

function statePill(bill: PendingBillView, t: T): ReactNode {
  const tone = bill.state === 'settled' ? 'success'
    : bill.state === 'partial' || bill.state === 'overpaid' || bill.state === 'void' || bill.state === 'missing' ? 'warning'
      : 'neutral'
  return <Pill tone={tone}>{t(PENDING_BILL_STATE_LABEL[bill.state])}</Pill>
}

function branch(bill: PendingBillView, t: T): ReactNode {
  if (bill.branchKnown && bill.branchName) return bill.branchName
  const code = <span className="pending-bills__code">{bill.branchCode}</span>
  if (bill.branchKnown) return code
  return <>{code} <span className="pending-bills__muted">{t('pendingBills.branch.unknown')}</span></>
}

type PendingBillColumn = {
  key: 'date' | 'age' | 'branch' | 'owes' | 'state' | 'bill' | 'amount' | 'balance'
  header: string
  render: (bill: PendingBillView) => ReactNode
}

function columns(
  t: T,
  locale: ReturnType<typeof useI18n>['locale'],
  onOpen: (bill: PendingBillView) => void,
): PendingBillColumn[] {
  return [
    { key: 'date', header: t('pendingBills.col.date'), render: (bill) => <span className="tabular pending-bills__nowrap">{formatDayMonthYear(bill.billDate, locale)}</span> },
    { key: 'age', header: t('pendingBills.col.age'), render: (bill) => <span className="tabular">{pendingBillAgeLabel(bill.ageDays, t)}</span> },
    { key: 'branch', header: t('pendingBills.col.branch'), render: (bill) => branch(bill, t) },
    { key: 'owes', header: t('pendingBills.col.owes'), render: (bill) => <span className="pending-bills__owes">{bill.counterpartyNote ?? <span className="pending-bills__muted">{t('pendingBills.owes.none')}</span>}</span> },
    { key: 'state', header: t('pendingBills.col.state'), render: (bill) => statePill(bill, t) },
    { key: 'bill', header: t('pendingBills.col.billNo'), render: (bill) => (
      <button type="button" className="pending-bills__record-trigger" onClick={() => onOpen(bill)} aria-label={t('pendingBills.openBill', { billNo: bill.billNo })}>
        <span className="pending-bills__code">{bill.billNo}</span>
      </button>
    ) },
    { key: 'amount', header: t('pendingBills.col.amount'), render: (bill) => <span className="tabular">{formatIDRExact(bill.amount)}</span> },
    { key: 'balance', header: t('pendingBills.col.balance'), render: (bill) => <span className="tabular">{formatIDRExact(bill.balance)}</span> },
  ]
}

export function PendingBillsPage() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : ''
  const isWide = useIsWideOverlayWidth()
  const isDesktop = useIsDesktop()
  useDocumentTitle(t('pendingBills.documentTitle'))

  const { status, data, tooMany, reload } = useReportingRead(loadPendingBills)
  const { toast, showToast, clearToast } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [historyState, setHistoryState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; entries: PendingBillPaymentHistoryEntry[] }>({ status: 'idle', entries: [] })
  const [historyRequest, setHistoryRequest] = useState(0)
  const [formMode, setFormMode] = useState<PaymentFormMode | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  // Closing the form brings its buttons back; focus returns to the panel's action (or the history's).
  const restoreFocusRef = useRef(false)
  const restoreActionFocus = () => {
    restoreFocusRef.current = true
    window.setTimeout(() => { restoreFocusRef.current = false }, 2000)
  }
  useEffect(() => {
    if (!restoreFocusRef.current || formMode) return
    const target = document.querySelector<HTMLElement>('[data-viewer-region="actions"] button')
      ?? document.querySelector<HTMLElement>('[data-content-slot="payment-history"] button')
    if (!target) return
    restoreFocusRef.current = false
    target.focus()
  })
  const [discardOpen, setDiscardOpen] = useState(false)
  const [optimisticPayments, setOptimisticPayments] = useState<PendingBillPaymentAmountRow[]>([])
  const formDirtyRef = useRef(false)
  const formBusyRef = useRef(false)
  const pendingTransitionRef = useRef<(() => void) | null>(null)

  const updateFormBusy = useCallback((busy: boolean) => {
    formBusyRef.current = busy
    setFormBusy(busy)
  }, [])
  const guardedTransition = useCallback((proceed: () => void) => {
    if (formBusyRef.current) return
    if (formDirtyRef.current) {
      pendingTransitionRef.current = proceed
      setDiscardOpen(true)
      return
    }
    proceed()
  }, [])
  const cancelDiscard = useCallback(() => {
    pendingTransitionRef.current = null
    setDiscardOpen(false)
  }, [])
  const discardAndProceed = useCallback(async () => {
    formDirtyRef.current = false
    setDiscardOpen(false)
    const proceed = pendingTransitionRef.current
    pendingTransitionRef.current = null
    proceed?.()
  }, [])

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

  const frame = (children: ReactNode, state?: 'loading' | 'error' | 'empty', meta?: ReactNode, action?: ReactNode) => (
    <PageFamilyFrame family="workspace" title={t('nav.money.pendingBills')} meta={meta} state={state} action={action}>
      {children}
    </PageFamilyFrame>
  )
  const refresh = (
    <Button variant="outline" onClick={reload} disabled={status === 'loading'}>
      {t('pendingBills.refresh')}
    </Button>
  )

  if (!data && status === 'loading') return frame(<LoadingShell count={5} className="money-skeleton pending-bills-loading" />, 'loading')
  if (!data) {
    return frame(
      <MoneyLoadError
        tooMany={tooMany}
        message={t('pendingBills.error')}
        tooManyMessage={t('pendingBills.error.tooMany')}
        onRetry={reload}
      />,
      'error',
    )
  }

  const kept = status === 'error'
    ? <MoneyLoadError kept tooMany={tooMany} message={t('pendingBills.error.kept')} tooManyMessage={t('pendingBills.error.tooMany')} onRetry={reload} />
    : null
  if (!data.snapshot) {
    return frame(
      <div className="pending-bills-body">
        {kept}
        <EmptyState variant="awaiting" title={t('pendingBills.none.title')} copy={t('pendingBills.none.copy')}>
          {!tooMany && refresh}
        </EmptyState>
      </div>,
      'empty',
    )
  }

  const copiedAt = formatWibWeekdayTime(data.snapshot.snapshot_as_of, locale)
  const stale = isPendingBillCopyStale(data.snapshot.snapshot_as_of, new Date())
  const freshness = (
    <MoneyFreshness
      latestDate={wibToday(new Date(data.snapshot.snapshot_as_of))}
      syncedAt={data.snapshot.snapshot_as_of}
      freshMessage={t('pendingBills.asOf', { time: copiedAt })}
      staleMessage={t('pendingBills.stale', { time: copiedAt })}
    />
  )
  const staleAction = stale && !tooMany ? refresh : undefined
  if (bills.length === 0) {
    return frame(
      <div className="pending-bills-body">
        {kept}
        <EmptyState variant="quiet" title={t('pendingBills.empty.title')}>{!stale && !tooMany && refresh}</EmptyState>
      </div>,
      'empty',
      freshness,
      staleAction,
    )
  }

  const summary = summarizePendingBills(bills)
  const selectedHistory = selectedBill && historyState.status !== 'idle' ? historyState : { status: 'loading' as const, entries: [] }
  const historyStatus = selectedHistory.status === 'idle' ? 'loading' : selectedHistory.status
  const onFormSaved = (bill: PendingBillView, saved: PendingBillPaymentSaved) => {
    setOptimisticPayments((current) => [...current, {
      id: saved.paymentId,
      esb_code: bill.esbCode,
      branch_code: bill.branchCode,
      bill_no: bill.billNo,
      amount: saved.amount,
    }])
    const savedEntries = saved.paymentId ? [saved] : []
    const count = String(savedEntries.length)
    const total = formatIDRExact(savedEntries.reduce((sum, entry) => sum + Math.abs(entry.amount), 0))
    showToast(saved.reverseOf
      ? t('pendingBills.confirmation.reversed', { count, total })
      : t('pendingBills.confirmation.recorded', { count, total }))
    formDirtyRef.current = false
    setFormMode(null)
    updateFormBusy(false)
    setHistoryRequest((current) => current + 1)
    reload()
    restoreActionFocus()
  }
  const cancelPaymentForm = () => guardedTransition(() => {
    formDirtyRef.current = false
    setFormMode(null)
    restoreActionFocus()
  })
  const selectBill = (bill: PendingBillView) => {
    if (bill.id === selectedId) return
    guardedTransition(() => {
      formDirtyRef.current = false
      setFormMode(null)
      updateFormBusy(false)
      setSelectedId(bill.id)
    })
  }
  const paymentForm = selectedBill && formMode ? (
    <PendingBillPaymentForm
      key={`${selectedBill.id}-${formMode.kind === 'reverse' ? `reverse-${formMode.entry.id}` : 'payment'}`}
      bill={selectedBill}
      orgId={orgId}
      reversePayment={formMode.kind === 'reverse' ? { id: formMode.entry.id, amount: formMode.entry.amount } : null}
      onCancel={cancelPaymentForm}
      onSaved={(saved) => onFormSaved(selectedBill, saved)}
      onDirtyChange={(dirty) => { formDirtyRef.current = dirty }}
      onBusyChange={updateFormBusy}
    />
  ) : null
  const adapter = selectedBill ? createPendingBillRecordAdapter({
    bill: selectedBill,
    entries: selectedHistory.entries,
    historyStatus,
    locale,
    t,
    canPay: (selectedBill.state === 'open' || selectedBill.state === 'partial') && selectedBill.balance > 0,
    formMode: formMode !== null,
    form: paymentForm,
    onStartPayment: () => {
      formDirtyRef.current = false
      setFormMode({ kind: 'payment' })
    },
    onReverse: (entry) => {
      formDirtyRef.current = false
      setFormMode({ kind: 'reverse', entry })
    },
    onRetryHistory: () => setHistoryRequest((current) => current + 1),
  }) : null
  const billColumns = columns(t, locale, selectBill)
  const recordPanel = selectedBill && adapter ? (
    <>
      <RecordPanelHost
        label={t('pendingBills.record.panelLabel', { billNo: selectedBill.billNo })}
        title={isDesktop ? t('nav.money.pendingBills') : t('pendingBills.record.panelLabel', { billNo: selectedBill.billNo })}
        closeLabel={t('record.close')}
        rootClassName="drawer-split--sticky"
        focusKey={selectedBill.id}
        transitionPending={discardOpen || formBusy}
        onClose={() => guardedTransition(() => {
          formDirtyRef.current = false
          setFormMode(null)
          setSelectedId(null)
        })}
      >
        <RecordViewer adapter={adapter} mode="panel" />
      </RecordPanelHost>
      <ConfirmDialog
        open={discardOpen}
        title={t('catalog.record.unsaved.title')}
        body={t('catalog.record.unsaved.copy')}
        confirmLabel={t('catalog.record.unsaved.discard')}
        cancelLabel={t('leaveGuard.stay')}
        tone="destructive"
        onConfirm={discardAndProceed}
        onCancel={cancelDiscard}
      />
    </>
  ) : null

  return frame(
    <div className="pending-bills-body">
      <Toast toast={toast} onDismiss={clearToast} />
      {kept}
      <div className="pending-bills-summary" aria-live="polite">
        {t('pendingBills.summary', { count: String(summary.openCount), total: formatIDRExact(summary.openBalance) })}
      </div>
      <div className={selectedBill && isWide ? 'record-split' : undefined}>
        <div className="pending-bills-list-column">
          <MoneyTableShell className="pending-bills-table">
            <caption className="sr-only">{t('pendingBills.table.caption')}</caption>
            <thead>
              <tr>
                {billColumns.map((column) => (
                  <th key={column.key} scope="col" className={`money-table__head money-table__cell--${column.key}`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="money-table__group">
              {bills.map((bill) => (
                <tr key={bill.id} className="money-table__row">
                  {billColumns.map((column) => (
                    <td key={column.key} className={`money-table__cell money-table__cell--${column.key}`}>
                      <span className="money-table__cell-label">{column.header}</span>
                      <span className="money-table__cell-value">{column.render(bill)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </MoneyTableShell>
        </div>
        {recordPanel}
      </div>
    </div>,
    undefined,
    freshness,
    staleAction,
  )
}
