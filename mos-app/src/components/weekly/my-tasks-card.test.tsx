// MyTasksCard tests — PR-4 (AC-W01..W04, AC-W06)
// TDD RED phase: these fail until my-tasks-card.tsx is implemented.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('@/lib/db/tasks', () => ({
  listTasks: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople:        vi.fn(),
}))

import { listTasks }                    from '@/lib/db/tasks'
import { getBusinessUnits, getPeople }  from '@/lib/db/directory'

const mockListTasks       = vi.mocked(listTasks)
const mockGetBUs          = vi.mocked(getBusinessUnits)
const mockGetPeople       = vi.mocked(getPeople)

import { MyTasksCard } from './my-tasks-card'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const VIEWER_ID = 'person-001'
const NOW       = new Date('2026-06-20T05:00:00Z') // Fri 12:00 WIB

const taskBlocked = {
  id: 'task-100', org_id: 'org-1', title: 'Finalise Q3 roastery output forecast',
  business_unit_id: 'bu-1', status: 'Blocked' as const,
  responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
  consulted_person_ids: [], informed_person_ids: [],
  description: null, due_date: '2026-06-17', // overdue
  last_activity_at: '2026-06-15T08:00:00Z',
  archived_at: null, created_by: VIEWER_ID,
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-15T08:00:00Z',
}

const taskInProgress = {
  id: 'task-101', org_id: 'org-1', title: 'Approve new bar opening checklist',
  business_unit_id: 'bu-2', status: 'In Progress' as const,
  responsible_person_id: VIEWER_ID, accountable_person_id: 'person-002',
  consulted_person_ids: [], informed_person_ids: [],
  description: null, due_date: '2026-06-22',
  last_activity_at: '2026-06-20T03:00:00Z',
  archived_at: null, created_by: VIEWER_ID,
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-20T03:00:00Z',
}

const taskOpen = {
  id: 'task-102', org_id: 'org-1', title: 'Draft August staff roster — all units',
  business_unit_id: 'bu-1', status: 'Open' as const,
  responsible_person_id: 'person-003', accountable_person_id: VIEWER_ID,
  consulted_person_ids: [], informed_person_ids: [],
  description: null, due_date: '2026-07-02',
  last_activity_at: '2026-06-20T01:00:00Z',
  archived_at: null, created_by: 'person-003',
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-20T01:00:00Z',
}

// taskDone: viewer is A, status Done — must always sort LAST (never off-track).
const taskDone = {
  id: 'task-104', org_id: 'org-1', title: 'Close out May inventory audit',
  business_unit_id: 'bu-1', status: 'Done' as const,
  responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
  consulted_person_ids: [], informed_person_ids: [],
  description: null, due_date: '2026-06-10', // a past due date, but Done ⇒ not overdue
  last_activity_at: '2026-06-18T08:00:00Z',
  archived_at: null, created_by: VIEWER_ID,
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-18T08:00:00Z',
}

// taskOther: viewer is neither R nor A — must be filtered OUT
const taskOther = {
  id: 'task-103', org_id: 'org-1', title: 'Unrelated task someone else owns',
  business_unit_id: 'bu-1', status: 'Open' as const,
  responsible_person_id: 'person-999', accountable_person_id: 'person-888',
  consulted_person_ids: [VIEWER_ID], informed_person_ids: [], // C only — excluded
  description: null, due_date: '2026-07-05',
  last_activity_at: '2026-06-19T00:00:00Z',
  archived_at: null, created_by: 'person-999',
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-19T00:00:00Z',
}

const buOptions  = [
  { id: 'bu-1', name: 'Roastery' },
  { id: 'bu-2', name: 'Cafe Ops' },
]
const people = [
  { id: VIEWER_ID,    full_name: 'Arief Said' },
  { id: 'person-002', full_name: 'Dewi Wahyuni' },
  { id: 'person-003', full_name: 'Rina Lestari' },
]

// ── Helper ────────────────────────────────────────────────────────────────────
async function renderCard(viewerId = VIEWER_ID, now = NOW) {
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <MyTasksCard viewerId={viewerId} now={now} />
      </MemoryRouter>,
    )
    await Promise.resolve()
  })
  return utils
}

// ── beforeEach defaults ───────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  mockGetBUs.mockResolvedValue(buOptions)
  mockGetPeople.mockResolvedValue(people)
  mockListTasks.mockResolvedValue([taskBlocked, taskInProgress, taskOpen, taskOther])
})

