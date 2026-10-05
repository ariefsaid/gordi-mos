import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, Outlet, MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { CreateDraftProvider } from '@/shell/create-drafts'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { AuthState } from '@/auth/context'

vi.mock('@/lib/db/work-lines', () => ({
  listWorkLinesAll: vi.fn(),
  createWorkLine: vi.fn(),
  renameWorkLine: vi.fn(),
  setWorkLineArchived: vi.fn(),
}))
vi.mock('@/lib/db/objectives', () => ({ listObjectivesAll: vi.fn() }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/lib/db/work-records', () => ({ listProcessCollectionFacts: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [], objective_content_org: false, objective_content_bu_ids: [] }),
  getWorkWriteScopes: vi.fn(),
}))
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/catalog/catalog-record-document', () => ({
  CatalogRecordDocument: ({ id }: { id: string }) => <p>record body {id}</p>,
}))
vi.mock('@/components/tasks/task-drawer', () => ({ TaskOverlayContent: () => null }))

import { listWorkLinesAll, createWorkLine } from '@/lib/db/work-lines'
import { listObjectivesAll } from '@/lib/db/objectives'
import { listTasks } from '@/lib/db/tasks'
import { listProcessCollectionFacts } from '@/lib/db/work-records'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { useAuth } from '@/auth/use-auth'
import { ProjectsProcessesPage } from './projects-processes-page'

function viewerAuth(): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles: ['ops_lead'], affiliated: [],
    },
    signOut: vi.fn(),
  }
}

function task(id: string, objectiveId: string | null, workLineId: string | null, status: TaskListRow['status'] = 'Open'): TaskListRow {
  return {
    id, org_id: 'org-1', title: id, business_unit_id: 'bu-1', status,
    responsible_person_id: 'p1', accountable_person_id: 'p1', consulted_person_ids: [],
    informed_person_ids: [], due_date: null,
    objective_id: objectiveId, work_line_id: workLineId,
    last_activity_at: '2026-07-07T00:00:00Z', archived_at: null, created_by: 'p1',
  }
}

