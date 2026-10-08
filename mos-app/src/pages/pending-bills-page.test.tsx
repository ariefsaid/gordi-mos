// PendingBillsPage (#1464) — Finance's list of copied deferred-payment bills.
// AC-1113: a non-Finance deep link meets the outside-access panel and issues no read.
// AC-1123: loading, none-snapshot, empty, error and stale each say a sentence and offer an action.
// AC-1124: the as-of time is the copy run's, never the clock's.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/lib/db/reporting-pending-bills', () => ({
  listPendingBills: vi.fn(),
  latestPendingBillSnapshot: vi.fn(),
}))
vi.mock('@/lib/db/pending-bill-payments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/pending-bill-payments')>()),
  listPendingBillPaymentAmounts: vi.fn(),
  listPendingBillPaymentHistory: vi.fn(),
  recordPendingBillPayment: vi.fn(),
  paySeveralPendingBills: vi.fn(),
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
  PendingBillBalanceChangedError,
  recordPendingBillPayment,
  paySeveralPendingBills,
  uploadPendingBillProof,
  type PaidPendingBill,
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
const mockPaySeveral = vi.mocked(paySeveralPendingBills)
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

function renderPage(accessRoles = ['finance'], initialLocale: 'en' | 'id' = 'en', strictMode = false) {
  mockUseAuth.mockReturnValue(authViewer(accessRoles))
  const page = (
    <I18nProvider initialLocale={initialLocale}>
      <MemoryRouter initialEntries={['/money/pending-bills']}>
        <Routes>
          <Route element={<RequireAccessRole anyOf={['finance']} scope="link" />}>
            <Route path="/money/pending-bills" element={<PendingBillsPage />} />
          </Route>
          <Route path="/money" element={<p>money root</p>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  )
  return render(strictMode ? <StrictMode>{page}</StrictMode> : page)
}

function setViewport(desktop: boolean, wide = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(min-width: 1100px)' ? wide : query === '(min-width: 768px)' ? desktop : false,
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
  mockPaySeveral.mockResolvedValue([])
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
  it('keeps the currency and figure together in the page summary', async () => {
    renderPage()
    const summary = await screen.findByText(/3 open bills/)

    expect(summary.textContent).toContain('Rp\u00a02.761.000 remaining')
    expect(summary.textContent).toContain('oldest 420 days')
    expect(summary.textContent).toContain('paid this month Rp\u00a00')
  })

  it('shows every bill oldest first with who owes, amount, balance, age and state', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: 'All' }))
    const table = await screen.findByRole('table', { name: /Pending bills/ })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByText(/^PB-/).textContent)).toEqual(['PB-1', 'PB-4', 'PB-3', 'PB-2'])
    const oldest = within(rows[0])
    expect(oldest.getByText('pop_up_east')).toBeInTheDocument()
    expect(oldest.getAllByText('Rp 2.480.000')).toHaveLength(2)
    expect(oldest.getByText('420 days')).toBeInTheDocument()
    expect(oldest.getByText('Open')).toBeInTheDocument()
    const missingState = within(rows[1]).getByText('No longer in ESB')
    expect(missingState.closest('.pending-bills__state-pill')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Voided in ESB')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Not written on the bill')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Today')).toBeInTheDocument()
  })
})

