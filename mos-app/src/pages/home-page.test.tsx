// HomePage tests — Home renders the SAME consequence-ranked regions (needs-you, failed checks,
// my work today) in whichever of the three Home layouts (Focused / Overview / List) the
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
// The real per-person arrangement store (not a stub): the AC-204 (4) block below switches
// arrangement the same way /profile does, so the door is proven on more than the default one.

import { setHomeLayout } from '@/lib/home-layout'

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

// #759: `getRoles` is dropped — the persona composition no longer walks the org role tree
// (Home now decides on `isManager` + manage capability, both already on the viewer).
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

// The two Home doors (#757) read their own DAL on mount — mocked here so a page render never
// reaches the network. Their render contracts live in the door tests; the page owns WHO mounts.
vi.mock('../lib/db/objectives', () => ({ listObjectiveProgress: vi.fn() }))
import { listObjectiveProgress } from '@/lib/db/objectives'
const mockListObjectiveProgress = vi.mocked(listObjectiveProgress)

vi.mock('../lib/db/cafe-opening', () => ({ getViewerCafeDoor: vi.fn() }))
import { getViewerCafeDoor } from '@/lib/db/cafe-opening'
const mockGetCafeDoor = vi.mocked(getViewerCafeDoor)

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
import { HomeObjectivesDoor } from '@/components/home/home-objectives-door'

// #759 (AC-080): personas moved off role-chain-scope and onto the two composition inputs
// `isManager` (derived-manager fact from the role chain — CONTEXT.md → Manager) and the manage
// capabilities. A viewer with reports OR a manage grant is a LEAD (cockpit Home); everyone else
// is a MEMBER (capture-first Home). Fixtures below carry the flags directly so no test walks the
// role tree here.

