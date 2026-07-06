import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PeopleRow, RolesRow } from '@/lib/database.types'

vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: vi.fn(() => true) }))

import { listTasks } from '@/lib/db/tasks'
import { getPeople } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { CascadePage } from './cascade-page'

const VIEWER_ID = 'viewer-1'

const viewerPerson: PeopleRow = {
  id: VIEWER_ID,
  org_id: 'org-1',
  user_id: 'user-1',
  full_name: 'Cahya Cafe',
  email: 'cahya@example.test',
  archived_at: null,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
}

const viewerRole: RolesRow = {
  id: 'role-1',
  org_id: 'org-1',
  business_unit_id: 'bu-1',
  name: 'Ops',
  reports_to_role_id: null,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
}

const authedState: Extract<AuthState, { status: 'authenticated' }> = {
  status: 'authenticated',
  viewer: { person: viewerPerson, roles: [viewerRole], isManager: false, accessRoles: ['member'] },
  signOut: async () => {},
}

function authWithRoles(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: { ...authedState.viewer, accessRoles },
    signOut: authedState.signOut,
  }
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: overrides.id ?? 'task-1',
    org_id: 'org-1',
    title: overrides.title ?? 'Task',
    business_unit_id: 'bu-1',
    status: overrides.status ?? 'Open',
    responsible_person_id: overrides.responsible_person_id ?? VIEWER_ID,
    accountable_person_id: overrides.accountable_person_id ?? VIEWER_ID,
    consulted_person_ids: overrides.consulted_person_ids ?? [],
    informed_person_ids: overrides.informed_person_ids ?? [],
    description: null,
    due_date: overrides.due_date ?? '2026-07-10',
    objective_id: 'objective_id' in overrides ? overrides.objective_id ?? null : 'obj-1',
    work_line_id: 'work_line_id' in overrides ? overrides.work_line_id ?? null : 'wl-1',
    last_activity_at: '2026-07-06T00:00:00Z',
    archived_at: null,
    created_by: VIEWER_ID,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z',
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(useIsDesktop).mockReturnValue(true)
  vi.mocked(listTasks).mockResolvedValue([
    makeTask({ id: 'task-1', title: 'Project task', objective_id: 'obj-1', work_line_id: 'wl-1' }),
    makeTask({ id: 'task-2', title: 'Process task', objective_id: 'obj-1', work_line_id: 'wl-2' }),
  ])
  vi.mocked(getPeople).mockResolvedValue([{ id: VIEWER_ID, full_name: 'Cahya Cafe' }])
  vi.mocked(listObjectives).mockResolvedValue([{ id: 'obj-1', name: 'Grow revenue' }])
  vi.mocked(listWorkLines).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project' },
    { id: 'wl-2', name: 'Daily prep', type: 'process' },
  ])
})

