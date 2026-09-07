import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { BranchOption } from '@/lib/db/kitchen-logs.types'
import type { CafeOpeningForBranch } from '@/lib/db/cafe-opening'

// AC-028..034 (#789). The Café Opening is one door row on the Café root; component tests mock
// the DAL, never a live DB. The resolver getTodayOpeningForBranch and startTodayOpening are the
// only two seams — see cafe-opening.ts. AC-033 pins the row and Home Café door to the SAME
// resolver export by module identity (below).
vi.mock('@/lib/db/cafe-opening', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/cafe-opening')>('@/lib/db/cafe-opening')
  return {
    ...actual,
    getTodayOpeningForBranch: vi.fn(),
    startTodayOpening: vi.fn(),
  }
})
vi.mock('@/auth/use-auth')

import { getTodayOpeningForBranch, startTodayOpening } from '@/lib/db/cafe-opening'
import { useAuth } from '@/auth/use-auth'
import { CafeOpeningDoorRow } from './cafe-opening-door-row'

const mockGetTodayOpeningForBranch = vi.mocked(getTodayOpeningForBranch)
const mockStartTodayOpening = vi.mocked(startTodayOpening)
const mockUseAuth = vi.mocked(useAuth)

const BRANCH_HQ: BranchOption = { id: 'b-hq', code: 'gordi_hq', name: 'Gordi HQ' }
const BRANCH_RR: BranchOption = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }

const PROCESS_ID = '00000000-0000-0000-0000-00000000c001'
const TEAM_ID = '00000000-0000-0000-0000-000000005b01'
const RUN_ID = '00000000-0000-0000-0000-00000000r001'

const NOT_STARTED_HQ: CafeOpeningForBranch = { processId: PROCESS_ID, teamId: TEAM_ID, runId: null, rollup: null }
const STARTED_RR: CafeOpeningForBranch = {
  processId: PROCESS_ID, teamId: 'team-rr', runId: RUN_ID,
  rollup: {
    process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
    status: 'open', total: 9, open: 5, in_progress: 0, blocked: 0, done: 4,
    overdue: 0, pending_unresolved: 0, completion_pct: 44,
  },
}

function setAuthAs(accessRoles: string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001', org_id: 'org-1', user_id: 'auth-user-001',
        must_change_password: false,
        full_name: 'Krishna Kitchen', email: 'krishna@example.test', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  })
}

