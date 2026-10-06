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

  it('AC-1120: derives each balance and settlement state from signed payment entries', async () => {
    const withPayments = toPendingBillViews as unknown as (
      bills: readonly PendingBillRow[],
      today: string,
      payments: readonly { esb_code: string; branch_code: string; bill_no: string; amount: number }[],
    ) => Array<{ billNo: string; amount: number; balance: number; state: string }>
    const views = withPayments([
      bill({ bill_no: 'PARTIAL', amount: 1000 }),
      bill({ bill_no: 'SETTLED', amount: 750 }),
      bill({ bill_no: 'VOID', amount: 500, source_state: 'void' }),
      bill({ bill_no: 'MISSING', amount: 300, source_state: 'missing' }),
    ], '2026-10-06', [
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PARTIAL', amount: 250 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'SETTLED', amount: 750 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'VOID', amount: 200 },
    ])
    expect(views.map(({ billNo, balance, state }) => ({ billNo, balance, state }))).toEqual([
      { billNo: 'MISSING', balance: 300, state: 'missing' },
      { billNo: 'PARTIAL', balance: 750, state: 'partial' },
      { billNo: 'SETTLED', balance: 0, state: 'settled' },
      { billNo: 'VOID', balance: 300, state: 'void' },
    ])
    const module = await import('./pending-bills')
    const summarize = (module as unknown as { summarizePendingBills?: (bills: typeof views) => unknown }).summarizePendingBills
    expect(typeof summarize).toBe('function')
    if (summarize) expect(summarize(views)).toEqual({ openBalance: 1050, openCount: 2 })
  })

  it('reads a numeric amount sent as text as a number', () => {
    const [view] = toPendingBillViews([bill({ amount: '96000.00' as unknown as number })], '2026-10-06')
    expect(view.amount).toBe(96000)
  })
})

describe('AC-1134: payment form validation keeps invalid submissions off', () => {
  it('names missing and invalid fields and only enables a complete in-balance payment', async () => {
    const module = await import('./pending-bills')
    const validate = (module as unknown as {
      validatePendingBillPaymentForm?: (input: {
        amount: string
        cashInDate: string
        hasProof: boolean
        balance: number
        today: string
      }) => { errors: Record<string, string>; canSubmit: boolean }
    }).validatePendingBillPaymentForm
    expect(typeof validate).toBe('function')
    if (!validate) return

    expect(validate({ amount: '', cashInDate: '', hasProof: false, balance: 1000, today: '2026-10-06' })).toEqual({
      errors: { amount: 'required', cashInDate: 'required', proof: 'required' },
      canSubmit: false,
    })
    expect(validate({ amount: '1001', cashInDate: '2026-10-06', hasProof: true, balance: 1000, today: '2026-10-06' })).toEqual({
      errors: { amount: 'overBalance' },
      canSubmit: false,
    })
    expect(validate({ amount: '1000.5', cashInDate: '2026-10-06', hasProof: true, balance: 1000, today: '2026-10-06' })).toEqual({
      errors: { amount: 'invalid' },
      canSubmit: false,
    })
    expect(validate({ amount: '1000', cashInDate: '2026-10-06', hasProof: true, balance: 1000, today: '2026-10-06' })).toEqual({
      errors: {},
      canSubmit: true,
    })
  })
})

describe('isPendingBillCopyStale — more than 30 hours since the copy ran', () => {
  const copy = '2026-10-05T19:05:00Z'
  it('is fresh at 30 hours and stale just after', () => {
    expect(isPendingBillCopyStale(copy, new Date('2026-10-07T01:05:00Z'))).toBe(false)
    expect(isPendingBillCopyStale(copy, new Date('2026-10-07T01:06:00Z'))).toBe(true)
  })
})
