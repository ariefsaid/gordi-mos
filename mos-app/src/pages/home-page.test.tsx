// HomePage tests cover the daily brief's data contract, access gates and live supporting feed.
// Presentation-specific tests live beside HomeDailyBrief; the retired Focused/Overview/List
// arrangement tests were removed with those inactive modules.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import type { RolesRow } from '@/lib/database.types'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomePage } from './home-page'
import { HomeObjectivesDoor } from '@/components/home/home-objectives-door'
import { viewerAdmittedToRoute } from '@/shell/destinations'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// Finance reporting stays on /dashboard; Home must never start these reads.
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

vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getRoles: vi.fn(),
}))
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

// Signals (#245). Keep the module's real ordering helper while controlling only the reads.
vi.mock('../lib/db/signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/signals')>()),
  listReadableSignals: vi.fn(),
  listAllTeams: vi.fn(),
}))
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
const mockListSignals = vi.mocked(listReadableSignals)
const mockListAllTeams = vi.mocked(listAllTeams)

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

// The role name is deliberately irrelevant to the café route gate. This persona proves that the
// route's shared admission authority, rather than a hand-copied name regex, controls the band.
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

const ORG_ID = '10000000-0000-0000-0000-000000000001'
const BU_FINANCE = '20000000-0000-0000-0000-000000000013'
const roleStamps = {
  org_id: ORG_ID,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const MD_ROLE: RolesRow = {
  id: '30000000-0000-0000-0000-000000000000',
  business_unit_id: null,
  name: 'Managing Director',
  reports_to_role_id: null,
  ...roleStamps,
}
const FINANCE_LEAD_ROLE: RolesRow = {
  id: '30000000-0000-0000-0000-000000000005',
  business_unit_id: BU_FINANCE,
  name: 'Finance Lead',
  reports_to_role_id: MD_ROLE.id,
  ...roleStamps,
}
const ANALYST_ROLE: RolesRow = {
  id: '30000000-0000-0000-0000-000000000099',
  business_unit_id: BU_FINANCE,
  name: 'Finance Analyst',
  reports_to_role_id: FINANCE_LEAD_ROLE.id,
  ...roleStamps,
}
const ORG_TREE = [MD_ROLE, FINANCE_LEAD_ROLE, ANALYST_ROLE].map(
  ({ id, business_unit_id, reports_to_role_id }) => ({ id, business_unit_id, reports_to_role_id }),
)

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
})

describe('Home daily operating brief', () => {
  it('renders one attention-first composition with wide My work and no layout picker or tabs', async () => {
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    const { container } = await renderHome(financeViewer)
    const brief = await screen.findByTestId('home-daily-brief')
    const main = brief.querySelector<HTMLElement>('.home-brief-main')!
    const aside = brief.querySelector<HTMLElement>('.home-brief-aside')!
    const attention = brief.querySelector<HTMLElement>('.home-brief-attention')!
    const myWork = brief.querySelector<HTMLElement>('.home-brief-my-work')!

    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('.home-bento')).toBeNull()
    expect(main).toContainElement(attention)
    expect(main).toContainElement(myWork)
    expect(aside).not.toContainElement(myWork)
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(attention.compareDocumentPosition(myWork) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps a stored legacy layout preference inert while preserving the daily brief', async () => {
    window.localStorage.setItem(
      'gordi.home.layout.' + financeViewer.viewer.person.id,
      'overview',
    )
    const { container } = await renderHome(financeViewer)
    expect(await screen.findByTestId('home-daily-brief')).toBeInTheDocument()
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('.home-bento')).toBeNull()
  })

  it('makes the next action explicit while keeping the canonical task link and state origin', async () => {
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    await renderHome(financeViewer)
    const row = await screen.findByText('Restock oat milk')
    const link = row.closest('a')!
    expect(link).toHaveAttribute('href', '/work/tasks/t-late')
    expect(within(link).getByText('Open task')).toBeInTheDocument()
  })
})