// A LEAD fixture — has reports, so the cockpit composition applies. `financeViewer` was the
// pre-#759 "any signed-in viewer" fixture; promoting it keeps the Focused tab-strip tests
// (which are the cockpit path) reading the same DOM they always have.
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
    isManager: true,
    accessRoles: ['finance'],
    affiliated: [],
  },
  signOut: vi.fn(),
}
// A MEMBER — no reports, no manage capability. The capture-first Home applies.
const memberViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: [], isManager: false },
}
// AC-084 / #759: the barista — a plain member whose primary Team is a production stream at
// Gordi HQ. Affiliation arrives as the #744 payload fact, never re-derived from a role name.
// The Café door (from #757) mounts for this persona; the composition drops failed-checks and the
// Objectives door.
const baristaViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], isManager: false, affiliated: ['cafe'] },
}
const adminViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['admin'] },
}
// AC-204 (4) block below: the personas that steer a scope get the Objectives door — under the
// #759 composition this collapses to "any lead" (has reports OR a manage capability). The
// pre-#759 fixtures walked the role chain (getRoles) to answer the same question; the
// composition now folds it into `isManager` and the manage caps, so the org-tree mock is gone.
const ownerDirectorViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], isManager: true, roles: [
    { id: '30000000-0000-0000-0000-000000000000', org_id: '10000000-0000-0000-0000-000000000001',
      business_unit_id: null, name: 'Managing Director', reports_to_role_id: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ] },
}
const functionOwnerViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], isManager: true, roles: [
    { id: '30000000-0000-0000-0000-000000000005', org_id: '10000000-0000-0000-0000-000000000001',
      business_unit_id: '20000000-0000-0000-0000-000000000013', name: 'Finance Lead',
      reports_to_role_id: '30000000-0000-0000-0000-000000000000',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ] },
}
// The negative for the Objectives door: a member (no reports, no manage cap). Uses the same
// shape as `memberViewer` — both classify as MEMBER, so the door is absent.
const noScopeViewer: AuthState = memberViewer
const manageCapabilityViewer: AuthState = {
  ...memberViewer,
  viewer: { ...memberViewer.viewer, accessRoles: ['ops_lead'] },
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
  mockListSignals.mockResolvedValue([])
  mockListAllTeams.mockResolvedValue([])
  mockListObjectiveProgress.mockResolvedValue([])
  mockGetCafeDoor.mockResolvedValue(null)
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

describe('AC-H02/OD-17: a member-only viewer sees the capture-first Home (#759 — never blank, never a cockpit)', () => {
  it('renders the Needs you now band + the Signals column for a member — and NO tab strip', async () => {
    await renderHome(memberViewer)
    // The member composition (AC-080) renders `needs-you` as a labelled BAND, not a tab.
    expect(await screen.findByRole('region', { name: /needs you now/i })).toBeInTheDocument()
    expect(screen.queryByRole('tablist'), 'member composition never shows the Focused tab strip').toBeNull()
    // Signals is a STANDING column in every composition (AC-082).
    expect(await screen.findByRole('region', { name: /^Signals · \d+$/ })).toBeInTheDocument()
    expect(mockListRevenue).not.toHaveBeenCalled()
  })
})

// AC-073 / FR-072 (OD-WAY-93 #8) — `failed-checks` renders only for viewers admitted by BOTH
// arms of the #759 composition (AC-080): a cockpit persona (lead or above) AND the /cafe/log
// route (Café-affiliated or admin). A MEMBER never carries the region, even where the route
// admits them — a member has no reports to review, and the composition drops the region on that
// arm before the tabs are ever composed. Everyone else in the cockpit arm without affiliation
// sees two tabs.
describe('AC-073 (× #759 AC-080): failed-checks renders only for a cockpit persona admitted by /cafe/log', () => {
  const failedCheck = { id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: CAFE_LOG_ROUTE }

  const cockpitAffiliated: AuthState = { ...financeViewer, viewer: { ...financeViewer.viewer, isManager: true, affiliated: ['cafe'] } }

  // Personas span the composition's two axes: composition-arm (member vs lead) and route
  // admission (unaffiliated vs café). Only the cockpit-and-admitted intersection admits the
  // region; every other case must not carry it AND must not run the DAL for it either.
  const personas: [string, AuthState, boolean][] = [
    ['a lead café-affiliated', cockpitAffiliated, true],
    ['an admin (cockpit via manage capability, route via role)', adminViewer, true],
    // A barista (MEMBER, affiliated) — the composition drops the region on the member arm even
    // though /cafe/log admits her. The Café DOOR is her capture affordance instead (AC-074/#757).
    ['a barista (member, café-affiliated)', baristaViewer, false],
    ['a lead unaffiliated', financeViewer, false],
    ['a plain unaffiliated member', memberViewer, false],
  ]

  for (const [label, viewer, admitted] of personas) {
    it(`${label}: the region is ${admitted ? 'present' : 'absent'}`, async () => {
      mockLoadFailedChecks.mockResolvedValue([failedCheck])
      await renderHome(viewer)
      if (admitted) {
        // Cockpit path: Focused tabs render, and the region has its own tab that opens to the row.
        await screen.findByRole('tablist')
        await userEvent.click(screen.getByRole('tab', { name: /café checks/i }))
        expect(screen.getByText('Production · 2026-07-20')).toBeInTheDocument()
      } else {
        // The region and its DOM must be entirely absent from the page.
        expect(screen.queryByRole('tab', { name: /café checks/i })).toBeNull()
        expect(screen.queryByRole('region', { name: /café checks/i })).toBeNull()
        expect(screen.queryByText('Production · 2026-07-20')).toBeNull()
      }
    })
  }
})

describe('F-C / OD-REDESIGN-64 — no legacy dead-link cards on Home', () => {
  it('member Home hides the weekly-update + Daily Log cards entirely', async () => {
    await renderHome(memberViewer)
    // #759: member composition renders a `needs-you` BAND, not a tab strip.
    await screen.findByRole('region', { name: /needs you now/i })
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
    const feed = await screen.findByRole('region', { name: /^Signals · \d+$/ })
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
    const feed = await screen.findByRole('region', { name: /^Signals · \d+$/ })
    expect(within(feed).getByText(/grinder is jamming on the second hopper/i)).toBeInTheDocument()
    await waitFor(() => expect(within(feed).getByText('Riri Barista')).toBeInTheDocument())
    expect(within(feed).getByText('Bar Kemang')).toBeInTheDocument()
    // The placeholder is retired, not merely hidden behind data.
    expect(screen.queryByText(/isn.t available/i)).toBeNull()
  })

  it('DIV-G5: a failed Signals read shows the error + a working Retry — never "No Signals yet"', async () => {
    mockListSignals.mockRejectedValue(new Error('offline'))
    await renderHome(memberViewer)
    const feed = await screen.findByRole('region', { name: /^Signals$/ })
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

  it('shows a zero Signals count when the read is empty (DIV-G5)', async () => {
    // The header tally is built from the region counts only; Signals is a column, not a
    // region, so wiring it must not have invented a fifth number for it to sum.
    let resolveSignals!: (rows: SignalRow[]) => void
    mockListSignals.mockReturnValue(new Promise((resolve) => { resolveSignals = resolve }))
    mockListTasks.mockResolvedValue([])
    await renderHome(memberViewer)
    // #759: a member's Home has no tab strip — the region body is a labelled BAND, which lands
    // when the composition + the region model have resolved, i.e. the moment the tasks read did.
    await screen.findByRole('region', { name: /needs you now/i })

    // Tasks/failed-checks all resolved, so the header states its tally while Signals is
    // still in flight — proof the feed contributes no count that could be wrong.
    expect(await screen.findByText('0 left')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /signals/i })).toBeNull()

    await act(async () => {
      resolveSignals([])
      await Promise.resolve(); await Promise.resolve()
    })
    const feed = await screen.findByRole('region', { name: /^Signals · \d+$/ })
    expect(within(feed).getByText(/no signals yet/i)).toBeInTheDocument()
    expect(within(feed).getByRole('heading', { name: 'Signals · 0' })).toBeInTheDocument()
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
    const tab = screen.getByRole('tab', { name: /my work/i })
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
    await userEvent.click(screen.getByRole('tab', { name: /my work/i }))
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
    const myWorkIdx = labels.findIndex(l => /my work/i.test(l))
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
    expect(screen.getByRole('region', { name: /my work/i })).toBeInTheDocument()
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
    // #711: the copy named a "Refresh" control that isn't there — the button reads "Retry".
    // DESIGN.md's state kit: an error names a cause and the action it ACTUALLY offers.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load this list. Retry.")
    expect(alert).not.toHaveTextContent(/refresh/i)

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

// AC-040 — the day header DOM holds greeting + role chip + `N left` ONLY: no rotating state
// sentence, no progressbar, no help button. The wrap half of the contract (chip to line 2 at 390,
// one line everywhere else) is pinned at the CSS layer in guard-home-day-header.css.test.ts —
// jsdom computes no layout — so here the assertion is the DOM facts that CSS leans on, plus the
// 44px floor's honest precondition: the header contains NO interactive control at all, so none
// can measure under 44px.
describe('AC-040 — the day header is greeting + role chip + N left, nothing else', () => {
  it('renders greeting, role chip and the left tally — and no control, track or slogan', async () => {
    mockListTasks.mockResolvedValue([])
    await renderHome(ownerDirectorViewer)
    await screen.findByRole('tablist')
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening)/)
    expect(within(head).getByText('Managing Director')).toBeInTheDocument()
    expect(within(head).getByText('0 left')).toBeInTheDocument()
    // The opt-in modes the one-line CSS contract keys on (guard-home-day-header.css.test.ts).
    expect(head).toHaveClass('home-day-header', 'content-header--compact')
    // No state sentence, no progress track, no help tip — and, since none of those exist, no
    // interactive control of ANY kind in the header (the 44px floor is vacuously met).
    expect(within(head).queryByText(/handled|Fresh start|Clean slate/i)).toBeNull()
    expect(within(head).queryByRole('progressbar')).toBeNull()
    expect(within(head).queryByRole('button')).toBeNull()
    expect(within(head).queryByRole('link')).toBeNull()
  })

  // DIV-G5 (the standing rule the deleted state-line tests used to carry): a failed read leaves
  // the header with NO tally — absent, never zero. run as an ADMITTED viewer (AC-073): an
  // unaffiliated one runs no failed-checks read at all, so a rejected mock could prove nothing.
  it('a region read that fails leaves the header with no tally figure at all', async () => {
    // failed-checks is the one region with its own independent read, so failing it alone must
    // still withhold the header total — a sum over the reads that happened to land is exactly the
    // figure the viewer cannot trace.
    mockLoadFailedChecks.mockRejectedValue(new Error('offline'))
    mockListTasks.mockResolvedValue([overdueTaskRow(adminViewer.viewer.person.id)])
    await renderHome(adminViewer)
    await screen.findByRole('tablist')
    const head = screen.getByTestId('page-head')
    expect(within(head).queryByText(/\d+ left/)).toBeNull()
    expect(within(head).queryByText(/handled/)).toBeNull()
  })

  it('AC-052: Home does not read notifications for a mentions band', async () => {
    await renderHome(financeViewer)
    await screen.findByRole('tablist')

    expect(mockListNotifications).not.toHaveBeenCalled()
    expect(screen.queryByRole('tab', { name: /mentions/i })).toBeNull()
    expect(screen.queryByText('Mentions')).toBeNull()
  })
})

// ── AC-204 (4): "Home's owner-cockpit section reads as intentional rather than as a surface with
// something removed." #179 cut the cascade route and took Home's progress drill with it. The
// successor door is the Objectives roll-up, and it must be on the Home people actually land on —
// the index route — not only on the dev-only stacked composition where it was first built.
//
// ── AC-204 (4): "Home's owner-cockpit section reads as intentional rather than as a surface with
// something removed." #179 cut the cascade route and took Home's progress drill with it. The
// successor door is the Objectives roll-up, and it must be on the Home people actually land on —
// the index route — not only on the dev-only stacked composition where it was first built.
//
// The oracle is the JOB, not the markup: a viewer who steers a scope (the owner-director over the
// whole company, a function owner over their business unit) can walk from Home to the roll-up; a
// member, who comes to Home for what needs them today, is not handed a company-wide door they did
// not ask for. Placeholder copy is what a removed surface leaves behind, so its ABSENCE from the
// door is asserted too.
describe('AC-204 (4) × #759 AC-080: the shipped Home carries the Objectives roll-up door only in the cockpit', () => {
  const objectivesDoor = () => screen.getByRole('region', { name: 'Objectives' })

  it('the owner-director can walk from Home to the Objectives roll-up', async () => {
    await renderHome(ownerDirectorViewer)
    await screen.findByRole('tablist')

    const door = await screen.findByRole('region', { name: 'Objectives' })
    expect(door).toBe(objectivesDoor())
    expect(door).not.toHaveTextContent(/Progress rolls up|coming/i)
  })

  it('a function owner (lead by reports) gets the same door', async () => {
    await renderHome(functionOwnerViewer)
    await screen.findByRole('tablist')
    expect(await screen.findByRole('region', { name: 'Objectives' })).toBe(objectivesDoor())
  })

  it('a manage-capability viewer gets the door even with no reports', async () => {
    // ops_lead holds `objective.manage` — the composition classifies them as LEAD on that alone.
    await renderHome(manageCapabilityViewer)
    await screen.findByRole('tablist')
    expect(await screen.findByRole('region', { name: 'Objectives' })).toBeInTheDocument()
  })

  it('a member (no reports, no manage cap) gets the CAPTURE-FIRST Home — no Objectives door, no tabs', async () => {
    await renderHome(noScopeViewer)
    // The member composition renders needs-you as a labelled BAND — the presence of that region
    // proves the composition landed, so an absent Objectives door is a decision rather than a race.
    await screen.findByRole('region', { name: /needs you now/i })
    expect(screen.queryByRole('region', { name: 'Objectives' })).toBeNull()
    expect(screen.queryByRole('tablist'), 'a member sees no tab strip either').toBeNull()
  })

  it('the door rides the shared aside for a lead, so every arrangement carries it (NFR-924)', async () => {
    setHomeLayout(financeViewer.viewer.person.id, 'list')
    await renderHome(ownerDirectorViewer)

    await screen.findByRole('region', { name: 'Objectives' })
    // List, not Focused — the arrangement really did change under it.
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})

describe('AC-074: Home mounts the Café door only for viewers admitted by the affiliation seam', () => {
  it('an unaffiliated viewer gets no Café door', async () => {
    mockGetCafeDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 1, total: 2 })
    await renderHome(financeViewer)
    await screen.findByRole('tablist')
    await waitFor(() => expect(mockGetCafeDoor).not.toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /café gordi hq/i })).toBeNull()
  })

  it('a Café-affiliated viewer gets the mounted door', async () => {
    mockGetCafeDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 1, total: 2 })
    await renderHome(baristaViewer)
    expect(await screen.findByRole('link', { name: /café gordi hq/i })).toBeInTheDocument()
  })
})

