import { describe, it, expect, vi, beforeEach } from 'vitest'
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

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
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
    expect(screen.getByText('2 linked')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 done')).toBeInTheDocument()
    expect(screen.getByText('07 Jul 2026, 07:00 WIB')).toBeInTheDocument()
    expect(container.querySelector('.catalog-collection__disclosure')).toBeNull()
  })

  it('uses the head Create door and renders a focused draft row inside the collection', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    expect(screen.getByTestId('page-head').querySelector('.ch-action')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create objective' }))
    const form = await screen.findByRole('form', { name: 'Create objective' })
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Delight guests' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createObjective).toHaveBeenCalledWith('Delight guests'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create objective' })).toHaveFocus())
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
