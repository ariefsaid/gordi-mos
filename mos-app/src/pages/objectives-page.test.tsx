import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, Outlet, MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { CreateDraftProvider } from '@/shell/create-drafts'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'

vi.mock('@/lib/db/objectives', () => ({
  listObjectivesAll: vi.fn(),
  createObjective: vi.fn(),
  renameObjective: vi.fn(),
  setObjectiveArchived: vi.fn(),
}))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLinesAll: vi.fn() }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [], objective_content_org: false, objective_content_bu_ids: [] }),
  getWorkWriteScopes: vi.fn(),
}))
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/catalog/catalog-record-document', () => ({
  CatalogRecordDocument: ({ id }: { id: string }) => <p>record body {id}</p>,
}))
vi.mock('@/components/tasks/task-drawer', () => ({ TaskOverlayContent: () => null }))

import { listObjectivesAll, createObjective } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { getBusinessUnits } from '@/lib/db/directory'
import { listTasks } from '@/lib/db/tasks'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { useAuth } from '@/auth/use-auth'
import type { AuthState } from '@/auth/context'
import { ObjectivesPage } from './objectives-page'

function viewerWithRoles(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  } as AuthState
}

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

function renderPage(entry = "/", locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[entry]}>
        <ObjectivesPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

function openViewOptions() {
  fireEvent.click(screen.getByRole('button', { name: 'View & filters' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue(viewerWithRoles(['ops_lead']))
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
    { id: 'obj-2', name: 'Lonely objective', archived_at: null },
  ])
  vi.mocked(listWorkLinesAll).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
    { id: 'wl-2', name: 'Daily prep', type: 'process', archived_at: null },
  ])
  vi.mocked(listTasks).mockResolvedValue([])
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Retail Ops' }])
  vi.mocked(getWorkWriteScopes).mockResolvedValue({
    workline_org: true,
    objective_org: true,
    workline_bu_ids: [],
    objective_bu_ids: [],
    objective_content_org: false,
    objective_content_bu_ids: [],
  })
  vi.mocked(createObjective).mockResolvedValue({ id: 'obj-new', name: 'New', archived_at: null })
})

