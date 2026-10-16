// PendingBillsPage — Finance's list and MOS record of deferred-payment bills (#1465).
// The nightly reporting copy stays read-only; payments and reversals use the append-only MOS RPC.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { MoneyFreshness } from '@/components/money/money-head'
import { MoneyLoadError } from '@/components/money/money-load-error'
import { MoneyTableShell } from '@/components/money/money-table-shell'
import { PendingBillPaymentForm, type PendingBillPaymentSaved } from '@/components/money/pending-bill-payment-form'
import { createPendingBillRecordAdapter, pendingBillAgeLabel } from '@/components/money/pending-bill-record-adapter'
import { PendingBillCard, PendingBillRow } from '@/components/money/pending-bill-queue-row'
import { MoneyFigure, MoneyFigures } from '@/components/money/money-figures'
import { MoneyFilterChips, type MoneyChip } from '@/components/money/money-filter-chips'
import { Pill } from '@/components/ui/pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Select } from '@/components/ui/select'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { SearchField } from '@/components/ui/search-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { ActionBar } from '@/components/ui/action-bar'
import { SortIndicator } from '@/components/ui/sort-indicator'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { RecordViewer } from '@/components/records/record-viewer'
import { useReportingRead } from '@/hooks/useReportingRead'
import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import {
  latestPendingBillSnapshot,
  listPendingBills,
} from '@/lib/db/reporting-pending-bills'
import {
  listPendingBillPaymentAmounts,
  listPendingBillFinanceLabels,
  setPendingBillFinanceLabel,
  listPendingBillPaymentHistory,
  type PendingBillPaymentAmountRow,
  type PendingBillPaymentHistoryEntry,
} from '@/lib/db/pending-bill-payments'
import { formatWeekdayDayMonth, formatWibWeekdayTime, WIB_OFFSET_MS } from '@/lib/format/date'
import type { Locale } from '@/i18n/messages'
import { formatIDRExact } from '@/lib/format/money'
import { billParamKey, billSortKey, DEFAULT_BILL_SORT, filterPendingBills, isPendingBillCopyStale, parseBillSort, sortPendingBills, type BillSort, isPendingBillSelectable, summarizePendingBillSelection, summarizePendingBills, toPendingBillViews, validatePendingBillFinanceLabel, type PendingBillAgeBucket, type PendingBillView, type PendingBillViewMode } from '@/lib/pending-bills'
import { wibToday } from '@/lib/home-attention'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { PhoneActionBarContext } from '@/shell/page-action-bar'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import './pending-bills-page.css'

/** The nightly copy runs at 02:00 WIB: the next one, as a label. */
function nextCopyAt(locale: Locale): string {
  const wibNow = new Date(Date.now() + WIB_OFFSET_MS)
  const day = wibNow.getUTCHours() < 2 ? wibToday() : wibToday(new Date(Date.now() + 24 * 3600_000))
  return `${formatWeekdayDayMonth(day, locale)}, 02:00 WIB`
}

const loadPendingBills = () =>
  Promise.all([listPendingBills(), latestPendingBillSnapshot(), listPendingBillPaymentAmounts(), listPendingBillFinanceLabels()])
    .then(([bills, snapshot, payments, financeLabels]) => ({ bills, snapshot, payments, financeLabels }))

type PaymentFormMode = { kind: 'payment' } | { kind: 'multi' } | { kind: 'reverse'; entry: PendingBillPaymentHistoryEntry }

