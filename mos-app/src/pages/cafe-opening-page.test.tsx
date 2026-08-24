import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { DueProcessRun } from '@/lib/db/processes.types'
import type { TeamOption } from '@/lib/db/signals.types'

// B7 (AC-716): component test mocks the DAL, never a live DB. CafeOpeningPage resolves the
// process id + the viewer's branch Team, then hosts CafeOpeningPanel + the existing capture links.
vi.mock('@/lib/db/cafe-opening', () => ({
  getCafeOpeningProcessId: vi.fn(),
  listStartableCafeTeams: vi.fn(),
  getTodayOpeningForTeam: vi.fn(),
  startTodayOpening: vi.fn(),
  wibToday: () => '2026-07-17',
}))
vi.mock('@/lib/db/signals', () => ({ listAuthorTeams: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({ listPendingTasks: vi.fn(), resolvePendingTask: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
// #440: the module ROOT states the stream its five doors lead into. Mocked at the same seams
// the capture surfaces use — un-mocked these hit Supabase and the head would silently read '—'.
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual, listStreamPairs: vi.fn() }
})

import {
  getCafeOpeningProcessId, listStartableCafeTeams, getTodayOpeningForTeam,
} from '@/lib/db/cafe-opening'
import { listAuthorTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import { listActiveBranches } from '@/lib/db/branches'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listStreamPairs } from '@/lib/db/kitchen-logs'
import { CafeOpeningPage } from './cafe-opening-page'
import { rememberStream } from '@/lib/cafe-stream'

const mockGetCafeOpeningProcessId = vi.mocked(getCafeOpeningProcessId)
const mockListStartableCafeTeams = vi.mocked(listStartableCafeTeams)
const mockGetTodayOpeningForTeam = vi.mocked(getTodayOpeningForTeam)
const mockListAuthorTeams = vi.mocked(listAuthorTeams)
const mockGetPeople = vi.mocked(getPeople)
const mockBranches = vi.mocked(listActiveBranches)
const mockStreamPairs = vi.mocked(listStreamPairs)
const mockDefaultStream = vi.mocked(fetchDefaultStream)

const BRANCH_RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const BRANCH_RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const RADIANT_BAR = { branch: BRANCH_RAD, activity: 'bar' as const }

const PROCESS_ID = '00000000-0000-0000-0000-00000000c001'
const TEAM_ID = '00000000-0000-0000-0000-000000005b01'

function authedState(accessRoles: string[] = ['ops_lead']): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001', org_id: 'org-1', user_id: 'auth-user-001',
        must_change_password: false,
        full_name: 'Cahya Cafe', email: 'cahya@example.test', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles,
    },
    signOut: async () => {},
  }
}

function renderPage(accessRoles: string[] = ['ops_lead']) {
  return render(
    <AuthContext.Provider value={authedState(accessRoles)}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe']}>
          <CafeOpeningPage />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  rememberStream(null) // the Café stream is remembered module-wide (#440) — isolate per test
  mockGetPeople.mockResolvedValue([])
  mockBranches.mockResolvedValue([BRANCH_RAD, BRANCH_RR])
  mockStreamPairs.mockResolvedValue([BRANCH_RAD, BRANCH_RR].flatMap(b => [
    { branch_id: b.id, activity: 'kitchen' as const },
    { branch_id: b.id, activity: 'bar' as const },
  ]))
  mockDefaultStream.mockResolvedValue(RADIANT_BAR)
})

describe('issue 440 — the Café root states the stream its doors lead into', () => {
  it('names the stream in the page head, canonically, and lets it be set for the module', async () => {
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    mockListStartableCafeTeams.mockResolvedValue([])
    mockListAuthorTeams.mockResolvedValue([])
    const { container } = renderPage()
    const head = container.querySelector('[data-testid="page-head"]') as HTMLElement
    const picker = await waitFor(() => {
      const el = head.querySelector('select') as HTMLSelectElement | null
      expect(el?.value).toBeTruthy()
      return el as HTMLSelectElement
    })
    expect(picker.selectedOptions[0].textContent).toBe('Radiant · Bar')
    expect(head.textContent).toMatch(/stream/i)
  })
})

