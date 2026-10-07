// PendingBillsPage (#1464) — Finance's list of copied deferred-payment bills.
// AC-1113: a non-Finance deep link meets the outside-access panel and issues no read.
// AC-1123: loading, none-snapshot, empty, error and stale each say a sentence and offer an action.
// AC-1124: the as-of time is the copy run's, never the clock's.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/lib/db/reporting-pending-bills', () => ({
  listPendingBills: vi.fn(),
  latestPendingBillSnapshot: vi.fn(),
}))
vi.mock('@/lib/db/pending-bill-payments', () => ({
  listPendingBillPaymentAmounts: vi.fn(),
  listPendingBillPaymentHistory: vi.fn(),
  recordPendingBillPayment: vi.fn(),
  uploadPendingBillProof: vi.fn(),
}))
// Money is ship-gated in today's builds; these tests are about the page and its role gate.
vi.mock('@/lib/ship-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ship-gate')>()),
  isShipGated: () => false,
}))
vi.mock('@/auth/use-auth')

import { latestPendingBillSnapshot, listPendingBills, type PendingBillRow } from '@/lib/db/reporting-pending-bills'
import { ReportingRowCapError } from '@/lib/db/reporting-shared'
import {
  listPendingBillPaymentAmounts,
  listPendingBillPaymentHistory,
  recordPendingBillPayment,
  uploadPendingBillProof,
  type PendingBillPaymentAmountRow,
  type PendingBillPaymentHistoryEntry,
} from '@/lib/db/pending-bill-payments'
import { useAuth } from '@/auth/use-auth'
import { RequireAccessRole } from '@/auth/require-access-role'
import { I18nProvider } from '@/i18n/I18nProvider'
import { PendingBillsPage } from './pending-bills-page'

const mockList = vi.mocked(listPendingBills)
const mockSnapshot = vi.mocked(latestPendingBillSnapshot)
const mockPaymentAmounts = vi.mocked(listPendingBillPaymentAmounts)
const mockPaymentHistory = vi.mocked(listPendingBillPaymentHistory)
const mockRecordPayment = vi.mocked(recordPendingBillPayment)
const mockUploadProof = vi.mocked(uploadPendingBillProof)
const mockUseAuth = vi.mocked(useAuth)

function authViewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'u-1', full_name: 'Test Person',
        email: 't@example.test', must_change_password: false, archived_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  }
}

// Last night's copy: Tue 6 Oct 2026, 02:05 WIB.
const COPY = '2026-10-05T19:05:00Z'
const NOW = new Date('2026-10-06T03:00:00Z') // 10:00 WIB the same morning

function bill(over: Partial<PendingBillRow>): PendingBillRow {
  return {
    esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-1', sales_no: null, bill_date: '2026-10-01',
    branch_name: 'Rumah Rames', branch_id: 'b-1', counterparty_note: 'Meja 4', amount: 185000,
    source_state: 'present', source_state_at: null, snapshot_as_of: COPY,
    ...over,
  }
}

function renderPage(accessRoles = ['finance']) {
  mockUseAuth.mockReturnValue(authViewer(accessRoles))
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/money/pending-bills']}>
        <Routes>
          <Route element={<RequireAccessRole anyOf={['finance']} scope="link" />}>
            <Route path="/money/pending-bills" element={<PendingBillsPage />} />
          </Route>
          <Route path="/money" element={<p>money root</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function setViewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(min-width: 768px)' ? desktop : false,
    media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

const realMatchMedia = window.matchMedia

beforeEach(() => {
  vi.clearAllMocks()
  setViewport(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockSnapshot.mockResolvedValue({ snapshot_as_of: COPY, bill_count: 3 })
  mockPaymentAmounts.mockResolvedValue([])
  mockPaymentHistory.mockResolvedValue([])
  mockRecordPayment.mockResolvedValue({ paymentId: 'payment-new', replayed: false })
  mockUploadProof.mockResolvedValue('org-1/proof.pdf')
  mockList.mockResolvedValue([
    bill({ bill_no: 'PB-2', bill_date: '2026-10-06', counterparty_note: null, amount: 96000 }),
    bill({ bill_no: 'PB-1', bill_date: '2025-08-12', branch_name: null, branch_code: 'pop_up_east', branch_id: null, amount: 2480000 }),
    bill({ bill_no: 'PB-3', bill_date: '2026-10-05', source_state: 'void' }),
    bill({ bill_no: 'PB-4', bill_date: '2026-10-04', source_state: 'missing' }),
  ])
})
afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
})

describe('AC-1113: only Finance reaches the list', () => {
  it.each([['manager'], ['supervisor']])('a %s deep link meets the outside-access panel and reads nothing', async (role) => {
    renderPage([role])
    expect(await screen.findByText('Pending bills is outside your access')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(mockList).not.toHaveBeenCalled()
    expect(mockSnapshot).not.toHaveBeenCalled()
  })
})

describe('the ready list', () => {
  it('shows every bill oldest first with who owes, amount, balance, age and state', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: /Pending bills/ })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByText(/^PB-/).textContent)).toEqual(['PB-1', 'PB-4', 'PB-3', 'PB-2'])
    const oldest = within(rows[0])
    expect(oldest.getByText('pop_up_east')).toBeInTheDocument()
    expect(oldest.getAllByText('Rp 2.480.000')).toHaveLength(2)
    expect(oldest.getByText('420 days')).toBeInTheDocument()
    expect(oldest.getByText('Open')).toBeInTheDocument()
    expect(within(rows[1]).getByText('No longer in ESB')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Voided in ESB')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Not written on the bill')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Today')).toBeInTheDocument()
  })
})

