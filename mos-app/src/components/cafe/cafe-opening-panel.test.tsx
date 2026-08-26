import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TodayOpening } from '@/lib/db/cafe-opening'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import type { PersonOption } from '@/lib/db/directory'

// B5/B6 (AC-712..715): component tests mock the DAL, never a live DB (mirrors
// start-run-control.test.tsx). CafeOpeningPanel reuses Step-6's PendingResolution +
// listPendingTasks/resolvePendingTask (Rule 11) — mocked here at the module boundary.
vi.mock('@/lib/db/cafe-opening', () => ({
  getTodayOpeningForTeam: vi.fn(),
  startTodayOpening: vi.fn(),
}))
vi.mock('@/lib/db/processes', () => ({
  listPendingTasks: vi.fn(),
  resolvePendingTask: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/auth/use-auth')

import { getTodayOpeningForTeam, startTodayOpening } from '@/lib/db/cafe-opening'
import { listPendingTasks, resolvePendingTask } from '@/lib/db/processes'
import { getPeople } from '@/lib/db/directory'
import { useAuth } from '@/auth/use-auth'
import { CafeOpeningPanel } from './cafe-opening-panel'

const mockGetTodayOpeningForTeam = vi.mocked(getTodayOpeningForTeam)
const mockStartTodayOpening = vi.mocked(startTodayOpening)
const mockListPendingTasks = vi.mocked(listPendingTasks)
const mockResolvePendingTask = vi.mocked(resolvePendingTask)
const mockGetPeople = vi.mocked(getPeople)
const mockUseAuth = vi.mocked(useAuth)

function setAuthAs(accessRoles: string[]) {
  mockUseAuth.mockReturnValue({
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
    signOut: vi.fn(),
  })
}

import { messages } from '@/i18n/messages'

const PROCESS_ID = '00000000-0000-0000-0000-00000000c001'
const TEAM_ID = '00000000-0000-0000-0000-000000005b01'
const RUN_ID = '00000000-0000-0000-0000-00000000r001'

const NOT_STARTED: TodayOpening = { started: false, runId: null, rollup: null }

function renderPanel() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <CafeOpeningPanel processId={PROCESS_ID} teamId={TEAM_ID} teamName="Radiant" />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListPendingTasks.mockResolvedValue([])
  mockGetPeople.mockResolvedValue([])
})

// Half B convergence: the fetch-in-flight state uses the shared LoadingShell (role=status +
// aria-busy), never a bare SkeletonRows with no busy announcement.
describe('Loading state (Half B — shared LoadingShell, not a bare skeleton)', () => {
  it('announces role=status aria-busy while the opening fetch is in flight', () => {
    setAuthAs(['ops_lead'])
    mockGetTodayOpeningForTeam.mockReturnValue(new Promise(() => {})) // never resolves

    renderPanel()

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })
})

// ── AC-712: capable viewer, not started → Start today's opening ─────────────
describe('AC-712 — capable viewer, opening not started', () => {
  it('renders a control whose accessible name is exactly "Start today\'s opening" and it calls startTodayOpening on click', async () => {
    setAuthAs(['ops_lead'])
    mockGetTodayOpeningForTeam.mockResolvedValue(NOT_STARTED)
    mockStartTodayOpening.mockResolvedValue({ run_id: RUN_ID, created: 2, pending: 1, idempotent: false })

    renderPanel()

    const startButton = await screen.findByRole('button', { name: "Start today's opening" })
    // Never a bare "Start"/"Create" (Rule 7) — the accessible name is the full verb+object phrase.
    expect(startButton.textContent?.trim().toLowerCase()).not.toBe('start')
    expect(startButton.textContent?.trim().toLowerCase()).not.toBe('create')

    await userEvent.click(startButton)
    await waitFor(() => {
      expect(mockStartTodayOpening).toHaveBeenCalledWith(PROCESS_ID, TEAM_ID)
    })
  })
})

// ── AC-713: viewer without process.start, not started → read-only ───────────
describe('AC-713 — non-capable viewer (finance — member now capable, OD-71iii), opening not started', () => {
  it('renders no actionable Start control; shows the neutral read-only not-started copy (OD-71iii)', async () => {
    setAuthAs(['finance'])
    mockGetTodayOpeningForTeam.mockResolvedValue(NOT_STARTED)

    renderPanel()

    await waitFor(() => {
      expect(screen.getByText(/no one has started today.s opening/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
    // Never a disabled/dead Start button either (Rule 12).
    expect(document.querySelector('button:disabled')).toBeNull()
  })

  // Step 7 minors (item 7a) — the ✓ (quiet/"done") glyph misread as "already handled" for a
  // state that's actually waiting on someone else's action. "awaiting" is the existing state-kit
  // variant built for exactly this ("nothing yet, pull again" — kitchen-review-page.tsx) —
  // smallest change: swap the variant, no new state-kit option needed.
  it('item 7a: uses the "awaiting" EmptyState variant (never the ✓ "done"-reading glyph) for the not-started non-capable (finance) state', async () => {
    setAuthAs(['finance'])
    mockGetTodayOpeningForTeam.mockResolvedValue(NOT_STARTED)

    renderPanel()

    await waitFor(() => screen.getByTestId('empty-state'))
    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-empty-variant', 'awaiting')
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })
})

// ── AC-714: started → caption + roll-up + link into /work/tasks ─────────────
describe('AC-714 — opening started: caption, roll-up, and the /work/tasks link', () => {
  it('renders the occurrence caption + roll-up summary + a link scoped to the run, and never shows "Process Run"', async () => {
    setAuthAs(['ops_lead'])
    mockGetTodayOpeningForTeam.mockResolvedValue({
      started: true, runId: RUN_ID,
      rollup: {
        process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 5, open: 2, in_progress: 0, blocked: 0, done: 2,
        overdue: 1, pending_unresolved: 1, completion_pct: 40,
      },
    })

    renderPanel()

    await screen.findByText('Café Opening · 17 Jul 2026')
    expect(screen.getByText(/2\/5 done/)).toBeInTheDocument()
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument()
    expect(screen.getByText(/1 to assign/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view opening tasks/i })
    expect(link).toHaveAttribute('href', expect.stringContaining(`occurrence=${RUN_ID}`))
    expect(link).toHaveAttribute('href', expect.stringContaining('/work/tasks'))
    expect(document.body.textContent).not.toContain('Process Run')
  })

  // Design fix wave item 6 — the café member dead-end minor: a non-capable member saw "1 to
  // assign" with nothing below it to click (the resolve editor only mounts for a capable
  // viewer) — that read like an instruction with no way to act. Neutral "N unassigned" wording
  // never implies an action the viewer can't take.
  it('item 6: a non-capable viewer (finance) sees "N unassigned" (never "N to assign") since they have no way to resolve it', async () => {
    setAuthAs(['finance'])
    mockGetTodayOpeningForTeam.mockResolvedValue({
      started: true, runId: RUN_ID,
      rollup: {
        process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 5, open: 2, in_progress: 0, blocked: 0, done: 2,
        overdue: 1, pending_unresolved: 1, completion_pct: 40,
      },
    })

    renderPanel()

    await screen.findByText('Café Opening · 17 Jul 2026')
    expect(screen.getByText(/1 unassigned/)).toBeInTheDocument()
    expect(screen.queryByText(/1 to assign/)).not.toBeInTheDocument()
  })
})

// ── AC-715: pending "to assign" resolution, gated on process.start ──────────
const PENDING_ROW: PendingTaskRow = {
  id: 'pending-1', process_run_id: RUN_ID, task_def_id: 'def-ca03',
  candidate_person_ids: ['f002', 'f003'], reason: 'multiple', resolved_at: null,
  title: 'Brew station handover',
}
const PEOPLE: PersonOption[] = [
  { id: 'f002', full_name: 'Twin A' },
  { id: 'f003', full_name: 'Twin B' },
]

describe('AC-715 — pending "to assign" resolution', () => {
  it('a process.start-capable viewer resolves a pending candidate via resolvePendingTask', async () => {
    setAuthAs(['ops_lead'])
    mockGetTodayOpeningForTeam.mockResolvedValue({
      started: true, runId: RUN_ID,
      rollup: {
        process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 5, open: 4, in_progress: 0, blocked: 0, done: 0,
        overdue: 0, pending_unresolved: 1, completion_pct: 0,
      },
    })
    mockListPendingTasks.mockResolvedValue([PENDING_ROW])
    mockGetPeople.mockResolvedValue(PEOPLE)
    mockResolvePendingTask.mockResolvedValue('task-new-1')

    renderPanel()

    const candidateButton = await screen.findByRole('button', { name: 'Twin A' })
    await userEvent.click(candidateButton)

    await waitFor(() => {
      expect(mockResolvePendingTask).toHaveBeenCalledWith('pending-1', 'f002')
    })
  })

  it('a viewer without process.start sees no resolve control', async () => {
    setAuthAs(['finance'])
    mockGetTodayOpeningForTeam.mockResolvedValue({
      started: true, runId: RUN_ID,
      rollup: {
        process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 5, open: 4, in_progress: 0, blocked: 0, done: 0,
        overdue: 0, pending_unresolved: 1, completion_pct: 0,
      },
    })
    mockListPendingTasks.mockResolvedValue([PENDING_ROW])
    mockGetPeople.mockResolvedValue(PEOPLE)

    renderPanel()

    await screen.findByText('Café Opening · 17 Jul 2026')
    expect(mockListPendingTasks).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Twin A' })).not.toBeInTheDocument()
  })
})

// ── issue 457: the team caption must not read as the chosen production stream ────────────
// The Café root's head shows "Choose stream…" with this caption directly beneath it. A bare
// team name in that slot ("Radiant") sits exactly where a stream name ("Radiant · Bar") is
// expected, and is read as one. The panel is Team-scoped by design (DD-WAY-34 keeps the root
// picker); the caption must therefore SAY what it scopes.
describe('issue 457: the Café root team caption says what it scopes', () => {
  it('is never the bare team name — in either opening state', async () => {
    setAuthAs(['ops_lead'])
    mockGetTodayOpeningForTeam.mockResolvedValue(NOT_STARTED)
    const { container, unmount } = renderPanel()
    const notStarted = await waitFor(() => {
      const el = container.querySelector('.cafe-opening-team')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(notStarted.textContent?.trim()).not.toBe('Radiant')
    expect(notStarted.textContent).toContain('Radiant')
    unmount()

    mockGetTodayOpeningForTeam.mockResolvedValue({
      started: true,
      runId: RUN_ID,
      rollup: {
        process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 3, open: 2, in_progress: 0, blocked: 0, done: 1,
        overdue: 0, pending_unresolved: 0, completion_pct: 33,
      },
    })
    const started = renderPanel()
    const caption = await waitFor(() => {
      const el = started.container.querySelector('.cafe-opening-team')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(caption.textContent?.trim()).not.toBe('Radiant')
  })

  it('names the job it scopes, from the catalog, in both locales', () => {
    // The English word is not the Indonesian one here — a single-locale add would ship the
    // English caption to an Indonesian floor.
    expect(messages.en['cafe.opening.teamCaption']).toContain('${team}')
    expect(messages.id['cafe.opening.teamCaption']).toContain('${team}')
    expect(messages.id['cafe.opening.teamCaption']).not.toBe(messages.en['cafe.opening.teamCaption'])
  })
})