describe('the table columns', () => {
  it('orders Age near Date and State after Who owes, before the bill and money columns', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Select', 'Date', 'Age', 'Branch', 'Who owes', 'State', 'Bill no.', 'Amount', 'Balance'],
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
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
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

  it('keeps a long counterparty note readable on the phone card and recoverable in the record panel', async () => {
    setViewport(false)
    const note = 'Kedai kopi dan roti dekat pasar yang buka sebelum matahari terbit'
    mockList.mockResolvedValue([bill({ bill_no: 'PB-LONG', counterparty_note: note })])
    renderPage()
    const text = await screen.findByText(note)
    expect(text).toHaveAttribute('title', note)
    expect(text.closest('.money-table__cell--owes')).toBeInTheDocument()

    const row = text.closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Open bill PB-LONG' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-LONG' })
    expect(within(panel).getByText(note)).toBeInTheDocument()
  })

  it('keeps the full branch name in the record panel when the tablet row is clamped', async () => {
    setViewport(true)
    const branchName = 'North Jakarta Central Distribution and Finance Office'
    mockList.mockResolvedValue([bill({ bill_no: 'PB-BRANCH', branch_name: branchName })])
    renderPage()
    const branchCell = (await screen.findByRole('row', { name: /PB-BRANCH/ })).querySelector('.pending-bills__branch')
    expect(branchCell).toHaveAttribute('title', branchName)

    fireEvent.click(screen.getByRole('button', { name: 'Open bill PB-BRANCH' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-BRANCH' })
    expect(within(panel).getByText(branchName)).toBeInTheDocument()
  })

  it('keeps the unnamed counterparty placeholder muted', async () => {
    setViewport(false)
    renderPage()
    const placeholder = await screen.findByText('Not written on the bill')
    expect(placeholder).toHaveClass('pending-bills__muted')
    expect(placeholder.closest('.money-table__cell--owes')).toBeInTheDocument()
  })
})

describe('tablet urgency cues', () => {
  it('keeps a 90+ marker in the bill cell while the age column is hidden', async () => {
    setViewport(true)
    renderPage()
    const row = await screen.findByRole('row', { name: /PB-1/ })
    const billCell = row.querySelector('.money-table__cell--bill') as HTMLElement
    const recentRow = screen.getByRole('row', { name: /PB-2/ })

    expect(within(row).getByText('420 days')).toBeInTheDocument()
    expect(within(billCell).getByText('90+ days')).toHaveClass('pending-bills__age-old', 'pending-bills__tablet-age-cue')
    expect(recentRow.querySelector('.pending-bills__tablet-age-cue')).toBeNull()
  })
})

describe('AC-1121: pending-bill view controls', () => {
  it('resets the phone page scroll after changing the tab, branch, age or search', async () => {
    setViewport(false)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    const scroller = table.closest('.money-table-scroll') as HTMLDivElement
    const pageScroller = table.closest('.page-frame--v3') as HTMLDivElement
    const assertScrollReset = async (change: () => void | Promise<void>) => {
      scroller.scrollTop = 136
      pageScroller.scrollTop = 136
      await change()
      await waitFor(() => {
        expect(scroller.scrollTop).toBe(0)
        expect(pageScroller.scrollTop).toBe(0)
      })
    }

    await assertScrollReset(() => { fireEvent.click(screen.getByRole('tab', { name: 'Paid' })) })
    await assertScrollReset(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
      fireEvent.click(screen.getByRole('combobox', { name: 'Branch' }))
      fireEvent.click(await screen.findByRole('option', { name: 'pop_up_east' }))
    })
    await assertScrollReset(() => { fireEvent.click(screen.getByRole('button', { name: '90+ days' })) })
    await assertScrollReset(() => { fireEvent.change(screen.getByRole('searchbox', { name: 'Search bills' }), { target: { value: 'PB-1' } }) })
  })

  it('defaults to Open, marks paid rows unselectable, and clears selection when the tab changes', async () => {
    mockList.mockResolvedValue([
      bill({ bill_no: 'PB-2', bill_date: '2026-10-06', counterparty_note: null, amount: 96000 }),
      bill({ bill_no: 'PB-1', bill_date: '2025-08-12', branch_name: null, branch_code: 'pop_up_east', branch_id: null, amount: 2480000 }),
      bill({ bill_no: 'PB-3', bill_date: '2026-10-05', source_state: 'void' }),
      bill({ bill_no: 'PB-4', bill_date: '2026-10-04', source_state: 'missing' }),
      bill({ bill_no: 'PB-SETTLED', bill_date: '2026-10-03', amount: 500 }),
    ])
    mockPaymentAmounts.mockResolvedValue([{
      id: 'settled-payment', esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-SETTLED', amount: 500, cash_in_date: '2026-10-02',
    }])
    renderPage()
    const openTab = await screen.findByRole('tab', { name: 'Open' })
    expect(openTab).toHaveAttribute('aria-selected', 'true')
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-1' }))
    expect(screen.getByRole('region', { name: '1 selected · Rp 2.480.000 total' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Paid' }))
    expect(await within(table).findByText('PB-SETTLED')).toBeInTheDocument()
    expect(await screen.findByText(/3 open bills/)).toHaveTextContent('paid this month Rp 500')
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-SETTLED' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: /selected ·/ })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(await within(table).findByText('PB-3')).toBeInTheDocument()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-1' })).not.toBeChecked()
    expect(within(table).getByText('Voided in ESB')).toBeInTheDocument()
  })

  it('keeps branch and age filters behind a phone disclosure and preserves their result when collapsed', async () => {
    setViewport(false)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    const trigger = screen.getByRole('button', { name: 'Filters' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls', 'pending-bills-filter-options')
    expect(screen.queryByRole('combobox', { name: 'Branch' })).toBeNull()
    expect(screen.getByRole('searchbox', { name: 'Search bills' })).toBeInTheDocument()
    expect(await screen.findByText(/3 bills · oldest 420 days/)).toHaveTextContent('Rp 2.761.000 open')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('combobox', { name: 'Branch' }))
    fireEvent.click(await screen.findByRole('option', { name: 'pop_up_east' }))
    expect(screen.getByRole('button', { name: 'Filters, 1 active filter' })).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: '90+ days' }))

    expect(screen.getByRole('button', { name: 'Filters, 2 active filters' })).toHaveTextContent('2')
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(1)
    expect(within(table).getByText('PB-1')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('combobox', { name: 'Branch' })).toBeNull()
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(1)
    expect(within(table).getByText('PB-1')).toBeInTheDocument()

    fireEvent.click(trigger)
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('localizes the phone disclosure and its active count in Indonesian', async () => {
    setViewport(false)
    renderPage(['finance'], 'id')
    await screen.findByRole('table')
    const trigger = screen.getByRole('button', { name: 'Filter' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: '90+ hari' }))
    expect(screen.getByRole('button', { name: 'Filter, 1 filter aktif' })).toHaveTextContent('1')
  })

  it('combines branch, age and bill-number search and marks 90+ rows', async () => {
    setViewport(false)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Branch' }))
    fireEvent.click(await screen.findByRole('option', { name: 'pop_up_east' }))
    fireEvent.click(screen.getByRole('button', { name: '90+ days' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search bills' }), { target: { value: 'pb - 1' } })

    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('PB-1')).toBeInTheDocument()
    expect(within(rows[0]).getByText('420 days')).toHaveClass('pending-bills__age-old')
    expect(await screen.findByText(/1 bill · oldest 420 days/)).toHaveTextContent('Rp 2.480.000 open')
  })
})

describe('multi-bill payment selection', () => {
  it('places tablet selection actions before the bill list in reading and focus order', async () => {
    setViewport(true)
    renderPage()
    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-1' }))

    const selection = screen.getByRole('region', { name: '1 selected · Rp 2.480.000 total' })
    expect(selection.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('makes Record payment primary and Clear selection secondary', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-1' }))

    expect(screen.getByRole('button', { name: 'Record payment' })).toHaveClass('btn-primary')
    expect(screen.getByRole('button', { name: 'Clear selection' })).toHaveClass('btn-outline')
  })

  it('selects only payable rows and reports the selected count and balance', async () => {
    mockList.mockResolvedValue([
      bill({ bill_no: 'PB-2', bill_date: '2026-10-06', amount: 96000 }),
      bill({ bill_no: 'PB-1', bill_date: '2025-08-12', branch_name: null, branch_code: 'pop_up_east', branch_id: null, amount: 2480000 }),
      bill({ bill_no: 'PB-SETTLED', bill_date: '2026-10-03', amount: 500 }),
      bill({ bill_no: 'PB-3', bill_date: '2026-10-05', source_state: 'void' }),
      bill({ bill_no: 'PB-4', bill_date: '2026-10-04', source_state: 'missing' }),
    ])
    mockPaymentAmounts.mockResolvedValue([{
      id: 'settled-payment', esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-SETTLED', amount: 500, cash_in_date: '2026-10-02',
    }])
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: 'All' }))
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    const selectAll = within(table).getByRole('checkbox', { name: 'Select all payable bills' })
    const open = within(table).getByRole('checkbox', { name: 'Select bill PB-2' })
    const partial = within(table).getByRole('checkbox', { name: 'Select bill PB-1' })
    const settled = within(table).getByRole('checkbox', { name: 'Select bill PB-SETTLED' })
    const voided = within(table).getByRole('checkbox', { name: 'Select bill PB-3' })
    const missing = within(table).getByRole('checkbox', { name: 'Select bill PB-4' })

    expect(settled).toBeDisabled()
    expect(voided).toBeDisabled()
    expect(missing).toBeDisabled()
    fireEvent.click(selectAll)

    expect(open).toBeChecked()
    expect(partial).toBeChecked()
    expect(screen.getByRole('region', { name: '2 selected · Rp 2.576.000 total' })).toBeInTheDocument()
  })

  it('keeps per-card selection operable on phone', async () => {
    setViewport(false)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    const checkbox = within(table).getByRole('checkbox', { name: 'Select bill PB-2' })
    expect(checkbox).toBeEnabled()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(screen.getByRole('region', { name: '1 selected · Rp 96.000 total' })).toBeInTheDocument()
  })

  it('offers select-all in the phone header and selects every payable bill', async () => {
    setViewport(false)
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: 'All' }))
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    const viewToolbar = document.querySelector('.pending-bills-view-toolbar')
    expect(viewToolbar).not.toBeNull()
    const selectAll = within(viewToolbar as HTMLElement).getByRole('checkbox', { name: 'Select all payable bills' })

    expect(selectAll).toBeEnabled()
    fireEvent.click(selectAll)

    expect(selectAll).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-1' })).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-2' })).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-3' })).toBeDisabled()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-4' })).toBeDisabled()
    expect(screen.getByRole('region', { name: '2 selected · Rp 2.576.000 total' })).toBeInTheDocument()
  })

  it('keeps the selected bills and names the server failure for retry', async () => {
    mockPaySeveral.mockRejectedValue(new Error('Pending bill PB-2 is already settled.'))
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-1' }))
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    const form = await screen.findByRole('form', { name: 'Record payment' })
    fireEvent.change(within(form).getByLabelText('Cash-in date'), { target: { value: '06/10/2026' } })
    fireEvent.change(within(form).getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record payment' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent('Pending bill PB-2 is already settled.')
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-1' })).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-2' })).toBeChecked()
    expect(screen.getByRole('region', { name: '2 selected · Rp 2.576.000 total' })).toBeInTheDocument()
  })

  it('refreshes changed balances without losing the selection or payment draft', async () => {
    mockList.mockResolvedValueOnce([
      bill({ bill_no: 'PB-2', bill_date: '2026-10-06', amount: 96000 }),
      bill({ bill_no: 'PB-1', bill_date: '2025-08-12', branch_name: null, branch_code: 'pop_up_east', branch_id: null, amount: 2480000 }),
    ]).mockResolvedValue([
      bill({ bill_no: 'PB-2', bill_date: '2026-10-06', amount: 97000 }),
      bill({ bill_no: 'PB-1', bill_date: '2025-08-12', branch_name: null, branch_code: 'pop_up_east', branch_id: null, amount: 2480000 }),
    ])
    mockPaySeveral.mockRejectedValue(new PendingBillBalanceChangedError())
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-1' }))
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    const form = await screen.findByRole('form', { name: 'Record payment' })
    const date = within(form).getByLabelText('Cash-in date')
    fireEvent.change(date, { target: { value: '06/10/2026' } })
    fireEvent.change(within(form).getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record payment' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent('Balances changed. Review the selected bills and try again.')
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    expect(within(form).getByText('Rp 97.000')).toBeInTheDocument()
    expect(within(form).getByLabelText('Cash-in date')).toHaveValue('6 Oct 2026')
    expect(within(form).getByText('receipt.pdf')).toBeInTheDocument()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-1' })).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'Select bill PB-2' })).toBeChecked()
  })

  it('settles every selected row, clears selection and restores focus to a bill row', async () => {
    mockList.mockResolvedValue([
      bill({ bill_no: 'PB-2', bill_date: '2026-10-06', amount: 96000.5 }),
      bill({ bill_no: 'PB-1', bill_date: '2025-08-12', branch_name: null, branch_code: 'pop_up_east', branch_id: null, amount: 2480000 }),
    ])
    const batchResults: PaidPendingBill[] = [
      { billId: '["GKI","pop_up_east","PB-1"]', paymentId: 'batch-payment-1', esbCode: 'GKI', branchCode: 'pop_up_east', billNo: 'PB-1', amount: 2480000, replayed: false },
      { billId: '["GKI","rumah_rames","PB-2"]', paymentId: 'batch-payment-2', esbCode: 'GKI', branchCode: 'rumah_rames', billNo: 'PB-2', amount: 96000.5, replayed: false },
    ]
    mockPaySeveral.mockResolvedValue(batchResults)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select all payable bills' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    const form = await screen.findByRole('form', { name: 'Record payment' })
    expect(within(form).queryByRole('spinbutton', { name: 'Amount' })).toBeNull()
    expect(within(form).getByText('Rp 2.576.000,50')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Cash-in date'), { target: { value: '06/10/2026' } })
    fireEvent.change(within(form).getByLabelText(/^Proof/), {
      target: { files: [new File(['proof'], 'receipt.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByRole('status')).toHaveTextContent('2 bills settled · Rp 2.576.000,50 total.')
    expect(mockPaySeveral).toHaveBeenCalledWith(expect.objectContaining({
      billIds: ['["GKI","pop_up_east","PB-1"]', '["GKI","rumah_rames","PB-2"]'],
      expectedAmountsCents: [248000000, 9600050],
      cashInDate: '2026-10-06',
      proofPath: 'org-1/proof.pdf',
    }))
    expect(screen.getByRole('tab', { name: 'Paid' })).toHaveAttribute('aria-selected', 'true')
    const updatedRows = within(table).getAllByRole('row').slice(1)
    expect(updatedRows).toHaveLength(2)
    for (const row of updatedRows) {
      expect(within(row).getByText('Settled')).toBeInTheDocument()
      expect(within(row).getByText('Rp 0')).toBeInTheDocument()
    }
    expect(screen.queryByRole('region', { name: /selected ·/ })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open bill PB-1' })).toHaveFocus())
  })
})

describe('AC-1135: recording updates the selected row and confirms count plus total', () => {
  it('moves a settled bill to Paid and leaves its record panel open', async () => {
    const persisted: PendingBillPaymentAmountRow[] = [{
      id: 'payment-new', esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-2', amount: 96000, cash_in_date: '2026-10-06',
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
    expect(screen.getByRole('tab', { name: 'Paid' })).toHaveAttribute('aria-selected', 'true')
    const updatedRow = within(table).getByRole('button', { name: 'Open bill PB-2' }).closest('tr')
    expect(updatedRow).toBeInTheDocument()
    expect(updatedRow).toHaveTextContent('Settled')
    expect(updatedRow).toHaveTextContent('Rp 0')
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

describe('the pending bill record panel at every width', () => {
  it.each([
    ['en', 'Pay 2 bills'],
    ['id', 'Bayar 2 tagihan'],
  ] as const)('titles a phone multi-bill panel with the localized selected count (%s)', async (locale, title) => {
    setViewport(false)
    renderPage(['finance'], locale)
    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getByRole('checkbox', { name: locale === 'en' ? 'Select bill PB-1' : 'Pilih tagihan PB-1' }))
    fireEvent.click(within(table).getByRole('checkbox', { name: locale === 'en' ? 'Select bill PB-2' : 'Pilih tagihan PB-2' }))
    fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Record payment' : 'Catat pembayaran' }))

    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(title, { selector: '.record-panel-title' })).toBeInTheDocument()
  })

  it('names the bill in the full-screen phone panel title', async () => {
    setViewport(false)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open bill PB-2' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    expect(within(panel).getByText('Pending bill PB-2', { selector: '.record-panel-title' })).toBeInTheDocument()
  })

  it('keeps the multi-payment date pristine through the real RecordViewer panel open', async () => {
    setViewport(false)
    renderPage(['finance'], 'en', true)
    const table = await screen.findByRole('table', { name: 'Pending bills, oldest first' })
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-1' }))
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select bill PB-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    const panel = await screen.findByRole('dialog')
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    const date = within(form).getByLabelText('Cash-in date')
    expect(form).toHaveFocus()
    expect(date).not.toHaveAttribute('aria-invalid', 'true')
    expect(within(form).queryByRole('alert')).toBeNull()
    expect(date).not.toHaveFocus()

    fireEvent.focus(date)
    fireEvent.blur(date)
    expect(await within(form).findByRole('alert')).toHaveTextContent('Enter a date.')
    expect(date).toHaveAttribute('aria-invalid', 'true')
  })

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

  it('guards Escape on the wide desktop panel until the draft is discarded', async () => {
    setViewport(true, true)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open bill PB-2' }))
    const panel = await screen.findByLabelText('Pending bill PB-2')
    fireEvent.click(within(panel).getByRole('button', { name: 'Record payment' }))
    const form = within(panel).getByRole('form', { name: 'Record payment' })
    const amount = within(form).getByLabelText('Amount')
    fireEvent.change(amount, { target: { value: '10' } })
    fireEvent.keyDown(amount, { key: 'Escape' })

    const discard = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(panel).toBeInTheDocument()
    expect(amount).toHaveValue('10')
    fireEvent.click(within(discard).getByRole('button', { name: 'Stay on this page' }))
    expect(within(panel).getByRole('form', { name: 'Record payment' })).toBeInTheDocument()

    fireEvent.keyDown(amount, { key: 'Escape' })
    const confirm = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByLabelText('Pending bill PB-2')).toBeNull())
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

  it('returns a reversed bill from Paid to Open and restores focus to its panel action', async () => {
    mockList.mockResolvedValue([bill({ bill_no: 'PB-2', amount: 1000 })])
    const paid: PendingBillPaymentAmountRow[] = [{ id: 'payment-1', esb_code: 'GKI', branch_code: 'rumah_rames', bill_no: 'PB-2', amount: 1000, cash_in_date: '2026-10-06' }]
    const history: PendingBillPaymentHistoryEntry[] = [{
      id: 'payment-1', esbCode: 'GKI', branchCode: 'rumah_rames', billNo: 'PB-2',
      entryKind: 'payment', amount: 1000, cashInDate: '2026-10-06', proofPath: 'org-1/proof.pdf',
      proofUrl: 'https://proof.example.test/signed', note: null, reversalOf: null, reversalReason: null,
      actorName: 'Finance Person', createdAt: '2026-10-06T03:00:00Z',
    }]
    mockPaymentAmounts.mockResolvedValue(paid)
    mockPaymentHistory.mockResolvedValue(history)
    renderPage()
    fireEvent.click(await screen.findByRole('tab', { name: 'Paid' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open bill PB-2' }))
    const panel = await screen.findByRole('dialog', { name: 'Pending bill PB-2' })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Reverse payment' }))
    const form = within(panel).getByRole('form', { name: 'Reverse payment' })
    fireEvent.change(within(form).getByLabelText(/reason/i), { target: { value: 'Entered against the wrong bill' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record reversal' }))
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled())
    await waitFor(() => expect(within(panel).queryByRole('form', { name: 'Reverse payment' })).toBeNull())
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')
    const reopenedRow = within(screen.getByRole('table', { name: 'Pending bills, oldest first' }))
      .getByRole('button', { name: 'Open bill PB-2' }).closest('tr')
    expect(reopenedRow).toHaveTextContent('Open')
    expect(reopenedRow).toHaveTextContent('Rp 1.000')
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
    expect(status).toHaveClass('money-skeleton')
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
