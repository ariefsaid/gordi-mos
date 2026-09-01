/**
 * Cascade D1 — Work-line grouping + Objective/Work-line columns + summary caption.
 * Spec: docs/specs/cascade-foundation.spec.md NFR-206 literacy bar; ADR-0014.
 * Tests: tasks-grouping (workline dim), group-header-row (type label), task-row
 * (Objective + Work-line columns), tasks-workspace integration (summary caption).
 *
 * AC coverage:
 *   FR-231: workline group-by dimension available in toolbar
 *   FR-232: grouping by work_line_id (null → "No work-line" trailing group)
 *   FR-233: group-header shows name + type label (Project / Daily / ongoing)
 *   FR-234: Work-line + Objective columns in the table
 *   FR-235: "—" when field is empty
 *   FR-236: summary caption counts project vs daily work-lines per person
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'

// ── Mock data layer ──────────────────────────────────────────────────────────
vi.mock('../../lib/db/tasks', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskRaci: vi.fn(),
  updateTaskFields: vi.fn(),
  addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
vi.mock('../../lib/db/objectives', () => ({
  listObjectives: vi.fn(),
}))
vi.mock('../../lib/db/work-lines', () => ({
  listWorkLines: vi.fn(),
}))

import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TasksWorkspace } from './tasks-workspace'
import { OverlayHostProvider } from '@/shell/overlay-host'

const mockListTasks = vi.mocked(listTasks)
const mockListObjectives = vi.mocked(listObjectives)
const mockListWorkLines = vi.mocked(listWorkLines)

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1', name: 'CEO',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: VIEWER_PERSON, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Default task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const BUS = [{ id: 'bu-1', name: 'Kitchen' }]
const PEOPLE = [
  { id: VIEWER_ID, full_name: 'Arief Said' },
  { id: 'other-id', full_name: 'Maya Rahmawati' },
]
const OBJECTIVES = [
  { id: 'obj-1', name: 'Grow direct orders' },
  { id: 'obj-2', name: 'Launch autumn menu' },
]
const WORK_LINES = [
  { id: 'wl-1', name: 'Daily IG Content', type: 'process' as const },
  { id: 'wl-2', name: 'New Menu Design', type: 'project' as const },
  { id: 'wl-3', name: 'Brand Refresh', type: 'project' as const },
]

function stubMatchMedia(split = true, desktop = true) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('768')) matches = desktop
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

function renderTable(props: Partial<React.ComponentProps<typeof TasksWorkspace>> = {}) {
  const utils = render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/tasks']}>
        <OverlayHostProvider><TasksWorkspace {...props} /></OverlayHostProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  // Grouping and sorting are intentionally behind the desktop View options disclosure.
  // These legacy cascade tests exercise the controls, not the disclosure itself.
  const viewOptions = screen.queryByRole('button', { name: /view options/i })
  if (viewOptions?.getAttribute('aria-expanded') === 'false') fireEvent.click(viewOptions)
  return utils
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetTasksViewPrefForTests()
  stubMatchMedia(true, true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
  mockListObjectives.mockResolvedValue(OBJECTIVES)
  mockListWorkLines.mockResolvedValue(WORK_LINES)
})

// ── FR-231: Work-line option in the Group chip ────────────────────────────────


// Group/Sort/toggles are disclosed behind the desktop "View options" trigger (score-gate
// slice, 2026-07-22). Open it when collapsed; the grouping capability itself is unchanged.
function ensureViewOptionsOpen() {
  const trigger = screen.queryByRole('button', { name: /view & filters|view options/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
}

describe('FR-231 — Work-line option in the Group chip', () => {
  it('the Group chip includes a "Work-line" option', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    const options = Array.from(groupSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options).toContain('Project/Process')
  })
})

// ── FR-232: grouping by work_line_id ─────────────────────────────────────────

describe('FR-232 — group-by Work-line nests rows under work-line headers', () => {
  it('tasks with a work_line_id appear under their work-line group header', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Shoot Tuesday reel', work_line_id: 'wl-1', status: 'In Progress' }),
      makeTask({ id: 't2', title: 'Design menu layout', work_line_id: 'wl-2', status: 'Open' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Shoot Tuesday reel'))
    // Switch groupBy to 'workline'
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      // group header rows appear (tr.grp)
      const groupRows = document.querySelectorAll('tr.grp')
      expect(groupRows.length).toBeGreaterThanOrEqual(2)
      // group header glabels carry the work-line names
      const glabels = Array.from(document.querySelectorAll('.glabel')).map(n => n.textContent)
      expect(glabels).toContain('Daily IG Content')
      expect(glabels).toContain('New Menu Design')
      // leaf rows appear
      expect(screen.getByText('Shoot Tuesday reel')).toBeInTheDocument()
      expect(screen.getByText('Design menu layout')).toBeInTheDocument()
    })
  })

  it('null work_line_id → "No work-line" group at the end', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Orphan task', work_line_id: null }),
      makeTask({ id: 't2', title: 'Linked task', work_line_id: 'wl-1' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Orphan task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      // group header glabels
      const glabels = Array.from(document.querySelectorAll('.glabel')).map(n => n.textContent)
      // "No work-line" group exists
      expect(glabels).toContain('No work-line')
      // Named group also appears
      expect(glabels).toContain('Daily IG Content')
      // Orphan task appears
      expect(screen.getByText('Orphan task')).toBeInTheDocument()
    })
  })

  it('group-by workline does not break existing group-by dimensions', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 'a', title: 'A task', status: 'Blocked' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    // Still works for status
    fireEvent.change(groupSelect, { target: { value: 'status' } })
    await waitFor(() => {
      const glabels = Array.from(document.querySelectorAll('.glabel')).map(n => n.textContent)
      // Status grouping still works; #569 drops empty statuses — only Blocked has a row.
      expect(glabels).toContain('Blocked')
      expect(document.querySelectorAll('tr.grp').length).toBe(1)
    })
  })
})

// ── FR-233: group-header shows name + type label ──────────────────────────────

describe('FR-233 — group header shows type label (Project / Daily / ongoing)', () => {
  it('process work-line shows a "Daily / ongoing" type label', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Daily task', work_line_id: 'wl-1' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Daily task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      // The type label text is present (not color-only — WCAG 1.4.1)
      expect(screen.getByText(/daily.*ongoing/i)).toBeInTheDocument()
    })
  })

  it('project work-line shows a "Project" type label', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't2', title: 'Project task', work_line_id: 'wl-2' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Project task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      // Find the group header row for "New Menu Design" (wl-2, type=project)
      const grpRows = Array.from(document.querySelectorAll('tr.grp'))
      const menuRow = grpRows.find(r => r.textContent?.includes('New Menu Design'))
      expect(menuRow).not.toBeNull()
      // That row's type tag should say "Project"
      expect(menuRow!.textContent).toMatch(/project/i)
    })
  })

  it('null work-line group header has no type label', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Orphan', work_line_id: null }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Orphan'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      expect(screen.getByText('No work-line')).toBeInTheDocument()
    })
  })

  it('type label is never color-only: both process and project labels carry readable text (WCAG 1.4.1)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Process task', work_line_id: 'wl-1' }),
      makeTask({ id: 't2', title: 'Project task', work_line_id: 'wl-2' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Process task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      // Both type labels are text nodes in the DOM group headers — not just colored dots.
      const grpRows = Array.from(document.querySelectorAll('tr.grp'))
      const allText = grpRows.map(r => r.textContent ?? '').join(' ')
      expect(allText).toMatch(/daily.*ongoing/i)
      expect(allText).toMatch(/project/i)
    })
  })
})

// ── FR-234/235: Work-line + Objective — moved to the drawer (Wave 2c) ────────
// OD-REDESIGN-61..64 (e7 priority columns): the default desktop DB-view table shows
// ONLY Title · PIC · Supervisor · Status · Due. Work-line/Project-Process + Objective
// (and Team/Source/Activity) moved OUT of the table into the record drawer/full page,
// where the typed Task already shows them (OD-62). This is column PRIORITY, not data
// removal — the work-line group-by dimension (FR-231/232/233) + workload caption
// (FR-236) are unchanged, and resolution + reachability stay proven by the mobile
// card tests below + the TaskSurface drawer.
describe('FR-234 — Work-line/Objective moved OUT of the default desktop table (Wave 2c)', () => {
  it('thead does NOT render Work-line or Objective column headers (priority trim)', async () => {
    mockListTasks.mockResolvedValue([makeTask({ title: 'A task' })])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    expect(screen.queryByRole('columnheader', { name: /project\/process/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /objective/i })).toBeNull()
    // Priority decision headers remain (incl. Due — the regression was Due clipping).
    expect(screen.getByRole('columnheader', { name: /due/i })).toBeInTheDocument()
  })

  it('a body row does NOT render Work-line/Objective cells (moved to drawer)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'IG task', work_line_id: 'wl-1', objective_id: 'obj-1' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('IG task'))
    const row = screen.getByText('IG task').closest('tr')!
    expect(row.querySelector('.td-workline')).toBeNull()
    expect(row.querySelector('.td-objective')).toBeNull()
  })
})

// ── FR-236: Summary caption ───────────────────────────────────────────────────

describe('FR-236 — summary caption when grouped by Work-line + single person', () => {
  it('shows a summary caption when groupBy=workline and a single person is filtered', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'IG task', work_line_id: 'wl-1', responsible_person_id: 'other-id' }),
      makeTask({ id: 't2', title: 'Menu task', work_line_id: 'wl-2', responsible_person_id: 'other-id' }),
      makeTask({ id: 't3', title: 'Brand task', work_line_id: 'wl-3', responsible_person_id: 'other-id' }),
    ])
    renderTable()
    // Wait for data
    await waitFor(() => screen.getByText('IG task'))
    // Switch to groupby=workline
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    // Filter to a single person (Maya)
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'other-id' } })
    await waitFor(() => {
      // caption says "Maya's work:" (their first name) — 2 projects, 1 daily
      const caption = screen.getByRole('status', { name: /workload summary/i })
      expect(caption).toBeInTheDocument()
      expect(caption.textContent).toMatch(/maya/i)
      // counts match: 2 project work-lines (wl-2, wl-3), 1 daily/ongoing (wl-1)
      expect(caption.textContent).toMatch(/2\s+project/i)
      expect(caption.textContent).toMatch(/1\s+daily/i)
    })
  })

  it('uses "Your work" when the filtered person is the viewer themselves', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'My IG task', work_line_id: 'wl-1', responsible_person_id: VIEWER_ID }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('My IG task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: VIEWER_ID } })
    await waitFor(() => {
      const caption = screen.getByRole('status', { name: /workload summary/i })
      expect(caption.textContent).toMatch(/your work/i)
    })
  })

  it('shows no caption when no person filter is active', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'A task', work_line_id: 'wl-1' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('A task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    // no personFilter set — wait for the group header to appear
    await waitFor(() => {
      const glabels = Array.from(document.querySelectorAll('.glabel')).map(n => n.textContent)
      expect(glabels).toContain('Daily IG Content')
    })
    expect(screen.queryByRole('status', { name: /workload summary/i })).toBeNull()
  })

  it('shows no caption when groupBy is not workline (even with a person filter)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Status task', status: 'Open', responsible_person_id: 'other-id' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Status task'))
    ensureViewOptionsOpen()
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'status' } })
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'other-id' } })
    await waitFor(() => expect(document.querySelectorAll('tr.grp').length).toBeGreaterThanOrEqual(1))
    expect(screen.queryByRole('status', { name: /workload summary/i })).toBeNull()
  })
})

// ── Mobile: card detail list is PIC/Supervisor/Due only ────────────────────────
// v4 distill (mobile-grouped-cards.tsx TaskCard comment, citing .claude/skills/impeccable
// distill.md "remove redundancy"): Work-line, Objective and Source were dropped from the phone
// card body — they rendered an empty "—" line for every ad-hoc task, "noise wearing information's
// clothes". PIC + Supervisor + Due are the decision-relevant fields for weekly triage (the same
// set the desktop row already settled on, Wave 2c OD-REDESIGN-61..64); full typed metadata is one
// tap away on the record. This describe block used to assert the pre-distill card shape.
describe('Mobile cards: detail list is PIC/Supervisor/Due (Work-line/Objective dropped as redundant)', () => {
  beforeEach(() => {
    stubMatchMedia(false, false) // mobile viewport
    __resetTasksViewPrefForTests()
  })

  it('mobile card shows PIC, Supervisor, and Due — NOT the Work-line/Objective names', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Mobile task', work_line_id: 'wl-2', objective_id: 'obj-2' }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Mobile task'))
    const card = screen.getByText('Mobile task').closest('article')
    expect(card).toHaveTextContent('PIC')
    expect(card).toHaveTextContent('Supervisor')
    expect(card).toHaveTextContent('Due')
    // The Work-line/Objective NAMES are gone from the card body — they're one tap away on the
    // record, not restated here (distill.md "remove redundancy").
    expect(card).not.toHaveTextContent('New Menu Design')
    expect(card).not.toHaveTextContent('Launch autumn menu')
  })

  it('mobile card shows "—" for an empty due date', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Mobile task', work_line_id: null, objective_id: null, due_date: null }),
    ])
    renderTable()
    await waitFor(() => screen.getByText('Mobile task'))
    // At least one "—" for the empty field in the card
    const card = screen.getByText('Mobile task').closest('article')
    expect(card?.textContent).toContain('—')
  })
})
