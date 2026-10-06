// Pending bills view-model (#1464): copied bills → the rows Finance reads, oldest first.
import type { PendingBillRow } from '@/lib/db/reporting-pending-bills'

export type PendingBillState = 'open' | 'partial' | 'settled' | 'void' | 'missing'

export interface PendingBillPaymentAmount {
  esb_code: string
  branch_code: string
  bill_no: string
  /** Reversals are negative, so summing entries restores the outstanding balance. */
  amount: number
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
  amount: number
  recordedPaid: number
  balance: number
  ageDays: number
  state: PendingBillState
}

/** The copy runs nightly; one older than this missed at least one run (the same threshold as Money). */
export const PENDING_BILLS_STALE_AFTER_MS = 30 * 3600_000

const DAY_MS = 86_400_000
const SOURCE_STATE: Record<PendingBillRow['source_state'], PendingBillState> = {
  present: 'open',
  void: 'void',
  missing: 'missing',
}

function billKey(esbCode: string, branchCode: string, billNo: string): string {
  return JSON.stringify([esbCode, branchCode, billNo])
}

/** Whole calendar days from `billDate` to `today`, both YYYY-MM-DD in WIB. */
export function pendingBillAgeDays(billDate: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${billDate}T00:00:00Z`)) / DAY_MS)
}

export function toPendingBillViews(
  rows: readonly PendingBillRow[],
  today: string,
  payments: readonly PendingBillPaymentAmount[] = [],
): PendingBillView[] {
  const paidByBill = new Map<string, number>()
  for (const payment of payments) {
    const key = billKey(payment.esb_code, payment.branch_code, payment.bill_no)
    paidByBill.set(key, (paidByBill.get(key) ?? 0) + Number(payment.amount))
  }

  return rows
    .map((row): PendingBillView => {
      const amount = Number(row.amount)
      const recordedPaid = paidByBill.get(billKey(row.esb_code, row.branch_code, row.bill_no)) ?? 0
      const balance = amount - recordedPaid
      const sourceState = SOURCE_STATE[row.source_state]
      const state = sourceState !== 'open'
        ? sourceState
        : balance <= 0
          ? 'settled'
          : recordedPaid > 0
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
}

export function summarizePendingBills(bills: readonly PendingBillView[]): PendingBillSummary {
  const open = bills.filter((bill) => bill.state !== 'void' && bill.balance > 0)
  return {
    openBalance: open.reduce((total, bill) => total + bill.balance, 0),
    openCount: open.length,
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
  if (!draft.amount.trim()) errors.amount = 'required'
  else if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) errors.amount = 'invalid'
  else if (amount > draft.balance) errors.amount = 'overBalance'

  if (!draft.cashInDate) errors.cashInDate = 'required'
  else if (!isIsoCalendarDate(draft.cashInDate)) errors.cashInDate = 'invalid'
  else if (draft.cashInDate > draft.today) errors.cashInDate = 'future'

  if (!draft.hasProof) errors.proof = 'required'
  return { errors, canSubmit: Object.keys(errors).length === 0 }
}

export function isPendingBillCopyStale(snapshotAsOf: string, now: Date): boolean {
  return now.getTime() - Date.parse(snapshotAsOf) > PENDING_BILLS_STALE_AFTER_MS
}