// ── AC-W01: lists R/A tasks off-track-first as name-chip links ───────────────
describe('AC-W01: lists R/A tasks off-track-first as name-chip links', () => {
  it('AC-W01: shows rows for tasks where viewer is R or A (not C-only tasks)', async () => {
    await renderCard()
    // R/A tasks visible
    await waitFor(() =>
      expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument(),
    )
    expect(screen.getByText('Approve new bar opening checklist')).toBeInTheDocument()
    expect(screen.getByText('Draft August staff roster — all units')).toBeInTheDocument()
    // C-only task hidden
    expect(screen.queryByText('Unrelated task someone else owns')).not.toBeInTheDocument()
  })

  it('AC-W01: off-track-first — Blocked row appears before Open row', async () => {
    await renderCard()
    await waitFor(() =>
      expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument(),
    )
    const links = screen.getAllByRole('link').filter(l =>
      l.closest('td') !== null, // only task-row links, not the "All tasks" link
    )
    const titles = links.map(l => l.textContent)
    const blockedIdx = titles.findIndex(t => t?.includes('Finalise Q3'))
    const openIdx    = titles.findIndex(t => t?.includes('Draft August'))
    expect(blockedIdx).toBeLessThan(openIdx)
  })

  // RI (regression-invariant): an OVERDUE task outranks any NON-OVERDUE task regardless
  // of status. The old comparator keyed on STATUS_ORDER (In Progress → Blocked → …), so an
  // overdue-Blocked task sorted BELOW a calm In-Progress task — contradicting the card's
  // own "off track first" subtitle, OD-P0-8, and the signed mockup. This is the exact case
  // the weak "Blocked before Open" assertion masked.
  it('AC-W01/RI: an overdue Blocked task outranks a calm (future-due) In-Progress task', async () => {
    // taskBlocked is Blocked + OVERDUE (due 2026-06-17, now 2026-06-20).
    // taskInProgress is In Progress + CALM (due 2026-06-22 — future, not overdue).
    // Under the old status-primary sort, In Progress (index 0) would come first → WRONG.
    await renderCard()
    await waitFor(() =>
      expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument(),
    )
    const titles = screen.getAllByRole('link')
      .filter(l => l.closest('td') !== null)
      .map(l => l.textContent)
    const overdueBlockedIdx = titles.findIndex(t => t?.includes('Finalise Q3')) // overdue Blocked
    const calmInProgressIdx = titles.findIndex(t => t?.includes('Approve new bar')) // calm In Progress
    expect(overdueBlockedIdx).toBeGreaterThanOrEqual(0)
    expect(calmInProgressIdx).toBeGreaterThanOrEqual(0)
    expect(overdueBlockedIdx).toBeLessThan(calmInProgressIdx)
  })

  // RI: Done is never off-track — it always sorts LAST, below every active row,
  // even when its due date is in the past (isOverdue() excludes Done).
  it('AC-W01/RI: Done always sorts last (below every active row)', async () => {
    mockListTasks.mockResolvedValue([taskDone, taskBlocked, taskInProgress, taskOpen, taskOther])
    await renderCard()
    await waitFor(() =>
      expect(screen.getByText('Close out May inventory audit')).toBeInTheDocument(),
    )
    const titles = screen.getAllByRole('link')
      .filter(l => l.closest('td') !== null)
      .map(l => l.textContent)
    const doneIdx = titles.findIndex(t => t?.includes('Close out May inventory audit'))
    // Done is last among the four R/A rows (taskOther is filtered out).
    expect(doneIdx).toBe(titles.length - 1)
  })

  it('AC-W01: task name cell is a link to /tasks/:id', async () => {
    await renderCard()
    await waitFor(() =>
      expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /Finalise Q3 roastery output forecast/i })
    expect(link.getAttribute('href')).toBe('/tasks/task-100')
  })
})