describe('AC-H01/OD-17: Home never renders routine finance KPIs', () => {
  it('keeps finance groups and finance reads off the daily brief', async () => {
    await renderHome(financeViewer)
    expect(await screen.findByTestId('home-daily-brief')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
    expect(screen.queryByText(/as of/i)).toBeNull()
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
  })
})

describe('AC-H02: a member sees a usable brief and live Signals column', () => {
  it('does not leave the member Home blank', async () => {
    await renderHome(memberViewer)
    expect(await screen.findByTestId('home-daily-brief')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /^Signals · \d+$/ })).toBeInTheDocument()
    expect(mockListRevenue).not.toHaveBeenCalled()
  })
})

describe('Issue 246 / OD-WAY-51: failed checks agree with /cafe/log admission', () => {
  const failedCheck = {
    id: 'fc1', title: 'Production · 2026-07-20', meta: 'Qty off', route: CAFE_LOG_ROUTE,
  }
  const personas: [string, AuthState][] = [
    ['a viewer with a café-sounding job role', cafeViewer],
    ['a finance viewer with no job role', financeViewer],
    ['a plain member with no job role', memberViewer],
    ['an ops lead', { ...financeViewer, viewer: { ...financeViewer.viewer, accessRoles: ['ops_lead'] } }],
  ]

  const accessRolesOf = (auth: AuthState) =>
    auth.status === 'authenticated' ? auth.viewer.accessRoles : []

  for (const [label, viewer] of personas) {
    it(label + ': the band is present iff the route admits them', async () => {
      const admitted = viewerAdmittedToRoute(CAFE_LOG_ROUTE, accessRolesOf(viewer))
      mockLoadFailedChecks.mockResolvedValue([failedCheck])
      await renderHome(viewer)
      const brief = await screen.findByTestId('home-daily-brief')

      expect(mockLoadFailedChecks.mock.calls.length > 0, 'queried the café-log DAL').toBe(admitted)
      if (admitted) {
        expect(brief.querySelector('.home-brief-lane--checks')).not.toBeNull()
      } else {
        expect(brief.querySelector('.home-brief-lane--checks')).toBeNull()
      }
      expect(screen.queryByText('Production · 2026-07-20') != null, 'rendered the reject').toBe(admitted)
    })
  }

  it('does not use the job-role name as an access gate', async () => {
    const withRole = (name: string): AuthState => ({
      ...memberViewer,
      viewer: {
        ...memberViewer.viewer,
        accessRoles: ['ops_lead'],
        roles: [{
          id: '30000000-0000-0000-0000-000000000002',
          org_id: ORG_ID,
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
      mockGetRoles.mockResolvedValue([])
      mockListNotifications.mockResolvedValue([])
      mockLoadFailedChecks.mockResolvedValue([failedCheck])
      mockListSignals.mockResolvedValue([])
      mockListAllTeams.mockResolvedValue([])
      const { unmount } = await renderHome(withRole(name))
      await screen.findByTestId('home-daily-brief')
      seen.push(screen.queryByText('Production · 2026-07-20') != null)
      unmount()
    }
    expect(seen[0]).toBe(true)
    expect(seen[1]).toBe(true)
  })
})

describe('Home retirement and chromeless composition', () => {
  it('does not carry legacy weekly-update or Daily Log cards', async () => {
    await renderHome(memberViewer)
    await screen.findByTestId('home-daily-brief')
    expect(screen.queryByRole('region', { name: 'My weekly update' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Today on the Daily Log/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /write update/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /open the daily log/i })).toBeNull()
  })

  it('keeps the daily brief and Signals free of card-shell chrome', async () => {
    await renderHome(financeViewer)
    const brief = await screen.findByTestId('home-daily-brief')
    const feed = await screen.findByRole('region', { name: /^Signals · \d+$/ })
    const shellClasses = ['bg-card', 'border', 'border-border', 'rounded-lg', 'shadow-rest']
    for (const c of shellClasses) {
      expect(brief).not.toHaveClass(c)
      expect(feed).not.toHaveClass(c)
    }
  })
})

describe('Issue 245 / FR-928: Signals stays live, concise and honest', () => {
  it('renders readable Signals with the author and Team resolved', async () => {
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
    expect(screen.queryByText(/isn.t available/i)).toBeNull()
  })

  it('surfaces a failed Signals read with a working Retry, never an empty success', async () => {
    mockListSignals.mockRejectedValue(new Error('offline'))
    await renderHome(memberViewer)
    const feed = await screen.findByRole('region', { name: /^Signals$/ })
    expect(within(feed).getByText(/couldn't load signals/i)).toBeInTheDocument()
    expect(within(feed).queryByText(/no signals yet/i)).toBeNull()

    mockListSignals.mockResolvedValue([signalRow()])
    const callsBefore = mockListSignals.mock.calls.length
    await act(async () => {
      within(feed).getByRole('button', { name: /retry/i }).click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockListSignals.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() =>
      expect(screen.getByText(/grinder is jamming on the second hopper/i)).toBeInTheDocument())
  })

  it('shows an honest zero Signals count after an empty read without adding Signals to the tally', async () => {
    let resolveSignals!: (rows: SignalRow[]) => void
    mockListSignals.mockReturnValue(new Promise((resolve) => { resolveSignals = resolve }))
    mockListTasks.mockResolvedValue([])
    await renderHome(memberViewer)
    expect(await screen.findByText('0 left')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()

    await act(async () => {
      resolveSignals([])
      await Promise.resolve()
      await Promise.resolve()
    })
    const feed = await screen.findByRole('region', { name: /^Signals · \d+$/ })
    expect(within(feed).getByText(/no signals yet/i)).toBeInTheDocument()
    expect(within(feed).getByRole('heading', { name: 'Signals · 0' })).toBeInTheDocument()
  })
})

describe('Home task regions preserve decision context and collection doors', () => {
  it('keeps overdue reason, Responsible name, BU caption and canonical task link', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(viewerId)])
    mockGetPeople.mockResolvedValue([{ id: viewerId, full_name: 'Cahya Cafe' }])
    mockGetBUs.mockResolvedValue([{ id: 'bu-cafe', name: 'Café' }])

    await renderHome(financeViewer)
    const row = await screen.findByText('Restock oat milk')
    const link = row.closest('a')!
    expect(within(link).getByText(/Overdue · \d+d/)).toBeInTheDocument()
    await waitFor(() => expect(within(link).getByText('Cahya Cafe')).toBeInTheDocument())
    expect(within(link).getByText('Café')).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/work/tasks/t-late')
  })

  it('renders My work in the wide main lane with the true count and full collection link', async () => {
    const viewerId = financeViewer.viewer.person.id
    const normalTask = {
      ...overdueTaskRow(viewerId),
      id: 't-open',
      title: 'Prep beans',
      due_date: '2099-01-01',
      status: 'In Progress' as const,
    }
    const secondTask = {
      ...normalTask,
      id: 't-open2',
      title: 'Clean grinder',
      due_date: '2099-02-01',
      status: 'Open' as const,
    }
    mockListTasks.mockResolvedValue([normalTask, secondTask])
    await renderHome(financeViewer)
    const myWork = await screen.findByRole('region', { name: /^My work today/ })
    expect(within(myWork).getByText('Prep beans')).toBeInTheDocument()
    expect(within(myWork).getByText('Clean grinder')).toBeInTheDocument()
    expect(within(myWork).getByRole('link', { name: /my open tasks · 2/i }))
      .toHaveAttribute('href', '/work/tasks?view=my-work')
  })

  it('keeps attention ahead of My work in document order', async () => {
    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([
      overdueTaskRow(viewerId),
      {
        ...overdueTaskRow(viewerId),
        id: 't-open',
        title: 'Prep beans',
        due_date: '2099-01-01',
        status: 'Open' as const,
      },
    ])
    await renderHome(financeViewer)
    const brief = await screen.findByTestId('home-daily-brief')
    const attention = brief.querySelector('.home-brief-attention')!
    const myWork = brief.querySelector('.home-brief-my-work')!
    expect(attention.compareDocumentPosition(myWork) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('DIV-G5: shared task loading/error states never become an empty all-clear', () => {
  it('shows retriable errors for the shared task projection and clears them after Retry', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    await renderHome(financeViewer)
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0]).toHaveTextContent("Couldn't load this list. Retry.")
    expect(alerts[0]).not.toHaveTextContent(/refresh/i)

    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([overdueTaskRow(viewerId)])
    const callsBefore = mockListTasks.mock.calls.length
    await act(async () => {
      screen.getAllByRole('button', { name: /retry/i })[0].click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockListTasks.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() => expect(screen.getByText('Restock oat milk')).toBeInTheDocument())
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('shows busy states for both task-derived lanes while the shared read is in flight', async () => {
    let resolveTasks!: (rows: ReturnType<typeof overdueTaskRow>[]) => void
    mockListTasks.mockReturnValue(new Promise((resolve) => { resolveTasks = resolve }))
    await renderHome(financeViewer)
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/couldn't load this list/i)).toBeNull()

    await act(async () => {
      resolveTasks([])
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0))
  })
})

describe('AC-040 / AC-052: Home identity is day-aware and does not add a mentions read', () => {
  it('renders greeting, day/date identity, role and the traceable left tally without controls', async () => {
    mockListTasks.mockResolvedValue([])
    await renderHome(ownerDirectorViewer)
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1 }))
      .toHaveTextContent(/Good (morning|afternoon|evening)/)
    expect(head.querySelector('.home-head-date')).not.toBeNull()
    expect(head.querySelector('.home-head-date')?.textContent).toBeTruthy()
    expect(within(head).getByText('Managing Director')).toBeInTheDocument()
    expect(within(head).getByText('0 left')).toBeInTheDocument()
    expect(head).toHaveClass('home-day-header', 'content-header--compact')
    expect(within(head).queryByRole('button')).toBeNull()
    expect(within(head).queryByRole('link')).toBeNull()
    expect(mockListNotifications).not.toHaveBeenCalled()
  })

  it('withholds the header tally while an independent region read fails', async () => {
    mockLoadFailedChecks.mockRejectedValue(new Error('offline'))
    mockListTasks.mockResolvedValue([overdueTaskRow(financeViewer.viewer.person.id)])
    await renderHome(financeViewer)
    const head = screen.getByTestId('page-head')
    expect(within(head).queryByText(/\d+ left/)).toBeNull()
    expect(within(head).queryByText(/handled/)).toBeNull()
  })
})

describe('AC-204 (4): the shipped Home carries the gated Objectives door', () => {
  const objectivesDoor = () => screen.getByRole('region', { name: 'Objectives' })

  beforeEach(() => {
    mockGetRoles.mockResolvedValue(ORG_TREE)
  })

  it('lets an owner-director walk to the Objectives roll-up', async () => {
    await renderHome(ownerDirectorViewer)
    const link = await screen.findByRole('link', { name: /see progress/i })
    expect(link).toHaveAttribute('href', '/work/objectives')
    expect(objectivesDoor()).toContainElement(link)
    expect(objectivesDoor()).toHaveTextContent(/Progress rolls up from each Objective/i)
    expect(objectivesDoor()).not.toHaveTextContent(/coming/i)
  })

  it('gives a function owner the same door', async () => {
    await renderHome(functionOwnerViewer)
    const link = await screen.findByRole('link', { name: /see progress/i })
    expect(link).toHaveAttribute('href', '/work/objectives')
    expect(objectivesDoor()).toContainElement(link)
  })

  it('does not hand a company-wide door to a member who steers no scope', async () => {
    await renderHome(noScopeViewer)
    await screen.findByTestId('home-daily-brief')
    await waitFor(() => expect(mockGetRoles).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /see progress/i })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Objectives' })).toBeNull()
  })
})

describe('issue 444 mechanism: the door component owns its canonical destination', () => {
  it('renders directly as a route to /work/objectives', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <HomeObjectivesDoor />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByRole('link', { name: /see progress/i }))
      .toHaveAttribute('href', '/work/objectives')
  })
})
