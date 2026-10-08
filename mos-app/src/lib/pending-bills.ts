// Pending bills view-model (#1464): copied bills → the rows Finance reads, oldest first.
import type { PendingBillRow } from '@/lib/db/reporting-pending-bills'

export type PendingBillState = 'open' | 'partial' | 'settled' | 'overpaid' | 'void' | 'missing'

export interface PendingBillPaymentAmount {
  esb_code: string
  branch_code: string
  bill_no: string
  /** Reversals are negative, so summing entries restores the outstanding balance. */
  amount: number
  cash_in_date?: string
}

export interface PendingBillView {
  id: string
  billDate: string
  esbCode: string
  branchName: string | null
  branchCode: string
  /** Linked to a branch MOS knows; false while the till's code is not in the catalog. */
  branchKnown: boolean
  billNo: string
  counterpartyNote: string | null
  financeLabel: string | null
  amount: number
  recordedPaid: number
  balance: number
  ageDays: number
  state: PendingBillState
}

/** The copy runs nightly; one older than this missed at least one run (the same threshold as Money). */
export const PENDING_BILLS_STALE_AFTER_MS = 30 * 3600_000
export const PENDING_BILL_FINANCE_LABEL_MAX_LENGTH = 60

const DAY_MS = 86_400_000
const SOURCE_STATE: Record<PendingBillRow['source_state'], PendingBillState> = {
  present: 'open',
  void: 'void',
  missing: 'missing',
}

/** Money math is done in whole cents so sums and balances carry no float residue. */
const toCents = (value: number): number => Math.round(value * 100)

function billKey(esbCode: string, branchCode: string, billNo: string): string {
  return JSON.stringify([esbCode, branchCode, billNo])
}

