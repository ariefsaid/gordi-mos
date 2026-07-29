// HomePage tests — Home renders the SAME consequence-ranked regions (needs-you, failed checks,
// mentions, my work today) in whichever of the three Home layouts (Focused / Overview / List) the
// viewer has chosen (OD-V4-9). These tests exercise the default Focused layout — the arrangement
// itself (Overview/List, region parity, primitive uniqueness) is covered by
// `components/home/home-layout-parity.test.tsx` and `components/home/guard-home-layout.css.test.ts`.
//
// These are the SAME goal-oracles the earlier single-stream Home had (no finance leak, honest
// gating, decision context, true counts, attention-first ordering), re-expressed against the
// Focused tab anatomy — never bent to the app's current state. Two capabilities the region-based
// wiring dropped (found as a follow-up defect, not a deliberate retirement) are restored below:
// region-level loading/error surfacing (DIV-G5 — a failed/still-loading read must never render as
// an indistinguishable empty region) and the "My open tasks · N ->" drill-through link.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react'
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

// Signals feed — SignalFeedSection's own DAL, mocked so the Home tests stay isolated.
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
// A cafe-affiliated viewer: a plain member whose JOB ROLE name matches the Café module workMatch —
// the honest ceiling gating the failed-checks (/cafe/log) band (SEC-1 route hygiene).
const cafeViewer: AuthState = {
  ...financeViewer,
  viewer: {
    ...financeViewer.viewer,
    accessRoles: ['member'],
    roles: [{
      id: '30000000-0000-0000-0000-000000000002',
      org_id: '10000000-0000-0000-0000-000000000001',
      business_unit_id: '20000000-0000-0000-0000-000000000014',
      name: 'Kitchen Lead',
      reports_to_role_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }],
  },
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
  it('renders the Focused layout, no finance groups, no snapshot line, no finance query', async () => {
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
    expect(screen.queryByText(/as of/i)).toBeNull()
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
  })
})

describe('AC-H02/OD-17: a member-only viewer sees the stream (never blank)', () => {
  it('renders the Focused tabs + the Signals feed for a member', async () => {
    await renderHome(memberViewer)
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Signals' })).toBeInTheDocument()
    expect(mockListRevenue).not.toHaveBeenCalled()
  })
})

describe('SEC-1 route hygiene (FLAG-B/G2) — the failed-checks /cafe/log band is gated to cafe viewers', () => {
  it('a cafe-affiliated viewer sees their failed checks (the DAL is queried, the item renders on its tab)', async () => {
    mockLoadFailedChecks.mockResolvedValue([
      { id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: '/cafe/log' },
    ])
    await renderHome(cafeViewer)
    await screen.findByRole('tablist')
    expect(mockLoadFailedChecks).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
    expect(await screen.findByText('Production · 2026-07-20')).toBeInTheDocument()
  })

  it('a non-cafe finance viewer never queries café logs nor gets a /cafe/log deep-link', async () => {
    mockLoadFailedChecks.mockResolvedValue([
      { id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: '/cafe/log' },
    ])
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    expect(mockLoadFailedChecks).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
    expect(screen.queryByText('Production · 2026-07-20')).toBeNull()
  })
})

describe('F-C / OD-REDESIGN-64 — no legacy dead-link cards on Home', () => {
  it('member Home hides the weekly-update + Daily Log cards entirely', async () => {
    await renderHome(memberViewer)
    await screen.findByRole('tablist')
    expect(screen.queryByRole('region', { name: 'My weekly update' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Today on the Daily Log/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /write update/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /open the daily log/i })).toBeNull()
  })
})

describe('OD-REDESIGN-82: Home is chromeless — no card-shell chrome on the layout wrappers', () => {
  it('the Signals feed is a SECTION landmark, and neither it nor the tab strip carries card-shell chrome', async () => {
    await renderHome(financeViewer)
    const shellClasses = ['bg-card', 'border', 'border-border', 'rounded-lg', 'shadow-rest']
    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(feed.tagName).toBe('SECTION')
    for (const c of shellClasses) expect(feed).not.toHaveClass(c)

    const tablist = await screen.findByRole('tablist')
    for (const c of shellClasses) expect(tablist).not.toHaveClass(c)
  })
})

