// ProjectsProcessesPage — V3 catalog collection grammar (RecordCollectionSurface + CollectionToolbar).
// AC-406 (FR-422): each project/process shows its parent objective(s) + the per-objective task count.
// The parent is READ from the shipped `work_lines.objective_id` edge (DD-WAY-15, #204); the Task's own
// objective_id is the fallback for a task filed with no Project/Process. These fixtures set both, so
// the trace reads the same either way — the edge-vs-fallback precedence itself is owned by
// `src/lib/cascade/count-rollup.test.ts`. The management CRUD (create with a Type field / rename / archive / unarchive) and
// the Project·Process type filter are preserved; journeys assert the goal, not the old inline-add chrome.
//
// PORTED 2026-08-05 (#194). Two assertion literals here contradicted the v4 SOURCE and were refreshed
// to it; every goal is asserted unchanged.
//   1. The create affordance was named "Add project or process"; the source calls it "Create project
//      or process" (`catalog.projects.add`). Same cause as the sibling Objectives file — the copy
//      landed in b81bb42 (2026-07-28), the assertions in 2d33247 (2026-07-23). Indonesian agrees
//      ('Buat proyek atau proses').
//   2. The FR-422 orphan trace was matched as "no parent objective (N)"; the source renders
//      "no parent Objective (N)" (`catalog.trace.noParent`). Objective is a domain term and is
//      capitalised throughout CONTEXT.md's three-level cascade, so the source is the contract here.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'

vi.mock('@/lib/db/work-lines', () => ({
  listWorkLinesAll: vi.fn(),
  createWorkLine: vi.fn(),
  renameWorkLine: vi.fn(),
  setWorkLineArchived: vi.fn(),
}))
vi.mock('@/lib/db/objectives', () => ({ listObjectivesAll: vi.fn() }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))

import {
  listWorkLinesAll, createWorkLine, renameWorkLine, setWorkLineArchived,
} from '@/lib/db/work-lines'
import { listObjectivesAll } from '@/lib/db/objectives'
import { listTasks } from '@/lib/db/tasks'
import { ProjectsProcessesPage } from './projects-processes-page'

function task(id: string, objectiveId: string | null, workLineId: string | null): TaskListRow {
  return {
    id, org_id: 'org-1', title: id, business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'p1', accountable_person_id: 'p1', consulted_person_ids: [],
    informed_person_ids: [], description: null, due_date: null,
    objective_id: objectiveId, work_line_id: workLineId,
    last_activity_at: '2026-07-07T00:00:00Z', archived_at: null, created_by: 'p1',
    created_at: '2026-07-07T00:00:00Z', updated_at: '2026-07-07T00:00:00Z',
  }
}

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ProjectsProcessesPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listWorkLinesAll).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
    { id: 'wl-2', name: 'Daily prep', type: 'process', archived_at: null },
  ])
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
    { id: 'obj-2', name: 'Brand love', archived_at: null },
  ])
  vi.mocked(createWorkLine).mockResolvedValue({ id: 'wl-new', name: 'New', type: 'project', archived_at: null })
  vi.mocked(renameWorkLine).mockResolvedValue()
  vi.mocked(setWorkLineArchived).mockResolvedValue()
})

describe('AC-406: ProjectsProcessesPage up-trace (FR-422)', () => {
  it('shows the parent objective(s) + per-objective task count', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1'),
      task('t2', 'obj-1', 'wl-1'),
      task('t3', 'obj-2', 'wl-1'),
    ])
    renderPage()
    await screen.findByText('Menu launch')
    const trace = await screen.findByTestId('catalog-trace')
    // Menu launch ladders up to Grow revenue (2) + Brand love (1)
    expect(trace.textContent).toContain('Under:')
    expect(trace.textContent).toContain('Grow revenue (2)')
    expect(trace.textContent).toContain('Brand love (1)')
    // DO-20(a) (census F3): the counts carry their unit — the up-trace mirrors the
    // down-trace grammar with a trailing labeled total, never bare "(2)" figures alone.
    expect(trace.textContent).toContain('3 tasks')
  })

  it('surfaces "no parent objective (N)" for a work_line whose tasks have a work_line but no objective (FR-422 edge case)', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1'),
      task('t2', null, 'wl-2'),
    ])
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    await screen.findByText('Daily prep')
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="catalog-trace"]')).toHaveLength(2)
    })
    const traces = [...container.querySelectorAll('[data-testid="catalog-trace"]')].map((n) => n.textContent)
    expect(traces.some((t) => t?.includes('no parent Objective (1)'))).toBe(true)
  })
})

describe('V3 collection grammar conformance', () => {
  beforeEach(() => { vi.mocked(listTasks).mockResolvedValue([]) })

  it('renders on the shared Management family frame with the V3 surface + toolbar', async () => {
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    const main = container.querySelector('main')
    expect(main).toHaveAttribute('data-page-family', 'management')
    expect(main?.querySelector(':scope > .page-frame__content')).toBeTruthy()
    expect(container.querySelector('[data-testid="record-collection-toolbar"]')).toBeTruthy()
  })

  it('each row carries its Project / Process type tag', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    // Scope to the collection list so the create-bar Type <option>s don't match.
    const list = screen.getByRole('list', { name: 'Active' })
    expect(within(list).getByText('Project')).toBeInTheDocument()
    expect(within(list).getByText('Process')).toBeInTheDocument()
  })

  it('exactly ONE create affordance — the inline Add bar (the head carries no action slot)', async () => {
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    expect(container.querySelector('.ch-action')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Create project or process' })).toHaveLength(1)
  })
})

describe('Catalog CRUD + type filter are preserved under the new grammar', () => {
  beforeEach(() => { vi.mocked(listTasks).mockResolvedValue([]) })

  it('create: the inline Add bar creates a work_line with the chosen Type (FR-013/014)', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    const form = screen.getByRole('form', { name: 'Create project or process' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Weekly stock opname' } })
    fireEvent.change(within(form).getByRole('combobox'), { target: { value: 'process' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Create project or process' }))
    await waitFor(() => expect(createWorkLine).toHaveBeenCalledWith('Weekly stock opname', 'process'))
  })

  it('rename: the inline row editor calls renameWorkLine with the new name', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Rename Menu launch' }))
    const editor = await screen.findByLabelText('Rename Menu launch')
    fireEvent.change(editor, { target: { value: 'Menu relaunch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(renameWorkLine).toHaveBeenCalledWith('wl-1', 'Menu relaunch'))
  })

  it('archive: the row Archive action soft-archives the work_line', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Archive Menu launch' }))
    await waitFor(() => expect(setWorkLineArchived).toHaveBeenCalledWith('wl-1', true))
  })

  it('unarchive: the Archived view exposes Unarchive, which restores the work_line', async () => {
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
      { id: 'wl-3', name: 'Retired process', type: 'process', archived_at: '2026-01-01T00:00:00Z' },
    ])
    renderPage()
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    const unarchive = await screen.findByRole('button', { name: 'Unarchive Retired process' })
    fireEvent.click(unarchive)
    await waitFor(() => expect(setWorkLineArchived).toHaveBeenCalledWith('wl-3', false))
  })

  it('type filter: narrowing to Processes hides the Projects', async () => {
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    const typeFilter = container.querySelector('#collection-filter-type') as HTMLSelectElement
    fireEvent.change(typeFilter, { target: { value: 'process' } })
    await waitFor(() => expect(screen.queryByText('Menu launch')).toBeNull())
    expect(screen.getByText('Daily prep')).toBeInTheDocument()
  })
})
