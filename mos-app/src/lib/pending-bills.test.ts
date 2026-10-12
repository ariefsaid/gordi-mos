// Pending bills view-model (#1464): what one copied bill reads as on the Finance list.
import { describe, it, expect } from 'vitest'
import type { PendingBillRow } from '@/lib/db/reporting-pending-bills'
import { filterPendingBills, isPendingBillCopyStale, normalizePendingBillFinanceLabel, pendingBillAgeDays, summarizePendingBills, toPendingBillViews, validatePendingBillFinanceLabel, type PendingBillFilters } from './pending-bills'

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
    const views = toPendingBillViews([
      bill({ bill_no: 'PARTIAL', amount: 1000 }),
      bill({ bill_no: 'SETTLED', amount: 750 }),
      bill({ bill_no: 'VOID', amount: 500, source_state: 'void' }),
      bill({ bill_no: 'MISSING', amount: 300, source_state: 'missing' }),
      bill({ bill_no: 'OVERPAID', amount: 400 }),
    ], '2026-10-06', [
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'OVERPAID', amount: 500 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PARTIAL', amount: 250 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'SETTLED', amount: 750 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'VOID', amount: 200 },
    ])
    expect(views.map(({ billNo, balance, state }) => ({ billNo, balance, state }))).toEqual([
      { billNo: 'MISSING', balance: 300, state: 'missing' },
      { billNo: 'OVERPAID', balance: -100, state: 'overpaid' },
      { billNo: 'PARTIAL', balance: 750, state: 'partial' },
      { billNo: 'SETTLED', balance: 0, state: 'settled' },
      { billNo: 'VOID', balance: 300, state: 'void' },
    ])
    expect(summarizePendingBills(views, [], '2026-10-06')).toEqual({
      openBalance: 1050,
      openCount: 2,
      oldestAgeDays: 5,
      paidInPeriod: 0,
    })
  })

  it('keeps cent balances exact: no float residue turns a settled bill overpaid or a remainder inexact', () => {
    const rows = [
      bill({ bill_no: 'CENTS', amount: 1000.01 }),
      bill({ bill_no: 'SUM', amount: 0.3 }),
      bill({ bill_no: 'HALF', amount: 12345.5 }),
    ]
    const views = toPendingBillViews(rows, '2026-10-06', [
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'CENTS', amount: 1000 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'SUM', amount: 0.1 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'SUM', amount: 0.2 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'HALF', amount: 12345 },
    ])
    const byNo = Object.fromEntries(views.map((view) => [view.billNo, view]))
    expect(byNo.CENTS).toMatchObject({ balance: 0.01, state: 'partial' })
    expect(byNo.SUM).toMatchObject({ balance: 0, state: 'settled' })
    expect(byNo.HALF).toMatchObject({ balance: 0.5, state: 'partial' })
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
    // A bill whose total carries cents is settled by whole rupiah and then its exact remainder.
    expect(validate({ amount: '0.5', cashInDate: '2026-10-06', hasProof: true, balance: 0.5, today: '2026-10-06' })).toEqual({
      errors: {},
      canSubmit: true,
    })
    expect(validate({ amount: '12345.5', cashInDate: '2026-10-06', hasProof: true, balance: 12345.5, today: '2026-10-06' }).canSubmit).toBe(true)
    expect(validate({ amount: '0.25', cashInDate: '2026-10-06', hasProof: true, balance: 0.5, today: '2026-10-06' }).errors).toEqual({ amount: 'invalid' })
    expect(validate({ amount: '0.01', cashInDate: '2026-10-06', hasProof: true, balance: 0.01, today: '2026-10-06' }).canSubmit).toBe(true)
    expect(validate({ amount: '1000.01', cashInDate: '2026-10-06', hasProof: true, balance: 1000.01, today: '2026-10-06' }).canSubmit).toBe(true)
  })
})

describe('multi-bill payment selection', () => {
  it('AC-1134: totals selected open balances exactly and excludes unpayable bills', async () => {
    const module = await import('./pending-bills')
    const views = toPendingBillViews([
      bill({ bill_no: 'OPEN', amount: 1000.5 }),
      bill({ bill_no: 'PARTIAL', amount: 250 }),
      bill({ bill_no: 'SETTLED', amount: 600 }),
      bill({ bill_no: 'VOID', source_state: 'void', amount: 700 }),
      bill({ bill_no: 'MISSING', source_state: 'missing', amount: 800 }),
    ], '2026-10-06', [
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PARTIAL', amount: 50 },
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'SETTLED', amount: 600 },
    ])
    const summarize = (module as unknown as {
      summarizePendingBillSelection?: (bills: typeof views, selectedIds: readonly string[]) => {
        bills: typeof views
        count: number
        total: number
      }
    }).summarizePendingBillSelection

    expect(summarize?.(views, views.map((view) => view.id))).toEqual({
      bills: [views.find((view) => view.billNo === 'OPEN'), views.find((view) => view.billNo === 'PARTIAL')],
      count: 2,
      total: 1200.5,
    })
  })
})

