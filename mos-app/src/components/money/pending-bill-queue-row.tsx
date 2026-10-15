// One pending bill in the queue: a table row on desktop, a card on phone. Both open the bill's
// record on a click anywhere outside the checkbox; the who-owes name is the keyboard stop.
import type { MouseEvent } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Pill } from '@/components/ui/pill'
import { StatusBadge } from '@/components/ui/status-badge'
import type { Locale } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import type { PendingBillView } from '@/lib/pending-bills'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { formatIDRExact } from '@/lib/format/money'
import { pendingBillAgeLabel, PENDING_BILL_STATUS_KEY } from '@/components/money/pending-bill-record-adapter'

type Props = {
  bill: PendingBillView
  locale: Locale
  t: Translate
  selected: boolean
  selectable: boolean
  selectionLocked: boolean
  open: boolean
  onToggle: (id: string, selected: boolean) => void
  onOpen: (bill: PendingBillView) => void
}

/** Bills past 90 days are the list's exception: the pill carries the size ("95 days"). */
const OLD_BILL_DAYS = 90

function Age({ bill, t }: { bill: PendingBillView; t: Translate }) {
  const label = pendingBillAgeLabel(bill.ageDays, t)
  return bill.ageDays > OLD_BILL_DAYS ? <Pill tone="warning" dot={false} className="pending-bills__age-old">{label}</Pill> : <span className="pb-muted">{label}</span>
}

function StatePill({ bill }: { bill: PendingBillView }) {
  return <StatusBadge status={PENDING_BILL_STATUS_KEY[bill.state]} />
}

/** Why a bill cannot be picked for payment: shown as the checkbox's tooltip and spoken name. */
function blockedReason(bill: PendingBillView, t: Translate): string | undefined {
  if (bill.state === 'missing') return t('pendingBills.select.blocked.missing')
  if (bill.state === 'void') return t('pendingBills.select.blocked.void')
  if (bill.state === 'overpaid') return t('pendingBills.select.blocked.overpaid')
  return t('pendingBills.select.blocked.settled')
}

function Pick({ bill, t, selected, selectable, selectionLocked, onToggle, className }: Pick<Props, 'bill' | 't' | 'selected' | 'selectable' | 'selectionLocked' | 'onToggle'> & { className: string }) {
  const reason = selectable ? undefined : blockedReason(bill, t)
  const name = t('pendingBills.selectBill', { billNo: bill.billNo })
  return (
    <label className={className} title={reason}>
      <Checkbox aria-label={reason ? `${name}. ${reason}` : name} checked={selected} disabled={!selectable || selectionLocked} onChange={(checked) => onToggle(bill.id, checked)} />
    </label>
  )
}

function Branch({ bill, t }: { bill: PendingBillView; t: Translate }) {
  return <>{bill.branchKnown && bill.branchName ? bill.branchName : bill.branchCode}{!bill.branchKnown && <> {t('pendingBills.branch.unknown')}</>}</>
}

const ignoreInteractive = (event: MouseEvent, open: () => void) => {
  if ((event.target as Element).closest('a, button, label, input')) return
  open()
}

function Who({ bill, t, onOpen }: { bill: PendingBillView; t: Translate; onOpen: (bill: PendingBillView) => void }) {
  const note = bill.counterpartyNote?.trim() || null
  const who = note ?? t('pendingBills.owes.none')
  return (
    <button type="button" className="pb-open" data-pending-bill-trigger={bill.id} title={note ?? undefined} onClick={() => onOpen(bill)}>
      {who}<span className="sr-only"> · {t('pendingBills.openBill', { billNo: bill.billNo })}</span>
    </button>
  )
}

export function PendingBillRow({ bill, locale, t, selected, selectable, selectionLocked, open, onToggle, onOpen }: Props) {
  return (
    <tr className="pb-row" data-selected={selected || undefined} data-open={open || undefined} onClick={(event) => ignoreInteractive(event, () => onOpen(bill))}>
      <td className="pb-cell pb-cell--select">
        <Pick className="pending-bills__checkbox-target" bill={bill} t={t} selected={selected} selectable={selectable} selectionLocked={selectionLocked} onToggle={onToggle} />
      </td>
      <td className="pb-cell pb-cell--identity">
        <Who bill={bill} t={t} onOpen={onOpen} />
        <span className="pb-sub"><span className="pb-code">{bill.billNo}</span> · <Branch bill={bill} t={t} /></span>
        {bill.financeLabel && <span className="pb-sub">{t('pendingBills.col.financeLabel')}: {bill.financeLabel}</span>}
      </td>
      <td className="pb-cell pb-cell--state"><StatePill bill={bill} /></td>
      <td className="pb-cell pb-cell--date">
        <span>{formatWeekdayDayMonth(bill.billDate, locale)}</span>
        <Age bill={bill} t={t} />
      </td>
      <td className="pb-cell pb-cell--num tabular">{formatIDRExact(bill.amount)}</td>
      <td className="pb-cell pb-cell--num pb-cell--balance tabular">{formatIDRExact(bill.balance)}</td>
    </tr>
  )
}

export function PendingBillCard({ bill, locale, t, selected, selectable, selectionLocked, open, onToggle, onOpen }: Props) {
  return (
    <li className="pb-card" data-selected={selected || undefined} data-open={open || undefined} onClick={(event) => ignoreInteractive(event, () => onOpen(bill))}>
      <Pick className="pending-bills__checkbox-target pb-card__select" bill={bill} t={t} selected={selected} selectable={selectable} selectionLocked={selectionLocked} onToggle={onToggle} />
      <div className="pb-card__body">
        <div className="pb-card__head">
          <Who bill={bill} t={t} onOpen={onOpen} />
          <strong className="pb-card__balance tabular">{formatIDRExact(bill.balance)}</strong>
        </div>
        <p className="pb-card__meta"><span className="pb-code">{bill.billNo}</span> · <Branch bill={bill} t={t} /> · {formatWeekdayDayMonth(bill.billDate, locale)}</p>
        {bill.financeLabel && <p className="pb-card__meta">{t('pendingBills.col.financeLabel')}: {bill.financeLabel}</p>}
        <p className="pb-card__meta"><StatePill bill={bill} /><Age bill={bill} t={t} />{bill.amount !== bill.balance && <span>{t('pendingBills.col.amount')} <span className="tabular">{formatIDRExact(bill.amount)}</span></span>}</p>
      </div>
    </li>
  )
}