/** Whole calendar days from `billDate` to `today`, both YYYY-MM-DD in WIB. */
export function pendingBillAgeDays(billDate: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${billDate}T00:00:00Z`)) / DAY_MS)
}

export function normalizePendingBillFinanceLabel(value: string): string {
  return value.trim()
}

export function validatePendingBillFinanceLabel(value: string): boolean {
  return normalizePendingBillFinanceLabel(value).length <= PENDING_BILL_FINANCE_LABEL_MAX_LENGTH
}

export function toPendingBillViews(
  rows: readonly PendingBillRow[],
  today: string,
  payments: readonly PendingBillPaymentAmount[] = [],
  financeLabels: readonly { esb_code: string; branch_code: string; bill_no: string; finance_label: string }[] = [],
): PendingBillView[] {
  const paidByBill = new Map<string, number>()
  const labelByBill = new Map(financeLabels.map((label) => [
    billKey(label.esb_code, label.branch_code, label.bill_no), label.finance_label,
  ]))
  for (const payment of payments) {
    const key = billKey(payment.esb_code, payment.branch_code, payment.bill_no)
    paidByBill.set(key, (paidByBill.get(key) ?? 0) + toCents(Number(payment.amount)))
  }

  return rows
    .map((row): PendingBillView => {
      const amount = Number(row.amount)
      const recordedPaidCents = paidByBill.get(billKey(row.esb_code, row.branch_code, row.bill_no)) ?? 0
      const balanceCents = toCents(amount) - recordedPaidCents
      const recordedPaid = recordedPaidCents / 100
      const balance = balanceCents / 100
      const sourceState = SOURCE_STATE[row.source_state]
      const state = sourceState !== 'open'
        ? sourceState
        : balanceCents < 0
          ? 'overpaid'
          : balanceCents === 0
            ? 'settled'
            : recordedPaidCents > 0
            ? 'partial'
            : 'open'
      return {
        id: billKey(row.esb_code, row.branch_code, row.bill_no),
        billDate: row.bill_date,
        esbCode: row.esb_code,
        branchName: row.branch_name,
        branchCode: row.branch_code,
        branchKnown: row.branch_id !== null,
        billNo: row.bill_no,
        counterpartyNote: row.counterparty_note,
        financeLabel: labelByBill.get(billKey(row.esb_code, row.branch_code, row.bill_no)) ?? null,
        amount,
        recordedPaid,
        balance,
        ageDays: pendingBillAgeDays(row.bill_date, today),
        state,
      }
    })
    .sort((a, b) => a.billDate.localeCompare(b.billDate) || a.id.localeCompare(b.id))
}

export interface PendingBillSummary {
  openBalance: number
  openCount: number
  oldestAgeDays: number | null
  paidInPeriod: number
}

export function isPendingBillSelectable(bill: PendingBillView): boolean {
  return (bill.state === 'open' || bill.state === 'partial') && bill.balance > 0
}

export interface PendingBillSelectionSummary {
  bills: PendingBillView[]
  count: number
  total: number
}

export function summarizePendingBillSelection(
  bills: readonly PendingBillView[],
  selectedIds: readonly string[],
): PendingBillSelectionSummary {
  const selected = new Set(selectedIds)
  const selectedBills = bills.filter((bill) => selected.has(bill.id) && isPendingBillSelectable(bill))
  const totalCents = selectedBills.reduce((sum, bill) => sum + toCents(bill.balance), 0)
  return { bills: selectedBills, count: selectedBills.length, total: totalCents / 100 }
}

export type PendingBillViewMode = 'open' | 'paid' | 'all'
export type PendingBillAgeBucket = 'all' | '0-30' | '31-90' | '90+'

export interface PendingBillFilters {
  view: PendingBillViewMode
  branchCode: string
  ageBucket: PendingBillAgeBucket
  search: string
}

function normalizedSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

export function filterPendingBills(
  bills: readonly PendingBillView[],
  filters: PendingBillFilters,
): PendingBillView[] {
  const query = normalizedSearch(filters.search)
  return bills.filter((bill) => {
    if (filters.view === 'open' && (bill.state === 'void' || bill.balance <= 0)) return false
    if (filters.view === 'paid' && bill.state !== 'settled' && bill.state !== 'overpaid') return false
    if (filters.branchCode && bill.branchCode !== filters.branchCode) return false
    if (filters.ageBucket === '0-30' && (bill.ageDays < 0 || bill.ageDays > 30)) return false
    if (filters.ageBucket === '31-90' && (bill.ageDays < 31 || bill.ageDays > 90)) return false
    if (filters.ageBucket === '90+' && bill.ageDays <= 90) return false
    if (query && ![bill.billNo, bill.counterpartyNote ?? '', bill.financeLabel ?? ''].some((value) => normalizedSearch(value).includes(query))) return false
    return true
  })
}

export function summarizePendingBills(
  bills: readonly PendingBillView[],
  payments: readonly PendingBillPaymentAmount[],
  today: string,
): PendingBillSummary {
  const open = bills.filter((bill) => bill.state !== 'void' && bill.balance > 0)
  const visibleBillKeys = new Set(bills.map((bill) => bill.id))
  // The page has no period control; count cash-in dates from this WIB month to today.
  const periodStart = `${today.slice(0, 7)}-01`
  const paidInPeriodCents = payments.reduce((total, payment) => {
    if (!payment.cash_in_date || payment.cash_in_date < periodStart || payment.cash_in_date > today) return total
    if (!visibleBillKeys.has(billKey(payment.esb_code, payment.branch_code, payment.bill_no))) return total
    return total + toCents(payment.amount)
  }, 0)
  return {
    openBalance: open.reduce((total, bill) => total + toCents(bill.balance), 0) / 100,
    openCount: open.length,
    oldestAgeDays: open.length > 0 ? Math.max(...open.map((bill) => bill.ageDays)) : null,
    paidInPeriod: paidInPeriodCents / 100,
  }
}

export type PendingBillPaymentField = 'amount' | 'cashInDate' | 'proof'
export type PendingBillPaymentFieldError = 'required' | 'invalid' | 'overBalance' | 'future'

export interface PendingBillPaymentDraft {
  amount: string
  cashInDate: string
  hasProof: boolean
  balance: number
  today: string
}

export interface PendingBillPaymentValidation {
  errors: Partial<Record<PendingBillPaymentField, PendingBillPaymentFieldError>>
  canSubmit: boolean
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validatePendingBillPaymentForm(draft: PendingBillPaymentDraft): PendingBillPaymentValidation {
  const errors: PendingBillPaymentValidation['errors'] = {}
  const amount = Number(draft.amount)
  // The copy keeps ESB totals to the cent: whole rupiah (at least 1), or exactly the remaining balance.
  const settlesBill = toCents(amount) === toCents(draft.balance)
  if (!draft.amount.trim()) errors.amount = 'required'
  else if (!Number.isFinite(amount) || amount <= 0 || (!settlesBill && (amount < 1 || !Number.isInteger(amount)))) errors.amount = 'invalid'
  else if (toCents(amount) > toCents(draft.balance)) errors.amount = 'overBalance'

  if (!draft.cashInDate) errors.cashInDate = 'required'
  else if (!isIsoCalendarDate(draft.cashInDate)) errors.cashInDate = 'invalid'
  else if (draft.cashInDate > draft.today) errors.cashInDate = 'future'

  if (!draft.hasProof) errors.proof = 'required'
  return { errors, canSubmit: Object.keys(errors).length === 0 }
}

export function isPendingBillCopyStale(snapshotAsOf: string, now: Date): boolean {
  return now.getTime() - Date.parse(snapshotAsOf) > PENDING_BILLS_STALE_AFTER_MS
}