describe('FR-928 (home-layout-preference) — Signals render in the feed only, never inside a work-region tab', () => {
  // Supersedes the retired OD-REDESIGN-84.1 attention/FYI split: that split existed only to give
  // attention-worthy Signals a home inside the now-retired single-stream HomeStream. FR-928 makes
  // the Signals feed the ONE standing column in every layout — every Signal renders there, severity
  // included, and none of them sit inside a work region.
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
    await screen.findByRole('tablist')
    // The descriptor's load signature — a second bespoke Home loader would call listReadableSignals({}).
    expect(mockListReadableSignals).toHaveBeenCalledWith({ includeRetracted: true })
    expect(mockListReadableSignals).toHaveBeenCalledTimes(1)
  })

  it('an Urgent Signal and a FYI Signal both render in the Signals feed, and only there', async () => {
    mockListReadableSignals.mockResolvedValue([
      sig({ id: 'urg', body: 'Freezer alarm went off', attention: 'Urgent' }),
      sig({ id: 'fyi', body: 'New oat-milk brand in stock', attention: 'FYI' }),
    ])
    await renderHome(memberViewer)

    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(await within(feed).findByText('Freezer alarm went off')).toBeInTheDocument()
    expect(within(feed).getByText('New oat-milk brand in stock')).toBeInTheDocument()
    // Exactly one instance of each in the whole document — the feed, never a work-region tab.
    expect(screen.getAllByText('Freezer alarm went off')).toHaveLength(1)
    expect(screen.getAllByText('New oat-milk brand in stock')).toHaveLength(1)
  })
})

describe('Decision context — an overdue task row carries its reason chip + PIC + owning-BU caption (Luna J01/J02)', () => {
  it('ranks the overdue task on the default Focused tab with "Overdue · Nd", the Responsible name, and the BU caption', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(viewerId)])
    mockGetPeople.mockResolvedValue([{ id: viewerId, full_name: 'Cahya Cafe' }])
    mockGetBUs.mockResolvedValue([{ id: 'bu-cafe', name: 'Café' }])

    await renderHome(financeViewer)
    const row = await screen.findByText('Restock oat milk')
    const link = row.closest('a')!
    // Reason chip makes the ranking legible ("Overdue · <days>d") — the beat-E7 improvement.
    expect(within(link).getByText(/Overdue · \d+d/)).toBeInTheDocument()
    await waitFor(() => expect(within(link).getByText('Cahya Cafe')).toBeInTheDocument())
    expect(within(link).getByText('Café')).toBeInTheDocument()
    // Canonical record link (OD-81.2 exception).
    expect(link.getAttribute('href')).toBe('/work/tasks/t-late')
  })
})

describe('My work today region — the viewer\'s own open work, capped, on its own tab (FR-925/929)', () => {
  it('the My work today tab shows a true item count and the open task rows', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([
      { ...overdueTaskRow(viewerId), id: 't-open', title: 'Prep beans', due_date: '2099-01-01', status: 'In Progress' },
      { ...overdueTaskRow(viewerId), id: 't-open2', title: 'Clean grinder', due_date: '2099-02-01', status: 'Open' },
    ])
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    const tab = screen.getByRole('tab', { name: /my work today/i })
    expect(tab.textContent).toMatch(/2/)
    fireEvent.click(tab)
    expect(await screen.findByText('Prep beans')).toBeInTheDocument()
    expect(screen.getByText('Clean grinder')).toBeInTheDocument()
  })

  // RESTORED (see the DIV-G5 note further down): the retired single-stream HomeStream carried a
  // standalone "My open tasks · N →" drill-through link to the full My-work saved view, carrying
  // the viewer's FULL open-task count (not just the capped items rendered on this tab). The
  // region-based wiring dropped it; `HomeRegion.drillTo` + `RegionDrillLink` restore it.
  it('also shows "My open tasks · N →" carrying the FULL open-task count, linking to the My-work saved view', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([
      { ...overdueTaskRow(viewerId), id: 't-open', title: 'Prep beans', due_date: '2099-01-01', status: 'In Progress' },
      { ...overdueTaskRow(viewerId), id: 't-open2', title: 'Clean grinder', due_date: '2099-02-01', status: 'Open' },
    ])
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    fireEvent.click(screen.getByRole('tab', { name: /my work today/i }))
    const link = await screen.findByRole('link', { name: /my open tasks · 2/i })
    expect(link.getAttribute('href')).toBe('/work/tasks?view=my-work')
  })
})

describe('OD-V4-10: attention always leads my-work in the shared region order (the order toggle is retired)', () => {
  it('the tab strip orders Needs you now ahead of My work today', async () => {
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    await renderHome(financeViewer)
    const tabs = await screen.findAllByRole('tab')
    const labels = tabs.map(tab => tab.textContent ?? '')
    const needsYouIdx = labels.findIndex(l => /needs you now/i.test(l))
    const myWorkIdx = labels.findIndex(l => /my work today/i.test(l))
    expect(needsYouIdx).toBeGreaterThanOrEqual(0)
    expect(myWorkIdx).toBeGreaterThan(needsYouIdx)
  })
})

describe('OD-V4-9: Home renders the person\'s chosen layout', () => {
  it('AC-920: renders Focused when nothing is stored', async () => {
    window.localStorage.clear()
    await renderHome(financeViewer)
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })

  it('AC-921: renders the stored layout', async () => {
    window.localStorage.setItem(`gordi.home.layout.${financeViewer.viewer.person.id}`, 'list')
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
  })
})