/** LocationEcho renders the current pathname+search so a test can assert navigation from a start. */
function LocationEcho() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderRow(branch: BranchOption, width?: number) {
  if (width !== undefined) {
    // AC-028 asserts the phone-390 render — Testing Library reads DOM width off window.innerWidth,
    // so set it before mount. Reset in afterEach is not required: JSDOM shares one window and each
    // test controls its own state through this seam.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    window.dispatchEvent(new Event('resize'))
  }
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/cafe']}>
        <Routes>
          <Route path="/cafe" element={<><CafeOpeningDoorRow branch={branch} /><LocationEcho /></>} />
          <Route path="/work/tasks" element={<><LocationEcho /></>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── AC-028: kitchen hand at 390, no run → one outline-weight row "Start today's opening" ─────
describe('AC-028 — kitchen hand at 390, no run', () => {
  it('renders one outline-weight row whose accessible name is exactly "Start today\'s opening"; no Team select on the route', async () => {
    setAuthAs(['member'])
    mockGetTodayOpeningForBranch.mockResolvedValue(NOT_STARTED_HQ)

    const { container } = renderRow(BRANCH_HQ, 390)

    const start = await screen.findByRole('button', { name: "Start today's opening" })
    expect(start).toHaveClass('btn', 'btn-outline')
    // Never a bare "Start" (Rule 7).
    expect(start.textContent?.trim().toLowerCase()).not.toBe('start')
    // No Team select on /cafe — the door row owns no picker of its own.
    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

// ── AC-029: run at 4/9 → row reads `☕ Opening · Rumah Rames · 4/9 done →` ────────────────────
describe('AC-029 — run at 4/9', () => {
  it('reads "☕ Opening · Rumah Rames · 4/9 done" and links to the run\'s Task record (occurrence-scoped /work/tasks)', async () => {
    setAuthAs(['member'])
    mockGetTodayOpeningForBranch.mockResolvedValue(STARTED_RR)

    renderRow(BRANCH_RR)

    const row = await screen.findByRole('link')
    expect(row).toHaveTextContent(/☕ Opening · Rumah Rames · 4\/9 done/)
    expect(row).toHaveAttribute('href', `/work/tasks?occurrence=${RUN_ID}`)
    expect(row).toHaveClass('btn', 'btn-outline')
    // No pending-PIC chips on /cafe — they belong to the Task record, not the door row.
    expect(screen.queryByText(/to assign/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/unassigned/i)).not.toBeInTheDocument()
  })
})

// ── AC-030: ops lead switching Gordi HQ · Kitchen ↔ Rumah Rames · Kitchen — the door follows ──
describe('AC-030 — ops lead switching streams: the door follows the branch', () => {
  it('re-reads the resolver with the new branch id on every switch (head and door never disagree)', async () => {
    setAuthAs(['ops_lead'])
    mockGetTodayOpeningForBranch.mockImplementation(async (branchId) => {
      if (branchId === BRANCH_HQ.id) return NOT_STARTED_HQ
      return STARTED_RR
    })

    const view = render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe']}>
          <CafeOpeningDoorRow branch={BRANCH_HQ} />
        </MemoryRouter>
      </I18nProvider>,
    )
    await screen.findByRole('button', { name: "Start today's opening" })
    expect(mockGetTodayOpeningForBranch).toHaveBeenCalledWith(BRANCH_HQ.id)

    view.rerender(
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe']}>
          <CafeOpeningDoorRow branch={BRANCH_RR} />
        </MemoryRouter>
      </I18nProvider>,
    )
    await screen.findByRole('link')
    expect(mockGetTodayOpeningForBranch).toHaveBeenCalledWith(BRANCH_RR.id)
    expect(screen.getByRole('link')).toHaveTextContent(/Rumah Rames/)
  })
})

// ── AC-031: Finance → no door, no start control ───────────────────────────────────────────────
describe('AC-031 — Finance', () => {
  it('renders nothing when the resolver returns null (RPC cafe_opening_can_start filter is the mirror)', async () => {
    setAuthAs(['finance'])
    mockGetTodayOpeningForBranch.mockResolvedValue(null)

    const { container } = renderRow(BRANCH_HQ)

    await waitFor(() => {
      expect(mockGetTodayOpeningForBranch).toHaveBeenCalled()
    })
    expect(container.querySelector('.cafe-opening-door-row')).toBeNull()
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

// ── AC-032 e2e is in mos-app/e2e/AC-720-cafe-today-opening.spec.ts (rewritten in this issue). ──

// ── AC-033: Home Café door and the root row import the SAME resolver (pin by module identity) ─
// The Home Café door reintroduction (currently absent from this branch) reads the same
// getTodayOpeningForBranch export the row reads. Pinning is layered:
//   (1) the resolver is a real, exported function on the canonical module;
//   (2) the door row's source imports it from EXACTLY that module path — a rename or a fork
//       would break this test the same day it would break a consumer.
describe('AC-033 — one resolver, pinned by module identity', () => {
  it('getTodayOpeningForBranch is a real named export on @/lib/db/cafe-opening', async () => {
    const canonical = await vi.importActual<typeof import('@/lib/db/cafe-opening')>('@/lib/db/cafe-opening')
    expect(typeof canonical.getTodayOpeningForBranch).toBe('function')
  })

  it('the door-row and any future Home Café door name the SAME module path for the resolver', () => {
    const row = readFileSync(
      resolve(process.cwd(), 'src/components/cafe/cafe-opening-door-row.tsx'),
      'utf8',
    )
    // The door row's import site. When the Home Café door is (re-)introduced, its source is
    // required to name the SAME path (a codemod would catch a divergence).
    expect(row).toMatch(/import[^;]*getTodayOpeningForBranch[^;]*from ['"]@\/lib\/db\/cafe-opening['"]/)
  })
})

// ── Start path: navigates into the run's Task record on spawn ──────────────────────────────────
describe('start path', () => {
  it('a capable viewer starts, and the row navigates into /work/tasks?occurrence=<runId>', async () => {
    setAuthAs(['member'])
    mockGetTodayOpeningForBranch.mockResolvedValue(NOT_STARTED_HQ)
    mockStartTodayOpening.mockResolvedValue({ run_id: 'run-new', created: 3, pending: 0, idempotent: false })

    renderRow(BRANCH_HQ)

    const start = await screen.findByRole('button', { name: "Start today's opening" })
    await userEvent.click(start)

    await waitFor(() => {
      expect(mockStartTodayOpening).toHaveBeenCalledWith(PROCESS_ID, TEAM_ID)
    })
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/work/tasks?occurrence=run-new')
    })
  })

  it('a viewer without process.start (finance) sees no start control even if the resolver returned a not-started row', async () => {
    setAuthAs(['finance'])
    mockGetTodayOpeningForBranch.mockResolvedValue(NOT_STARTED_HQ)

    renderRow(BRANCH_HQ)

    await waitFor(() => {
      expect(mockGetTodayOpeningForBranch).toHaveBeenCalled()
    })
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

// ── Locale parity (both locales carry the door row's copy) ────────────────────────────────────
describe('locale parity', () => {
  it('both English and Indonesian carry cafe.opening.doorRow.started with ${branch}, ${done} and ${total} slots', async () => {
    const { messages } = await import('@/i18n/messages')
    expect(messages.en['cafe.opening.doorRow.started']).toContain('${branch}')
    expect(messages.en['cafe.opening.doorRow.started']).toContain('${done}')
    expect(messages.en['cafe.opening.doorRow.started']).toContain('${total}')
    expect(messages.id['cafe.opening.doorRow.started']).toContain('${branch}')
    expect(messages.id['cafe.opening.doorRow.started']).toContain('${done}')
    expect(messages.id['cafe.opening.doorRow.started']).toContain('${total}')
    expect(messages.id['cafe.opening.doorRow.started']).not.toBe(messages.en['cafe.opening.doorRow.started'])
  })
})
