// HomePage tests — the consequence-ranked stream (owner redirect 2026-07-22: "Home = ONE
// consequence-ranked stream, be braver than E7"). Home is a single prioritised flow ranked across
// record types (overdue → due-today → blocked → failed-checks → mentions → my work today) rendered
// as one column of uniform record rows with reason chips + quiet band dividers, plus an ambient
// Signals tail. The order preference reorders the two stream GROUPS (attention / my-work).
//
// These are the SAME goal-oracles the two-region Home had, re-expressed against the stream anatomy
// (attention items visible with decision context, the order toggle reorders + persists, counts are
// true, no finance tiles, no legacy dead-link cards) — never bent to the app's current state.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// Finance reporting DAL — mocked so we can assert Home NEVER calls it (OD-REDESIGN-17: routine
// finance KPIs live on /dashboard, not Home).
vi.mock('../lib/db/reporting', () => ({
  listSalesDailyRevenue: vi.fn(),
  latestSnapshotAsOf: vi.fn(() => null),
  latestReportingDate: vi.fn(() => null),
}))
import { listSalesDailyRevenue } from '@/lib/db/reporting'
const mockListRevenue = vi.mocked(listSalesDailyRevenue)

vi.mock('../lib/db/reporting-margin', () => ({
  listSalesMarginDaily: vi.fn(),
  latestMarginSnapshotAsOf: vi.fn(() => null),
  latestMarginReportingDate: vi.fn(() => null),
}))
import { listSalesMarginDaily } from '@/lib/db/reporting-margin'
const mockListMargin = vi.mocked(listSalesMarginDaily)

vi.mock('../lib/db/tasks', () => ({ listTasks: vi.fn() }))
import { listTasks } from '@/lib/db/tasks'
const mockListTasks = vi.mocked(listTasks)

vi.mock('../lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
const mockGetBUs = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

vi.mock('../lib/db/notifications', () => ({
  listNotifications: vi.fn(),
  notificationRoute: () => null,
}))
import { listNotifications } from '@/lib/db/notifications'
const mockListNotifications = vi.mocked(listNotifications)

vi.mock('../lib/db/home-attention-data', () => ({ loadFailedChecksForViewer: vi.fn() }))
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
const mockLoadFailedChecks = vi.mocked(loadFailedChecksForViewer)

// Signal ambient tail — SignalFeedSection's own DAL, mocked so the Home tests stay isolated.
vi.mock('../lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return {
    ...actual,
    listReadableSignals: vi.fn().mockResolvedValue([]),
    correctSignal: vi.fn(),
    listAllTeams: vi.fn().mockResolvedValue([]),
  }
})
vi.mock('../shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: vi.fn(), postCount: 0 }),
}))
import { listReadableSignals } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
const mockListReadableSignals = vi.mocked(listReadableSignals)

import { HomePage } from './home-page'
import { setRegionOrder, resolveRegionOrder } from '@/lib/home-region-order'

const financeViewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya@gordi.id',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
    accessRoles: ['finance'],
  },
  signOut: vi.fn(),
}
const memberViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: [] },
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

async function renderHome(auth: AuthState = financeViewer) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(createElement(HomePage), { wrapper })
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

const STREAM = { name: /what needs you/i } as const

function overdueTaskRow(viewerId: string) {
  return {
    id: 't-late', org_id: 'org-1', title: 'Restock oat milk', business_unit_id: 'bu-cafe',
    status: 'In Progress' as const, responsible_person_id: viewerId, accountable_person_id: 'other-1',
    consulted_person_ids: [], informed_person_ids: [], description: null, due_date: '2020-01-01',
    objective_id: null, work_line_id: null, last_activity_at: '2026-06-30T00:00:00Z',
    archived_at: null, created_by: 'x', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockListTasks.mockResolvedValue([])
  mockGetBUs.mockResolvedValue([])
  mockGetPeople.mockResolvedValue([])
  mockListNotifications.mockResolvedValue([])
  mockLoadFailedChecks.mockResolvedValue([])
})

describe('AC-H01/OD-17: Home never renders the revenue/margin KPI tiles nor calls the finance DAL', () => {
  it('renders the stream, no finance groups, no snapshot line, no finance query', async () => {
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
    expect(screen.queryByText(/as of/i)).toBeNull()
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
  })
})

