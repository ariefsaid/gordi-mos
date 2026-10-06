// Pending bills view-model (#1464): copied bills → the rows Finance reads, oldest first.
import type { PendingBillRow } from '@/lib/db/reporting-pending-bills'

export type PendingBillState = 'open' | 'void' | 'missing'

export interface PendingBillView {
  id: string
  billDate: string
  branchName: string | null
  branchCode: string
  billNo: string
  counterpartyNote: string | null
  amount: number
  /** What is still owed. Equal to the amount until payments are recorded (#1465). */
  balance: number
  ageDays: number
  state: PendingBillState
}

/** The copy runs nightly; one older than this missed at least one run (the same threshold as Money). */
export const PENDING_BILLS_STALE_AFTER_MS = 30 * 3600_000

const DAY_MS = 86_400_000
const STATE: Record<PendingBillRow['source_state'], PendingBillState> = {
  present: 'open',
  void: 'void',
  missing: 'missing',
}

/** Whole calendar days from `billDate` to `today`, both YYYY-MM-DD in WIB. */
export function pendingBillAgeDays(billDate: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${billDate}T00:00:00Z`)) / DAY_MS)
}

export function toPendingBillViews(rows: readonly PendingBillRow[], today: string): PendingBillView[] {
  return rows
    .map((row): PendingBillView => {
      const amount = Number(row.amount)
      return {
        id: `${row.esb_code}|${row.branch_code}|${row.bill_no}`,
        billDate: row.bill_date,
        branchName: row.branch_name,
        branchCode: row.branch_code,
        billNo: row.bill_no,
        counterpartyNote: row.counterparty_note,
        amount,
        balance: amount,
        ageDays: pendingBillAgeDays(row.bill_date, today),
        state: STATE[row.source_state],
      }
    })
    .sort((a, b) => a.billDate.localeCompare(b.billDate) || a.id.localeCompare(b.id))
}

export function isPendingBillCopyStale(snapshotAsOf: string, now: Date): boolean {
  return now.getTime() - Date.parse(snapshotAsOf) > PENDING_BILLS_STALE_AFTER_MS
}