describe('issue 444 mechanism: the door component itself never learned about the gate', () => {
  it('rendered directly it still exposes its data door — hidden never quietly became deleted', async () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <HomeObjectivesDoor />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(await screen.findByRole('region', { name: 'Objectives' })).toBeInTheDocument()
  })
})

// ── #759: the persona-composed Home ─────────────────────────────────────────────────────────
// AC-080 is unit-tested on `composeHome` (home-composition.test.ts). These tests are the RTL
// integration proof — the page dispatches on the composition and the rendered Home matches the
// ticket's contract at both the member arm and the cockpit arm.

// AC-081: barista at 390 — three bands in reading order (Café door → Needs you now → Signals),
// no tabs, no Objectives door, no Failed checks region, no Mentions, at most 9 controls in
// <main>. jsdom's viewport does not truly measure at 390, so the assertions here are the DOM
// facts the CSS branch keys off (the single-column collapse below 940px lives in
// home-layouts.css and is asserted separately). Every reachable count comes from a small,
// mocked fixture so the ≤9 controls floor is pinned rather than sampled.
describe('AC-081: barista at 390 renders the capture-first Home — three bands, no cockpit chrome', () => {
  const barId = baristaViewer.viewer.person.id
  const dueToday = (id: string, title: string) => ({
    id, org_id: 'org-1', title, business_unit_id: 'bu-cafe',
    status: 'Open' as const, responsible_person_id: barId, accountable_person_id: 'other-1',
    consulted_person_ids: [], informed_person_ids: [], description: null,
    // Due DATE only — jsdom evaluates the WIB compare on the calendar date, which is what
    // dueTodayStreamItems uses.
    due_date: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10),
    objective_id: null, work_line_id: null, last_activity_at: '2026-06-30T00:00:00Z',
    archived_at: null, created_by: 'x', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
  })

  it('renders Café door + Needs you now band + Signals column, in that order, and no cockpit affordances', async () => {
    mockListTasks.mockResolvedValue([dueToday('t1', 'Rebuild the espresso hopper'), dueToday('t2', 'Restock the syrup shelf')])
    mockGetCafeDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 1, total: 2 })
    mockListSignals.mockResolvedValue([])

    await renderHome(baristaViewer)
    // The three bands, present:
    const cafeDoor = await screen.findByRole('link', { name: /café gordi hq/i })
    const needsYou = await screen.findByRole('region', { name: /needs you now/i })
    const signals = await screen.findByRole('region', { name: /^Signals · \d+$/ })

    // …and in reading order — comparePosition is a real DOM check that survives visual
    // reordering because it names the actual document order. FOLLOWING = 4.
    expect(cafeDoor.compareDocumentPosition(needsYou) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(needsYou.compareDocumentPosition(signals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // No cockpit chrome: no tab strip, no Objectives door, no Café-checks tab/region, no
    // Mentions anywhere on the page.
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Objectives' })).toBeNull()
    expect(screen.queryByRole('tab', { name: /café checks/i })).toBeNull()
    expect(screen.queryByRole('region', { name: /café checks/i })).toBeNull()
    expect(screen.queryByText(/mentions/i)).toBeNull()

    // The Share door is present (`Share a Signal`); the search input is NOT (member composition).
    expect(screen.getByRole('button', { name: /share a signal/i })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: /search signals/i })).toBeNull()

    // ≤9 controls in <main>: the interactive tally the ticket pins. Signals rows count as
    // buttons in this fixture (the row is a role=button in ambient variant), so a large signal
    // list would blow the floor — a real barista Home's signal column stays capped anyway.
    const main = document.querySelector('main')!
    const controls = main.querySelectorAll('a, button, [role="button"], [role="tab"], input, select, textarea')
    expect(controls.length, `main carried ${controls.length} controls; the barista Home must stay at 9 or fewer`).toBeLessThanOrEqual(9)
  })
})