describe('AC-H02/OD-17: a member-only viewer sees the stream (never blank)', () => {
  it('renders the ranked stream + the ambient Signals tail for a member', async () => {
    await renderHome(memberViewer)
    expect(await screen.findByRole('region', STREAM)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Signals' })).toBeInTheDocument()
    expect(mockListRevenue).not.toHaveBeenCalled()
  })
})

describe('F-C / OD-REDESIGN-64 — no legacy dead-link cards on Home', () => {
  it('member Home hides the weekly-update + Daily Log cards entirely', async () => {
    await renderHome(memberViewer)
    await screen.findByRole('region', STREAM)
    expect(screen.queryByRole('region', { name: 'My weekly update' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Today on the Daily Log/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /write update/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /open the daily log/i })).toBeNull()
  })
})

describe('OD-REDESIGN-82: the stream + Signals tail are chromeless section landmarks with headings', () => {
  it('renders as SECTIONs with accessible headings and no card-shell chrome on the region wrappers', async () => {
    await renderHome(financeViewer)
    const shellClasses = ['bg-card', 'border', 'border-border', 'rounded-lg', 'shadow-rest']
    for (const name of [STREAM.name, 'Signals']) {
      const region = await screen.findByRole('region', { name })
      expect(region.tagName).toBe('SECTION')
      for (const c of shellClasses) expect(region).not.toHaveClass(c)
    }
  })
})

describe('OD-84.1 / Luna P0-1 — attention-worthy Signals lead the stream; only FYI stays ambient', () => {
  function sig(over: Partial<SignalRow> = {}): SignalRow {
    return {
      id: 's', author_id: 'a', owning_team_id: 'tm', occurred_at: '2026-07-16T02:00:00Z',
      body: 'A signal', attention: 'FYI', category: null, source: 'human',
      retracted_at: null, retract_reason: null, edited_at: null, created_at: '2026-07-16T02:00:00Z',
      ...over,
    }
  }

  it('loads Signals ONCE through the shared descriptor (FR-V3-013 — no second loader)', async () => {
    await renderHome(memberViewer)
    await screen.findByRole('region', STREAM)
    // The descriptor's load signature — a second bespoke Home loader would call listReadableSignals({}).
    expect(mockListReadableSignals).toHaveBeenCalledWith({ includeRetracted: true })
    expect(mockListReadableSignals).toHaveBeenCalledTimes(1)
  })

  it('an Urgent Signal ranks in the attention group (band 0); a FYI Signal stays in the ambient tail', async () => {
    mockListReadableSignals.mockResolvedValue([
      sig({ id: 'urg', body: 'Freezer alarm went off', attention: 'Urgent' }),
      sig({ id: 'fyi', body: 'New oat-milk brand in stock', attention: 'FYI' }),
    ])
    await renderHome(memberViewer)

    const attn = await screen.findByTestId('attention-group')
    // The attention-worthy Signal leads the stream, carrying its "Urgent" reason chip…
    expect(await within(attn).findByText('Freezer alarm went off')).toBeInTheDocument()
    expect(within(attn).getByText('Urgent')).toBeInTheDocument()
    // …and the FYI Signal is NOT ranked into the attention group.
    expect(within(attn).queryByText('New oat-milk brand in stock')).toBeNull()

    // The FYI Signal is the ambient Signals tail; the Urgent one is not duplicated there.
    const tail = await screen.findByRole('region', { name: 'Signals' })
    expect(within(tail).getByText('New oat-milk brand in stock')).toBeInTheDocument()
    expect(within(tail).queryByText('Freezer alarm went off')).toBeNull()
  })
})

describe('Decision context — an overdue task row carries its reason chip + PIC + owning-BU caption (Luna J01/J02)', () => {
  it('ranks the overdue task in the attention group with "Overdue · Nd", the Responsible name, and the BU caption', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(viewerId)])
    mockGetPeople.mockResolvedValue([{ id: viewerId, full_name: 'Cahya Cafe' }])
    mockGetBUs.mockResolvedValue([{ id: 'bu-cafe', name: 'Café' }])

    await renderHome(financeViewer)
    const attn = await screen.findByTestId('attention-group')
    const row = await within(attn).findByText('Restock oat milk')
    const link = row.closest('a')!
    // Reason chip makes the ranking legible ("Overdue · <days>d") — the beat-E7 improvement.
    expect(within(attn).getByText(/Overdue · \d+d/)).toBeInTheDocument()
    await waitFor(() => expect(within(link).getByText('Cahya Cafe')).toBeInTheDocument())
    expect(within(link).getByText('Café')).toBeInTheDocument()
    // Canonical record link (OD-81.2 exception).
    expect(link.getAttribute('href')).toBe('/work/tasks/t-late')
  })
})

describe('My work today band — count is true, drills to the My-work saved view', () => {
  // DELIBERATE copy change (Census R2 DO-16(b) · home F4): label states its true scope.
  it('shows "My open tasks · N →" with the viewer\'s open-task count, linking to /work/tasks?view=my-work', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([
      { ...overdueTaskRow(viewerId), id: 't-open', title: 'Prep beans', due_date: '2099-01-01', status: 'In Progress' },
      { ...overdueTaskRow(viewerId), id: 't-open2', title: 'Clean grinder', due_date: '2099-02-01', status: 'Open' },
    ])
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    const link = await screen.findByRole('link', { name: /my open tasks · 2/i })
    expect(link.getAttribute('href')).toBe('/work/tasks?view=my-work')
    // A my-work row is visible (these are not overdue → they land in the my-work band).
    expect(screen.getByText('Prep beans')).toBeInTheDocument()
  })
})