describe('the table columns', () => {
  it('puts Age beside Date and State right after Who owes, so how old and flagged are visible at tablet widths', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Date', 'Age', 'Branch', 'Who owes', 'State', 'Bill no.', 'Amount', 'Balance'],
    )
  })

  it('renders the list inside the shared Money table shell', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    expect(table).toHaveClass('money-table')
    expect(table.closest('.money-table-scroll')).toBeInTheDocument()
  })

  it('says a branch MOS does not know is unknown, beside the code the till sent', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    const row = within(table).getByText('PB-1').closest('tr')!
    expect(within(row).getByText('pop_up_east')).toBeInTheDocument()
    expect(within(row).getByText('· unknown branch')).toBeInTheDocument()
    const linked = within(table).getByText('PB-2').closest('tr')!
    expect(within(linked).queryByText('· unknown branch')).toBeNull()
  })
})

describe('the phone list', () => {
  it('shows each bill in the shared row markup with who owes, amount, age, state and balance', async () => {
    setViewport(false)
    renderPage()
    await screen.findByText('Copied from ESB Tue 6 Oct, 02:05 WIB')
    const table = screen.getByRole('table', { name: 'Pending bills, oldest first' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    const oldest = within(rows[0])
    expect(oldest.getByText('Meja 4')).toBeInTheDocument()
    expect(oldest.getAllByText('Rp 2.480.000')).toHaveLength(2)
    expect(oldest.getByText('pop_up_east')).toBeInTheDocument()
    expect(oldest.getByText('PB-1')).toBeInTheDocument()
    expect(oldest.getByText('420 days')).toBeInTheDocument()
    expect(oldest.getByText('Open')).toBeInTheDocument()
    expect(oldest.getByText('Meja 4').closest('.money-table__cell--owes')).toBeInTheDocument()
  })

  it('keeps a long counterparty note available in the shared row at phone width', async () => {
    setViewport(false)
    const note = 'Kedai kopi dan roti dekat pasar yang buka sebelum matahari terbit'
    mockList.mockResolvedValue([bill({ bill_no: 'PB-LONG', counterparty_note: note })])
    renderPage()
    const text = await screen.findByText(note)
    expect(text.closest('.money-table__cell--owes')).toBeInTheDocument()
  })

  it('keeps the unnamed counterparty placeholder muted', async () => {
    setViewport(false)
    renderPage()
    const placeholder = await screen.findByText('Not written on the bill')
    expect(placeholder).toHaveClass('pending-bills__muted')
    expect(placeholder.closest('.money-table__cell--owes')).toBeInTheDocument()
  })
})

describe('AC-1135: recording updates the selected row and confirms count plus total', () => {
  it('settles the same bill row in place and leaves its record panel open', async () => {
    const persisted: PendingBillPaymentAmountRow[] = [{
      id: 'payment-new', esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-2', amount: 96000,
    }]
    const history: PendingBillPaymentHistoryEntry[] = [{
      id: 'payment-new', esbCode: 'GKI', branchCode: 'rumah_rames', billNo: 'PB-2',
      entryKind: 'payment', amount: 96000, cashInDate: '2026-10-06', proofPath: 'org-1/proof.pdf',
      proofUrl: 'https://proof.example.test/signed', note: null, reversalOf: null, reversalReason: null,
      actorName: 'Finance Person', createdAt: '2026-10-06T03:00:00Z',
    }]
    mockPaymentAmounts.mockResolvedValueOnce([]).mockResolvedValue(persisted)
    mockPaymentHistory.mockResolvedValueOnce([]).mockResolvedValue(history)
    renderPage()

    const openRow = await screen.findByRole('button', { name: 'Open bill PB-2' })
    const originalRow = openRow.closest('tr')
    fireEvent.click(openRow)
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    await screen.findByText('No payments recorded for this bill.')
    expect(panel.querySelector('[data-record-kind="pending-bill"]')).toBeInTheDocument()
    expect(within(panel).getAllByText('PB-2')).toHaveLength(1)
    fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }))
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    expect(within(panel).getAllByText('PB-2')).toHaveLength(1)

    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '96000' } })
    fireEvent.change(within(form).getByLabelText('Cash-in date'), { target: { value: '06/10/2026' } })
    fireEvent.change(within(form).getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })
    const submit = within(form).getByRole('button', { name: 'Record payment' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    expect(await screen.findByRole('status')).toHaveTextContent('1 payment recorded · Rp 96.000 total.')
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(expect.objectContaining({
      esbCode: 'GKI', branchCode: 'rumah_rames', billNo: 'PB-2', amount: 96000,
      cashInDate: '2026-10-06', proofPath: 'org-1/proof.pdf',
    })))
    expect(await within(panel).findByRole('link', { name: 'Open private proof' })).toHaveAttribute('href', 'https://proof.example.test/signed')
    const table = screen.getByRole('table', { name: 'Pending bills, oldest first' })
    const updatedRow = within(table).getByRole('button', { name: 'Open bill PB-2' }).closest('tr')
    expect(updatedRow).toBeInTheDocument()
    expect(updatedRow).toHaveTextContent('Settled')
    expect(updatedRow).toHaveTextContent('Rp 0')
    expect(updatedRow).toBe(originalRow)
    expect(screen.getByRole('dialog', { name: 'Pending bill PB-2' })).toBeInTheDocument()
  })
})

