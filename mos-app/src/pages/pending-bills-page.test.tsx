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
// Money is ship-gated in today's builds; these tests are about the page and its role gate.
vi.mock('@/lib/ship-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ship-gate')>()),
  isShipGated: () => false,
}))
vi.mock('@/auth/use-auth')

import { latestPendingBillSnapshot, listPendingBills, type PendingBillRow } from '@/lib/db/reporting-pending-bills'
import { useAuth } from '@/auth/use-auth'
import { RequireAccessRole } from '@/auth/require-access-role'
import { I18nProvider } from '@/i18n/I18nProvider'
import { PendingBillsPage } from './pending-bills-page'

const mockList = vi.mocked(listPendingBills)
const mockSnapshot = vi.mocked(latestPendingBillSnapshot)
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

  it('names the sideways-scrolling table box and lets the keyboard reach it', async () => {
    renderPage()
    const box = await screen.findByRole('region', { name: 'Pending bills table, scrolls sideways' })
    expect(box).toHaveAttribute('tabindex', '0')
    expect(within(box).getByRole('table')).toBeInTheDocument()
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
  it('shows one card per bill: who owes and amount, then date, branch and bill no., then age, state and balance', async () => {
    setViewport(false)
    renderPage()
    await screen.findByText('Copied from ESB Tue 6 Oct, 02:05 WIB')
    expect(screen.queryByRole('table')).toBeNull()
    const cards = document.querySelectorAll('.pending-bill-card')
    expect(cards).toHaveLength(4)
    const oldest = within(cards[0] as HTMLElement)
    expect(oldest.getByText('Meja 4')).toBeInTheDocument()
    expect(oldest.getAllByText('Rp 2.480.000')).toHaveLength(2)
    expect(oldest.getByText('pop_up_east')).toBeInTheDocument()
    expect(oldest.getByText('PB-1')).toBeInTheDocument()
    expect(oldest.getByText('420 days')).toBeInTheDocument()
    expect(oldest.getByText('Open')).toBeInTheDocument()
    expect(oldest.getByText('Meja 4').closest('.pending-bill-card__title')).not.toHaveClass('pending-bill-card__title--none')
  })

  it('keeps the card title muted when no one is named on the bill', async () => {
    setViewport(false)
    renderPage()
    const placeholder = await screen.findByText('Not written on the bill')
    expect(placeholder.closest('.pending-bill-card__title')).toHaveClass('pending-bill-card__title--none')
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