describe('AC-512: default order = attention-first', () => {
  it('renders the attention group before the my-work group when nothing is stored', async () => {
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    const attn = screen.getByTestId('attention-group')
    const mine = screen.getByTestId('my-work-group')
    expect(Boolean(attn.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })
})

describe('AC-513: personal-first reorders the groups + the header summary survives', () => {
  it('renders the my-work group first, plus a "Needs attention · N →" header summary that jumps to the attention group', async () => {
    const personId = financeViewer.viewer.person.id
    setRegionOrder(personId, 'personal-first')
    mockListTasks.mockResolvedValue([overdueTaskRow(personId)])

    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    const attn = screen.getByTestId('attention-group')
    const mine = screen.getByTestId('my-work-group')
    expect(Boolean(mine.compareDocumentPosition(attn) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)

    const summaryLink = screen.getByRole('link', { name: /needs attention · \d+/i })
    expect(summaryLink.getAttribute('href')).toBe('#attention-brief')
    expect(summaryLink).toHaveClass('home-attention-jump')
    expect(summaryLink.textContent).toMatch(/→\s*$/)
    // The anchor target exists on the attention group.
    expect(attn.id).toBe('attention-brief')
  })
})

describe('AC-514: the order preference reorders + persists', () => {
  it('reorders the groups and persists personal-first when "My items first" is chosen', async () => {
    const personId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(personId)])
    const user = userEvent.setup()
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)

    await act(async () => { await user.click(screen.getByRole('radio', { name: /my items first/i })) })

    const attn = screen.getByTestId('attention-group')
    const mine = screen.getByTestId('my-work-group')
    expect(Boolean(mine.compareDocumentPosition(attn) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(resolveRegionOrder(personId)).toBe('personal-first')
  })
})

describe('RI-1: the order control is a radiogroup, not a tablist', () => {
  it('exposes role=radiogroup/radio and never role=tab', async () => {
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /attention first/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /my items first/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

function stubMatchMedia(overrides: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      for (const [needle, value] of Object.entries(overrides)) {
        if (query.includes(needle)) { matches = value; break }
      }
      return { matches, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }
    },
  })
}

describe('RI-2: the order toggle folds behind a disclosure at ≤390px', () => {
  afterEach(() => stubMatchMedia({}))

  it('collapses the radiogroup behind a compact "View options" trigger at ≤390px', async () => {
    stubMatchMedia({ '390': true, '768': false })
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('button', { name: /view options/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('expanding the trigger reveals the radiogroup', async () => {
    stubMatchMedia({ '390': true, '768': false })
    const user = userEvent.setup()
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    await act(async () => { await user.click(screen.getByRole('button', { name: /view options/i })) })
    expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
  })

  it('renders the radiogroup inline above ≤390px (desktop unchanged)', async () => {
    stubMatchMedia({ '390': false, '768': true })
    await renderHome(financeViewer)
    await screen.findByRole('region', STREAM)
    expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view options/i })).toBeNull()
  })
})

describe('AC-515: group order is width-independent (DOM order, no CSS reflow)', () => {
  it('keeps the my-work group before the attention group at 390px and desktop, via DOM order not CSS `order`', async () => {
    const personId = financeViewer.viewer.person.id
    setRegionOrder(personId, 'personal-first')
    mockUseAuth.mockReturnValue(financeViewer)

    for (const width of [390, 1280]) {
      let utils!: ReturnType<typeof render>
      await act(async () => {
        utils = render(createElement(MemoryRouter, null, createElement(I18nProvider, null,
          createElement('div', { style: { width } }, createElement(HomePage)))))
        await Promise.resolve(); await Promise.resolve()
      })
      await waitFor(() => expect(within(utils.container).getByRole('region', STREAM)).toBeInTheDocument())

      const stream = utils.container.querySelector('.home-stream') as HTMLElement
      expect(stream.getAttribute('data-region-order')).toBe('personal-first')
      const attn = within(utils.container).getByTestId('attention-group')
      const mine = within(utils.container).getByTestId('my-work-group')
      expect(Boolean(mine.compareDocumentPosition(attn) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
      expect(attn.style.order).toBe('')
      expect(mine.style.order).toBe('')
      utils.unmount()
    }
  })
})

describe('Home retry/projection convergence: one retriable error for the shared tasks projection', () => {
  it('a failed tasks fetch shows exactly ONE error, and a single Retry re-fetches the one projection', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    await renderHome(financeViewer)
    const attn = await screen.findByTestId('attention-group')
    await waitFor(() =>
      expect(within(attn).getByText("Couldn't load this list. Refresh to try again.")).toBeInTheDocument())
    // ONE error for the whole task projection (overdue/due-today/blocked/my-work share it), never one per band.
    expect(within(attn).getAllByText("Couldn't load this list. Refresh to try again.")).toHaveLength(1)

    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(viewerId)])
    const callsBefore = mockListTasks.mock.calls.length
    await act(async () => {
      within(attn).getByRole('button', { name: /retry/i }).click()
      await Promise.resolve(); await Promise.resolve()
    })
    expect(mockListTasks.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() => expect(within(attn).getByText('Restock oat milk')).toBeInTheDocument())
    expect(within(attn).queryByText("Couldn't load this list. Refresh to try again.")).toBeNull()
  })
})
