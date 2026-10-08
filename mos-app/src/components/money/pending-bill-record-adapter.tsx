import { createElement, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { fieldSlot, readField } from '@/components/records/record-slots'
import type { RecordContentSlot, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import type { PendingBillPaymentHistoryEntry } from '@/lib/db/pending-bill-payments'
import { PENDING_BILL_FINANCE_LABEL_MAX_LENGTH, type PendingBillState, type PendingBillView } from '@/lib/pending-bills'
import { formatDayMonthYear, formatWibWeekdayTime } from '@/lib/format/date'
import { formatIDRExact } from '@/lib/format/money'
import type { Locale, MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'

export const PENDING_BILL_STATE_LABEL: Record<PendingBillState, MessageKey> = {
  open: 'pendingBills.state.open',
  partial: 'pendingBills.state.partial',
  settled: 'pendingBills.state.settled',
  overpaid: 'pendingBills.state.overpaid',
  void: 'pendingBills.state.void',
  missing: 'pendingBills.state.missing',
}

export function pendingBillAgeLabel(days: number, t: Translate): string {
  if (days <= 0) return t('pendingBills.age.today')
  return days === 1 ? t('pendingBills.age.one') : t('pendingBills.age.other', { count: String(days) })
}

export interface PendingBillRecordAdapterInput {
  bill: PendingBillView
  entries: readonly PendingBillPaymentHistoryEntry[]
  historyStatus: 'loading' | 'ready' | 'error'
  locale: Locale
  t: Translate
  canPay: boolean
  formMode: boolean
  form: ReactNode
  onStartPayment: () => void
  onReverse: (entry: PendingBillPaymentHistoryEntry) => void
  onRetryHistory: () => void
}

function branchText(bill: PendingBillView, t: Translate): string {
  if (bill.branchKnown && bill.branchName) return bill.branchName
  return bill.branchKnown ? bill.branchCode : `${bill.branchCode} ${t('pendingBills.branch.unknown')}`
}

function historySlot(input: PendingBillRecordAdapterInput): RecordContentSlot {
  const { entries, locale, t, onReverse, onRetryHistory, formMode, historyStatus } = input
  const reversed = new Set(entries.flatMap((entry) => entry.reversalOf ? [entry.reversalOf] : []))
  return {
    id: 'payment-history',
    label: t('pendingBills.history.title'),
    render: (context) => (
      <>
        {createElement(context.headingLevel === 1 ? 'h2' : 'h3', { className: 'record-viewer__section-title' }, t('pendingBills.history.title'))}
        {historyStatus === 'loading' ? (
          <LoadingShell label={t('record.state.loading')} />
        ) : historyStatus === 'error' ? (
          <ErrorState message={t('pendingBills.history.error')} onRetry={onRetryHistory} retryLabel={t('record.state.retry')} />
        ) : entries.length === 0 ? (
          <p className="record-viewer__permission-note">{t('pendingBills.history.empty')}</p>
        ) : (
          <ul className="record-viewer__activity">
            {entries.map((entry) => {
              const isReversal = entry.entryKind === 'reversal'
              const hasReversal = reversed.has(entry.id)
              return (
                <li key={entry.id} className="record-viewer__activity-item">
                  <span>{t(isReversal ? 'pendingBills.history.reversal' : 'pendingBills.history.payment')} · {formatIDRExact(isReversal ? entry.amount : Math.abs(entry.amount))}</span>
                  <span className="record-viewer__activity-detail">
                    {' · '}{t('pendingBills.history.cashInDate', { date: formatDayMonthYear(entry.cashInDate, locale) })}
                    {' · '}{entry.actorName ?? t('pendingBills.history.finance')}
                  </span>
                  <time dateTime={entry.createdAt} className="record-viewer__activity-time">{formatWibWeekdayTime(entry.createdAt, locale)}</time>
                  {entry.note && <span className="record-viewer__activity-detail"> · {entry.note}</span>}
                  {entry.reversalReason && <span className="record-viewer__activity-detail"> · {t('pendingBills.history.reason', { reason: entry.reversalReason })}</span>}
                  {entry.proofUrl && <a className="record-viewer__activity-link" href={entry.proofUrl} target="_blank" rel="noopener noreferrer">{t('pendingBills.history.openProof')}</a>}
                  {hasReversal && <span className="record-viewer__activity-detail"> · {t('pendingBills.history.reversed')}</span>}
                  {!formMode && !isReversal && !hasReversal && (
                    <Button variant="ghost" onClick={() => onReverse(entry)}>{t('pendingBills.history.reverse')}</Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </>
    ),
  }
}

export function createPendingBillRecordAdapter(input: PendingBillRecordAdapterInput): RecordViewerAdapter {
  const { bill, t } = input
  const outstanding = fieldSlot('outstanding', t('pendingBills.record.summary'), [
    readField({ key: 'date', label: t('pendingBills.col.date'), control: 'date', value: bill.billDate, displayValue: formatDayMonthYear(bill.billDate, input.locale) }),
    readField({ key: 'branch', label: t('pendingBills.col.branch'), control: 'text', value: bill.branchCode, displayValue: branchText(bill, t) }),
    readField({ key: 'counterparty', label: t('pendingBills.col.owes'), control: 'text', value: bill.counterpartyNote, displayValue: bill.counterpartyNote ?? t('pendingBills.owes.none') }),
    {
      ...readField({
        key: 'financeLabel',
        label: t('pendingBills.col.financeLabel'),
        control: 'text',
        value: bill.financeLabel,
        displayValue: bill.financeLabel ?? t('pendingBills.label.none'),
        placeholder: t('pendingBills.label.placeholder'),
      }),
      editable: true,
      maxLength: PENDING_BILL_FINANCE_LABEL_MAX_LENGTH,
    },
    readField({ key: 'amount', label: t('pendingBills.col.amount'), control: 'text', value: bill.amount, displayValue: formatIDRExact(bill.amount) }),
    readField({ key: 'recordedPaid', label: t('pendingBills.record.recorded'), control: 'text', value: bill.recordedPaid, displayValue: formatIDRExact(bill.recordedPaid) }),
    readField({ key: 'balance', label: t('pendingBills.col.balance'), control: 'text', value: bill.balance, displayValue: formatIDRExact(bill.balance) }),
    readField({ key: 'age', label: t('pendingBills.col.age'), control: 'text', value: bill.ageDays, displayValue: pendingBillAgeLabel(bill.ageDays, t) }),
    readField({ key: 'state', label: t('pendingBills.col.state'), control: 'status', value: bill.state, displayValue: t(PENDING_BILL_STATE_LABEL[bill.state]) }),
  ])
  const outstandingSlot: RecordContentSlot = {
    ...outstanding,
    render: (context) => (
      <>
        {outstanding.render(context)}
        {bill.state === 'void' && <p className="record-viewer__permission-note">{t('pendingBills.record.voidMark')}</p>}
        {bill.state === 'missing' && <p className="record-viewer__permission-note">{t('pendingBills.record.missingMark')}</p>}
      </>
    ),
  }
  const actions = input.canPay && !input.formMode ? [{
    id: 'record-payment',
    label: t('pendingBills.record.recordPayment'),
    intent: 'primary' as const,
    run: input.onStartPayment,
  }] : []
  const contentSlots: RecordContentSlot[] = [outstandingSlot]
  if (input.form) contentSlots.push({ id: 'payment-form', label: t('pendingBills.form.title'), render: () => input.form })
  contentSlots.push(historySlot(input))

  return {
    kind: 'pending-bill',
    id: bill.id,
    title: bill.billNo,
    typeLabel: t('pendingBills.record.type'),
    metadata: [],
    relations: [],
    contentSlots,
    activity: [],
    actions,
    permission: { readOnly: true, allowedActionIds: actions.map((action) => action.id) },
    state: 'ready',
  }
}
