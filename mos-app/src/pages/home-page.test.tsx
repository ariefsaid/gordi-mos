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
// The Signals-feed block (v4's "FR-928") asserts live Signal content again (#245): the port's
// placeholder stood only while Signals had no surface on this line, and #193 landed one.

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

vi.mock('../lib/db/home-attention-data', () => ({
  loadFailedChecksForViewer: vi.fn(),
  CAFE_LOG_ROUTE: '/cafe/log',
}))
import { loadFailedChecksForViewer, CAFE_LOG_ROUTE } from '@/lib/db/home-attention-data'
const mockLoadFailedChecks = vi.mocked(loadFailedChecksForViewer)

// Daily Log needs-attention read (AC-091 propagation, #302). OPS_LOG_ROUTE rides the stub
// because home-stream (real, in this file) imports it from this module.
vi.mock('../lib/db/ops-log', () => ({
  listNeedsAttentionLogEntries: vi.fn(),
  OPS_LOG_ROUTE: '/ops',
}))
import { listNeedsAttentionLogEntries } from '@/lib/db/ops-log'
const mockListOpsAttentionEntries = vi.mocked(listNeedsAttentionLogEntries)
import type { LogEntryRow } from '@/lib/db/ops-log.types'

// The shared admission authority (#246) — the test asks it the same question Home asks, so the
// expectation tracks the route, never a hand-copied role list.
import { viewerAdmittedToRoute } from '@/shell/destinations'

// Signals (#245). PARTIAL mock: `SignalFeedRows` calls `orderSignalsForFeed` from this same module,
// and a whole-module stub would replace the real ordering with undefined — the feed's ranking must
// stay the production one, only the two READS are controlled here.
vi.mock('../lib/db/signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/signals')>()),
  listReadableSignals: vi.fn(),
  listAllTeams: vi.fn(),
}))
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
const mockListSignals = vi.mocked(listReadableSignals)
const mockListAllTeams = vi.mocked(listAllTeams)

// Home mounts inside AppShell's SignalComposerHost in the app; these page tests render HomePage
// alone, so the composer door is stubbed to the one thing the feed asks of it.
vi.mock('../shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, postCount: 0 }),
}))

function signalRow(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 's-1', author_id: 'author-1', owning_team_id: 'team-1',
    occurred_at: '2026-08-05T02:00:00Z',
    body: 'Grinder is jamming on the second hopper',
    attention: 'FYI', category: 'Equipment/facility', source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-08-05T02:00:00Z',
    ...overrides,
  }
}

import { HomePage } from './home-page'

const financeViewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya@example.test',
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
// A viewer whose JOB ROLE name reads as café work. Kept as a persona, no longer as a gate: since
// #246 the job-role name decides nothing on Home (OD-WAY-51) — it is here precisely so the tests
// can prove that it makes no difference.
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
  mockListOpsAttentionEntries.mockResolvedValue([])
  mockListSignals.mockResolvedValue([])
  mockListAllTeams.mockResolvedValue([])
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

