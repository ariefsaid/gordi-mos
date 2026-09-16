import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { DueProcessRun } from '@/lib/db/processes.types'
import type { CafeOpeningTeam, CafeViewerTeam } from '@/lib/db/cafe-opening'

vi.mock('@/lib/db/cafe-opening', () => ({
  getCafeOpeningProcessId: vi.fn(),
  resolveCafeOpeningTeamForTeam: vi.fn(),
  resolveCafeOpeningTeamForBranch: vi.fn(),
  listCafeViewerTeams: vi.fn(),
  listStartableCafeTeams: vi.fn(),
  getTodayOpeningForTeam: vi.fn(),
  startTodayOpening: vi.fn(),
  wibToday: () => '2026-07-17',
}))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({
  canStartProcessForTeam: vi.fn(),
  listPendingTasks: vi.fn(),
  resolvePendingTask: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
// DD-MVP-17: the capture surface is the root's body. This suite owns the location/door
// behavior, so the log surface itself is stubbed — its own data and behavior have their
// own suite (kitchen-log-page.test.tsx).
vi.mock('./kitchen-log-page', () => ({
  KitchenLogPage: ({ leading }: { leading?: React.ReactNode }) => (
    <div data-testid="cafe-capture-root">
      {leading}
      <div data-testid="cafe-capture-surface" />
    </div>
  ),
}))

import {
  getCafeOpeningProcessId,
  getTodayOpeningForTeam,
  listCafeViewerTeams,
  listStartableCafeTeams,
  resolveCafeOpeningTeamForBranch,
  resolveCafeOpeningTeamForTeam,
} from '@/lib/db/cafe-opening'
import { listActiveBranches } from '@/lib/db/branches'
import { canStartProcessForTeam } from '@/lib/db/processes'
import { getPeople } from '@/lib/db/directory'
import { rememberCafeOpeningTeam } from '@/lib/cafe-opening-location'
import { CafeRootPage } from './cafe-opening-page'

const mockGetCafeOpeningProcessId = vi.mocked(getCafeOpeningProcessId)
const mockGetTodayOpeningForTeam = vi.mocked(getTodayOpeningForTeam)
const mockListCafeViewerTeams = vi.mocked(listCafeViewerTeams)
const mockListStartableCafeTeams = vi.mocked(listStartableCafeTeams)
const mockResolveCafeOpeningTeamForBranch = vi.mocked(resolveCafeOpeningTeamForBranch)
const mockResolveCafeOpeningTeamForTeam = vi.mocked(resolveCafeOpeningTeamForTeam)
const mockBranches = vi.mocked(listActiveBranches)
const mockCanStartProcessForTeam = vi.mocked(canStartProcessForTeam)
const mockGetPeople = vi.mocked(getPeople)

const BRANCH_RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const BRANCH_RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const PROCESS_ID = '00000000-0000-0000-0000-00000000c001'
const TEAM_RAD = '00000000-0000-0000-0000-000000005b01'
const TEAM_RR = '00000000-0000-0000-0000-000000005b02'
const TEAM_HQ = '00000000-0000-0000-0000-000000005b03'
const OPENING_RAD: CafeOpeningTeam = { id: 'opening-rad', name: 'Radiant Operations', branchId: BRANCH_RAD.id }
const OPENING_RR: CafeOpeningTeam = { id: 'opening-rr', name: 'Rumah Rames Operations', branchId: BRANCH_RR.id }
const VIEWER_ID = '40000000-0000-0000-0000-000000000001'

const notStarted = { started: false, runId: null, rollup: null }
const started = {
  started: true,
  runId: 'run-1',
  rollup: {
    process_run_id: 'run-1', caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
    status: 'open' as const, total: 2, open: 2, in_progress: 0, blocked: 0, done: 0,
    overdue: 0, pending_unresolved: 0, completion_pct: 0,
  },
}

function viewerTeam(id: string, isPrimary = false): CafeViewerTeam {
  return { id, name: `${id} profile`, business_unit_id: 'bu-1', site_id: null, is_primary: isPrimary }
}

function dueTeam(owning_team_id: string): DueProcessRun {
  return {
    work_line_id: PROCESS_ID, process_name: 'Café Opening', owning_team_id,
    team_name: `${owning_team_id} due`, period_key: '2026-07-17', scheduled_date: '2026-07-17',
  }
}

function authState(accessRoles: string[] = ['ops_lead'], personId = VIEWER_ID): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: personId, org_id: 'org-1', user_id: `auth-${personId}`, must_change_password: false,
        full_name: 'Cahya Cafe', email: 'cahya@example.test', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: async () => {},
  }
}