describe('pending-bill record history states', () => {
  it('shows the shared record loading state while payment history is loading', async () => {
    mockPaymentHistory.mockReturnValueOnce(new Promise<PendingBillPaymentHistoryEntry[]>(() => {}))
    renderPage()
    const openBill = await screen.findByRole('button', { name: 'Open bill PB-2' })
    fireEvent.click(openBill)
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    expect(within(panel).getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    expect(await within(panel).findByRole('status', { name: 'Loading record' })).toBeInTheDocument()
  })

  it('uses the shared record error state and retries history', async () => {
    mockPaymentHistory.mockRejectedValueOnce(new Error('offline'))
    renderPage()
    const openBill = await screen.findByRole('button', { name: 'Open bill PB-2' })
    fireEvent.click(openBill)
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    expect(within(panel).getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent('Payment history could not be loaded.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await within(panel).findByText('No payments recorded for this bill.')).toBeInTheDocument()
    expect(mockPaymentHistory).toHaveBeenCalledTimes(2)
  })
})

describe('the payment form in the record panel at every width', () => {
  it('moves focus into the form when it opens and back to the panel action when it closes', async () => {
    setViewport(false)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open bill PB-2' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }))
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    await waitFor(() => expect(form).toHaveFocus())

    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Record payment' })).toHaveFocus())
  })

  it('stays inline on phone and guards Escape until the draft is discarded', async () => {
    setViewport(false)
    renderPage()
    const openBill = await screen.findByRole('button', { name: 'Open bill PB-2' })
    fireEvent.click(openBill)
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }))
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    expect(document.querySelector('.modal-shell__surface[data-surface="sheet"]')).toBeNull()

    const amount = within(form).getByLabelText('Amount')
    fireEvent.change(amount, { target: { value: '10' } })
    fireEvent.keyDown(amount, { key: 'Escape' })
    const discard = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(form).toBeInTheDocument()
    expect(amount).toHaveValue('10')
    fireEvent.click(within(discard).getByRole('button', { name: 'Stay on this page' }))
    expect(within(panel).getByRole('form', { name: 'Record payment' })).toBeInTheDocument()

    fireEvent.keyDown(amount, { key: 'Escape' })
    const confirm = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pending bill PB-2' })).toBeNull())
  })

  it('returns focus to the panel action after a part payment is saved', async () => {
    mockList.mockResolvedValue([bill({ bill_no: 'PB-2', amount: 96_000 })])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open bill PB-2' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }))
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '1000' } })
    fireEvent.change(within(form).getByLabelText('Cash-in date'), { target: { value: '06/10/2026' } })
    fireEvent.change(within(form).getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled())
    await waitFor(() => expect(within(panel).queryByRole('form', { name: 'Record payment' })).toBeNull())
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Record payment' })).toHaveFocus())
  })

  it('returns focus to the panel action after a reversal is saved', async () => {
    mockList.mockResolvedValue([bill({ bill_no: 'PB-2', amount: 96_000 })])
    const paid: PendingBillPaymentAmountRow[] = [{ id: 'payment-1', esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-2', amount: 1000 }]
    const history: PendingBillPaymentHistoryEntry[] = [{
      id: 'payment-1', esbCode: 'GKI', branchCode: 'rumah_rames', billNo: 'PB-2',
      entryKind: 'payment', amount: 1000, cashInDate: '2026-10-06', proofPath: 'org-1/proof.pdf',
      proofUrl: 'https://proof.example.test/signed', note: null, reversalOf: null, reversalReason: null,
      actorName: 'Finance Person', createdAt: '2026-10-06T03:00:00Z',
    }]
    mockPaymentAmounts.mockResolvedValue(paid)
    mockPaymentHistory.mockResolvedValue(history)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open bill PB-2' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Reverse payment' }))
    const form = within(panel).getByRole('form', { name: 'Reverse payment' })
    fireEvent.change(within(form).getByLabelText(/reason/i), { target: { value: 'Entered against the wrong bill' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record reversal' }))
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled())
    await waitFor(() => expect(within(panel).queryByRole('form', { name: 'Reverse payment' })).toBeNull())
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Record payment' })).toHaveFocus())
  })

  it('accepts decimal-comma entry for the exact remaining balance', async () => {
    mockList.mockResolvedValue([bill({ bill_no: 'PB-2', amount: 96_000.5 })])
    renderPage()
    const openBill = await screen.findByRole('button', { name: 'Open bill PB-2' })
    fireEvent.click(openBill)
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }))
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '96000,5' } })
    const today = '06/10/2026'
    fireEvent.change(within(form).getByLabelText('Cash-in date'), { target: { value: today } })
    fireEvent.change(within(form).getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 96000.5 })))
  })
})