// AC-082: barista at 1440 — the same three bands, but the layout is two columns (Café door +
// Needs you now in the work column, Signals in the aside beside them). The two-column grid is
// `.home-layout` and it collapses to single-column below 940px, so this test asserts the
// grid-scoped placement of the two work bands vs the Signals section at the DOM level (which is
// what the responsive branch keys off).
describe('AC-082: barista at 1440 keeps the same bands and the Signals column beside them', () => {
  it('the Café door and Needs you now are inside .home-layout\'s work track; Signals is its aside sibling', async () => {
    mockGetCafeDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 1, total: 2 })
    mockListSignals.mockResolvedValue([])
    const { container } = await renderHome(baristaViewer)
    const layout = container.querySelector('.home-layout')
    expect(layout, 'the standing two-column grid must be present').not.toBeNull()

    // Two grid CHILDREN — the standing shape of `.home-layout` (work + Signals). A third child
    // here would drop under the aside track, so the assertion doubles as a structural guard.
    expect(layout!.children.length).toBe(2)

    const workColumn = layout!.children[0] as HTMLElement
    // Café door + needs-you band both live inside the work column.
    expect(workColumn.contains(screen.getByRole('link', { name: /café gordi hq/i }))).toBe(true)
    expect(workColumn.contains(screen.getByRole('region', { name: /needs you now/i }))).toBe(true)

    // Signals is the aside sibling — not inside the work column.
    const signalsSection = screen.getByRole('region', { name: /^Signals · \d+$/ })
    expect(workColumn.contains(signalsSection)).toBe(false)
    expect(layout!.contains(signalsSection)).toBe(true)
  })
})

