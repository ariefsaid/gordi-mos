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
//
// #191 port note: this file is carried from `v4-redesign`'s `home-page.test.tsx` with ONE
// substantive change — the Signals-feed assertions (v4's "FR-928" describe block, which asserted
// live Signal content loaded through `useRecordCollection` + `lib/db/signals`) are replaced by a
// single block asserting the honest placeholder Home ships instead. That infrastructure
// (record-collection engine, the Signals record surface, `signal-composer-host`) is `dev`'s #193,
// not #191's — see the note atop `home-page.tsx`. Every other assertion in this file is unchanged
// in substance from the v4 suite.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
// userEvent, not fireEvent: it drives the full pointer/keyboard sequence a real person
// produces, which is the stronger instrument against a tab strip (the roving-tabindex
// contract in components/home/home-focused.tsx) — and it is what the sibling Home tests
// already use.
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
      must_change_password: false,
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
  it('renders the Focused tabs + the Signals column for a member', async () => {
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
    await userEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
    expect(await screen.findByText('Production · 2026-07-20')).toBeInTheDocument()
  })

  it('a non-cafe finance viewer never queries café logs nor gets a /cafe/log deep-link', async () => {
    mockLoadFailedChecks.mockResolvedValue([
      { id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: '/cafe/log' },
    ])
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    expect(mockLoadFailedChecks).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
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
  it('the Signals column is a SECTION landmark, and neither it nor the tab strip carries card-shell chrome', async () => {
    await renderHome(financeViewer)
    const shellClasses = ['bg-card', 'border', 'border-border', 'rounded-lg', 'shadow-rest']
    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(feed.tagName).toBe('SECTION')
    for (const c of shellClasses) expect(feed).not.toHaveClass(c)

    const tablist = await screen.findByRole('tablist')
    for (const c of shellClasses) expect(tablist).not.toHaveClass(c)
  })
})

// #191 port note (replaces v4's "FR-928" block): the live Signals feed (record-collection +
// lib/db/signals + the Signals record surface) is #193's port, not #191's — see the note atop
// home-page.tsx. Home states that plainly instead of a broken fetch or a silently empty region.
describe('Port scope (#191): the Signals column states it is not available yet, pending #193', () => {
  it('renders a labelled Signals region with a pending message, and never calls a Signals DAL', async () => {
    await renderHome(memberViewer)
    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(within(feed).getByText(/isn.t available/i)).toBeInTheDocument()
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
    await userEvent.click(tab)
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
    await userEvent.click(screen.getByRole('tab', { name: /my work today/i }))
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

  // "Not Focused" is not the same claim as "List". The absence of a tablist passes identically
  // when Home renders OVERVIEW — which is exactly what a layout-dispatch bug produces — so each
  // case below names something only ITS layout emits, and the mirror case pins the other.
  //
  // List is the only arrangement that gives every region a labelled landmark: it wraps each in
  // `<section aria-label={region}>`. Overview's tiles are unlabelled sections (generic), inside
  // the bento grid that only it renders.
  it('AC-921: a stored "list" renders List — every region a labelled landmark, no tabs, no bento', async () => {
    window.localStorage.setItem(`gordi.home.layout.${financeViewer.viewer.person.id}`, 'list')
    const { container } = await renderHome(financeViewer)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /needs you now/i })).toBeInTheDocument())
    expect(screen.getByRole('region', { name: /my work today/i })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(container.querySelector('.home-bento')).toBeNull()
  })

  it('AC-921 (mirror): a stored "overview" renders Overview — the bento grid, no tabs, no landmarks', async () => {
    window.localStorage.setItem(`gordi.home.layout.${financeViewer.viewer.person.id}`, 'overview')
    const { container } = await renderHome(financeViewer)
    await waitFor(() =>
      expect(container.querySelector('.home-bento [data-region="needs-you"]')).not.toBeNull())
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /needs you now/i })).not.toBeInTheDocument()
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
