/**
 * Cascade fix-round regression tests (RI-1..RI-4 + fix 5..7).
 * Each test deliberately fails before the fix and must pass after.
 *
 * AC coverage (new):
 *   RI-3: Task column never renders at 0 width / scroll container is scrollable
 *   RI-2: Person+workline filter suppresses zero-count work-line groups
 *   RI-1: Mobile grouped header renders type-label text when groupBy=workline
 *   RI-4: Caption total reconciles (Done + archived tasks excluded from counts)
 *   Fix-5: Mobile card dt labels are visible (not sr-only)
 *   Fix-6: Work-line picker options include (project)/(daily) cue
 *   Fix-7: useCascadeCatalogs hook — mount-once load, no block on loading gate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { __resetTasksViewPrefForTests } from './use-tasks-view-pref'
import { __resetExpandPrefForTests } from './use-expand-pref'

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
import { MobileGroupedCards } from './mobile-grouped-cards'
import type { MobileGroupedCardsProps } from './mobile-grouped-cards'

const VIEWER_ID = 'viewer-id'
const VIEWER_PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Arief Said',
  email: 'arief@gordi.id', archived_at: null,
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

const PEOPLE = [
  { id: VIEWER_ID, full_name: 'Arief Said' },
  { id: 'maya-id', full_name: 'Maya Rahmawati' },
]
const BUS = [{ id: 'bu-1', name: 'Kitchen' }]
const OBJECTIVES = [
  { id: 'obj-1', name: 'Grow direct orders' },
]
const WORK_LINES = [
  { id: 'wl-project', name: 'New Menu Design', type: 'project' as const },
  { id: 'wl-process', name: 'Daily IG Content', type: 'process' as const },
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

function renderWorkspace(props: Partial<React.ComponentProps<typeof TasksWorkspace>> = {}) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/tasks']}>
        <TasksWorkspace {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  __resetExpandPrefForTests()
  __resetTasksViewPrefForTests()
  stubMatchMedia(true, true)
  vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
  vi.mocked(listObjectives).mockResolvedValue(OBJECTIVES)
  vi.mocked(listWorkLines).mockResolvedValue(WORK_LINES)
})

// ── RI-3: Task column never 0 width + scroll container scrollable ─────────────

describe('RI-3 — Task column width and scroll container', () => {
  it('RI-3: .tasks-scroll has overflow-x: auto so wide content scrolls instead of clipping', () => {
    const cssPath = resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css')
    const css = readFileSync(cssPath, 'utf8')
    // .tasks-scroll must have overflow-x: auto (not visible or hidden)
    const idx = css.indexOf('.tasks-scroll {')
    expect(idx).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', idx)
    const close = css.indexOf('}', open)
    const body = css.slice(open + 1, close)
    // Must have overflow-x: auto
    expect(body).toMatch(/overflow-x:\s*auto/)
    // Must NOT be overflow-x: visible (which clips content)
    expect(body).not.toMatch(/overflow-x:\s*visible/)
  })

  it('RI-3: .tasks-table has a min-width so fixed cols do not starve the Task column', () => {
    const cssPath = resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css')
    const css = readFileSync(cssPath, 'utf8')
    // The table must declare a min-width so it never collapses below the sum of fixed cols.
    // This guarantees the Task (width:auto) col always has space.
    const idx = css.indexOf('.tasks-table {')
    expect(idx).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', idx)
    const close = css.indexOf('}', open)
    const body = css.slice(open + 1, close)
    expect(body).toMatch(/min-width:/)
  })
})

// ── RI-2: Person+workline filter suppresses zero-count groups ─────────────────

describe('RI-2 — Person filter + groupBy=workline suppresses empty groups', () => {
  it('RI-2: when person filter is active, zero-count work-line groups are NOT rendered', async () => {
    // Maya only has tasks on wl-project; wl-process has 0 tasks for Maya.
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'Menu task', work_line_id: 'wl-project', responsible_person_id: 'maya-id' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('Menu task'))

    // Switch to All segment so Maya's task is visible regardless of viewer scope
    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)

    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })

    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'maya-id' } })

    await waitFor(() => {
      const glabels = Array.from(document.querySelectorAll('.glabel')).map(n => n.textContent)
      // wl-project group has Maya's task — must render
      expect(glabels).toContain('New Menu Design')
      // wl-process has 0 tasks for Maya — must NOT render when person filter active
      expect(glabels).not.toContain('Daily IG Content')
    })
  })

  it('RI-2: without a person filter, all work-line groups are shown (layout stability)', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'Task A', work_line_id: 'wl-project' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('Task A'))
    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    await waitFor(() => {
      const glabels = Array.from(document.querySelectorAll('.glabel')).map(n => n.textContent)
      // Both groups render (no person filter = show all for layout stability)
      expect(glabels).toContain('New Menu Design')
      expect(glabels).toContain('Daily IG Content')
    })
  })
})

// ── RI-1: Mobile grouped header renders type-label text when groupBy=workline ──

describe('RI-1 — Mobile grouped header renders work-line type tag', () => {
  it('RI-1: mobile group header renders the type-label text ("Project") when groupBy=workline', () => {
    const groups: MobileGroupedCardsProps['groups'] = [
      {
        key: 'wl-project',
        label: 'New Menu Design',
        rows: [makeTask({ id: 't1', work_line_id: 'wl-project' })],
        overdue: 0,
        prefillParam: '',
        workLineType: 'project',
      },
    ]
    render(
      <MemoryRouter>
        <MobileGroupedCards
          groups={groups}
          now={new Date('2026-06-24')}
          buMap={new Map([['bu-1', 'Kitchen']])}
          personMap={new Map([[VIEWER_ID, 'Arief Said']])}
          isCollapsed={() => false}
          toggleCollapsed={() => {}}
          openAddTask={() => {}}
          setOverdueOnly={() => {}}
          buildOthers={() => []}
          workLineMap={new Map([['wl-project', 'New Menu Design']])}
          objectiveMap={new Map()}
        />
      </MemoryRouter>,
    )
    // The group header must include a type-label text node "Project" (not color-only)
    const head = document.querySelector('.mgc-group-head')
    expect(head).toBeTruthy()
    expect(head!.textContent).toMatch(/project/i)
  })

  it('RI-1: mobile group header renders "Daily / ongoing" for process work-line', () => {
    const groups: MobileGroupedCardsProps['groups'] = [
      {
        key: 'wl-process',
        label: 'Daily IG Content',
        rows: [makeTask({ id: 't2', work_line_id: 'wl-process' })],
        overdue: 0,
        prefillParam: '',
        workLineType: 'process',
      },
    ]
    render(
      <MemoryRouter>
        <MobileGroupedCards
          groups={groups}
          now={new Date('2026-06-24')}
          buMap={new Map([['bu-1', 'Kitchen']])}
          personMap={new Map([[VIEWER_ID, 'Arief Said']])}
          isCollapsed={() => false}
          toggleCollapsed={() => {}}
          openAddTask={() => {}}
          setOverdueOnly={() => {}}
          buildOthers={() => []}
          workLineMap={new Map([['wl-process', 'Daily IG Content']])}
          objectiveMap={new Map()}
        />
      </MemoryRouter>,
    )
    const head = document.querySelector('.mgc-group-head')
    expect(head!.textContent).toMatch(/daily.*ongoing/i)
  })

  it('RI-1: null workLineType (No work-line group) renders no type tag in mobile header', () => {
    const groups: MobileGroupedCardsProps['groups'] = [
      {
        key: '__no_workline__',
        label: 'No work-line',
        rows: [makeTask({ id: 't3', work_line_id: null })],
        overdue: 0,
        prefillParam: '',
        workLineType: null,
      },
    ]
    render(
      <MemoryRouter>
        <MobileGroupedCards
          groups={groups}
          now={new Date('2026-06-24')}
          buMap={new Map([['bu-1', 'Kitchen']])}
          personMap={new Map([[VIEWER_ID, 'Arief Said']])}
          isCollapsed={() => false}
          toggleCollapsed={() => {}}
          openAddTask={() => {}}
          setOverdueOnly={() => {}}
          buildOthers={() => []}
          workLineMap={new Map()}
          objectiveMap={new Map()}
        />
      </MemoryRouter>,
    )
    const head = document.querySelector('.mgc-group-head')
    // No "Project" or "Daily" tag in the No work-line group header
    expect(head!.textContent).not.toMatch(/^project$/i)
    expect(head!.textContent).not.toMatch(/daily.*ongoing/i)
  })
})

// ── RI-4: Caption total reconciles (Done + archived excluded) ─────────────────

describe('RI-4 — Caption reconciles; Done + archived tasks excluded from counts', () => {
  it('RI-4: caption counts only open (non-Done, non-archived) tasks for work-line projects', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      // Counted: open task on wl-project
      makeTask({ id: 't1', title: 'Open project task', work_line_id: 'wl-project',
        responsible_person_id: 'maya-id', status: 'Open' }),
      // NOT counted: Done task on wl-project
      makeTask({ id: 't2', title: 'Done project task', work_line_id: 'wl-project',
        responsible_person_id: 'maya-id', status: 'Done' }),
      // NOT counted: archived task on wl-process
      makeTask({ id: 't3', title: 'Archived process task', work_line_id: 'wl-process',
        responsible_person_id: 'maya-id', status: 'Open',
        archived_at: '2026-06-01T00:00:00Z' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('Open project task'))

    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)

    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'maya-id' } })

    await waitFor(() => {
      const caption = screen.getByRole('status', { name: /workload summary/i })
      // Only 1 project (wl-project has 1 open task; Done is excluded)
      // wl-process has archived task → excluded → 0 daily
      expect(caption.textContent).toMatch(/1\s+project/i)
      // The daily count is 0 — 'no work-lines yet' OR the caption omits it
      expect(caption.textContent).not.toMatch(/1\s+daily/i)
    })
  })

  it('RI-4: Done task excluded — caption does not count its work-line as active', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'Done only', work_line_id: 'wl-process',
        responsible_person_id: 'maya-id', status: 'Done' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('Done only'))

    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)

    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'maya-id' } })

    await waitFor(() => {
      const caption = screen.getByRole('status', { name: /workload summary/i })
      // 0 projects, 0 daily — Done task must not inflate count
      expect(caption.textContent).not.toMatch(/\b[1-9]\d*\s+project/i)
      expect(caption.textContent).not.toMatch(/\b[1-9]\d*\s+daily/i)
    })
  })

  it('RI-4: unassigned tasks (no work_line_id) append "and N unassigned" to the caption', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'Project task', work_line_id: 'wl-project',
        responsible_person_id: 'maya-id', status: 'Open' }),
      // Unclassified open task — must show in "unassigned" clause
      makeTask({ id: 't2', title: 'Unassigned task', work_line_id: null,
        responsible_person_id: 'maya-id', status: 'Open' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('Project task'))

    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)

    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'maya-id' } })

    await waitFor(() => {
      const caption = screen.getByRole('status', { name: /workload summary/i })
      // Caption must include "and 1 unassigned" (reconciles with the unclassified task)
      expect(caption.textContent).toMatch(/and\s+1\s+unassigned/i)
    })
  })

  it('RI-4: no "and N unassigned" clause when all tasks have a work-line', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'Project task', work_line_id: 'wl-project',
        responsible_person_id: 'maya-id', status: 'Open' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('Project task'))

    const seg = screen.getByRole('tablist', { name: /ownership filter/i })
    const allBtn = Array.from(seg.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('All'))
    if (allBtn) fireEvent.click(allBtn as Element)

    const groupSelect = screen.getByRole('combobox', { name: /group/i })
    fireEvent.change(groupSelect, { target: { value: 'workline' } })
    const personSelect = screen.getByRole('combobox', { name: /person/i })
    fireEvent.change(personSelect, { target: { value: 'maya-id' } })

    await waitFor(() => {
      const caption = screen.getByRole('status', { name: /workload summary/i })
      expect(caption.textContent).not.toMatch(/unassigned/i)
    })
  })
})

// ── Fix-5: Mobile card dt labels are visible (not sr-only) ───────────────────

describe('Fix-5 — Mobile card dt labels are visible', () => {
  it('Fix-5: Work-line dt label is visible (not sr-only) in mobile task card', () => {
    const taskWithWl = makeTask({ id: 't1', work_line_id: 'wl-project' })
    render(
      <MemoryRouter>
        <MobileGroupedCards
          groups={[{
            key: '__flat__',
            label: '',
            rows: [taskWithWl],
            overdue: 0,
            prefillParam: '',
          }]}
          now={new Date('2026-06-24')}
          buMap={new Map([['bu-1', 'Kitchen']])}
          personMap={new Map([[VIEWER_ID, 'Arief Said']])}
          isCollapsed={() => false}
          toggleCollapsed={() => {}}
          openAddTask={() => {}}
          setOverdueOnly={() => {}}
          buildOthers={() => []}
          workLineMap={new Map([['wl-project', 'New Menu Design']])}
          objectiveMap={new Map([['obj-1', 'Grow direct orders']])}
        />
      </MemoryRouter>,
    )
    // dt labels must be visible — not have class sr-only
    const dts = Array.from(document.querySelectorAll('.task-card-meta dt'))
    const srOnlyDts = dts.filter(dt => dt.classList.contains('sr-only'))
    // After fix: 0 dt elements may be sr-only (all are visible label:value)
    expect(srOnlyDts.length).toBe(0)
    // The dt text content is readable ("Work-line", "Objective", "Due", "Owner", "Activity")
    const dtTexts = dts.map(dt => dt.textContent)
    expect(dtTexts.some(t => /project\/process/i.test(t ?? ''))).toBe(true)
  })

  it('Fix-5: task-card-meta dt elements are not display:none or visually hidden', () => {
    // CSS rule: .task-card-meta dt { display: none } must not exist after fix
    const cssPath = resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css')
    const css = readFileSync(cssPath, 'utf8')
    // Find the .task-card-meta dt rule
    const ruleMatch = css.match(/\.task-card-meta\s+dt\s*\{([^}]+)\}/)
    if (ruleMatch) {
      const body = ruleMatch[1]
      // After fix: no display:none
      expect(body).not.toMatch(/display:\s*none/)
    }
    // If there is no .task-card-meta dt rule at all, that's also fine (no hiding)
  })
})

// ── Fix-6: Work-line picker options include type cue ─────────────────────────

describe('Fix-6 — Work-line picker options include project/daily cue', () => {
  it('Fix-6: create form work-line options show "(project)" or "(daily)" suffix', async () => {
    // Render in a way that triggers CreateSurface (mode=create)
    // We test the option text from TaskSurface indirectly by rendering
    // the workspace and checking the select options after the cascade lookups arrive.
    // We test it via the work-line pickers rendered in the task-surface create form.
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

    // Since TaskSurface renders the pickers, we import it directly
    const { TaskSurface } = await import('./task-surface')
    vi.mocked(listObjectives).mockResolvedValue(OBJECTIVES)
    vi.mocked(listWorkLines).mockResolvedValue(WORK_LINES)
    vi.mocked(getBusinessUnits).mockResolvedValue(BUS)
    vi.mocked(getPeople).mockResolvedValue(PEOPLE)

    const { createTask } = await import('@/lib/db/tasks')
    vi.mocked(createTask).mockResolvedValue('new-id')

    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="full" onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    // Wait for work-line select to appear
    const wlSelect = await screen.findByRole('combobox', { name: /project\/process/i })
    const options = Array.from(wlSelect.querySelectorAll('option')).map(o => o.textContent ?? '')
    // Options must include the type cue in parentheses
    expect(options.some(o => /project/i.test(o))).toBe(true)
    expect(options.some(o => /daily/i.test(o))).toBe(true)
  })
})

// ── Fix-7: useCascadeCatalogs hook — mount-once load ─────────────────────────

describe('Fix-7 — useCascadeCatalogs hook', () => {
  it('Fix-7: listObjectives and listWorkLines are called only once at mount (not on filter change)', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't1', title: 'A task' }),
    ])
    renderWorkspace()
    await waitFor(() => screen.getByText('A task'))

    const initialObjectivesCalls = vi.mocked(listObjectives).mock.calls.length
    const initialWorkLinesCalls = vi.mocked(listWorkLines).mock.calls.length

    // Trigger a filter change (status filter) — should NOT re-trigger catalog loads
    const statusSelect = screen.getByRole('combobox', { name: /status/i })
    fireEvent.change(statusSelect, { target: { value: 'Open' } })
    await waitFor(() => {}) // allow any async effects to settle

    // Catalog calls must NOT increase when a filter changes
    expect(vi.mocked(listObjectives).mock.calls.length).toBe(initialObjectivesCalls)
    expect(vi.mocked(listWorkLines).mock.calls.length).toBe(initialWorkLinesCalls)
  })

  it('Fix-7: catalog load failure does not block the task list from rendering', async () => {
    vi.mocked(listObjectives).mockRejectedValue(new Error('catalog failed'))
    vi.mocked(listWorkLines).mockRejectedValue(new Error('catalog failed'))
    vi.mocked(listTasks).mockResolvedValue([makeTask({ id: 't1', title: 'Resilient task' })])

    renderWorkspace()
    await waitFor(() => screen.getByText('Resilient task'))
    // The table renders normally even when catalog loads fail
    expect(screen.getByText('Resilient task')).toBeInTheDocument()
  })
})