function renderPage(entry = "/", locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[entry]}>
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
  vi.mocked(useAuth).mockReturnValue(viewerAuth())
  vi.mocked(listWorkLinesAll).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
    { id: 'wl-2', name: 'Daily prep', type: 'process', archived_at: null },
  ])
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
    { id: 'obj-2', name: 'Brand love', archived_at: null },
  ])
  vi.mocked(listTasks).mockResolvedValue([])
  vi.mocked(getWorkWriteScopes).mockResolvedValue({
    workline_org: true,
    objective_org: true,
    workline_bu_ids: [],
    objective_bu_ids: [],
    objective_content_org: false,
    objective_content_bu_ids: [],
  })
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
    const menuLaunch = screen.getByRole('link', { name: 'Menu launch' })
    const menuLaunchRow = menuLaunch.closest('[role="row"]') as HTMLElement
    // Task-derived Objective context belongs in the Objective cell even without a direct parent.
    expect(
      within(menuLaunchRow).getByRole('cell', { name: 'Objective: Not set. Contributes through Tasks to: Grow revenue' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Objective' })).toBeInTheDocument()
    expect(within(menuLaunchRow).getByText('Contributes through Tasks to: Grow revenue')).toBeInTheDocument()
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
    const dailyRow = daily.closest('[role="row"]') as HTMLElement
    expect(within(dailyRow).getByTestId('catalog-progress')).toHaveTextContent('1 / 2 done')
    expect(within(dailyRow).queryByText('0 / 3 done')).toBeNull()

    const unscheduled = screen.getByRole('link', { name: 'Unscheduled process' })
    const unscheduledRow = unscheduled.closest('[role="row"]') as HTMLElement
    expect(within(unscheduledRow).getByTestId('catalog-progress')).toHaveTextContent('No schedule')

    const manual = screen.getByRole('link', { name: 'Ad hoc process' })
    const manualRow = manual.closest('[role="row"]') as HTMLElement
    expect(within(manualRow).getByTestId('catalog-progress')).toHaveTextContent('On demand')

    const pending = screen.getByRole('link', { name: 'Started with pending work' })
    const pendingRow = pending.closest('[role="row"]') as HTMLElement
    expect(within(pendingRow).getByTestId('catalog-progress')).toHaveTextContent('1 awaiting assignment')
  })

  it('uses the head Create door and renders a form ABOVE the table, never inside it', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    expect(screen.getByTestId('page-head').querySelector('.ch-action')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create project or process' }))
    const form = await screen.findByRole('form', { name: 'Create project or process' })
    // Defect 1: the create form is its own block, not a row wedged under the table's column
    // headers — it must not be a descendant of the collection's role=table.
    expect(form.closest('[role="table"]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Weekly stock opname' } })
    fireEvent.click(within(form).getByRole('combobox', { name: 'Type' }))
    fireEvent.click(screen.getByRole('option', { name: 'Process' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Create process' }))
    await waitFor(() => expect(createWorkLine).toHaveBeenCalledWith('Weekly stock opname', 'process'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create project or process' })).toHaveFocus())
  })

  // AC-003
  it('preserves a failed Process draft and its type for retry', async () => {
    vi.mocked(createWorkLine).mockRejectedValueOnce(new Error('Temporary save failure'))
    renderPage()
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Create project or process' }))
    const form = await screen.findByRole('form', { name: 'Create project or process' })
    const name = within(form).getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Weekly stock opname' } })
    fireEvent.click(within(form).getByRole('combobox', { name: 'Type' }))
    fireEvent.click(screen.getByRole('option', { name: 'Process' }))
    fireEvent.click(within(form).getByRole('combobox', { name: 'Objective' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Brand love' }))
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save. Try again.')
    expect(name).toHaveValue('Weekly stock opname')
    expect(within(form).getByRole('combobox', { name: 'Objective' })).toHaveTextContent('Brand love')
    await waitFor(() => expect(name).toHaveFocus())
    expect(within(form).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Process')
    fireEvent.submit(form)
    await waitFor(() => expect(createWorkLine).toHaveBeenNthCalledWith(2, 'Weekly stock opname', 'process', expect.objectContaining({ objective_id: 'obj-2' })))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Create project or process' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Create project or process' })).toHaveFocus()
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


describe('R5 collection state boundaries', () => {
  it('keeps loading distinct from an empty success', async () => {
    vi.mocked(listWorkLinesAll).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('status', { name: 'Loading projects & processes…' })).toBeInTheDocument()
    expect(screen.queryByText('No projects or processes yet')).toBeNull()
  })

  it('shows true empty without Clear filters', async () => {
    vi.mocked(listWorkLinesAll).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No projects or processes yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('keeps filtered empty clearable with the shared item-specific message', async () => {
    renderPage('/?q=no-such-record')
    expect(await screen.findByRole('heading', { name: 'No projects and processes match these filters' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByRole('link', { name: 'Menu launch' })).toBeInTheDocument()
  })

  it.each([false, true])('says exactly Nothing archived yet without Clear filters (entire catalog empty: %s)', async (empty) => {
    if (empty) vi.mocked(listWorkLinesAll).mockResolvedValue([])
    renderPage('/?view=archived')
    expect(await screen.findByRole('heading', { name: 'Nothing archived yet' })).toBeInTheDocument()
    const disclosure = screen.queryByRole('button', { name: /View & filters/ })
    if (disclosure) fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name: 'Current status' })).toHaveTextContent('Archived')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    expect(screen.queryByText('No projects or processes yet')).toBeNull()
  })

  it('labels the status trigger and states that the default view is active-only', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Menu launch' })
    openViewOptions()
    const trigger = screen.getByRole('button', { name: 'Current status' })
    expect(trigger).toHaveTextContent('Active only')
  })

  it.each(['timeout', 'server'])('keeps a %s failure out of empty success and retries', async (failure) => {
    vi.mocked(listWorkLinesAll).mockRejectedValueOnce(new Error(failure))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load')
    expect(screen.queryByText('No projects or processes yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('link', { name: 'Menu launch' })).toBeInTheDocument()
  })
})

describe('R5 denied write authority', () => {
  it('keeps Projects and Processes readable while denying creation and rename', async () => {
    const auth = viewerAuth()
    if (auth.status !== 'authenticated') throw new Error('Expected authenticated fixture')
    auth.viewer.accessRoles = ['member']
    vi.mocked(useAuth).mockReturnValue(auth)
    vi.mocked(getWorkWriteScopes).mockResolvedValue({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [], objective_content_org: false, objective_content_bu_ids: [] })
    renderPage()
    expect(await screen.findByRole('link', { name: 'Menu launch' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Daily prep' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create project or process' })).toBeNull()
    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull()
  })
})


it('R5: archived records hidden by search remain filtered-empty and clearable', async () => {
  vi.mocked(listWorkLinesAll).mockResolvedValue([{ id: 'archived-1', name: 'Archived project', type: 'project', archived_at: '2026-01-01' }])
  renderPage('/?view=archived&q=no-match')
  expect(await screen.findByRole('heading', { name: 'No projects and processes match these filters' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  expect(screen.queryByText('Nothing archived yet')).toBeNull()
})

describe('one create entry per width', () => {
  const original = window.matchMedia
  const railCollapsed = (collapsed: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('919.98') ? collapsed : false,
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
  afterEach(() => { window.matchMedia = original })

  it('keeps the header create button while the rail is expanded', async () => {
    railCollapsed(false)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Create project or process' })).toBeInTheDocument()
  })

  it('hides the header create button while the rail is collapsed, and opens the form from the global create intent', async () => {
    railCollapsed(true)
    renderPage('/?create=1')
    const form = await screen.findByRole('form', { name: 'Create project or process' })
    // The form's own submit may share the label; no button of that name sits outside the form.
    const outside = screen.queryAllByRole('button', { name: 'Create project or process' }).filter((button) => !form.contains(button))
    expect(outside).toHaveLength(0)
  })
})

describe('page help defines the domain terms', () => {
  it('EN: the head "?" states the purpose sentence and Responsible terms', async () => {
    renderPage()
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    const panel = screen.getByRole('note')
    expect(panel).toHaveTextContent('Projects and Processes are the work that drives your Objectives.')
    expect(panel).toHaveTextContent('Responsible is the one person doing the work')
    expect(panel).toHaveTextContent('Business Unit is the business line that owns the work')
  })

  it('ID: the localized help states the same terms', async () => {
    renderPage('/', 'id')
    await screen.findByText('Menu launch')
    fireEvent.click(screen.getByRole('button', { name: 'Bantuan' }))
    const panel = screen.getByRole('note')
    expect(panel).toHaveTextContent('Proyek dan Proses adalah kerja yang mendorong Tujuan Anda.')
    expect(panel).toHaveTextContent('Responsible adalah satu orang yang mengerjakan')
    expect(panel).toHaveTextContent('Business Unit adalah lini usaha yang memiliki pekerjaan')
  })
})

describe('one primary per screen beside an open record panel', () => {
  function renderWithHost(entry: string) {
    const router = createMemoryRouter(
      [{ path: '*', element: <I18nProvider><OverlayHostProvider><ProjectsProcessesPage /></OverlayHostProvider></I18nProvider> }],
      { initialEntries: [entry] },
    )
    return { router, ...render(<RouterProvider router={router} />) }
  }

  it('keeps the page-head Create button primary with no record open', async () => {
    renderWithHost('/')
    expect(await screen.findByRole('button', { name: 'Create project or process' })).toHaveClass('btn-primary')
  })

  it('steps the page-head Create button down to outline while a record panel is open, and restores it on close', async () => {
    renderWithHost('/?record=wl-1&recordType=work-line')
    await screen.findByText('record body wl-1')
    const create = screen.getByRole('button', { name: 'Create project or process' })
    expect(create).toHaveClass('btn-outline')
    expect(create).not.toHaveClass('btn-primary')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('record body wl-1')).toBeNull())
    expect(screen.getByRole('button', { name: 'Create project or process' })).toHaveClass('btn-primary')
  })
})

// AC-001, AC-002
describe('unfinished collection draft retention', () => {
  it('resumes all entered values after following another route and returning through Create', async () => {
    const router = createMemoryRouter([{
      element: <CreateDraftProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/projects?create=1">Return through Create</Link><Outlet /></CreateDraftProvider>,
      children: [{ path: '/work/projects', element: <ProjectsProcessesPage /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
    }], { initialEntries: ['/work/projects?create=1'] })
    render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
    let form = await screen.findByRole('form', { name: 'Create project or process' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Keep this full draft' } })
    fireEvent.click(within(form).getByRole('combobox', { name: 'Type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Process' }))
    fireEvent.click(within(form).getByRole('combobox', { name: 'Objective' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Brand love' }))
    const opener = screen.getByRole('button', { name: 'Create project or process' })
    fireEvent.click(opener)
    expect(opener).not.toHaveClass('btn-primary')
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep this full draft')
    expect(within(form).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Process')
    expect(within(form).getByRole('combobox', { name: 'Objective' })).toHaveTextContent('Brand love')
    fireEvent.click(screen.getByRole('link', { name: 'Signals destination' }))
    await screen.findByText('Signals destination body')
    fireEvent.click(screen.getByRole('link', { name: 'Return through Create' }))
    form = await screen.findByRole('form', { name: 'Create project or process' })
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep this full draft')
    expect(within(form).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Process')
    expect(within(form).getByRole('combobox', { name: 'Objective' })).toHaveTextContent('Brand love')
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })
})

// AC-004
it('keeps a retained projects buffer hidden when current write authority is denied on return', async () => {
  const router = createMemoryRouter([{
    element: <CreateDraftProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/projects">Return to collection</Link><Outlet /></CreateDraftProvider>,
    children: [{ path: '/work/projects', element: <ProjectsProcessesPage /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
  }], { initialEntries: ['/work/projects?create=1'] })
  render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Keep this authorized draft' } })
  fireEvent.click(screen.getByRole('link', { name: 'Signals destination' }))
  await screen.findByText('Signals destination body')
  vi.mocked(getWorkWriteScopes).mockResolvedValue({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [], objective_content_org: false, objective_content_bu_ids: [] })
  fireEvent.click(screen.getByRole('link', { name: 'Return to collection' }))
  await screen.findByText('Menu launch')
  expect(screen.queryByRole('form', { name: 'Create project or process' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Create project or process' })).toBeNull()
  expect(createWorkLine).not.toHaveBeenCalled()
})

// AC-003
it('confirms the saved projects record in the current collection when pending success arrives after route return', async () => {
  let confirm!: () => void
  vi.mocked(listWorkLinesAll).mockResolvedValue([])
  vi.mocked(createWorkLine).mockReturnValueOnce(new Promise((resolve) => {
    confirm = () => {
      const saved = { id: 'saved-return', name: 'Saved after returning', archived_at: null, type: 'process' as const }
      vi.mocked(listWorkLinesAll).mockResolvedValue([saved])
      resolve(saved)
    }
  }))
  const router = createMemoryRouter([{
    element: <CreateDraftProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/projects">Return to collection</Link><Outlet /></CreateDraftProvider>,
    children: [{ path: '/work/projects', element: <ProjectsProcessesPage /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
  }], { initialEntries: ['/work/projects?create=1'] })
  render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
  const form = await screen.findByRole('form', { name: 'Create project or process' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Saved after returning' } })
  fireEvent.click(within(form).getByRole('combobox', { name: 'Type' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Process' }))
  fireEvent.submit(form)
  await waitFor(() => expect(within(form).getByRole('textbox', { name: 'Name' })).toBeDisabled())
  const readsBeforeReturn = vi.mocked(listWorkLinesAll).mock.calls.length
  fireEvent.click(screen.getByRole('link', { name: 'Signals destination' }))
  await screen.findByText('Signals destination body')
  fireEvent.click(screen.getByRole('link', { name: 'Return to collection' }))
  await waitFor(() => expect(vi.mocked(listWorkLinesAll).mock.calls.length).toBeGreaterThan(readsBeforeReturn))
  expect(await screen.findByRole('textbox', { name: 'Name' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: 'Saved after returning' })).toBeNull()
  await act(async () => confirm())
  expect(await screen.findByRole('link', { name: 'Saved after returning' })).toBeInTheDocument()
  expect(screen.getAllByRole('status').some((status) => status.textContent === 'Added Saved after returning')).toBe(true)
  expect(screen.queryByRole('form', { name: 'Create project or process' })).toBeNull()
  expect(createWorkLine).toHaveBeenCalledTimes(1)
})
