import { describe, it, expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { wibToday } from '@/lib/home-attention'
import type { PendingBillView } from '@/lib/pending-bills'
import { PendingBillPaymentForm } from './pending-bill-payment-form'

const bill: PendingBillView = {
  id: '["ESB","BR","PB-1"]',
  billDate: '2026-10-01',
  esbCode: 'ESB',
  branchName: 'Branch',
  branchCode: 'BR',
  branchKnown: true,
  billNo: 'PB-1',
  counterpartyNote: 'Table 4',
  amount: 2500,
  recordedPaid: 0,
  balance: 2500,
  ageDays: 5,
  state: 'open',
}

function renderForm() {
  return render(
    <I18nProvider initialLocale="en">
      <PendingBillPaymentForm bill={bill} orgId="org-1" onCancel={vi.fn()} onSaved={vi.fn()} />
    </I18nProvider>,
  )
}

describe('AC-1134: multi-bill amounts are locked to the selected balances', () => {
  it('shows the balance total without an editable amount control', () => {
    type BatchFormProps = Parameters<typeof PendingBillPaymentForm>[0] & { bills: PendingBillView[] }
    const BatchForm = PendingBillPaymentForm as unknown as ComponentType<BatchFormProps>
    const secondBill: PendingBillView = { ...bill, id: 'second', billNo: 'PB-2', balance: 750, amount: 750 }
    render(
      <I18nProvider initialLocale="en">
        <BatchForm bill={bill} bills={[bill, secondBill]} orgId="org-1" onCancel={vi.fn()} onSaved={vi.fn()} />
      </I18nProvider>,
    )

    expect(screen.queryByRole('spinbutton', { name: 'Amount' })).toBeNull()
    expect(screen.queryByText('Rp 3.250')).not.toBeNull()
  })
})

describe('AC-1134: the payment form names invalid fields and keeps submit off', () => {
  it('lists required fields, blocks an amount over the balance, then enables a valid payment', async () => {
    renderForm()
    const submit = screen.getByRole('button', { name: 'Record payment' })
    expect(submit).toHaveClass('btn-primary')
    expect(submit).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Amount, Cash-in date, Proof')

    const amount = screen.getByLabelText('Amount')
    fireEvent.change(amount, { target: { value: '2501' } })
    fireEvent.blur(amount)
    expect(await screen.findByRole('alert')).toHaveTextContent('Amount cannot exceed the remaining balance of Rp 2.500.')
    expect(submit).toBeDisabled()

    fireEvent.change(amount, { target: { value: '2500' } })
    const date = screen.getByLabelText('Cash-in date')
    const today = wibToday()
    fireEvent.change(date, { target: { value: today.split('-').reverse().join('/') } })
    fireEvent.change(screen.getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => expect(submit).toBeEnabled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the proof picker open to gallery images and PDFs', () => {
    renderForm()
    const proof = screen.getByLabelText(/^Proof/) as HTMLInputElement
    expect(proof).not.toHaveAttribute('capture')
    expect(proof).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,application/pdf')
  })

  it('uses the shared quantity field control and reports an invalid proof draft as dirty', () => {
    const onDirtyChange = vi.fn()
    render(
      <I18nProvider initialLocale="en">
        <PendingBillPaymentForm bill={bill} orgId="org-1" onCancel={vi.fn()} onSaved={vi.fn()} onDirtyChange={onDirtyChange} />
      </I18nProvider>,
    )
    const amount = screen.getByRole('spinbutton', { name: 'Amount' })
    expect(amount).toHaveClass('mk-textinput__field')
    expect(amount.parentElement).toHaveClass('quantity-field-control--inline', 'mk-textinput__box')
    expect(amount).toHaveAttribute('aria-required', 'true')

    fireEvent.change(screen.getByLabelText(/^Proof/), {
      target: { files: [new File(['unsupported'], 'proof.txt', { type: 'text/plain' })] },
    })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('clearing the cash-in date clears the host dirty draft synchronously', () => {
    const onDirtyChange = vi.fn()
    render(
      <I18nProvider initialLocale="en">
        <PendingBillPaymentForm bill={bill} orgId="org-1" onCancel={vi.fn()} onSaved={vi.fn()} onDirtyChange={onDirtyChange} />
      </I18nProvider>,
    )
    const date = screen.getByLabelText('Cash-in date')
    fireEvent.change(date, { target: { value: wibToday().split('-').reverse().join('/') } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    fireEvent.change(date, { target: { value: '' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('a typed future date shows one alert, from the date field', async () => {
    renderForm()
    const date = screen.getByLabelText('Cash-in date')
    const next = new Date(Date.parse(`${wibToday()}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(date, { target: { value: next.split('-').reverse().join('/') } })
    fireEvent.blur(date)
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled()
  })
})