// AC-083: lead — at most three tabs `Needs you now · My work · Café checks`. The 390 no-wrap
// half of the contract is pinned at the CSS layer (guard-home-layout.css.test.ts § AC-083);
// here the assertion is the DOM facts the CSS relies on: the label set and count, in order.
describe('AC-083: lead cockpit tabs — at most three, in the ticket order', () => {
  it('a café-admitted lead sees exactly three tabs: Needs you now · My work · Café checks', async () => {
    const lead: AuthState = {
      ...financeViewer,
      viewer: { ...financeViewer.viewer, isManager: true, affiliated: ['cafe'] },
    }
    await renderHome(lead)
    const tabs = await screen.findAllByRole('tab')
    expect(tabs).toHaveLength(3)
    // Trimmed labels — the tab text includes the count, so match the region name as a prefix.
    const labels = tabs.map((t) => (t.textContent ?? '').replace(/\s*\d+\s*$/, '').trim())
    expect(labels).toEqual(['Needs you now', 'My work', 'Café checks'])
  })

  it('a lead NOT café-admitted sees two tabs: Needs you now · My work — a hidden failed-checks is a decision, not a race', async () => {
    await renderHome(financeViewer)   // isManager:true, affiliated:[] → cockpit, no café
    const tabs = await screen.findAllByRole('tab')
    expect(tabs).toHaveLength(2)
    const labels = tabs.map((t) => (t.textContent ?? '').replace(/\s*\d+\s*$/, '').trim())
    expect(labels).toEqual(['Needs you now', 'My work'])
  })
})