describe('Objectives collection-first contract', () => {
  it('renders real Objective links with child count, progress, and activity facts', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1', 'Done'),
      task('t2', 'obj-1', 'wl-2'),
    ])
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    expect(screen.getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives/obj-1')
    expect(screen.getByText('Through Tasks: Daily prep, Menu launch')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 done')).toBeInTheDocument()
    expect(screen.getByText('07 Jul 2026, 07:00 WIB')).toBeInTheDocument()
    expect(container.querySelector('.catalog-collection__disclosure')).toBeNull()
  })

  it('uses the head Create door and renders a form ABOVE the table, never inside it', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    expect(screen.getByTestId('page-head').querySelector('.ch-action')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create objective' }))
    const form = await screen.findByRole('form', { name: 'Create objective' })
    expect(form.closest('[role="table"]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Delight guests' } })
    fireEvent.submit(form)
    await waitFor(() => expect(createObjective).toHaveBeenCalledWith('Delight guests'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create objective' })).toHaveFocus())
  })

  // AC-001, AC-002
  it('reentering Create returns focus to the unfinished Objective without changing its name', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    const opener = screen.getByRole('button', { name: 'Create objective' })
    fireEvent.click(opener)
    const name = await screen.findByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Keep the guest experience draft' } })
    fireEvent.click(opener)
    expect(name).toHaveValue('Keep the guest experience draft')
    expect(name).toHaveFocus()
    expect(opener).not.toHaveClass('btn-primary')
    expect(createObjective).not.toHaveBeenCalled()
  })

  // AC-003
  it('keeps a failed Objective draft available for retry and restores create focus', async () => {
    vi.mocked(createObjective).mockRejectedValueOnce(new Error('Temporary save failure'))
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Create objective' }))
    const form = await screen.findByRole('form', { name: 'Create objective' })
    const name = within(form).getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Delight guests' } })
    fireEvent.click(within(form).getByRole('combobox', { name: 'Business Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Retail Ops' }))
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save. Try again.')
    expect(name).toHaveValue('Delight guests')
    expect(within(form).getByRole('combobox', { name: 'Business Unit' })).toHaveTextContent('Retail Ops')
    await waitFor(() => expect(name).toHaveFocus())
    fireEvent.submit(form)
    await waitFor(() => expect(createObjective).toHaveBeenNthCalledWith(2, 'Delight guests', { business_unit_id: 'bu-1' }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Create objective' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Create objective' })).toHaveFocus()
  })

  it('puts All / With tasks / No tasks behind the phone view disclosure', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    expect(screen.queryByRole('button', { name: 'With tasks' })).toBeNull()
    openViewOptions()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'With tasks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No tasks' })).toBeInTheDocument()
  })

  it('keeps the collection readable without offering objective writes', async () => {
    vi.mocked(useAuth).mockReturnValue(viewerWithRoles(['member']))
    vi.mocked(getWorkWriteScopes).mockResolvedValue({
      workline_org: false,
      objective_org: false,
      workline_bu_ids: [],
      objective_bu_ids: [],
      objective_content_org: false,
      objective_content_bu_ids: [],
    })
    renderPage()
    await screen.findByText('Grow revenue')
    expect(screen.getByRole('link', { name: 'Grow revenue' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create objective' })).toBeNull()
    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull()
  })
})


describe('R5 collection state boundaries', () => {
  it('keeps loading distinct from an empty success', async () => {
    vi.mocked(listObjectivesAll).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('status', { name: 'Loading objectives…' })).toBeInTheDocument()
    expect(screen.queryByText('No objectives yet')).toBeNull()
  })

  it('shows true empty without Clear filters', async () => {
    vi.mocked(listObjectivesAll).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No objectives yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('keeps filtered empty clearable with the shared item-specific message', async () => {
    renderPage('/?q=no-such-record')
    expect(await screen.findByRole('heading', { name: 'No objectives match these filters' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByRole('link', { name: 'Grow revenue' })).toBeInTheDocument()
  })

  it.each([false, true])('says exactly Nothing archived yet without Clear filters (entire catalog empty: %s)', async (empty) => {
    if (empty) vi.mocked(listObjectivesAll).mockResolvedValue([])
    renderPage('/?view=archived')
    expect(await screen.findByRole('heading', { name: 'Nothing archived yet' })).toBeInTheDocument()
    const disclosure = screen.queryByRole('button', { name: /View & filters/ })
    if (disclosure) fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name: 'Current status' })).toHaveTextContent('Archived')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    expect(screen.queryByText('No objectives yet')).toBeNull()
  })

  it.each(['timeout', 'server'])('keeps a %s failure out of empty success and retries', async (failure) => {
    vi.mocked(listObjectivesAll).mockRejectedValueOnce(new Error(failure))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load')
    expect(screen.queryByText('No objectives yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('link', { name: 'Grow revenue' })).toBeInTheDocument()
  })
})


it('R5: archived records hidden by search remain filtered-empty and clearable', async () => {
  vi.mocked(listObjectivesAll).mockResolvedValue([{ id: 'archived-1', name: 'Archived objective', archived_at: '2026-01-01' }])
  renderPage('/?view=archived&q=no-match')
  expect(await screen.findByRole('heading', { name: 'No objectives match these filters' })).toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Create objective' })).toBeInTheDocument()
  })

  it('hides the header create button while the rail is collapsed, and opens the form from the global create intent', async () => {
    railCollapsed(true)
    renderPage('/?create=1')
    const form = await screen.findByRole('form', { name: 'Create objective' })
    // The form's own submit may share the label; no button of that name sits outside the form.
    const outside = screen.queryAllByRole('button', { name: 'Create objective' }).filter((button) => !form.contains(button))
    expect(outside).toHaveLength(0)
  })
})

describe('page help defines the domain terms', () => {
  it('EN: the head "?" states the purpose sentence and Business Unit terms', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    const panel = screen.getByRole('note')
    expect(panel).toHaveTextContent('Objectives are what your team is working toward this period.')
    expect(panel).toHaveTextContent('Business Unit is the business line that owns the work')
  })

  it('ID: the localized help states the same terms', async () => {
    renderPage('/', 'id')
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Bantuan' }))
    const panel = screen.getByRole('note')
    expect(panel).toHaveTextContent('Tujuan adalah apa yang sedang dituju tim Anda periode ini.')
    expect(panel).toHaveTextContent('Business Unit adalah lini usaha yang memiliki pekerjaan')
  })
})

describe('one primary per screen beside an open record panel', () => {
  function renderWithHost(entry: string) {
    const router = createMemoryRouter(
      [{ path: '*', element: <I18nProvider><OverlayHostProvider><ObjectivesPage /></OverlayHostProvider></I18nProvider> }],
      { initialEntries: [entry] },
    )
    return { router, ...render(<RouterProvider router={router} />) }
  }

  it('keeps the page-head Create button primary with no record open', async () => {
    renderWithHost('/')
    expect(await screen.findByRole('button', { name: 'Create objective' })).toHaveClass('btn-primary')
  })

  it('steps the page-head Create button down to outline while a record panel is open, and restores it on close', async () => {
    renderWithHost('/?record=obj-1&recordType=objective')
    await screen.findByText('record body obj-1')
    const create = screen.getByRole('button', { name: 'Create objective' })
    expect(create).toHaveClass('btn-outline')
    expect(create).not.toHaveClass('btn-primary')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('record body obj-1')).toBeNull())
    expect(screen.getByRole('button', { name: 'Create objective' })).toHaveClass('btn-primary')
  })
})