describe('DIV-G5 (home-layout-preference.spec.md §7): a failed shared-tasks read is never an empty all-clear', () => {
  // RESTORED, re-expressed against the region/tab anatomy: the retired single-stream HomeStream's
  // "Home retry/projection convergence" test asserted a failed tasks fetch showed a retriable error
  // inside the attention group. The region-based layouts (Tasks 9-12) carried only each region's
  // resolved `items` — a still-loading/failed fetch rendered as an indistinguishable EMPTY region,
  // with no ErrorState/Retry anywhere on the page. `HomeRegion.state` + `RegionRows` restore it: the
  // default Focused tab (needs-you, which shares the tasks projection with my-work) now shows the
  // failure and a working Retry.
  it('the default tab shows an alert (never an empty tab), and Retry re-fetches the tasks projection', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this list. Refresh to try again."))

    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(viewerId)])
    const callsBefore = mockListTasks.mock.calls.length
    await act(async () => {
      screen.getByRole('button', { name: /retry/i }).click()
      await Promise.resolve(); await Promise.resolve()
    })
    expect(mockListTasks.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() => expect(screen.getByText('Restock oat milk')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the default tab shows a busy status (never an empty tab) while the tasks projection is in flight', async () => {
    let resolveTasks!: (rows: ReturnType<typeof overdueTaskRow>[]) => void
    mockListTasks.mockReturnValue(new Promise((resolve) => { resolveTasks = resolve }))
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/couldn't load this list/i)).toBeNull()

    await act(async () => {
      resolveTasks([])
      await Promise.resolve(); await Promise.resolve()
    })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})

// ── The compact day header (mockup home-priority-2026-07-28 `.hdr`) ───────────────────────────
// ONE ~70px block: greeting + role, the day's tally, a rule-driven state line, a progress track.
// It sits ABOVE the arrangements, so it must be identical in all three — and it must never state
// a total it cannot stand behind (DIV-G5, the same rule as the region counts).
describe('the Home header carries the day’s state (motivational half of the brief)', () => {
  const doneTodayTaskRow = (viewerId: string) => ({
    ...overdueTaskRow(viewerId),
    id: 't-done', title: 'Count the till', status: 'Done' as const, due_date: null,
    // "Today" by construction — no clock mocking, so this stays true on every run.
    last_activity_at: new Date().toISOString(),
  })

  it('states the tally, the rule’s state line and the handled share, from counts Home already holds', async () => {
    // 1 overdue task left (needs-you) + 1 finished today → "1 handled · 1 left", 50%,
    // and left <= 3 puts the rule in its countdown band, where the number IS the message.
    mockListTasks.mockResolvedValue([
      overdueTaskRow(financeViewer.viewer.person.id),
      doneTodayTaskRow(financeViewer.viewer.person.id),
    ])
    await renderHome(financeViewer)
    await screen.findByRole('tablist')

    expect(await screen.findByText('1 handled · 1 left')).toBeInTheDocument()
    expect(screen.getByText('1 more to go.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Handled today' }))
      .toHaveAttribute('aria-valuenow', '50')
  })

  it('is identical in all three arrangements — it sits above them', async () => {
    mockListTasks.mockResolvedValue([
      overdueTaskRow(financeViewer.viewer.person.id),
      doneTodayTaskRow(financeViewer.viewer.person.id),
    ])
    for (const layout of ['focused', 'overview', 'list'] as const) {
      window.localStorage.setItem(`gordi.home.layout.${financeViewer.viewer.person.id}`, layout)
      const { unmount } = await renderHome(financeViewer)
      const head = await screen.findByTestId('page-head')
      expect(within(head).getByText('1 handled · 1 left'), layout).toBeInTheDocument()
      expect(within(head).getByText('1 more to go.'), layout).toBeInTheDocument()
      expect(within(head).getByRole('progressbar'), layout).toHaveAttribute('aria-valuenow', '50')
      unmount()
    }
  })

  it('DIV-G5: a region whose read failed leaves the header with NO tally, not a wrong one', async () => {
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    mockListNotifications.mockRejectedValue(new Error('offline'))
    await renderHome(financeViewer)
    await screen.findByRole('tablist')

    const head = screen.getByTestId('page-head')
    expect(within(head).queryByText(/handled ·/)).toBeNull()
    expect(within(head).queryByRole('progressbar')).toBeNull()
    expect(within(head).getByText('Today’s tally isn’t in yet.')).toBeInTheDocument()
  })

  it('the header replaces the rhetorical job sentence rather than stacking on top of it', async () => {
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    // The state line answers "how is my day going" — a live question the static registry sentence
    // ("What needs my attention right now?") only asked. Both would not fit the ~70px block.
    expect(screen.queryByText(/What needs my attention/i)).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
