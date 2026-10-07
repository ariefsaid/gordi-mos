import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { translateFor } from '@/i18n/use-t'
import type { PendingBillPaymentHistoryEntry } from '@/lib/db/pending-bill-payments'
import type { PendingBillView } from '@/lib/pending-bills'
import type { RecordFieldSpec } from '@/components/records/record-viewer.types'
import { createPendingBillRecordAdapter } from './pending-bill-record-adapter'

const bill: PendingBillView = {
  id: '["ESB","BR","PB-1"]', billDate: '2026-10-01', esbCode: 'ESB', branchName: 'Branch',
  branchCode: 'BR', branchKnown: true, billNo: 'PB-1', counterpartyNote: 'Table 4', amount: 2500,
  recordedPaid: 125, balance: 2375, ageDays: 5, state: 'partial',
}

const entry: PendingBillPaymentHistoryEntry = {
  id: 'payment-1', esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1', entryKind: 'payment',
  amount: 125, cashInDate: '2026-10-06', proofPath: 'org/proof.pdf', proofUrl: 'https://proof.test/signed',
  note: 'Deposit', reversalOf: null, reversalReason: null, actorName: 'Finance', createdAt: '2026-10-06T03:00:00Z',
}

function makeAdapter(overrides: Partial<Parameters<typeof createPendingBillRecordAdapter>[0]> = {}) {
  return createPendingBillRecordAdapter({
    bill, entries: [entry], historyStatus: 'ready', locale: 'en', t: translateFor('en'), canPay: true, formMode: false,
    form: null, onStartPayment: vi.fn(), onReverse: vi.fn(), onRetryHistory: vi.fn(), ...overrides,
  })
}

function fields(adapter: ReturnType<typeof createPendingBillRecordAdapter>): RecordFieldSpec[] {
  return adapter.contentSlots.flatMap((slot) => slot.section?.fields ?? [])
}

describe('pending-bill record adapter', () => {
  it('projects outstanding amount, running balance, age and state into the shared record grammar', () => {
    const adapter = makeAdapter()
    expect(adapter.kind).toBe('pending-bill')
    expect(adapter.title).toBe('PB-1')
    expect(fields(adapter).map((field) => field.key)).toEqual([
      'date', 'branch', 'counterparty', 'amount', 'recordedPaid', 'balance', 'age', 'state',
    ])
    expect(fields(adapter).find((field) => field.key === 'amount')?.displayValue).toBe('Rp 2.500')
    expect(fields(adapter).find((field) => field.key === 'balance')?.displayValue).toBe('Rp 2.375')
    expect(fields(adapter).find((field) => field.key === 'age')?.displayValue).toBe('5 days')
    expect(adapter.actions).toMatchObject([{ id: 'record-payment', intent: 'primary', label: 'Record payment' }])
    expect(adapter.permission.allowedActionIds).toEqual(['record-payment'])
  })

  it('omits payment actions when the balance cannot be paid or a form is open', () => {
    expect(makeAdapter({ canPay: false }).actions).toEqual([])
    expect(makeAdapter({ formMode: true }).actions).toEqual([])
  })

  it('projects history loading through the shared state-kit control', () => {
    const onRetryHistory = vi.fn()
    const loadingSlot = makeAdapter({ historyStatus: 'loading', onRetryHistory }).contentSlots.find((slot) => slot.id === 'payment-history')!
    render(<I18nProvider initialLocale="en">{loadingSlot.render({ mode: 'panel', readOnly: true })}</I18nProvider>)
    expect(screen.getByRole('status', { name: 'Loading record' })).toBeInTheDocument()
  })

  it('shows the shared error state and wires Retry to the history owner', () => {
    const onRetryHistory = vi.fn()
    const errorSlot = makeAdapter({ historyStatus: 'error', onRetryHistory }).contentSlots.find((slot) => slot.id === 'payment-history')!
    render(<I18nProvider initialLocale="en">{errorSlot.render({ mode: 'panel', readOnly: true })}</I18nProvider>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Payment history could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetryHistory).toHaveBeenCalledOnce()
  })

  it('keeps payment proof links and per-entry reversal in shared activity content', () => {
    const onReverse = vi.fn()
    const adapter = makeAdapter({ onReverse })
    const history = adapter.contentSlots.find((slot) => slot.id === 'payment-history')!
    render(<I18nProvider initialLocale="en">{history.render({ mode: 'panel', readOnly: true })}</I18nProvider>)
    expect(screen.getByRole('link', { name: 'Open private proof' })).toHaveAttribute('href', entry.proofUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Reverse payment' }))
    expect(onReverse).toHaveBeenCalledWith(entry)
  })
})
