import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

// Weekly Updates + Daily Log are flag-hidden in production (config/features.ts), but the
// strip/team-module LOGIC is still exercised here under the SHOWN condition — force both
// flags on so these AC tests keep proving that behavior. The HIDDEN behavior (strips absent,
// trimmed subtitle) is covered separately in MyWeek.hidden.test.tsx.

// Mock weeklyUpdates data layer for strip wiring (AC-050, AC-051) + team module (RI-CROSS)
vi.mock('../lib/db/weekly-updates', () => ({
  getMyUpdate:     vi.fn(),
  upsertDraft:     vi.fn(),
  submit:          vi.fn(),
  reopen:          vi.fn(),
  addLine:         vi.fn(),
  updateLine:      vi.fn(),
  removeLine:      vi.fn(),
  listTeamUpdates: vi.fn(),
}))
import { getMyUpdate, listTeamUpdates } from '@/lib/db/weekly-updates'
const mockGetMyUpdate = vi.mocked(getMyUpdate)
const mockListTeamUpdates = vi.mocked(listTeamUpdates)

// Mock team.ts roster resolution for the My Week team module (RI-CROSS)
vi.mock('../lib/db/team', () => ({
  getTeamForManager: vi.fn(),
}))
import { getTeamForManager } from '@/lib/db/team'
const mockGetTeamForManager = vi.mocked(getTeamForManager)

// AC-W01..W04/W06: MyTasksCard data layer — mocked so MyWeek-level tests stay
// fast and isolated. The card's own behavior is covered in my-tasks-card.test.tsx.
vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople:        vi.fn(),
}))
import { listTasks }                   from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
const mockListTasks   = vi.mocked(listTasks)
const mockGetBUs      = vi.mocked(getBusinessUnits)
const mockGetPeople   = vi.mocked(getPeople)

const mockUseAuth = vi.mocked(useAuth)

import { MyWeek } from './my-week'

const nonManagerViewer = {
  status: 'authenticated' as const,
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
    accessRoles: [],
  },
  signOut: vi.fn(),
}

// FIX-4: async renderMyWeek — wraps render + flush inside act() so the
// getMyUpdate mock-resolved promise settles within act and no "not wrapped
// in act()" warnings are emitted (the async state update is now inside act).
async function renderMyWeek(auth: AuthState = nonManagerViewer) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <MyWeek />
      </MemoryRouter>,
    )
    // Flush the mock-resolved getMyUpdate Promise so the stripLoad state
    // update (loading → ready / error) is processed inside act().
    await Promise.resolve()
  })
  return utils
}

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('min-width') ? matches : !matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia(true)
  // Default: no update for this week (keeps existing tests stable)
  mockGetMyUpdate.mockResolvedValue(null)
  // Default team mocks: empty roster + empty updates
  mockGetTeamForManager.mockResolvedValue([])
  mockListTeamUpdates.mockResolvedValue([])
  // Default ops summary: no entries, no needs-attention
  // Default MyTasksCard data layer: empty task set (viewer sees "you're clear")
  mockListTasks.mockResolvedValue([])
  mockGetBUs.mockResolvedValue([])
  mockGetPeople.mockResolvedValue([])
})

// AC-011: My Week task-table card — now backed by MyTasksCard (data-wired, PR-4).
// Goal-oracle (unchanged): a clear viewer sees the "you're clear" message.
// Data source changes from hardcoded stub → listTasks + raciOwner filter.
describe('AC-011: MyTasksCard — the dominant module (data-wired, PR-4)', () => {
  it('AC-W01/AC-011: shows "My tasks" card head', async () => {
    await renderMyWeek()
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
  })

  it('AC-W01/AC-011: shows card meta subtitle', async () => {
    await renderMyWeek()
    await waitFor(() =>
      expect(
        screen.getByText("Where you're Responsible or Accountable · off track first"),
      ).toBeInTheDocument(),
    )
  })

  it('AC-W01/AC-011: has "All tasks →" link targeting /work/tasks', async () => {
    await renderMyWeek()
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /All tasks/i })
      expect(link.getAttribute('href')).toBe('/work/tasks')
    })
  })

  // AC-W03 goal-oracle (deliberate data-source change, goal unchanged):
  // a clear viewer (no R/A tasks) sees the "you're clear" message.
  it('AC-W03/AC-011: empty state — "you\'re clear" copy when no R/A tasks', async () => {
    // Default beforeEach: listTasks returns [] → empty after raciOwner filter
    await renderMyWeek()
    await waitFor(() =>
      expect(
        screen.getByText("No tasks where you're R or A this week — you're clear."),
      ).toBeInTheDocument(),
    )
  })

  it('AC-W02/AC-011: column headers carry the th-overline class (weight-400 overline)', async () => {
    await renderMyWeek()
    await waitFor(() => {
      const { container } = { container: document.body }
      const ths = container.querySelectorAll('[aria-label="My tasks this week"] thead th')
      expect(ths.length).toBeGreaterThan(0)
      ths.forEach(th => {
        expect(th.className).toMatch(/th-overline/)
      })
    })
  })
})

// AC-012: Empty strips link to their surfaces
describe('AC-012: Empty strips', () => {


  it('no amber/needs-me state in the empty strips', async () => {
    await renderMyWeek()
    // No amber draft pill element in the strips
    const container = document.body
    expect(container.querySelector('.strip-pill.draft')).toBeNull()
    // No "Needs sign-off" or "needs your sign-off" text (the specific needs-me marker)
    expect(screen.queryByText(/needs your sign-off|sign-off needed/i)).toBeNull()
  })
})

// FIX-2: Card-head uses the shared <CardHead> (IA-3, PR-2)
describe('FIX-2: Card-head uses the shared <CardHead> (IA-3)', () => {
  it('renders the shared <CardHead> shell (.card-head — flex-wrap via CardHead.css)', async () => {
    const { container } = await renderMyWeek()
    const cardHead = container.querySelector('[aria-label="My tasks this week"] .card-head')
    expect(cardHead).toBeTruthy()
  })

  it('"My tasks" is the CardHead title (h2.card-head-title)', async () => {
    const { container } = await renderMyWeek()
    const titleEl = container.querySelector('[aria-label="My tasks this week"] .card-head-title')
    expect(titleEl).toBeTruthy()
    expect(titleEl!.tagName).toBe('H2')
    expect(titleEl!.textContent).toBe('My tasks')
  })
})

// AC-010: WIB week math at the page level
describe('AC-010: My Week head WIB week math', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })


  it('(b) Mon boundary: 2026-06-08T16:30:00Z = Mon 8 Jun 00:30 WIB', async () => {
    vi.setSystemTime(new Date('2026-06-08T16:30:00Z'))
    await renderMyWeek()
    const subtitle = screen.getByText(/Week of/)
    expect(subtitle.textContent).toContain('Week of 8–14 Jun 2026')
    expect(subtitle.textContent).toContain('Mon 8 Jun')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
