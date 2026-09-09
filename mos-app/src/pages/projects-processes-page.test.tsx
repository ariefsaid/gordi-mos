import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('@/lib/db/work-records', () => ({ listProcessCollectionFacts: vi.fn().mockResolvedValue([]) }))

import { listWorkLinesAll, createWorkLine } from '@/lib/db/work-lines'
import { listObjectivesAll } from '@/lib/db/objectives'
import { listTasks } from '@/lib/db/tasks'
import { listProcessCollectionFacts } from '@/lib/db/work-records'
import { ProjectsProcessesPage } from './projects-processes-page'

function task(id: string, objectiveId: string | null, workLineId: string | null, status: TaskListRow['status'] = 'Open'): TaskListRow {
  return {
    id, org_id: 'org-1', title: id, business_unit_id: 'bu-1', status,
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

function openViewOptions() {
  fireEvent.click(screen.getByRole('button', { name: 'View & filters' }))
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
  vi.mocked(listTasks).mockResolvedValue([])
  vi.mocked(createWorkLine).mockResolvedValue({ id: 'wl-new', name: 'New', type: 'project', archived_at: null })
})

describe('Projects & Processes collection-first contract', () => {
  it('renders real row links with relation, progress, and activity facts', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1', 'Done'),
      task('t2', 'obj-1', 'wl-1'),
    ])
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    expect(screen.getByRole('link', { name: 'Menu launch' })).toHaveAttribute('href', '/work/projects/wl-1')
    expect(screen.getByText('Grow revenue')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 done')).toBeInTheDocument()
    expect(screen.getByText('07 Jul 2026, 07:00 WIB')).toBeInTheDocument()
    expect(container.querySelector('.catalog-collection__disclosure')).toBeNull()
    expect(screen.queryByRole('button', { name: /rename menu launch/i })).toBeNull()
  })

  it('uses current occurrence progress for Processes and names schedule states honestly', async () => {
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
      { id: 'wl-2', name: 'Daily prep', type: 'process', archived_at: null },
      { id: 'wl-3', name: 'Unscheduled process', type: 'process', archived_at: null },
      { id: 'wl-4', name: 'Ad hoc process', type: 'process', archived_at: null },
      { id: 'wl-5', name: 'Started with pending work', type: 'process', archived_at: null },
    ])
    // Lifetime linked Tasks deliberately disagree with the current occurrence: the Process row
    // must use the authoritative current-run roll-up, not the cascade's all-time count.
    vi.mocked(listTasks).mockResolvedValue([
      task('history-1', null, 'wl-2'),
      task('history-2', null, 'wl-2'),
      task('history-3', null, 'wl-2'),
    ])
    vi.mocked(listProcessCollectionFacts).mockResolvedValue([
      {
        work_line_id: 'wl-2', cadence_kind: 'daily', cadence_active: true, anchor_date: null,
        next_due_date: '2026-09-09',
        current_occurrence: { run_ids: ['run-2'], scheduled_date: '2026-09-09', status: 'open', done: 1, total: 2, pending_unresolved: 0 },
      },
      {
        work_line_id: 'wl-3', cadence_kind: null, cadence_active: null, anchor_date: null,
        next_due_date: null, current_occurrence: null,
      },
      {
        work_line_id: 'wl-4', cadence_kind: 'manual', cadence_active: true, anchor_date: null,
        next_due_date: null, current_occurrence: null,
      },
      {
        work_line_id: 'wl-5', cadence_kind: 'daily', cadence_active: true, anchor_date: null,
        next_due_date: '2026-09-09',
        current_occurrence: { run_ids: ['run-5'], scheduled_date: '2026-09-09', status: 'open', done: 0, total: 0, pending_unresolved: 1 },
      },
    ] as never)

    renderPage()

    const daily = await screen.findByRole('link', { name: 'Daily prep' })
    expect(within(daily).getByTestId('catalog-progress')).toHaveTextContent('1 / 2 done')
    expect(within(daily).queryByText('0 / 3 done')).toBeNull()

    const unscheduled = screen.getByRole('link', { name: 'Unscheduled process' })
    expect(within(unscheduled).getByTestId('catalog-progress')).toHaveTextContent('No schedule')

    const manual = screen.getByRole('link', { name: 'Ad hoc process' })
    expect(within(manual).getByTestId('catalog-progress')).toHaveTextContent('On demand')

    const pending = screen.getByRole('link', { name: 'Started with pending work' })
    expect(within(pending).getByTestId('catalog-progress')).toHaveTextContent('1 awaiting assignment')
  })

  it('uses the head Create door and renders a focused draft row inside the collection', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    expect(screen.getByTestId('page-head').querySelector('.ch-action')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create project or process' }))
    const form = await screen.findByRole('form', { name: 'Create project or process' })
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Weekly stock opname' } })
    fireEvent.click(within(form).getByRole('combobox', { name: 'Type' }))
    fireEvent.click(screen.getByRole('option', { name: 'Process' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createWorkLine).toHaveBeenCalledWith('Weekly stock opname', 'process'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create project or process' })).toHaveFocus())
  })

  it('cancels the focused draft on Escape through the same path as Cancel', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Create project or process' }))
    const form = await screen.findByRole('form', { name: 'Create project or process' })
    const name = within(form).getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Discard this draft' } })
    fireEvent.keyDown(name, { key: 'Escape' })

    expect(screen.queryByRole('form', { name: 'Create project or process' })).toBeNull()
    expect(createWorkLine).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create project or process' })).toHaveFocus()
  })

  it('puts All / Projects / Processes behind the phone view disclosure and filters the rows', async () => {
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    expect(screen.queryByRole('button', { name: 'Projects' })).toBeNull()
    openViewOptions()
    expect(screen.getByRole('button', { name: 'All types' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Processes' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Processes' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Menu launch' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Daily prep' })).toBeInTheDocument()
    expect(container.querySelector('.catalog-collection__disclosure')).toBeNull()
  })
})
