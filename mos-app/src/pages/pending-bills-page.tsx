// PendingBillsPage — Finance's list and MOS record of deferred-payment bills (#1465).
// The nightly reporting copy stays read-only; payments and reversals use the append-only MOS RPC.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/use-auth'
import { MoneyFreshness } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { MoneyTableShell } from '@/components/money/money-table-shell'
import { PendingBillPaymentForm, type PendingBillPaymentSaved } from '@/components/money/pending-bill-payment-form'
import { createPendingBillRecordAdapter, pendingBillAgeLabel, PENDING_BILL_STATE_LABEL } from '@/components/money/pending-bill-record-adapter'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Select } from '@/components/ui/select'
import { CollectionToolbarSearchField } from '@/components/record-collection/collection-toolbar'
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
import { filterPendingBills, isPendingBillCopyStale, isPendingBillSelectable, summarizePendingBillSelection, summarizePendingBills, toPendingBillViews, type PendingBillAgeBucket, type PendingBillView, type PendingBillViewMode } from '@/lib/pending-bills'
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
type PaymentFormMode = { kind: 'payment' } | { kind: 'multi' } | { kind: 'reverse'; entry: PendingBillPaymentHistoryEntry }

function statePill(bill: PendingBillView, t: T): ReactNode {
  const tone = bill.state === 'settled' ? 'success'
    : bill.state === 'partial' || bill.state === 'overpaid' || bill.state === 'void' || bill.state === 'missing' ? 'warning'
      : 'neutral'
  return (
    <Pill tone={tone} className="pending-bills__state-pill">
      <span className="pending-bills__state-label">{t(PENDING_BILL_STATE_LABEL[bill.state])}</span>
    </Pill>
  )
}

function branch(bill: PendingBillView, t: T): ReactNode {
  if (bill.branchKnown && bill.branchName) {
    return <span className="pending-bills__branch" title={bill.branchName}>{bill.branchName}</span>
  }
  const code = <span className="pending-bills__code">{bill.branchCode}</span>
  if (bill.branchKnown) return code
  return <>{code} <span className="pending-bills__muted">{t('pendingBills.branch.unknown')}</span></>
}

type PendingBillColumn = {
  key: 'select' | 'date' | 'age' | 'branch' | 'owes' | 'state' | 'bill' | 'amount' | 'balance'
  header: string
  headerContent?: ReactNode
  render: (bill: PendingBillView) => ReactNode
}