// AC-086: KEEP guards — the parity, layout-picker and quiet-all-clear invariants must survive
// the persona composition. This block is the smoke test that they still hold on the shipped
// page for both personas; the real proof is in the sibling guards (guard-home-layout.css.test.ts,
// home-layout-parity.test.tsx, home-region-polish.test.tsx), which the composition never touches.
describe('AC-086: KEEP guards — the persona composition never disturbs the shared invariants', () => {
  it('no horizontal overflow: no element on Home renders wider than its ancestor scroll container', async () => {
    // jsdom has no layout, so the catchable test is that no element carries an inline width that
    // would blow the container. The Focused strip's `overflow-x: auto` is asserted at the CSS
    // layer; this asserts the SHAPE the container query keys off — a single body element on
    // `<main>` above 100%. A member's Home is the harder case because its bands are the plain
    // stream-band grammar with no wide tile/tab strip absorbing overflow.
    await renderHome(baristaViewer)
    const main = document.querySelector('main')!
    for (const el of main.querySelectorAll<HTMLElement>('*')) {
      // A style="width: NNNpx" that ignores the container is what this catches; percentage or
      // grid widths flow with the container by definition.
      const w = el.style.width
      if (!w || !/px$/.test(w)) continue
      const px = parseFloat(w)
      expect(px, `an inline pixel width on ${el.tagName} would spill: ${w}`).toBeLessThanOrEqual(390)
    }
  })
})