function renderPage(accessRoles: string[] = ['ops_lead'], personId = VIEWER_ID) {
  return render(
    <AuthContext.Provider value={authState(accessRoles, personId)}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe']}>
          <CafeRootPage />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

function mapResolver() {
  mockResolveCafeOpeningTeamForTeam.mockImplementation(async (sourceId) => {
    if (sourceId === TEAM_RAD || sourceId === OPENING_RAD.id) return OPENING_RAD
    if (sourceId === TEAM_RR || sourceId === OPENING_RR.id) return OPENING_RR
    if (sourceId === TEAM_HQ) return OPENING_RAD
    return null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.removeItem('mos.locale')
  rememberCafeOpeningTeam(VIEWER_ID, null)
  rememberCafeOpeningTeam('person-b', null)
  mockGetPeople.mockResolvedValue([])
  mockCanStartProcessForTeam.mockResolvedValue(true)
  mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
  mockListCafeViewerTeams.mockResolvedValue([])
  mockListStartableCafeTeams.mockResolvedValue([])
  mockBranches.mockResolvedValue([BRANCH_RAD, BRANCH_RR])
  mockResolveCafeOpeningTeamForBranch.mockResolvedValue(null)
  mockResolveCafeOpeningTeamForTeam.mockResolvedValue(null)
  mockGetTodayOpeningForTeam.mockResolvedValue(notStarted)
})

afterEach(() => localStorage.removeItem('mos.locale'))

describe('Café Opening context', () => {
  it('uses the primary branch when another branch is due and has no production stream picker', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])
    mockListStartableCafeTeams.mockResolvedValue([dueTeam(TEAM_RAD), dueTeam(TEAM_RR)])

    renderPage()

    expect(await screen.findByTestId('cafe-opening-location')).toHaveTextContent('Radiant')
    expect(screen.getByRole('button', { name: 'Change location' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps an explicit location switch and remembers it for the same person', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])
    mockListStartableCafeTeams.mockResolvedValue([dueTeam(TEAM_RAD), dueTeam(TEAM_RR)])
    const user = userEvent.setup()
    const first = renderPage()

    await screen.findByTestId('cafe-opening-location')
    await user.click(screen.getByRole('button', { name: 'Change location' }))
    await user.click(screen.getByRole('button', { name: /Open location Rumah Rames/ }))

    expect(await screen.findByTestId('cafe-opening-location')).toHaveTextContent('Rumah Rames')
    expect(sessionStorage.getItem(`mos.cafe.opening.location.${VIEWER_ID}`)).toBe('opening-rr')
    first.unmount()

    renderPage()
    expect(await screen.findByTestId('cafe-opening-location')).toHaveTextContent('Rumah Rames')
  })

  it('dismisses the location disclosure with Escape and restores trigger focus', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])
    mockListStartableCafeTeams.mockResolvedValue([dueTeam(TEAM_RAD), dueTeam(TEAM_RR)])
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('cafe-opening-location')
    const trigger = screen.getByRole('button', { name: 'Change location' })
    await user.click(trigger)
    const otherLocation = await screen.findByRole('button', { name: /Open location Rumah Rames/ })
    await user.tab()
    expect(document.activeElement).toBe(otherLocation)

    await user.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: 'Choose a location' })).not.toBeInTheDocument()
    expect(screen.getByTestId('cafe-opening-location')).toHaveTextContent('Radiant')
    expect(document.activeElement).toBe(trigger)
  })

  it('does not render the previous person’s Opening while an identity switch reloads', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])
    const view = renderPage()
    await screen.findByTestId('cafe-opening-location')

    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RR, true)])
    view.rerender(
      <AuthContext.Provider value={authState(['ops_lead'], 'person-b')}>
        <I18nProvider>
          <MemoryRouter initialEntries={['/cafe']}>
            <CafeRootPage />
          </MemoryRouter>
        </I18nProvider>
      </AuthContext.Provider>,
    )

    expect(screen.queryByTestId('cafe-opening-location')).not.toBeInTheDocument()
    expect(await screen.findByTestId('cafe-opening-location')).toHaveTextContent('Rumah Rames')
  })

  it('uses a primary non-stream profile Team as the branch fallback', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_HQ, true)])
    mockListStartableCafeTeams.mockResolvedValue([dueTeam(TEAM_RR)])

    renderPage()

    expect(await screen.findByTestId('cafe-opening-location')).toHaveTextContent('Radiant')
    expect(screen.getByRole('button', { name: 'Change location' })).toBeInTheDocument()
  })

  it('retains a primary branch whose Opening is already started even when it is absent from due runs', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])
    mockGetTodayOpeningForTeam.mockResolvedValue(started)

    renderPage()

    expect(await screen.findByText('Café Opening · 17 Jul 2026')).toBeInTheDocument()
    expect(screen.getByText('Opening · Radiant')).toBeInTheDocument()
    expect(mockGetTodayOpeningForTeam).toHaveBeenCalledWith(PROCESS_ID, OPENING_RAD.id)
  })

  it('includes started branches for an elevated viewer without profile memberships', async () => {
    mockResolveCafeOpeningTeamForBranch.mockImplementation(async (branchId) => (
      branchId === BRANCH_RAD.id ? OPENING_RAD : OPENING_RR
    ))
    mapResolver()
    mockGetTodayOpeningForTeam.mockImplementation(async (_processId, teamId) => (
      teamId === OPENING_RAD.id ? started : notStarted
    ))

    renderPage(['ops_lead'])

    expect(await screen.findByRole('heading', { name: 'Choose a location' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open location Radiant.*Opening in progress/ })).toHaveTextContent('Opening in progress')
    expect(screen.getByRole('button', { name: /Open location Rumah Rames.*Opening available to start/ })).toHaveTextContent('Opening available to start')
  })

  it('shows actionable status for an ambiguous viewer instead of unexplained selectors', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD), viewerTeam(TEAM_RR)])
    mockGetTodayOpeningForTeam.mockImplementation(async (_processId, teamId) => (
      teamId === OPENING_RAD.id ? started : notStarted
    ))

    renderPage(['member'])

    expect(await screen.findByRole('heading', { name: 'Choose a location' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open location Radiant.*Opening in progress/ })).toHaveTextContent('Opening in progress')
    expect(screen.getByRole('button', { name: /Open location Rumah Rames.*Opening available to start/ })).toHaveTextContent('Opening available to start')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps the location status in the Indonesian accessible name', async () => {
    localStorage.setItem('mos.locale', 'id')
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD), viewerTeam(TEAM_RR)])
    mockListStartableCafeTeams.mockResolvedValue([dueTeam(TEAM_RAD)])

    renderPage(['member'])

    expect(await screen.findByRole('button', { name: /Buka lokasi Radiant.*Pembukaan siap dimulai/ })).toBeInTheDocument()
  })

  it('distinguishes a process load failure from missing assignment', async () => {
    mockGetCafeOpeningProcessId.mockRejectedValue(new Error('network'))

    renderPage()

    expect(await screen.findByText("Couldn't load today's café opening. Try again.")).toBeInTheDocument()
    expect(screen.queryByText('No café opening process is configured.')).not.toBeInTheDocument()
  })

  it('shows the actionable assignment state when no eligible branch exists', async () => {
    renderPage(['member'])

    expect(await screen.findByText("You're not on a café branch Team yet — ask your admin to add you.")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load today's café opening. Try again.")).not.toBeInTheDocument()
  })

  it('DD-MVP-17: the capture surface mounts with the Opening door row — no navigation menu', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])

    renderPage()

    await screen.findByTestId('cafe-capture-root')
    expect(screen.getByTestId('cafe-opening-location')).toHaveTextContent('Radiant')
    expect(screen.getByTestId('cafe-capture-surface')).toBeInTheDocument()
    // The large Log/Plan/Stock landing menu is retired: destinations live in the shell.
    expect(screen.queryByRole('link', { name: /plan/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /stock/i })).not.toBeInTheDocument()
  })

  it('DD-MVP-17: no lead-only doors remain to gate a member — the root is role-neutral for capture', async () => {
    mapResolver()
    mockListCafeViewerTeams.mockResolvedValue([viewerTeam(TEAM_RAD, true)])

    renderPage(['member'])

    await screen.findByTestId('cafe-capture-root')
    expect(screen.getByTestId('cafe-capture-surface')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /review/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /pushes/i })).not.toBeInTheDocument()
  })
})

describe('Café Opening responsive capture links', () => {
  it('stacks full-width capture links at ≤390px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-opening-page.css'), 'utf8')
    expect(css).toMatch(/@media\s*\(max-width:\s*390px\)/)
    const mediaBlock = css.slice(css.indexOf('@media (max-width: 390px)'))
    expect(mediaBlock).toMatch(/\.cafe-capture-link\s*\{[^}]*width:\s*100%/)
    expect(mediaBlock).toMatch(/\.cafe-capture-link\s*\{[^}]*min-height:\s*44px/)
  })
})