function columns(
  t: T,
  locale: ReturnType<typeof useI18n>['locale'],
  onOpen: (bill: PendingBillView) => void,
  selectedIds: ReadonlySet<string>,
  selectableIds: ReadonlySet<string>,
  allSelected: boolean,
  someSelected: boolean,
  selectionLocked: boolean,
  onToggle: (billId: string, selected: boolean) => void,
  onToggleAll: (selected: boolean) => void,
): PendingBillColumn[] {
  return [
    {
      key: 'select',
      header: t('pendingBills.select'),
      headerContent: (
        <>
          <span className="sr-only">{t('pendingBills.select')}</span>
          <label className="pending-bills__checkbox-target">
            <Checkbox
              aria-label={t('pendingBills.selectAll')}
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              disabled={selectableIds.size === 0 || selectionLocked}
              onChange={onToggleAll}
            />
          </label>
        </>
      ),
      render: (bill) => (
        <label className="pending-bills__checkbox-target">
          <Checkbox
            aria-label={t('pendingBills.selectBill', { billNo: bill.billNo })}
            checked={selectedIds.has(bill.id)}
            disabled={!selectableIds.has(bill.id) || selectionLocked}
            onChange={(selected) => onToggle(bill.id, selected)}
          />
        </label>
      ),
    },
    { key: 'date', header: t('pendingBills.col.date'), render: (bill) => <span className="tabular pending-bills__nowrap">{formatDayMonthYear(bill.billDate, locale)}</span> },
    { key: 'age', header: t('pendingBills.col.age'), render: (bill) => bill.ageDays > 90
      ? <Pill tone="warning" className="pending-bills__age-old">{pendingBillAgeLabel(bill.ageDays, t)}</Pill>
      : <span className="tabular">{pendingBillAgeLabel(bill.ageDays, t)}</span> },
    { key: 'branch', header: t('pendingBills.col.branch'), render: (bill) => branch(bill, t) },
    { key: 'owes', header: t('pendingBills.col.owes'), render: (bill) => <span className="pending-bills__owes" title={bill.counterpartyNote ?? undefined}>{bill.counterpartyNote ?? <span className="pending-bills__muted">{t('pendingBills.owes.none')}</span>}</span> },
    { key: 'state', header: t('pendingBills.col.state'), render: (bill) => statePill(bill, t) },
    { key: 'bill', header: t('pendingBills.col.billNo'), render: (bill) => (
      <button type="button" className="pending-bills__record-trigger" data-pending-bill-trigger={bill.id} onClick={() => onOpen(bill)} aria-label={t('pendingBills.openBill', { billNo: bill.billNo })}>
        <span className="pending-bills__code">{bill.billNo}</span>
        {bill.ageDays > 90 && <Pill tone="warning" className="pending-bills__age-old pending-bills__tablet-age-cue">{t('pendingBills.ageFilter.90+')}</Pill>}
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
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([])
  const [activeView, setActiveView] = useState<PendingBillViewMode>('open')
  const [branchFilter, setBranchFilter] = useState('')
  const [ageBucket, setAgeBucket] = useState<PendingBillAgeBucket>('all')
  const [search, setSearch] = useState('')
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const [historyState, setHistoryState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; entries: PendingBillPaymentHistoryEntry[] }>({ status: 'idle', entries: [] })
  const [historyRequest, setHistoryRequest] = useState(0)
  const [formMode, setFormMode] = useState<PaymentFormMode | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  // Closing the form brings its buttons back; focus returns to the panel's action (or the history's).
  const restoreFocusRef = useRef(false)
  const restoreMultiBillFocusRef = useRef<string | null>(null)
  const restoreActionFocus = () => {
    restoreFocusRef.current = true
    window.setTimeout(() => { restoreFocusRef.current = false }, 2000)
  }
  useEffect(() => {
    const billId = restoreMultiBillFocusRef.current
    if (billId) {
      const target = [...document.querySelectorAll<HTMLElement>('[data-pending-bill-trigger]')]
        .find((element) => element.dataset.pendingBillTrigger === billId)
      if (target) {
        restoreMultiBillFocusRef.current = null
        target.focus()
        return
      }
    }
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

  const today = wibToday()
  const basePayments = data?.payments
  const payments = useMemo(() => {
    const persistedPayments = basePayments ?? []
    const baseIds = new Set(persistedPayments.map((payment) => payment.id))
    return [...persistedPayments, ...optimisticPayments.filter((payment) => !baseIds.has(payment.id))]
  }, [basePayments, optimisticPayments])
  const bills = useMemo(() => data ? toPendingBillViews(data.bills, today, payments) : [], [data, payments, today])
  const visibleBills = useMemo(() => filterPendingBills(bills, {
    view: activeView,
    branchCode: branchFilter,
    ageBucket,
    search,
  }), [bills, activeView, branchFilter, ageBucket, search])
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0
    if (!isDesktop) {
      const pageFrame = listScrollRef.current?.closest<HTMLElement>('.page-frame--v3')
      if (pageFrame) pageFrame.scrollTop = 0
    }
  }, [activeView, branchFilter, ageBucket, search, isDesktop])
  // Keep open exposure and period-paid metrics stable across tabs; the other filters still scope them.
  const summaryBills = useMemo(() => filterPendingBills(bills, {
    view: 'all',
    branchCode: branchFilter,
    ageBucket,
    search,
  }), [bills, branchFilter, ageBucket, search])
  useEffect(() => {
    if (!data || formMode?.kind === 'multi') return
    const eligibleIds = new Set(visibleBills.filter(isPendingBillSelectable).map((bill) => bill.id))
    setSelectedBillIds((current) => {
      const next = current.filter((id) => eligibleIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [data, visibleBills, formMode?.kind])
  const selectionBills = formMode?.kind === 'multi' ? bills : visibleBills
  const selectedSummary = summarizePendingBillSelection(selectionBills, selectedBillIds)
  const selectedSet = new Set(selectedSummary.bills.map((bill) => bill.id))
  const selectableSet = new Set(visibleBills.filter(isPendingBillSelectable).map((bill) => bill.id))
  const allSelectableSelected = selectableSet.size > 0 && [...selectableSet].every((id) => selectedSet.has(id))
  const someSelectableSelected = [...selectableSet].some((id) => selectedSet.has(id))
  const selectionLocked = formMode?.kind === 'multi'
  const toggleBillSelection = (billId: string, selected: boolean) => {
    setSelectedBillIds((current) => selected
      ? current.includes(billId) ? current : [...current, billId]
      : current.filter((id) => id !== billId))
  }
  const toggleAllSelection = (selected: boolean) => {
    setSelectedBillIds(selected ? visibleBills.filter(isPendingBillSelectable).map((bill) => bill.id) : [])
  }
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

  const summary = summarizePendingBills(summaryBills, payments, today)
  const branchOptions = [...new Map(bills.map((bill) => [bill.branchCode, {
    code: bill.branchCode,
    label: bill.branchName ?? bill.branchCode,
  }])).values()].sort((a, b) => a.label.localeCompare(b.label, locale))
  const ageFilters: { bucket: PendingBillAgeBucket; label: string }[] = [
    { bucket: 'all', label: t('pendingBills.ageFilter.all') },
    { bucket: '0-30', label: t('pendingBills.ageFilter.0-30') },
    { bucket: '31-90', label: t('pendingBills.ageFilter.31-90') },
    { bucket: '90+', label: t('pendingBills.ageFilter.90+') },
  ]
  const selectedHistory = selectedBill && historyState.status !== 'idle' ? historyState : { status: 'loading' as const, entries: [] }
  const historyStatus = selectedHistory.status === 'idle' ? 'loading' : selectedHistory.status
  const changeView = (view: string) => {
    if (view === activeView) return
    guardedTransition(() => {
      formDirtyRef.current = false
      setFormMode(null)
      updateFormBusy(false)
      setSelectedBillIds([])
      setActiveView(view as PendingBillViewMode)
    })
  }
  const onFormSaved = (bill: PendingBillView, saved: PendingBillPaymentSaved) => {
    const paymentRows = saved.payments ?? [{
      billId: bill.id,
      paymentId: saved.paymentId,
      esbCode: bill.esbCode,
      branchCode: bill.branchCode,
      billNo: bill.billNo,
      amount: saved.amount,
      replayed: saved.replayed,
    }]
    setOptimisticPayments((current) => [...current, ...paymentRows.map((payment) => ({
      id: payment.paymentId,
      esb_code: payment.esbCode,
      branch_code: payment.branchCode,
      bill_no: payment.billNo,
      amount: payment.amount,
      cash_in_date: saved.cashInDate,
    }))])
    const count = String(paymentRows.length)
    const total = formatIDRExact(Math.abs(saved.amount))
    showToast(saved.reverseOf
      ? t('pendingBills.confirmation.reversed', { count, total })
      : saved.payments
        ? t('pendingBills.confirmation.recordedMany', { count, total })
        : t('pendingBills.confirmation.recorded', { count, total }))
    formDirtyRef.current = false
    setFormMode(null)
    updateFormBusy(false)
    reload()
    const resultingBalance = Math.round((bill.balance - saved.amount) * 100) / 100
    const movesToPaid = saved.payments !== undefined || (!saved.reverseOf && resultingBalance <= 0)
    const movesToOpen = Boolean(saved.reverseOf) && bill.state !== 'void' && bill.state !== 'missing' && resultingBalance > 0
    if (movesToPaid || movesToOpen) {
      setSelectedBillIds([])
      setActiveView(movesToPaid ? 'paid' : 'open')
    }
    if (saved.payments) {
      setSelectedId(null)
      restoreMultiBillFocusRef.current = bill.id
    } else {
      setHistoryRequest((current) => current + 1)
      restoreActionFocus()
    }
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
  const startMultiPayment = () => {
    const firstBill = selectedSummary.bills[0]
    if (!firstBill) return
    guardedTransition(() => {
      formDirtyRef.current = false
      setSelectedId(firstBill.id)
      setFormMode({ kind: 'multi' })
    })
  }
  const paymentForm = selectedBill && formMode ? (
    <PendingBillPaymentForm
      key={`${selectedBill.id}-${formMode.kind === 'reverse' ? `reverse-${formMode.entry.id}` : formMode.kind === 'multi' ? selectedBillIds.join('|') : 'payment'}`}
      bill={selectedBill}
      bills={formMode.kind === 'multi' ? selectedSummary.bills : undefined}
      orgId={orgId}
      reversePayment={formMode.kind === 'reverse' ? { id: formMode.entry.id, amount: formMode.entry.amount } : null}
      onCancel={cancelPaymentForm}
      onSaved={(saved) => onFormSaved(selectedBill, saved)}
      onDirtyChange={(dirty) => { formDirtyRef.current = dirty }}
      onBusyChange={updateFormBusy}
      onBalancesChanged={reload}
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
  const billColumns = columns(
    t,
    locale,
    selectBill,
    selectedSet,
    selectableSet,
    allSelectableSelected,
    someSelectableSelected,
    selectionLocked,
    toggleBillSelection,
    toggleAllSelection,
  )
  const isTabletViewport = isDesktop && !isWide
  const selectionBar = selectedSummary.count > 0 ? (
    <div className="pending-bills-selection-bar" data-overlay-edge={isTabletViewport ? undefined : 'bottom'} role="region" aria-label={t('pendingBills.selection.summary', {
      count: String(selectedSummary.count),
      total: formatIDRExact(selectedSummary.total),
    })}>
      <p aria-live="polite">{t('pendingBills.selection.summary', {
        count: String(selectedSummary.count),
        total: formatIDRExact(selectedSummary.total),
      })}</p>
      <div className="pending-bills-selection-bar__actions">
        <Button type="button" variant="primary" onClick={startMultiPayment} disabled={selectionLocked}>
          {t('pendingBills.record.recordPayment')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setSelectedBillIds([])} disabled={selectionLocked}>
          {t('pendingBills.selection.clear')}
        </Button>
      </div>
    </div>
  ) : null
  const recordPanelTitle = formMode?.kind === 'multi' && !isDesktop
    ? t(selectedSummary.count === 1 ? 'pendingBills.record.multiPanelTitle.one' : 'pendingBills.record.multiPanelTitle.other', {
      count: String(selectedSummary.count),
    })
    : t('pendingBills.record.panelLabel', { billNo: selectedBill?.billNo ?? '' })
  const recordPanel = selectedBill && adapter ? (
    <>
      <RecordPanelHost
        label={recordPanelTitle}
        title={isDesktop ? t('nav.money.pendingBills') : recordPanelTitle}
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
      <div className="pending-bills-list-toolbar">
        <div className="pending-bills-summary" aria-live="polite">
          {t(summary.openCount === 1 ? 'pendingBills.summary.one' : 'pendingBills.summary.other', {
            count: String(summary.openCount),
            total: formatIDRExact(summary.openBalance).replace(' ', '\u00a0'),
            age: summary.oldestAgeDays === null ? t('pendingBills.summary.noAge') : pendingBillAgeLabel(summary.oldestAgeDays, t),
            paid: formatIDRExact(summary.paidInPeriod).replace(' ', '\u00a0'),
          })}
        </div>
        <label className="pending-bills-mobile-select-all">
          <Checkbox
            aria-label={t('pendingBills.selectAll')}
            checked={allSelectableSelected}
            indeterminate={someSelectableSelected && !allSelectableSelected}
            disabled={selectableSet.size === 0 || selectionLocked}
            onChange={toggleAllSelection}
          />
          <span>{t('pendingBills.selectAll')}</span>
        </label>
      </div>
      <ViewTabs
        ariaLabel={t('pendingBills.view.label')}
        tabs={[
          { id: 'open', label: t('pendingBills.view.open') },
          { id: 'paid', label: t('pendingBills.view.paid') },
          { id: 'all', label: t('pendingBills.view.all') },
        ]}
        active={activeView}
        onChange={changeView}
      />
      <div className="pending-bills-filter-bar">
        <Select
          className="pending-bills-branch-filter"
          label={t('pendingBills.branchFilter.label')}
          aria-label={t('pendingBills.branchFilter.label')}
          value={branchFilter}
          onChange={(event) => setBranchFilter(event.target.value)}
          fullWidth
        >
          <option value="">{t('pendingBills.branchFilter.all')}</option>
          {branchOptions.map((branchOption) => (
            <option key={branchOption.code} value={branchOption.code}>{branchOption.label}</option>
          ))}
        </Select>
        <div className="pending-bills-age-filters" role="group" aria-label={t('pendingBills.ageFilter.label')}>
          {ageFilters.map(({ bucket, label }) => (
            <button
              key={bucket}
              type="button"
              aria-pressed={ageBucket === bucket}
              onClick={() => setAgeBucket(bucket)}
            >
              {label}
            </button>
          ))}
        </div>
        <CollectionToolbarSearchField search={{
          label: t('pendingBills.search.label'),
          placeholder: t('pendingBills.search.help'),
          value: search,
          onChange: setSearch,
        }} />
      </div>
      <div className={`pending-bills-results${selectedBill && isWide ? ' record-split' : ''}`}>
        <div className="pending-bills-list-column">
          {isTabletViewport && selectionBar}
          <MoneyTableShell className="pending-bills-table" scrollRef={listScrollRef}>
            <caption className="sr-only">{t('pendingBills.table.caption')}</caption>
            <thead>
              <tr>
                {billColumns.map((column) => (
                  <th key={column.key} scope="col" className={`money-table__head money-table__cell--${column.key}`}>
                    {column.headerContent ?? column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="money-table__group">
              {visibleBills.map((bill) => (
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
          {visibleBills.length === 0 && <p className="pending-bills-filter-empty" role="status">{t('pendingBills.empty.filtered')}</p>}
          {!isTabletViewport && selectionBar}
        </div>
        {recordPanel}
      </div>
    </div>,
    undefined,
    freshness,
    staleAction,
  )
}
