import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [] }),
  getWorkWriteScopes: vi.fn(),
}))
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))

import { listObjectivesAll, createObjective } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
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

function renderPage(entry = "/") {
  return render(
    <I18nProvider>
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
  vi.mocked(getWorkWriteScopes).mockResolvedValue({
    workline_org: true,
    objective_org: true,
    workline_bu_ids: [],
    objective_bu_ids: [],
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
    expect(screen.getByText('Projects & Processes: 2')).toBeInTheDocument()
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

  it('keeps a failed Objective draft available for retry and restores create focus', async () => {
    vi.mocked(createObjective).mockRejectedValueOnce(new Error('Temporary save failure'))
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Create objective' }))
    const form = await screen.findByRole('form', { name: 'Create objective' })
    const name = within(form).getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Delight guests' } })
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary save failure')
    expect(name).toHaveValue('Delight guests')
    fireEvent.submit(form)
    await waitFor(() => expect(createObjective).toHaveBeenNthCalledWith(2, 'Delight guests'))
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

  it('keeps filtered empty clearable', async () => {
    renderPage('/?q=no-such-record')
    expect(await screen.findByText('Nothing matches your filters')).toBeInTheDocument()
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
  expect(await screen.findByRole('heading', { name: 'Nothing matches your filters' })).toBeInTheDocument()
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
