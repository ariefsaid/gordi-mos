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
import type { RolesRow } from '@/lib/database.types'
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

vi.mock('../lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn(), getRoles: vi.fn() }))
import { getBusinessUnits, getPeople, getRoles } from '@/lib/db/directory'
const mockGetBUs = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockGetRoles = vi.mocked(getRoles)

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
    affiliated: [],
  },
  signOut: vi.fn(),
}
const memberViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: [] },
}
// AC-074: the barista — a plain member whose primary Team is a production stream at Gordi HQ.
// Affiliation arrives as the #744 payload fact, never re-derived from a role name.
const baristaViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], affiliated: ['cafe'] },
}
const adminViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['admin'] },
}
// ── Role-chain fixtures for the AC-204 (4) block below (mirror supabase/seed.sql's shape) ──
const ORG_ID = '10000000-0000-0000-0000-000000000001'
const BU_FINANCE = '20000000-0000-0000-0000-000000000013'
const roleStamps = { org_id: ORG_ID, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
/** Top of the chain — no parent role. The owner-director. */
const MD_ROLE: RolesRow = { id: '30000000-0000-0000-0000-000000000000', business_unit_id: null, name: 'Managing Director', reports_to_role_id: null, ...roleStamps }
/** The apex of Finance: its parent is the MD, who sits in a DIFFERENT (null) BU. A function owner. */
const FINANCE_LEAD_ROLE: RolesRow = { id: '30000000-0000-0000-0000-000000000005', business_unit_id: BU_FINANCE, name: 'Finance Lead', reports_to_role_id: MD_ROLE.id, ...roleStamps }
/** Mid-chain inside Finance — reports to the lead, same BU, so NOT an apex. A plain member. */
const ANALYST_ROLE: RolesRow = { id: '30000000-0000-0000-0000-000000000099', business_unit_id: BU_FINANCE, name: 'Finance Analyst', reports_to_role_id: FINANCE_LEAD_ROLE.id, ...roleStamps }
/** What `getRoles()` returns: the org tree, projected to the seam role-scope detection reads. */
const ORG_TREE = [MD_ROLE, FINANCE_LEAD_ROLE, ANALYST_ROLE].map(
  ({ id, business_unit_id, reports_to_role_id }) => ({ id, business_unit_id, reports_to_role_id }))

// The same person, holding the given org roles — the input the AC-204 (4) block varies to move a
// viewer between "steers a scope" and "does not". Access roles stay at plain `member` throughout,
// so what the door responds to is the ROLE CHAIN, never an access grant.
const ownerDirectorViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], roles: [MD_ROLE] },
}
const functionOwnerViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], roles: [FINANCE_LEAD_ROLE] },
}
const noScopeViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: ['member'], roles: [ANALYST_ROLE] },
}
const manageCapabilityViewer: AuthState = {
  ...noScopeViewer,
  viewer: { ...noScopeViewer.viewer, accessRoles: ['ops_lead'] },
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
  mockGetRoles.mockResolvedValue([])
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

describe('AC-H02/OD-17: a member-only viewer sees the stream (never blank)', () => {
  it('renders the Focused tabs + the Signals column for a member', async () => {
    await renderHome(memberViewer)
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /^Signals · \d+$/ })).toBeInTheDocument()
    expect(mockListRevenue).not.toHaveBeenCalled()
  })
})