describe('AC-716 — CafeOpeningPage hosts the panel + the existing capture links', () => {
  it('mounts CafeOpeningPanel (Start control) and links to Log/Plan/Stock/Review', async () => {
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    const due: DueProcessRun[] = [{
      work_line_id: PROCESS_ID, process_name: 'Café Opening',
      owning_team_id: TEAM_ID, team_name: 'Radiant Operations',
      period_key: '2026-07-17', scheduled_date: '2026-07-17',
    }]
    mockListStartableCafeTeams.mockResolvedValue(due)
    mockGetTodayOpeningForTeam.mockResolvedValue({ started: false, runId: null, rollup: null })

    renderPage()

    // The panel mounted (its Start control renders for this ops_lead viewer).
    await screen.findByRole('button', { name: "Start today's opening" })

    // The existing capture entry points stay reachable (FR-708).
    expect(screen.getByRole('link', { name: /log/i })).toHaveAttribute('href', '/cafe/log')
    expect(screen.getByRole('link', { name: /plan/i })).toHaveAttribute('href', '/cafe/plan')
    expect(screen.getByRole('link', { name: /stock/i })).toHaveAttribute('href', '/cafe/stock')
    // JQ-1: an ops_lead sees the lead-only day-steps (Review + Pushes).
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/cafe/review')
    expect(screen.getByRole('link', { name: /pushes/i })).toHaveAttribute('href', '/cafe/pushes')

    // Step 7 minor (item 7b) — real button-styled links (btn-outline: visible border/background),
    // never plain unstyled text.
    const logLink = screen.getByRole('link', { name: /log/i })
    expect(logLink).toHaveClass('btn', 'btn-outline')
  })

  it('JQ-1: a member sees Log/Plan/Stock but NOT the lead-only Review/Pushes doors', async () => {
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    const due: DueProcessRun[] = [{
      work_line_id: PROCESS_ID, process_name: 'Café Opening',
      owning_team_id: TEAM_ID, team_name: 'Radiant Operations',
      period_key: '2026-07-17', scheduled_date: '2026-07-17',
    }]
    mockListStartableCafeTeams.mockResolvedValue(due)
    mockGetTodayOpeningForTeam.mockResolvedValue({ started: false, runId: null, rollup: null })

    renderPage(['member'])

    // A member can still start their own Team's opening (OD-71iii) — wait for the ready surface.
    await screen.findByRole('link', { name: /log/i })

    // The capture doors a member reaches stay visible…
    expect(screen.getByRole('link', { name: /plan/i })).toHaveAttribute('href', '/cafe/plan')
    expect(screen.getByRole('link', { name: /stock/i })).toHaveAttribute('href', '/cafe/stock')
    // …but the ops_lead-only day-steps are HIDDEN — no door that only bounces the member.
    expect(screen.queryByRole('link', { name: /review/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /pushes/i })).not.toBeInTheDocument()
  })

  // Step 7 minor (item 7b) — full-width tap targets at ≤390px (CSS lock, mirrors task-row.test.tsx's
  // pattern of asserting the rule exists in the owning stylesheet).
  it('item 7b: the capture links stack full-width at ≤390px (CSS lock)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-opening-page.css'), 'utf8')
    expect(css).toMatch(/@media\s*\(max-width:\s*390px\)/)
    const mediaBlock = css.slice(css.indexOf('@media (max-width: 390px)'))
    expect(mediaBlock).toMatch(/\.cafe-capture-link\s*\{[^}]*width:\s*100%/)
    expect(mediaBlock).toMatch(/\.cafe-capture-link\s*\{[^}]*min-height:\s*44px/)
  })

  it("falls back to the viewer's own Team when today's opening is already started (not in the due list)", async () => {
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    mockListStartableCafeTeams.mockResolvedValue([]) // already started — omitted from the due list
    const myTeams: TeamOption[] = [
      { id: TEAM_ID, name: 'Radiant Operations', business_unit_id: 'bu-1', site_id: null, is_primary: true },
    ]
    mockListAuthorTeams.mockResolvedValue(myTeams)
    mockGetTodayOpeningForTeam.mockResolvedValue({
      started: true, runId: 'run-1',
      rollup: {
        process_run_id: 'run-1', caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 2, open: 2, in_progress: 0, blocked: 0, done: 0,
        overdue: 0, pending_unresolved: 0, completion_pct: 0,
      },
    })

    renderPage()

    await screen.findByText('Café Opening · 17 Jul 2026')
    expect(mockGetTodayOpeningForTeam).toHaveBeenCalledWith(PROCESS_ID, TEAM_ID)
  })

  it('AC-V3-007: asks a multi-Team viewer to choose before opening the selected Team context', async () => {
    const otherTeamId = '00000000-0000-0000-0000-000000005b02'
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    mockListStartableCafeTeams.mockResolvedValue([
      {
        work_line_id: PROCESS_ID, process_name: 'Café Opening',
        owning_team_id: TEAM_ID, team_name: 'Radiant Operations',
        period_key: '2026-07-17', scheduled_date: '2026-07-17',
      },
      {
        work_line_id: PROCESS_ID, process_name: 'Café Opening',
        owning_team_id: otherTeamId, team_name: 'Kemang Operations',
        period_key: '2026-07-17', scheduled_date: '2026-07-17',
      },
    ])
    mockGetTodayOpeningForTeam.mockResolvedValue({ started: false, runId: null, rollup: null })

    const user = userEvent.setup()
    renderPage()

    const teamPicker = await screen.findByRole('combobox', { name: /choose.*team/i })
    expect(mockGetTodayOpeningForTeam).not.toHaveBeenCalled()

    await user.selectOptions(teamPicker, otherTeamId)

    await screen.findByRole('button', { name: "Start today's opening" })
    expect(mockGetTodayOpeningForTeam).toHaveBeenCalledWith(PROCESS_ID, otherTeamId)
  })

  it('AC-V3-007: asks for a choice from multi-Team membership when no opening is due', async () => {
    const otherTeamId = '00000000-0000-0000-0000-000000005b02'
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    mockListStartableCafeTeams.mockResolvedValue([])
    mockListAuthorTeams.mockResolvedValue([
      { id: TEAM_ID, name: 'Radiant Operations', business_unit_id: 'bu-1', site_id: null, is_primary: true },
      { id: otherTeamId, name: 'Kemang Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
    ])
    mockGetTodayOpeningForTeam.mockResolvedValue({ started: true, runId: 'run-2', rollup: {
      process_run_id: 'run-2', caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
      overdue: 0, pending_unresolved: 0, completion_pct: 0,
    } })

    const user = userEvent.setup()
    renderPage()

    const teamPicker = await screen.findByRole('combobox', { name: /choose.*team/i })
    expect(mockGetTodayOpeningForTeam).not.toHaveBeenCalled()

    await user.selectOptions(teamPicker, otherTeamId)

    await screen.findByText('Café Opening · 17 Jul 2026')
    expect(mockGetTodayOpeningForTeam).toHaveBeenCalledWith(PROCESS_ID, otherTeamId)
  })

  it('renders an EmptyState (not a crash) when no Café Opening process is configured (RATIFY-7C)', async () => {
    mockGetCafeOpeningProcessId.mockResolvedValue(null)

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(mockListStartableCafeTeams).not.toHaveBeenCalled()
    // Half B convergence: missing configuration is never the 'quiet' ✓ earned-all-clear glyph —
    // it reads as "you're done" when actually an admin still needs to set this up. 'blank' (—)
    // is the honest "no source configured" variant.
    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-empty-variant', 'blank')
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it("Half B convergence: renders the 'blank' (never 'quiet' ✓) EmptyState when the viewer has no café branch Team", async () => {
    mockGetCafeOpeningProcessId.mockResolvedValue(PROCESS_ID)
    mockListStartableCafeTeams.mockResolvedValue([])
    mockListAuthorTeams.mockResolvedValue([])

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-empty-variant', 'blank')
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })
})