// ── AC-W02: mini-table th use weight-400 uppercase overline ──────────────────
describe('AC-W02: mini-table th use the weight-400 overline (shared class)', () => {
  it('AC-W02: column headers carry the th-overline class', async () => {
    const { container } = await renderCard()
    const ths = container.querySelectorAll('thead th')
    expect(ths.length).toBeGreaterThan(0)
    ths.forEach(th => {
      expect(th.className).toMatch(/th-overline/)
    })
  })

  it('AC-W02: renders exactly 5 column headers: Task / Status / Owner (R) / Due / Activity', async () => {
    await renderCard()
    const headers = screen.getAllByRole('columnheader')
    const texts = headers.map(h => h.textContent?.trim())
    expect(texts).toContain('Task')
    expect(texts).toContain('Status')
    expect(texts).toContain('Owner (R)')
    expect(texts).toContain('Due')
    expect(texts).toContain('Activity')
    expect(headers).toHaveLength(5)
  })
})

// ── AC-W03: empty — "you're clear" copy ──────────────────────────────────────
describe('AC-W03: empty state shows the "you\'re clear" message', () => {
  it('AC-W03: shows clear copy when no R/A tasks', async () => {
    // listTasks returns tasks, but none where viewer is R or A
    mockListTasks.mockResolvedValue([taskOther])
    await renderCard()
    await waitFor(() =>
      expect(
        screen.getByText("No tasks where you're R or A this week — you're clear."),
      ).toBeInTheDocument(),
    )
  })

  it('AC-W03: shows clear copy when listTasks returns empty array', async () => {
    mockListTasks.mockResolvedValue([])
    await renderCard()
    await waitFor(() =>
      expect(
        screen.getByText("No tasks where you're R or A this week — you're clear."),
      ).toBeInTheDocument(),
    )
  })
})

// ── AC-W04: loading skeleton + scoped error with Retry ───────────────────────
describe('AC-W04: loading skeleton and scoped inline error with Retry', () => {
  it('AC-W04: shows aria-busy skeleton while loading', () => {
    // Never resolves — stays in loading state
    mockListTasks.mockImplementation(() => new Promise(() => {}))
    render(
      <MemoryRouter>
        <MyTasksCard viewerId={VIEWER_ID} now={NOW} />
      </MemoryRouter>,
    )
    const card = document.querySelector('[aria-busy="true"]')
    expect(card).not.toBeNull()
  })

  it('AC-W04: shows scoped inline error with Retry when listTasks rejects', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    await act(async () => {
      render(
        <MemoryRouter>
          <MyTasksCard viewerId={VIEWER_ID} now={NOW} />
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument(),
    )
    // The card itself does not unmount — chrome stays
    expect(screen.getByText('My tasks')).toBeInTheDocument()
  })

  it('AC-W04: clicking Retry refetches', async () => {
    mockListTasks.mockRejectedValue(new Error('fail'))
    await act(async () => {
      render(
        <MemoryRouter>
          <MyTasksCard viewerId={VIEWER_ID} now={NOW} />
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    await waitFor(() => screen.getByRole('button', { name: /Retry/i }))
    // Now mock a successful response for the retry
    mockListTasks.mockResolvedValue([])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
      await Promise.resolve()
    })
    // After retry: error gone, empty state shown
    await waitFor(() =>
      expect(
        screen.getByText("No tasks where you're R or A this week — you're clear."),
      ).toBeInTheDocument(),
    )
  })
})

// ── AC-W06: name truncation + title attr; status never wraps ─────────────────
describe('AC-W06: name cell truncates + carries title; status cells nowrap', () => {
  it('AC-W06: name link has title attribute equal to the task title', async () => {
    await renderCard()
    await waitFor(() =>
      expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /Finalise Q3 roastery output forecast/i })
    expect(link.getAttribute('title')).toBe('Finalise Q3 roastery output forecast')
  })

  it('AC-W06: name link has the truncate class (overflow ellipsis)', async () => {
    const { container } = await renderCard()
    await waitFor(() =>
      expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument(),
    )
    const link = container.querySelector('a[href="/tasks/task-100"]')
    expect(link).not.toBeNull()
    // The link or an ancestor should have the `truncate` class OR the `name-chip` CSS class
    expect(link!.className).toMatch(/truncate|name-chip/)
  })
})

// ── Card-head chrome always visible ──────────────────────────────────────────
describe('Card-head chrome: title + meta + All tasks link', () => {
  it('renders "My tasks" card head title', async () => {
    await renderCard()
    expect(screen.getByText('My tasks')).toBeInTheDocument()
  })

  it('renders "All tasks →" link targeting /tasks', async () => {
    await renderCard()
    const link = screen.getByRole('link', { name: /All tasks/i })
    expect(link.getAttribute('href')).toBe('/tasks')
  })
})