describe('AC-1124: the as-of time comes from the copy run', () => {
  it('reads the snapshot time, not the clock', async () => {
    renderPage()
    expect(await screen.findByText('Copied from ESB Tue 6 Oct, 02:05 WIB')).toBeInTheDocument()
    expect(screen.queryByText(/10:00/)).toBeNull()
  })
})

describe('AC-1123: every state says what happened and offers an action', () => {
  it('loading shows a table-shaped status', async () => {
    mockList.mockReturnValue(new Promise(() => {}))
    renderPage()
    const status = await screen.findByRole('status', { name: 'Loading…' })
    expect(status).toBeInTheDocument()
  })

  it('no copy yet: says so, when it runs, and offers Refresh that reads again', async () => {
    mockSnapshot.mockResolvedValue(null)
    mockList.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No copy from ESB yet.')).toBeInTheDocument()
    expect(screen.getByText('The nightly copy runs at 02:00. If nothing is here by 08:00, tell the admin.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(mockSnapshot).toHaveBeenCalledTimes(2))
  })

  it('empty copy: says no bills, keeps the as-of line and offers Refresh', async () => {
    mockList.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No pending bills in the last copy.')).toBeInTheDocument()
    expect(screen.getByText('Copied from ESB Tue 6 Oct, 02:05 WIB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('empty copy reads as settled, not as waiting', async () => {
    mockList.mockResolvedValue([])
    renderPage()
    await screen.findByText('No pending bills in the last copy.')
    expect(screen.getByTestId('empty-state')).not.toHaveAttribute('data-empty-variant', 'awaiting')
  })

  it('a stale copy with no bills still warns that the list may be out of date', async () => {
    mockList.mockResolvedValue([])
    vi.setSystemTime(new Date('2026-10-07T03:00:00Z'))
    renderPage()
    await screen.findByText('No pending bills in the last copy.')
    expect(screen.getByText('This list may be out of date. The last copy from ESB was Tue 6 Oct, 02:05 WIB.')).toBeInTheDocument()
  })

  it('error: says the list could not load and offers Try again', async () => {
    mockList.mockRejectedValue(new Error('down'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load pending bills. Try again; if it keeps failing, tell the admin.")).toBeInTheDocument()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  })

  it('too many rows explains the limit without retrying the same capped read', async () => {
    mockList.mockRejectedValue(new ReportingRowCapError('over cap'))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('There are more pending bills than this page can read at once.')
    expect(within(alert).queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('stale: warns above the list with the last copy time and offers Refresh', async () => {
    vi.setSystemTime(new Date('2026-10-07T03:00:00Z')) // 32 hours after the copy
    renderPage()
    const banner = await screen.findByText('This list may be out of date. The last copy from ESB was Tue 6 Oct, 02:05 WIB.')
    expect(banner).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('a fresh copy shows no stale warning', async () => {
    renderPage()
    await screen.findByRole('table')
    expect(screen.queryByText(/may be out of date/)).toBeNull()
  })
})
