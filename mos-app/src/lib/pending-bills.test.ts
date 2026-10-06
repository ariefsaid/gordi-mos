// Pending bills view-model (#1464): what one copied bill reads as on the Finance list.
import { describe, it, expect } from 'vitest'
import type { PendingBillRow } from '@/lib/db/reporting-pending-bills'
import { isPendingBillCopyStale, pendingBillAgeDays, toPendingBillViews } from './pending-bills'

function bill(over: Partial<PendingBillRow>): PendingBillRow {
  return {
    esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-1', sales_no: null, bill_date: '2026-10-01',
    branch_name: 'Rumah Rames', branch_id: null, counterparty_note: 'Meja 4', amount: 185000,
    source_state: 'present', source_state_at: null, snapshot_as_of: '2026-10-05T19:05:00Z',
    ...over,
  }
}

describe('pendingBillAgeDays — whole days from the bill date to today in WIB', () => {
  it('is 0 on the bill day and counts calendar days after it', () => {
    expect(pendingBillAgeDays('2026-10-06', '2026-10-06')).toBe(0)
    expect(pendingBillAgeDays('2026-10-05', '2026-10-06')).toBe(1)
    expect(pendingBillAgeDays('2025-08-12', '2026-10-06')).toBe(420)
  })
})

describe('toPendingBillViews', () => {
  it('lists the oldest bill first and breaks a same-day tie by its key', () => {
    const views = toPendingBillViews([
      bill({ bill_no: 'PB-3', bill_date: '2026-10-04' }),
      bill({ bill_no: 'PB-2', bill_date: '2026-09-01' }),
      bill({ bill_no: 'PB-1', bill_date: '2026-09-01' }),
    ], '2026-10-06')
    expect(views.map((v) => v.billNo)).toEqual(['PB-1', 'PB-2', 'PB-3'])
    expect(views.map((v) => v.ageDays)).toEqual([35, 35, 2])
  })

  it('reads the source state as open, void or missing, and the balance as the amount', () => {
    const views = toPendingBillViews([
      bill({ bill_no: 'A', source_state: 'present', amount: 250000 }),
      bill({ bill_no: 'B', source_state: 'void' }),
      bill({ bill_no: 'C', source_state: 'missing' }),
    ], '2026-10-06')
    expect(views.map((v) => v.state)).toEqual(['open', 'void', 'missing'])
    expect(views[0].balance).toBe(250000)
    expect(views[0].amount).toBe(250000)
  })

  it('reads a numeric amount sent as text as a number', () => {
    const [view] = toPendingBillViews([bill({ amount: '96000.00' as unknown as number })], '2026-10-06')
    expect(view.amount).toBe(96000)
  })
})

describe('isPendingBillCopyStale — more than 30 hours since the copy ran', () => {
  const copy = '2026-10-05T19:05:00Z'
  it('is fresh at 30 hours and stale just after', () => {
    expect(isPendingBillCopyStale(copy, new Date('2026-10-07T01:05:00Z'))).toBe(false)
    expect(isPendingBillCopyStale(copy, new Date('2026-10-07T01:06:00Z'))).toBe(true)
  })
})