export function PendingBillsPage() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : ''
  const isWide = useIsRecordSplit()
  const isDesktop = useIsDesktop()
  useDocumentTitle(t('pendingBills.documentTitle'))

  const { status, data, tooMany, reload } = useReportingRead(loadPendingBills)
  const { toast, showToast, clearToast } = useToast()
  // Tab, filters, search, sort and the open bill live in the URL, so a reload or Back keeps the view.
  const [params, setParams] = useSearchParams()
  const setParam = useCallback((key: string, value: string | null) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value); else next.delete(key)
      return next
    }, { replace: true })
  }, [setParams])
  const viewParam = params.get('view')
  const activeView: PendingBillViewMode = viewParam === 'paid' || viewParam === 'all' ? viewParam : 'open'
  const branchFilter = params.get('branch') ?? ''
  const ageParam = params.get('age')
  const ageBucket: PendingBillAgeBucket = ageParam === '0-30' || ageParam === '31-90' || ageParam === '90+' ? ageParam : 'all'
  const search = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sort = useMemo(() => parseBillSort(sortParam), [sortParam])
  const openBillParam = params.get('bill')
  const setActiveView = (view: PendingBillViewMode) => setParam('view', view === 'open' ? null : view)
  const setBranchFilter = (code: string) => setParam('branch', code || null)
  const setAgeBucket = (bucket: PendingBillAgeBucket) => setParam('age', bucket === 'all' ? null : bucket)
  const setSearch = (value: string) => setParam('q', value || null)
  const setSort = (next: BillSort) => setParam('sort', billSortKey(next) === DEFAULT_BILL_SORT ? null : billSortKey(next))
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const listScrollRef = useRef<HTMLElement | null>(null)
  const [historyState, setHistoryState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; entries: PendingBillPaymentHistoryEntry[] }>({ status: 'idle', entries: [] })
  const [historyRequest, setHistoryRequest] = useState(0)
  const [formMode, setFormMode] = useState<PaymentFormMode | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [recordDraftGeneration, setRecordDraftGeneration] = useState(0)
  // Closing the form brings its buttons back; focus returns to the panel's action (or the history's).
  const restoreFocusRef = useRef(false)
  const restoreMultiBillFocusRef = useRef<string | null>(null)
  const multiPaymentFormRef = useRef<HTMLFormElement | null>(null)
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
      const activeTab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (activeTab) {
        restoreMultiBillFocusRef.current = null
        activeTab.focus()
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
  const [financeLabelOverrides, setFinanceLabelOverrides] = useState<Map<string, string | null>>(() => new Map())
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
    setRecordDraftGeneration((generation) => generation + 1)
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
  const bills = useMemo(() => {
    if (!data) return []
    return toPendingBillViews(data.bills, today, payments, data.financeLabels).map((bill) =>
      financeLabelOverrides.has(bill.id)
        ? { ...bill, financeLabel: financeLabelOverrides.get(bill.id) ?? null }
        : bill,
    )
  }, [data, payments, today, financeLabelOverrides])
  const visibleBills = useMemo(() => sortPendingBills(filterPendingBills(bills, {
    view: activeView,
    branchCode: branchFilter,
    ageBucket,
    search,
  }), sort), [bills, activeView, branchFilter, ageBucket, search, sort])
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0
    if (!isDesktop) {
      const pageFrame = listScrollRef.current?.closest<HTMLElement>('.page-frame--v3')
      if (pageFrame) pageFrame.scrollTop = 0
    }
  }, [activeView, branchFilter, ageBucket, search, sort, isDesktop])
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
  const selectedBill = bills.find((bill) => billParamKey(bill) === openBillParam) ?? null
  const selectedId = selectedBill?.id ?? null
  const setSelectedBill = (bill: PendingBillView | null) => setParam('bill', bill ? billParamKey(bill) : null)
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
    <PageFamilyFrame family="workspace" title={t('nav.money.pendingBills')} freshness={meta} state={state} action={action}>
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
        <section className="pending-bills-awaiting" role="status" aria-labelledby="pending-bills-awaiting-title">
          <h2 id="pending-bills-awaiting-title">{t('pendingBills.none.title')}</h2>
          <p>{t('pendingBills.none.copy')}</p>
          <dl className="pending-bills-awaiting__facts">
            <div><dt>{t('pendingBills.none.last')}</dt><dd>{t('pendingBills.none.lastValue')}</dd></div>
            <div><dt>{t('pendingBills.none.attempt')}</dt><dd>{t('pendingBills.none.attemptValue')}</dd></div>
            <div><dt>{t('pendingBills.none.next')}</dt><dd>{nextCopyAt(locale)}</dd></div>
          </dl>
          <p>{t('pendingBills.none.unavailable')}</p>
          {!tooMany && refresh}
        </section>
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
  const activeFilterCount = Number(Boolean(branchFilter)) + Number(ageBucket !== 'all')
  const branchFilterControl = (
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
  )
  const ageFilterControl = (
    <SegmentedControl
      className="pending-bills-age-filters"
      label={t('pendingBills.ageFilter.label')}
      options={ageFilters.map(({ bucket, label }) => ({ value: bucket, label }))}
      value={ageBucket}
      onChange={setAgeBucket}
    />
  )
  // Four buckets do not fit a phone-width segmented control (the system keeps those to 2-3 modes): the phone panel uses a select.
  const ageFilterSelect = (
    <Select
      className="pending-bills-branch-filter"
      label={t('pendingBills.ageFilter.label')}
      value={ageBucket}
      onChange={(event) => setAgeBucket(event.target.value as PendingBillAgeBucket)}
      fullWidth
    >
      {ageFilters.map(({ bucket, label }) => <option key={bucket} value={bucket}>{label}</option>)}
    </Select>
  )
  const searchControl = (
    <SearchField label={t('pendingBills.search.label')} placeholder={t('pendingBills.search.help')} value={search} onChange={setSearch} />
  )
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
    const settlesBill = saved.payments !== undefined || (!saved.reverseOf && resultingBalance <= 0)
    const reopensBill = Boolean(saved.reverseOf) && bill.state !== 'void' && bill.state !== 'missing' && resultingBalance > 0
    if (settlesBill || reopensBill) setSelectedBillIds([])
    if (saved.payments) {
      setSelectedBill(null)
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
      setSelectedBill(bill)
    })
  }
  const startMultiPayment = () => {
    const firstBill = selectedSummary.bills[0]
    if (!firstBill) return
    guardedTransition(() => {
      formDirtyRef.current = false
      setSelectedBill(firstBill)
      setFormMode({ kind: 'multi' })
    })
  }
  const commitFinanceLabel = async (key: string, value: string | number | boolean | null) => {
    if (key !== 'financeLabel' || typeof value !== 'string' || !selectedBill) {
      throw new Error('Unsupported pending-bill field.')
    }
    const financeLabel = value.trim() || null
    if (financeLabel !== null && !validatePendingBillFinanceLabel(financeLabel)) {
      throw new Error('Finance label must be 60 characters or fewer.')
    }
    updateFormBusy(true)
    try {
      await setPendingBillFinanceLabel({
        esbCode: selectedBill.esbCode,
        branchCode: selectedBill.branchCode,
        billNo: selectedBill.billNo,
        financeLabel,
      })
      setFinanceLabelOverrides((current) => new Map(current).set(selectedBill.id, financeLabel))
      showToast(t(financeLabel ? 'pendingBills.label.saved' : 'pendingBills.label.cleared'))
    } finally {
      updateFormBusy(false)
    }
  }
  const paymentForm = selectedBill && formMode ? (
    <PendingBillPaymentForm
      key={`${selectedBill.id}-${formMode.kind === 'reverse' ? `reverse-${formMode.entry.id}` : formMode.kind === 'multi' ? selectedBillIds.join('|') : 'payment'}`}
      bill={selectedBill}
      bills={formMode.kind === 'multi' ? selectedSummary.bills : undefined}
      orgId={orgId}
      reversePayment={formMode.kind === 'reverse' ? { id: formMode.entry.id, amount: formMode.entry.amount } : null}
      formRef={formMode.kind === 'multi' ? multiPaymentFormRef : undefined}
      onCancel={cancelPaymentForm}
      onSaved={(saved) => onFormSaved(selectedBill, saved)}
      onDirtyChange={(dirty) => { formDirtyRef.current = dirty }}
      onBusyChange={updateFormBusy}
      onBalancesChanged={reload}
    />
  ) : null
  const adapterCanPay = Boolean(selectedBill) && (selectedBill!.state === 'open' || selectedBill!.state === 'partial') && selectedBill!.balance > 0
  const startSinglePayment = () => {
    formDirtyRef.current = false
    setFormMode({ kind: 'payment' })
  }
  const adapter = selectedBill ? createPendingBillRecordAdapter({
    bill: selectedBill,
    entries: selectedHistory.entries,
    historyStatus,
    locale,
    t,
    formMode: formMode !== null,
    form: paymentForm,
    onStartPayment: startSinglePayment,
    onReverse: (entry) => {
      formDirtyRef.current = false
      setFormMode({ kind: 'reverse', entry })
    },
    onRetryHistory: () => setHistoryRequest((current) => current + 1),
  }) : null
  const selectionBar = selectedSummary.count > 0 ? (
    <ActionBar
      className="pending-bills-selection-bar"
      aria-label={t('pendingBills.selection.summary', { count: String(selectedSummary.count), total: formatIDRExact(selectedSummary.total) })}
      summary={<span aria-live="polite">{t('pendingBills.selection.summary', { count: String(selectedSummary.count), total: formatIDRExact(selectedSummary.total) })}</span>}
      secondary={<Button type="button" variant="outline" onClick={() => setSelectedBillIds([])} disabled={selectionLocked}>{t('pendingBills.selection.clear')}</Button>}
      primary={<Button type="button" variant="primary" onClick={startMultiPayment} disabled={selectionLocked}>{t('pendingBills.record.recordPayment')}</Button>}
    />
  ) : null
  const mobileSelectAll = !isDesktop ? (
    <label className="pending-bills-mobile-select-all">
      <Checkbox
        aria-label={t('pendingBills.selectAll')}
        checked={allSelectableSelected}
        indeterminate={someSelectableSelected && !allSelectableSelected}
        disabled={selectableSet.size === 0 || selectionLocked}
        onChange={toggleAllSelection}
      />
      <span>{t('pendingBills.selectAll.compact')}</span>
    </label>
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
        title={formMode?.kind === 'multi' && !isDesktop ? recordPanelTitle : t('pendingBills.record.type')}
        actions={isDesktop && adapterCanPay && !formMode
          ? <span data-viewer-region="actions"><Button type="button" variant={selectedSummary.count > 0 ? 'outline' : 'primary'} onClick={startSinglePayment}>{t('pendingBills.record.recordPayment')}</Button></span>
          : undefined}
        closeLabel={t('record.close')}
        rootClassName="drawer-split--sticky pending-bills-record"
        focusKey={selectedBill.id}
        initialFocusRef={formMode?.kind === 'multi' ? multiPaymentFormRef : undefined}
        transitionPending={discardOpen || formBusy}
        onClose={() => guardedTransition(() => {
          formDirtyRef.current = false
          setFormMode(null)
          setSelectedBill(null)
        })}
      >
        <RecordViewer
          key={`${selectedBill.id}-${recordDraftGeneration}`}
          adapter={adapter}
          mode="panel"
          onCommitField={commitFinanceLabel}
          onDirtyChange={(dirty) => { formDirtyRef.current = dirty }}
          fieldCommitsFrozen={discardOpen}
        />
        {/* Phone: the record's one primary sits in a bar at the foot of the panel, under the scrolling bill. */}
        {!isDesktop && adapterCanPay && !formMode && (
          <PhoneActionBarContext.Provider value={null}>
            <ActionBar
              className="pending-bills-record-bar"
              summary={`${t('pendingBills.col.balance')} ${formatIDRExact(selectedBill.balance)}`}
              primary={<span data-viewer-region="actions"><Button type="button" variant="primary" onClick={startSinglePayment}>{t('pendingBills.record.recordPayment')}</Button></span>}
            />
          </PhoneActionBarContext.Provider>
        )}
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

  const chips: MoneyChip[] = []
  if (branchFilter) chips.push({ id: 'branch', label: `${t('pendingBills.branchFilter.label')}: ${branchOptions.find((option) => option.code === branchFilter)?.label ?? branchFilter}`, onRemove: () => setBranchFilter('') })
  if (ageBucket !== 'all') chips.push({ id: 'age', label: `${t('pendingBills.ageFilter.label')}: ${ageFilters.find((f) => f.bucket === ageBucket)?.label ?? ageBucket}`, onRemove: () => setAgeBucket('all') })
  const sortOptions: { key: string; label: string }[] = [
    { key: 'date.asc', label: t('pendingBills.sort.oldest') },
    { key: 'date.desc', label: t('pendingBills.sort.newest') },
    { key: 'balance.desc', label: t('pendingBills.sort.balanceHigh') },
    { key: 'balance.asc', label: t('pendingBills.sort.balanceLow') },
    { key: 'amount.desc', label: t('pendingBills.sort.amountHigh') },
    { key: 'amount.asc', label: t('pendingBills.sort.amountLow') },
  ]
  const sortHeader = (column: BillSort['column'], label: string, align: 'start' | 'end' = 'end') => {
    const active = sort.column === column
    return (
      <th scope="col" className={`pb-head pb-head--${align}`} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className="pb-sort" onClick={() => setSort({ column, desc: active ? !sort.desc : column !== 'date' })}>
          {label}<SortIndicator dir={active ? (sort.desc ? 'desc' : 'asc') : null} />
        </button>
      </th>
    )
  }
  const rowProps = (bill: PendingBillView) => ({
    bill, locale, t, selected: selectedSet.has(bill.id), selectable: selectableSet.has(bill.id), selectionLocked, open: bill.id === selectedId,
    onToggle: toggleBillSelection, onOpen: selectBill,
  })
  const count = visibleBills.length
  const countText = t(count === 1 ? 'pendingBills.count.one' : 'pendingBills.count.other', { count: String(count) })
  const oldest = summary.oldestAgeDays

  return frame(
    <div className="pending-bills-body">
      <Toast toast={toast} onDismiss={clearToast} />
      {kept}
      <div className="pending-bills-view-toolbar">
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
        {mobileSelectAll}
      </div>
      <div className="pending-bills-filter-bar">
        {isDesktop ? (
          <>
            {searchControl}
            {branchFilterControl}
            {ageFilterControl}
          </>
        ) : (
          <>
            {searchControl}
            <ViewOptionsDisclosure
              open={filtersOpen}
              onToggle={() => setFiltersOpen((open) => !open)}
              onClose={() => setFiltersOpen(false)}
              label={activeFilterCount > 0 ? `${t('pendingBills.filters.label')} (${activeFilterCount})` : t('pendingBills.filters.label')}
              panelId="pending-bills-filter-options"
              className="pending-bills-filters-disclosure"
              triggerClassName="pending-bills-filters-trigger"
              chevronClassName="pending-bills-filters-chevron"
              panelClassName="pending-bills-filter-panel"
            >
              {branchFilterControl}
              {ageFilterSelect}
            </ViewOptionsDisclosure>
          </>
        )}
      </div>
      <MoneyFilterChips chips={chips} />
      <MoneyFigures label={t('pendingBills.summary.label')} className="pending-bills-summary">
        <MoneyFigure lead label={t('pendingBills.openBalanceLabel' as MessageKey)} value={formatIDRExact(summary.openBalance)} />
        <MoneyFigure label={t('pendingBills.openCountLabel' as MessageKey)} value={String(summary.openCount)} />
        <MoneyFigure
          label={t('pendingBills.oldestLabel' as MessageKey)}
          value={oldest === null ? t('pendingBills.summary.noAge') : pendingBillAgeLabel(oldest, t)}
          delta={oldest !== null && oldest > 90 ? <Pill tone="warning" dot={false}>{t('pendingBills.oldest.old')}</Pill> : undefined}
        />
        <MoneyFigure label={t('pendingBills.paidPeriodLabel' as MessageKey)} value={formatIDRExact(summary.paidInPeriod)} />
      </MoneyFigures>
      <div className={`pending-bills-results${isWide ? ' record-split pending-bills-results--workbench' : ''}${isWide && recordPanel ? ' has-record' : ''}`}>
        <div className="pending-bills-list-column">
          <div className="pending-bills-listbar">
            {isWide && !recordPanel && <p className="pending-bills-hint">{t('pendingBills.record.selectInstruction' as MessageKey)}</p>}
            {!isDesktop && (
              <label className="pending-bills-sort-phone">
                <span>{t('pendingBills.sort.label')}</span>
                <Select value={billSortKey(sort)} onChange={(event) => setSort(parseBillSort(event.target.value))}>
                  {sortOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </Select>
              </label>
            )}
            <p className="pending-bills-count" role="status">{countText}</p>
          </div>
          {isDesktop ? (
            <MoneyTableShell className="pending-bills-table" scrollRef={listScrollRef as React.RefObject<HTMLDivElement>}>
              <caption className="sr-only">{t('pendingBills.table.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-head pb-head--select">
                    <label className="pending-bills__checkbox-target"><Checkbox aria-label={t('pendingBills.selectAll')} checked={allSelectableSelected} indeterminate={someSelectableSelected && !allSelectableSelected} disabled={selectableSet.size === 0 || selectionLocked} onChange={toggleAllSelection} /></label>
                  </th>
                  <th scope="col" className="pb-head pb-head--start">{t('pendingBills.col.owes')}</th>
                  <th scope="col" className="pb-head pb-head--start">{t('pendingBills.col.state')}</th>
                  {sortHeader('date', t('pendingBills.col.date'), 'start')}
                  {sortHeader('amount', t('pendingBills.col.amount'))}
                  {sortHeader('balance', t('pendingBills.col.balance'))}
                </tr>
              </thead>
              <tbody className="money-table__group">
                {visibleBills.map((bill) => <PendingBillRow key={bill.id} {...rowProps(bill)} />)}
              </tbody>
            </MoneyTableShell>
          ) : (
            <ul ref={listScrollRef as React.RefObject<HTMLUListElement>} className="pb-cards" aria-label={t('pendingBills.table.caption')}>
              {visibleBills.map((bill) => <PendingBillCard key={bill.id} {...rowProps(bill)} />)}
            </ul>
          )}
          {visibleBills.length === 0 && (
            <div className="pending-bills-filter-empty" role="status">
              <p>{t('pendingBills.empty.filtered')}</p>
              {(search || branchFilter || ageBucket !== 'all') && (
                <Button variant="outline" onClick={() => setParams((current) => { const next = new URLSearchParams(current); for (const key of ['q', 'branch', 'age']) next.delete(key); return next }, { replace: true })}>{t('money.filter.clear')}</Button>
              )}
            </div>
          )}
        </div>
        {recordPanel}
      </div>
      {selectionBar}
    </div>,
    undefined,
    freshness,
    staleAction,
  )
}
