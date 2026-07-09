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

    // W1-4: the objective now rides as the per-work-line group hint (the ladder folds to
    // single-level work-line groups), so "Grow revenue" appears once per work-line.
    expect((await screen.findAllByText('Grow revenue')).length).toBeGreaterThanOrEqual(1)
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

    fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))

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

    fireEvent.click(screen.getByRole('tab', { name: 'Mine' }))

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

  it('W1-1: content head renders the .content-header chrome + h1 + count pill (ready)', async () => {
    renderPage()
    await screen.findByText('Project task') // wait for the data to land
    const head = screen.getByTestId('page-head')
    expect(head).toHaveClass('content-header')
    expect(head.querySelector('h1')).toHaveTextContent('Work cascade')
    // Ready → the count pill reflects the total task rows across the ladder (2).
    expect(head.querySelector('.ch-count')).toHaveTextContent('2')
  })

  it('W1-1: count pill is omitted while loading (count stays null until ready)', () => {
    vi.mocked(listTasks).mockReturnValue(new Promise(() => {}))
    renderPage()
    const head = screen.getByTestId('page-head')
    expect(head).toHaveClass('content-header')
    expect(screen.getByText('Loading the cascade…')).toBeInTheDocument()
    // Loading → count is null so the pill is omitted.
    expect(head.querySelector('.ch-count')).toBeNull()
  })

  it('W1-2: Mine/All is a tool-rail segmented control (tablist) that flips the mine scope + arrow-keys', async () => {
    renderPage()
    await screen.findByText('Project task')

    const seg = screen.getByRole('tablist', { name: 'Ownership filter' })
    expect(seg).toBeInTheDocument()
    const mineTab = screen.getByRole('tab', { name: 'Mine' })
    const allTab = screen.getByRole('tab', { name: 'All' })
    // Default scope = All.
    expect(allTab).toHaveAttribute('aria-selected', 'true')
    expect(mineTab).toHaveAttribute('aria-selected', 'false')

    // Clicking Mine flips the scope.
    fireEvent.click(mineTab)
    expect(mineTab).toHaveAttribute('aria-selected', 'true')

    // Arrow-key moves selection within the tablist (roving-tabindex grammar).
    fireEvent.keyDown(mineTab, { key: 'ArrowRight' })
    expect(allTab).toHaveAttribute('aria-selected', 'true')
  })

  it('W1-4: shared DataTable folds the ladder to single-level work-line groups (objective rides as hint)', async () => {
    renderPage()
    await screen.findByText('Project task')

    // One group-header per work-line (Menu launch · Daily prep).
    const groupLabels = Array.from(document.querySelectorAll('.dt-group-label')).map((n) => n.textContent)
    expect(groupLabels).toEqual(expect.arrayContaining(['Menu launch', 'Daily prep']))
    // Each group-header carries a count.
    expect(document.querySelectorAll('.dt-group-count').length).toBeGreaterThanOrEqual(2)
    // Objective line-of-sight survives the flatten as the group hint (once per work-line).
    const hints = Array.from(document.querySelectorAll('.dt-group-hint')).map((n) => n.textContent)
    expect(hints.filter((h) => h === 'Grow revenue').length).toBe(2)
    // Work-line type tags survive in the group header (Project / Daily / ongoing).
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Daily / ongoing')).toBeInTheDocument()
    // A known task row renders its title + owner (mirrors the Tasks DB-view row).
    expect(screen.getByText('Project task')).toBeInTheDocument()
    expect(screen.getAllByText('Cahya Cafe').length).toBe(2)
  })

  it('AC-305/NFR-300: phone branch renders the shared DataTable card list (.dt-card) instead of the desktop table', async () => {
    vi.mocked(useIsDesktop).mockReturnValue(false)
    renderPage()

    // The ladder still renders (objective + work-line + task) … the objective now rides
    // as the per-work-line group hint (W1-4 fold), so it appears on each work-line group.
    expect((await screen.findAllByText('Grow revenue')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Menu launch')).toBeInTheDocument()
    expect(screen.getByText('Project task')).toBeInTheDocument()
    // … on phone the shared DataTable single-renders its card branch (.dt-card).
    expect(document.querySelectorAll('.dt-card').length).toBe(2)
    // The i18n'd card labels render (Owner / Due) as the card detail dt labels.
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Due').length).toBeGreaterThan(0)
  })

  it('AC-305/NFR-300: desktop branch renders the shared DataTable (no phone cards)', async () => {
    vi.mocked(useIsDesktop).mockReturnValue(true)
    renderPage()
    expect(await screen.findByText('Project task')).toBeInTheDocument()
    // Desktop renders the dense grouped table; the phone card branch is absent.
    expect(document.querySelectorAll('.dt-table').length).toBe(1)
    expect(document.querySelectorAll('.dt-card').length).toBe(0)
  })
})