function renderPage(auth: AuthState = authedState) {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <CascadePage />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

describe('CascadePage', () => {
  it('AC-300: renders the objective → work-line → task ladder and reuses the cascade catalogs loader', async () => {
    renderPage()

    expect(await screen.findByText('Grow revenue')).toBeInTheDocument()
    expect(screen.getByText('Menu launch')).toBeInTheDocument()
    expect(screen.getByText('Daily prep')).toBeInTheDocument()
    expect(screen.getByText('Project task')).toBeInTheDocument()
    expect(screen.getByText('Process task')).toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Daily / ongoing')).toBeInTheDocument()

    await waitFor(() => expect(vi.mocked(listObjectives)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(listWorkLines)).toHaveBeenCalledTimes(1)
  })

  it('AC-301: renders Unlinked and No Project/Process branches and Mine narrows to the viewer-owned branch', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 'mine-1', title: 'My linked task', objective_id: 'obj-1', work_line_id: 'wl-1', responsible_person_id: VIEWER_ID }),
      makeTask({ id: 'unlinked-1', title: 'Unlinked task', objective_id: null, work_line_id: 'wl-2', responsible_person_id: 'other-2', accountable_person_id: 'other-2' }),
      makeTask({ id: 'no-wl-1', title: 'No work line task', objective_id: 'obj-1', work_line_id: null, responsible_person_id: 'other-3', accountable_person_id: 'other-3' }),
    ])

    renderPage()

    expect(await screen.findByText('(Unlinked)')).toBeInTheDocument()
    expect(screen.getByText('No Project/Process')).toBeInTheDocument()
    expect(screen.getByText('Unlinked task')).toBeInTheDocument()
    expect(screen.getByText('No work line task')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mine' }))

    await waitFor(() => {
      expect(screen.getByText('My linked task')).toBeInTheDocument()
      expect(screen.queryByText('Unlinked task')).toBeNull()
      expect(screen.queryByText('No work line task')).toBeNull()
    })
  })

  it('AC-303: shows WorkloadCaption only when Mine is on', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 'mine-project', title: 'Project task', work_line_id: 'wl-1', responsible_person_id: VIEWER_ID, status: 'Open' }),
      makeTask({ id: 'mine-process', title: 'Process task', work_line_id: 'wl-2', responsible_person_id: VIEWER_ID, status: 'In Progress' }),
      makeTask({ id: 'mine-unassigned', title: 'Unassigned task', work_line_id: null, responsible_person_id: VIEWER_ID, status: 'Open' }),
    ])

    renderPage()

    expect(await screen.findByText('Project task')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /workload summary/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mine' }))

    expect(await screen.findByRole('status', { name: /workload summary/i })).toBeInTheDocument()
  })

  it('AC-302 + AC-407: hides manage links for members, shows only projects for ops_lead, and both for admin (links to relocated /work/* routes)', async () => {
    renderPage(authWithRoles(['member']))
    await screen.findByText('Project task')
    expect(screen.queryByRole('link', { name: 'Manage objectives' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Manage projects & processes' })).toBeNull()

    cleanup()
    renderPage(authWithRoles(['ops_lead']))
    await screen.findByText('Project task')
    expect(screen.queryByRole('link', { name: 'Manage objectives' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Manage projects & processes' })).toHaveAttribute('href', '/work/projects-processes')

    cleanup()
    renderPage(authWithRoles(['admin']))
    await screen.findByText('Project task')
    expect(screen.getByRole('link', { name: 'Manage objectives' })).toHaveAttribute('href', '/work/objectives')
    expect(screen.getByRole('link', { name: 'Manage projects & processes' })).toHaveAttribute('href', '/work/projects-processes')
  })

  it('AC-302: renders loading, error, and empty states', async () => {
    vi.mocked(listTasks).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading the cascade…')).toBeInTheDocument()

    cleanup()
    vi.mocked(listTasks).mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText("Couldn't load the cascade")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    cleanup()
    vi.mocked(listTasks).mockResolvedValueOnce([])
    renderPage()
    expect(await screen.findByText('Nothing ladders up yet')).toBeInTheDocument()
  })

  it('AC-305/NFR-300: phone branch renders grouped cards (.task-card) instead of the desktop table', async () => {
    vi.mocked(useIsDesktop).mockReturnValue(false)
    renderPage()

    // The ladder still renders (objective + work-line + task) …
    expect(await screen.findByText('Grow revenue')).toBeInTheDocument()
    expect(screen.getByText('Menu launch')).toBeInTheDocument()
    expect(screen.getByText('Project task')).toBeInTheDocument()
    // … but on phone each task renders as a .task-card (the shipped Tasks DB-view card grammar).
    expect(document.querySelectorAll('[data-testid="task-card"]').length).toBe(2)
    // The i18n'd card labels render (Owner / Due).
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Due').length).toBeGreaterThan(0)
  })

  it('AC-305/NFR-300: desktop branch renders NO .task-card (uses the dense grouped table)', async () => {
    vi.mocked(useIsDesktop).mockReturnValue(true)
    renderPage()
    expect(await screen.findByText('Project task')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid="task-card"]').length).toBe(0)
  })
})