// #246 / OD-WAY-51 — the failed-checks band links to /cafe/log, so Home shows it exactly where
// THAT ROUTE admits the viewer. The assertion below is the RULE, evaluated against the shared
// admission authority per persona, not a transcript of today's output: if `/cafe/log` later gains
// a route gate, both the app and this test follow it without an edit. The previous form asserted
// "a Kitchen Lead sees it, a finance viewer doesn't", which re-encoded the job-role-NAME regex the
// ruling removed — measured against the real roster, that regex left 5 of 10 job roles matching no
// module at all, so viewers the route fully admitted were shown nothing.
describe('Issue 246 / OD-WAY-51: Home\'s failed-checks band agrees with what /cafe/log admits', () => {
  const failedCheck = { id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: CAFE_LOG_ROUTE }

  // Personas chosen to span the space the regex used to split: a job-role name that matched it, a
  // viewer with NO job role at all (the 5-of-10 case), and access-role tiers above and below.
  const personas: [string, AuthState][] = [
    ['a viewer with a café-sounding job role', cafeViewer],
    ['a finance viewer with no job role', financeViewer],
    ['a plain member with no job role', memberViewer],
    ['an ops lead', { ...financeViewer, viewer: { ...financeViewer.viewer, accessRoles: ['ops_lead'] } }],
  ]

  const accessRolesOf = (auth: AuthState) => (auth.status === 'authenticated' ? auth.viewer.accessRoles : [])

  for (const [label, viewer] of personas) {
    it(`${label}: the band is present iff the route admits them`, async () => {
      const admitted = viewerAdmittedToRoute(CAFE_LOG_ROUTE, accessRolesOf(viewer))
      mockLoadFailedChecks.mockResolvedValue([failedCheck])
      await renderHome(viewer)
      await screen.findByRole('tablist')

      expect(mockLoadFailedChecks.mock.calls.length > 0, 'queried the café-log DAL').toBe(admitted)
      await userEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
      expect(screen.queryByText('Production · 2026-07-20') != null, 'rendered the reject').toBe(admitted)
    })
  }

  it('the job-role NAME plays no part: same access roles, opposite job-role names, same band', async () => {
    // The regex's whole mechanism was the role NAME string. Two viewers who differ only there must
    // now be indistinguishable to Home — this is the assertion `viewerSeesCafe` could not pass.
    const withRole = (name: string): AuthState => ({
      ...memberViewer,
      viewer: {
        ...memberViewer.viewer,
        roles: [{
          id: '30000000-0000-0000-0000-000000000002',
          org_id: '10000000-0000-0000-0000-000000000001',
          business_unit_id: '20000000-0000-0000-0000-000000000014',
          name,
          reports_to_role_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }],
      },
    })
    const seen: boolean[] = []
    for (const name of ['Barista', 'People & Culture Officer']) {
      vi.clearAllMocks()
      mockListTasks.mockResolvedValue([])
      mockGetBUs.mockResolvedValue([])
      mockGetPeople.mockResolvedValue([])
      mockListNotifications.mockResolvedValue([])
      mockLoadFailedChecks.mockResolvedValue([failedCheck])
      mockListSignals.mockResolvedValue([])
      mockListAllTeams.mockResolvedValue([])
      const { unmount } = await renderHome(withRole(name))
      await screen.findByRole('tablist')
      await userEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
      seen.push(screen.queryByText('Production · 2026-07-20') != null)
      unmount()
    }
    expect(seen[0]).toBe(seen[1])
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

// #245 (restores v4's "FR-928" block): the Signals column is the live feed. It shipped as an
// honest "not available yet" placeholder while Signals had no surface on this line; #193 landed
// the DAL and /work/signals, so Home reads real Signals and the placeholder is gone.
describe('Issue 245 / FR-928: the Signals column renders real Signals, with an honest failure state', () => {
  it('renders the viewer\'s readable Signals in the column, with the author and Team resolved', async () => {
    mockListSignals.mockResolvedValue([signalRow()])
    mockListAllTeams.mockResolvedValue([
      { id: 'team-1', name: 'Bar Kemang', business_unit_id: 'bu-cafe', site_id: null, is_primary: false },
    ])
    mockGetPeople.mockResolvedValue([{ id: 'author-1', full_name: 'Riri Barista' }])

    await renderHome(memberViewer)
    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(within(feed).getByText(/grinder is jamming on the second hopper/i)).toBeInTheDocument()
    await waitFor(() => expect(within(feed).getByText('Riri Barista')).toBeInTheDocument())
    expect(within(feed).getByText('Bar Kemang')).toBeInTheDocument()
    // The placeholder is retired, not merely hidden behind data.
    expect(screen.queryByText(/isn.t available/i)).toBeNull()
  })

  it('DIV-G5: a failed Signals read shows the error + a working Retry — never "No Signals yet"', async () => {
    mockListSignals.mockRejectedValue(new Error('offline'))
    await renderHome(memberViewer)
    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(within(feed).getByText(/couldn't load signals/i)).toBeInTheDocument()
    expect(within(feed).queryByText(/no signals yet/i)).toBeNull()

    mockListSignals.mockResolvedValue([signalRow()])
    const callsBefore = mockListSignals.mock.calls.length
    await act(async () => {
      within(feed).getByRole('button', { name: /retry/i }).click()
      await Promise.resolve(); await Promise.resolve()
    })
    expect(mockListSignals.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() =>
      expect(screen.getByText(/grinder is jamming on the second hopper/i)).toBeInTheDocument())
  })

  it('states no Signals count anywhere — a number beside an unfinished read would be a guess (DIV-G5)', async () => {
    // The header tally is built from the four REGION counts only; Signals is a column, not a
    // region, so wiring it must not have invented a fifth number for it to sum.
    let resolveSignals!: (rows: SignalRow[]) => void
    mockListSignals.mockReturnValue(new Promise((resolve) => { resolveSignals = resolve }))
    mockListTasks.mockResolvedValue([])
    await renderHome(memberViewer)
    await screen.findByRole('tablist')

    // Tasks/mentions/failed-checks all resolved, so the header states its tally while Signals is
    // still in flight — proof the feed contributes no count that could be wrong.
    expect(await screen.findByText('0 handled · 0 left')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /signals/i })).toBeNull()

    await act(async () => {
      resolveSignals([])
      await Promise.resolve(); await Promise.resolve()
    })
    const feed = await screen.findByRole('region', { name: 'Signals' })
    expect(within(feed).getByText(/no signals yet/i)).toBeInTheDocument()
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

// ── AC-091 propagation, restored (#302) ─────────────────────────────────────────────────────
// The criterion: an open needs-attention Daily Log entry produces a signal where the person
// looks first — Home's needs-you region — and archiving it (archived_at, excluded by the read)
// clears that signal. The /ops half of the journey stays owned by e2e/ops-log-needs-attention;
// this test owns the propagation half. The DAL's query contract (incl. the archived exclusion)
// is owned by lib/db/ops-log.test.ts.
describe('AC-091 (restored, #302): an open needs-attention Daily Log entry surfaces in Needs-you — archiving clears it', () => {
  const openFlag: LogEntryRow = {
    id: 'ol-1', org_id: 'org-1', business_unit_id: 'bu-cafe', origin: 'manual',
    event_type: 'qc', title: 'Chiller down — stock at risk', detail: null,
    occurred_at: '2026-08-10T02:00:00Z', needs_attention: true, linked_task_id: null,
    archived_at: null, created_by: 'p-flagger',
    created_at: '2026-08-10T02:00:00Z', updated_at: '2026-08-10T02:00:00Z',
  }

  it('renders the flagged entry on the default tab (row → /ops, "Needs attention", flagger + BU); the post-archive read clears it to all-clear', async () => {
    mockListOpsAttentionEntries.mockResolvedValue([openFlag])
    mockGetBUs.mockResolvedValue([{ id: 'bu-cafe', name: 'Café' }])
    mockGetPeople.mockResolvedValue([{ id: 'p-flagger', full_name: 'Riri Barista' }])

    const { unmount } = await renderHome(memberViewer)
    const row = await screen.findByText('Chiller down — stock at risk')
    const link = row.closest('a')!
    expect(link.getAttribute('href')).toBe('/ops')
    expect(within(link).getByText('Needs attention')).toBeInTheDocument()
    await waitFor(() => expect(within(link).getByText('Riri Barista')).toBeInTheDocument())
    expect(within(link).getByText('Café')).toBeInTheDocument()
    // A plain member reads the org-visible set — the flag has no per-person assignee (FR-061).
    expect(mockListOpsAttentionEntries).toHaveBeenCalled()
    // The tab carries the true count (DIV-G5): 1, not an em-dash.
    expect(screen.getByRole('tab', { name: /needs you now/i }).textContent).toMatch(/1/)
    unmount()

    // The CLEAR half: archive sets archived_at → the read excludes it → no signal, all-clear.
    mockListOpsAttentionEntries.mockResolvedValue([])
    await renderHome(memberViewer)
    await waitFor(() => expect(screen.getByText(/all caught up/i)).toBeInTheDocument())
    expect(screen.queryByText('Chiller down — stock at risk')).toBeNull()
  })

  it('DIV-G5: a failed ops read shows the region error + a working Retry — never an all-clear', async () => {
    mockListOpsAttentionEntries.mockRejectedValue(new Error('offline'))
    await renderHome(memberViewer)
    await screen.findByRole('tablist')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this list. Refresh to try again."))

    mockListOpsAttentionEntries.mockResolvedValue([])
    const callsBefore = mockListOpsAttentionEntries.mock.calls.length
    await act(async () => {
      screen.getByRole('button', { name: /retry/i }).click()
      await Promise.resolve(); await Promise.resolve()
    })
    expect(mockListOpsAttentionEntries.mock.calls.length).toBe(callsBefore + 1)
  })
})