// AC-073 / FR-072 (OD-WAY-93 #8) — `failed-checks` exists only for Café-affiliated viewers or
// admin. The fact is the #744 payload answer (`viewer.affiliated`), read once at sign-in from the
// same predicate the write policies consult — never a route regex, never a job-role name.
// For everyone else the region is absent from every arrangement (two Focused tabs, no tile, no
// band), and Home runs no failed-checks read at all.
describe('AC-073: failed-checks renders only for Café-affiliated viewers or admin', () => {
  const failedCheck = { id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: CAFE_LOG_ROUTE }

  // Personas span the rule's two arms and its negatives: an affiliated member (the membership
  // arm), an admin (the role arm), and the unaffiliated viewers the region must never render for.
  const personas: [string, AuthState, boolean][] = [
    ['an affiliated barista (stream-Team membership)', baristaViewer, true],
    ['an admin (unaffiliated)', adminViewer, true],
    ['a finance viewer (unaffiliated)', financeViewer, false],
    ['a plain unaffiliated member', memberViewer, false],
    ['an ops_lead whose membership is org-structure only', { ...financeViewer, viewer: { ...financeViewer.viewer, accessRoles: ['ops_lead'] } }, false],
  ]

  for (const [label, viewer, admitted] of personas) {
    it(`${label}: the region is ${admitted ? 'present' : 'absent'} from every arrangement`, async () => {
      mockLoadFailedChecks.mockResolvedValue([failedCheck])
      await renderHome(viewer)
      await screen.findByRole('tablist')

      // The read itself must not run for a region that cannot render — a fetch whose answer has
      // nowhere to land is noise, and its count would leak into the day tally.
      expect(mockLoadFailedChecks.mock.calls.length > 0, 'queried the café-log DAL').toBe(admitted)
      if (admitted) {
        await userEvent.click(screen.getByRole('tab', { name: /failed checks/i }))
        expect(screen.getByText('Production · 2026-07-20')).toBeInTheDocument()
      } else {
        expect(screen.queryByRole('tab', { name: /failed checks/i })).toBeNull()
        expect(screen.queryByText('Production · 2026-07-20')).toBeNull()
        // Two tabs: needs-you and my-work — the whole surface agrees the region does not exist.
        expect(screen.getAllByRole('tab')).toHaveLength(2)
      }
    })
  }

  it('the job-role NAME plays no part: same access roles + affiliation, opposite job-role names, same result', async () => {
    // The retired gate decided by role-NAME string; two viewers who differ only there must stay
    // indistinguishable to Home. Both are unaffiliated members, so both see two tabs.
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
      seen.push(screen.queryByRole('tab', { name: /failed checks/i }) != null)
      unmount()
    }
    expect(seen[0]).toBe(seen[1])
    expect(seen[0]).toBe(false)
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
    // The header tally is built from the four REGION counts only; Signals is a column, not a
    // region, so wiring it must not have invented a fifth number for it to sum.
    let resolveSignals!: (rows: SignalRow[]) => void
    mockListSignals.mockReturnValue(new Promise((resolve) => { resolveSignals = resolve }))
    mockListTasks.mockResolvedValue([])
    await renderHome(memberViewer)
    await screen.findByRole('tablist')

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
describe('AC-204 (4): the shipped Home carries the Objectives roll-up door', () => {
  const objectivesDoor = () => screen.getByRole('region', { name: 'Objectives' })

  beforeEach(() => {
    mockGetRoles.mockResolvedValue(ORG_TREE)
  })

  it('the owner-director can walk from Home to the Objectives roll-up', async () => {
    await renderHome(ownerDirectorViewer)
    await screen.findByRole('tablist')

    const door = await screen.findByRole('region', { name: 'Objectives' })
    expect(door).toBe(objectivesDoor())
    expect(door).not.toHaveTextContent(/Progress rolls up|coming/i)
  })

  it('a function owner gets the same door', async () => {
    await renderHome(functionOwnerViewer)
    await screen.findByRole('tablist')
    expect(await screen.findByRole('region', { name: 'Objectives' })).toBe(objectivesDoor())
  })

  it('a manage-capability viewer gets the door even without a role-chain scope', async () => {
    await renderHome(manageCapabilityViewer)
    await screen.findByRole('tablist')
    expect(await screen.findByRole('region', { name: 'Objectives' })).toBeInTheDocument()
  })

  it('a member who steers no scope is handed no door', async () => {
    await renderHome(noScopeViewer)
    await screen.findByRole('tablist')
    // The read the gate rides has LANDED — so this absence is a decision, not a race. Without
    // this the test would pass just as well against a door that simply had not rendered yet.
    await waitFor(() => expect(mockGetRoles).toHaveBeenCalled())

    expect(screen.queryByRole('region', { name: 'Objectives' })).toBeNull()
  })

  it('the door rides the shared aside, so every arrangement carries it (NFR-924)', async () => {
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