describe('AC-1121: paid/open views, branch and age filters drive the matching summary', () => {
  const today = '2026-10-06'
  const rows = toPendingBillViews([
    bill({ bill_no: 'TODAY', bill_date: today, branch_code: 'branch-a', branch_name: 'Branch A', counterparty_note: 'Kedai kopi' }),
    bill({ bill_no: 'THIRTY', bill_date: '2026-09-06', branch_code: 'branch-a', branch_name: 'Branch A', counterparty_note: 'Green Tea Cart', amount: 500 }),
    bill({ bill_no: 'THIRTYONE', bill_date: '2026-09-05', branch_code: 'branch-b', branch_name: 'Branch B' }),
    bill({ bill_no: 'NINETY', bill_date: '2026-07-08', branch_code: 'branch-b', branch_name: 'Branch B' }),
    bill({ bill_no: 'NINETYONE', bill_date: '2026-07-07', branch_code: 'branch-b', branch_name: 'Branch B' }),
    bill({ bill_no: 'SETTLED', bill_date: '2026-10-04', branch_code: 'branch-a', amount: 800 }),
    bill({ bill_no: 'VOID', bill_date: '2026-10-05', branch_code: 'branch-a', source_state: 'void' }),
  ], today, [
    { esb_code: 'GKI', branch_code: 'branch-a', bill_no: 'THIRTY', amount: 25, cash_in_date: '2026-09-27' },
    { esb_code: 'GKI', branch_code: 'branch-a', bill_no: 'THIRTY', amount: 75, cash_in_date: '2026-10-03' },
    { esb_code: 'GKI', branch_code: 'branch-a', bill_no: 'SETTLED', amount: 800, cash_in_date: '2026-10-02' },
  ])
  const filters: PendingBillFilters = {
    view: 'all', branchCode: '', ageBucket: 'all', search: '',
  }

  it('AC-1121: applies Open, Paid and All without disturbing oldest-first order', () => {
    expect(filterPendingBills(rows, { ...filters, view: 'open' }).map((row) => row.billNo)).toEqual([
      'NINETYONE', 'NINETY', 'THIRTYONE', 'THIRTY', 'TODAY',
    ])
    expect(filterPendingBills(rows, { ...filters, view: 'paid' }).map((row) => row.billNo)).toEqual(['SETTLED'])
    expect(filterPendingBills(rows, filters).map((row) => row.billNo)).toEqual([
      'NINETYONE', 'NINETY', 'THIRTYONE', 'THIRTY', 'SETTLED', 'VOID', 'TODAY',
    ])
  })

  it('AC-1121: combines branch, age and case/space-insensitive search in the summary', () => {
    expect(filterPendingBills(rows, { ...filters, view: 'open', branchCode: 'branch-b', ageBucket: '31-90' }).map((row) => row.billNo))
      .toEqual(['NINETY', 'THIRTYONE'])
    expect(filterPendingBills(rows, { ...filters, view: 'open', ageBucket: '90+' }).map((row) => row.billNo))
      .toEqual(['NINETYONE'])
    const matched = filterPendingBills(rows, {
      ...filters, view: 'open', branchCode: 'branch-a', ageBucket: '0-30', search: '  gReEn   tEa  ',
    })
    expect(matched.map((row) => row.billNo)).toEqual(['THIRTY'])
    expect(summarizePendingBills(matched, [
      { esb_code: 'GKI', branch_code: 'branch-a', bill_no: 'THIRTY', amount: 25, cash_in_date: '2026-09-27' },
      { esb_code: 'GKI', branch_code: 'branch-a', bill_no: 'THIRTY', amount: 75, cash_in_date: '2026-10-03' },
    ], today)).toEqual({ openBalance: 400, openCount: 1, oldestAgeDays: 30, paidInPeriod: 75 })
  })
})

describe('AC-1122: search matches copied text and Finance labels independent of case and spacing', () => {
  it('finds copied counterparty text without requiring its original spacing', () => {
    const rows = toPendingBillViews([bill({ bill_no: 'TEXT', counterparty_note: '  Meja   Empat  ' })], '2026-10-06')
    expect(filterPendingBills(rows, { view: 'all', branchCode: '', ageBucket: 'all', search: ' mejaempat ' }).map((row) => row.billNo))
      .toEqual(['TEXT'])
  })

  it('finds the MOS Finance label without changing the copied counterparty note', () => {
    const rows = toPendingBillViews([bill({ bill_no: 'LABEL', counterparty_note: 'ESB note' })], '2026-10-06', [], [
      { esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'LABEL', finance_label: 'Owner Sari' },
    ])
    expect(rows[0]).toMatchObject({ counterpartyNote: 'ESB note', financeLabel: 'Owner Sari' })
    expect(filterPendingBills(rows, { view: 'all', branchCode: '', ageBucket: 'all', search: ' owner   sari ' }).map((row) => row.billNo))
      .toEqual(['LABEL'])
  })
})

describe('Finance label validation', () => {
  it('allows a trimmed label of 60 characters and rejects 61', () => {
    expect(validatePendingBillFinanceLabel(` ${'x'.repeat(60)} `)).toBe(true)
    expect(validatePendingBillFinanceLabel('x'.repeat(61))).toBe(false)
  })

  it('normalizes edge whitespace without changing interior text', () => {
    expect(normalizePendingBillFinanceLabel('\t\n Owner Sari \r\n\t')).toBe('Owner Sari')
    expect(normalizePendingBillFinanceLabel('\u00a0\u2003')).toBe('')
    expect(normalizePendingBillFinanceLabel('Owner\t\nSari')).toBe('Owner\t\nSari')
    expect(validatePendingBillFinanceLabel(`\t\n${'x'.repeat(60)}\r\n`)).toBe(true)
    expect(validatePendingBillFinanceLabel(`\t\n${'x'.repeat(61)}\r\n`)).toBe(false)
  })
})

describe('isPendingBillCopyStale — more than 30 hours since the copy ran', () => {
  const copy = '2026-10-05T19:05:00Z'
  it('is fresh at 30 hours and stale just after', () => {
    expect(isPendingBillCopyStale(copy, new Date('2026-10-07T01:05:00Z'))).toBe(false)
    expect(isPendingBillCopyStale(copy, new Date('2026-10-07T01:06:00Z'))).toBe(true)
  })
})