// AC-001, AC-002
describe('unfinished collection draft retention', () => {
  it('resumes all entered values after following another route and returning through Create', async () => {
    const router = createMemoryRouter([{
      element: <CreateDraftProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/objectives?create=1">Return through Create</Link><Outlet /></CreateDraftProvider>,
      children: [{ path: '/work/objectives', element: <ObjectivesPage /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
    }], { initialEntries: ['/work/objectives?create=1'] })
    render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
    let form = await screen.findByRole('form', { name: 'Create objective' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Keep this full draft' } })
    fireEvent.click(within(form).getByRole('combobox', { name: 'Business Unit' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Company-wide' }))
    fireEvent.click(screen.getByRole('link', { name: 'Signals destination' }))
    await screen.findByText('Signals destination body')
    fireEvent.click(screen.getByRole('link', { name: 'Return through Create' }))
    form = await screen.findByRole('form', { name: 'Create objective' })
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Keep this full draft')
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveFocus()
    expect(within(form).getByRole('combobox', { name: 'Business Unit' })).toHaveTextContent('Company-wide')
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create objective' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Business Unit' })).toHaveTextContent('Not set')
  })
})

// AC-004
it('keeps a retained objectives buffer hidden when current write authority is denied on return', async () => {
  const router = createMemoryRouter([{
    element: <CreateDraftProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/objectives">Return to collection</Link><Outlet /></CreateDraftProvider>,
    children: [{ path: '/work/objectives', element: <ObjectivesPage /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
  }], { initialEntries: ['/work/objectives?create=1'] })
  render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Keep this authorized draft' } })
  fireEvent.click(screen.getByRole('link', { name: 'Signals destination' }))
  await screen.findByText('Signals destination body')
  vi.mocked(getWorkWriteScopes).mockResolvedValue({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [], objective_content_org: false, objective_content_bu_ids: [] })
  fireEvent.click(screen.getByRole('link', { name: 'Return to collection' }))
  await screen.findByText('Grow revenue')
  expect(screen.queryByRole('form', { name: 'Create objective' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Create objective' })).toBeNull()
  expect(createObjective).not.toHaveBeenCalled()
})

// AC-003
it('confirms the saved objectives record in the current collection when pending success arrives after route return', async () => {
  let confirm!: () => void
  vi.mocked(listObjectivesAll).mockResolvedValue([])
  vi.mocked(createObjective).mockReturnValueOnce(new Promise((resolve) => {
    confirm = () => {
      const saved = { id: 'saved-return', name: 'Saved after returning', archived_at: null }
      vi.mocked(listObjectivesAll).mockResolvedValue([saved])
      resolve(saved)
    }
  }))
  const router = createMemoryRouter([{
    element: <CreateDraftProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/objectives">Return to collection</Link><Outlet /></CreateDraftProvider>,
    children: [{ path: '/work/objectives', element: <ObjectivesPage /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
  }], { initialEntries: ['/work/objectives?create=1'] })
  render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
  const form = await screen.findByRole('form', { name: 'Create objective' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Saved after returning' } })
  fireEvent.submit(form)
  await waitFor(() => expect(within(form).getByRole('textbox', { name: 'Name' })).toBeDisabled())
  const readsBeforeReturn = vi.mocked(listObjectivesAll).mock.calls.length
  fireEvent.click(screen.getByRole('link', { name: 'Signals destination' }))
  await screen.findByText('Signals destination body')
  fireEvent.click(screen.getByRole('link', { name: 'Return to collection' }))
  await waitFor(() => expect(vi.mocked(listObjectivesAll).mock.calls.length).toBeGreaterThan(readsBeforeReturn))
  expect(await screen.findByRole('textbox', { name: 'Name' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: 'Saved after returning' })).toBeNull()
  await act(async () => confirm())
  expect(await screen.findByRole('link', { name: 'Saved after returning' })).toBeInTheDocument()
  expect(screen.getAllByRole('status').some((status) => status.textContent === 'Added Saved after returning')).toBe(true)
  expect(screen.queryByRole('form', { name: 'Create objective' })).toBeNull()
  expect(createObjective).toHaveBeenCalledTimes(1)
})
