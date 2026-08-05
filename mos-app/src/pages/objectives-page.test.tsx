// ObjectivesPage — V3 catalog collection grammar (RecordCollectionSurface + CollectionToolbar).
// AC-406 (FR-422): each objective shows its child work_lines + the per-work_line task count
// (down-trace), computed over listTasks + listWorkLinesAll (no schema change). The management CRUD
// (create / rename / archive / unarchive) is preserved; these journeys assert the goal (the DAL call
// fires and the collection reloads), never the old inline-add chrome.
//
// PORTED 2026-08-05 (#194). Three assertions here named the create affordance "Add objective" and
// contradicted the v4 SOURCE, which calls it "Create objective" (`catalog.objectives.add`, and
// `catalog.objectives.adding` = "Creating…"). The source is the newer of the two: the copy landed in
// b81bb42 (2026-07-28) and these assertions were written in 2d33247 (2026-07-23), so the copy pass
// changed the label and left the tests behind. The label is refreshed to the source's; the GOAL each
// test encodes — exactly ONE create affordance, the inline Add bar, with no action slot in the head,
// and the SAME one in the teaching empty state — is asserted unchanged. Indonesian agrees
// ('Buat objective' = "Create objective"), so the two locales are not being pulled apart.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))

import {
  listObjectivesAll, createObjective, renameObjective, setObjectiveArchived,
} from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import type { AuthState } from '@/auth/context'
import { ObjectivesPage } from './objectives-page'

// Every test below except the PORT-028 pair asserts MANAGE-mode behaviour (create / rename /
// archive). Before #194 that premise was implicit — the page offered writes to anyone. It is now
// explicit, because Objectives has no read gate (OD-V4-1) and therefore has two real audiences.
// `ops_lead` holds objective.manage; `member` does not (src/lib/capabilities.ts).
function viewerWithRoles(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

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
        <ObjectivesPage />
      </MemoryRouter>
    </I18nProvider>,
  )
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
  vi.mocked(createObjective).mockResolvedValue({ id: 'obj-new', name: 'New', archived_at: null })
  vi.mocked(renameObjective).mockResolvedValue()
  vi.mocked(setObjectiveArchived).mockResolvedValue()
})

describe('AC-406: ObjectivesPage down-trace (FR-422)', () => {
  it('shows each objective\'s child work_lines + per-work_line task count', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1'),
      task('t2', 'obj-1', 'wl-1'),
      task('t3', 'obj-1', 'wl-2'),
    ])
    renderPage()
    await screen.findByText('Grow revenue')
    const trace = await screen.findByTestId('catalog-trace')
    // 3 tasks total · Menu launch (2), Daily prep (1)
    expect(trace.textContent).toContain('3 tasks')
    expect(trace.textContent).toContain('Menu launch (2)')
    expect(trace.textContent).toContain('Daily prep (1)')
  })

  it('renders no trace for an objective with zero tasks (no false zero)', async () => {
    vi.mocked(listTasks).mockResolvedValue([task('t1', 'obj-1', 'wl-1')])
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    await screen.findByText('Lonely objective')
    // Only obj-1 has tasks → exactly one trace; obj-2 ("Lonely objective") renders none.
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="catalog-trace"]')).toHaveLength(1)
    })
  })
})

describe('V3 collection grammar conformance', () => {
  beforeEach(() => { vi.mocked(listTasks).mockResolvedValue([]) })

  it('renders on the shared Management family frame (no bespoke page chrome)', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    const main = container.querySelector('main')
    expect(main).toHaveAttribute('data-page-family', 'management')
    expect(main?.querySelector(':scope > .page-frame__content')).toBeTruthy()
  })

  it('renders the V3 RecordCollection surface + toolbar (not the old inline-add list)', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    expect(container.querySelector('[data-testid="record-collection-toolbar"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="collection-result-header"]')).toBeTruthy()
  })

  // DELIBERATE goal change (Census R2 DO-7 · objectives F7): the bare head ".ch-count" digit
  // pill is a GUARD-R2-class naked number; the labeled result-header inside the collection is
  // the ONE place the count lives ("2 items in your scope").
  it('DO-7: the head shows no naked count pill — the labeled result-header carries the count', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    const head = screen.getByTestId('page-head')
    expect(head.querySelector('.ch-count')).toBeNull()
    const resultHeader = container.querySelector('[data-testid="collection-result-header"]')
    expect(resultHeader?.textContent).toContain('2 items in your scope')
  })

  it('exactly ONE create affordance — the inline Add bar (the head carries no action slot)', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    expect(container.querySelector('.ch-action')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Create objective' })).toHaveLength(1)
  })

  it('in the teaching empty state the create affordance is the SAME inline Add bar', async () => {
    vi.mocked(listObjectivesAll).mockResolvedValue([])
    const { container } = renderPage()
    await screen.findByText('No objectives yet')
    expect(screen.getAllByRole('button', { name: 'Create objective' })).toHaveLength(1)
    expect(container.querySelector('.ch-action')).toBeNull()
  })
})

// OD-V4-1 (owner-ratified 2026-07-27) removed the objective.manage READ gate: Objectives is
// visible to everyone, because seeing what the company committed to is the point. That makes a
// viewer who can READ but cannot WRITE a first-class audience of this surface — the only surface
// in Work that has one. These two tests are that viewer's contract.
describe('PORT-028: a viewer without objective.manage reads Objectives, and is offered no writes', () => {
  beforeEach(() => {
    vi.mocked(listTasks).mockResolvedValue([task('t1', 'obj-1', 'wl-1')])
    // `member` holds process.start and nothing else — no objective.manage.
    vi.mocked(useAuth).mockReturnValue(viewerWithRoles(['member']))
  })

  it('renders the surface read-only — no create bar, no row write actions, and no redirect', async () => {
    const { container } = renderPage()

    // Reading is not gated: the rows render, and so does everything that makes the cascade
    // legible from here. If a redirect had fired, none of this would be in the document.
    await screen.findByText('Grow revenue')
    expect(screen.getByText('Lonely objective')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="record-collection-toolbar"]')).toBeTruthy()
    expect(await screen.findByTestId('catalog-trace')).toBeInTheDocument()

    // Writing is. Not disabled — absent. A disabled Rename still advertises a door.
    expect(screen.queryByRole('form', { name: 'Create objective' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create objective' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename Grow revenue' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archive Grow revenue' })).toBeNull()
  })

  it('still exposes the relations disclosure — line-of-sight up the cascade is what they came for', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    const disclosure = screen.getByRole('button', { name: 'Show relations for Grow revenue' })
    fireEvent.click(disclosure)
    expect(await screen.findByTestId('catalog-relations')).toBeInTheDocument()
  })
})

describe('Catalog CRUD is preserved under the new grammar', () => {
  beforeEach(() => { vi.mocked(listTasks).mockResolvedValue([]) })

  it('create: submitting the inline Add bar calls createObjective and reloads', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    const form = screen.getByRole('form', { name: 'Create objective' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Delight guests' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Create objective' }))
    await waitFor(() => expect(createObjective).toHaveBeenCalledWith('Delight guests'))
    // reload after the mutation (initial load + reload)
    await waitFor(() => expect(vi.mocked(listObjectivesAll).mock.calls.length).toBeGreaterThan(1))
  })

  it('rename: the inline row editor calls renameObjective with the new name', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Rename Grow revenue' }))
    const editor = await screen.findByLabelText('Rename Grow revenue')
    fireEvent.change(editor, { target: { value: 'Grow revenue 2027' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(renameObjective).toHaveBeenCalledWith('obj-1', 'Grow revenue 2027'))
  })

  it('archive: the row Archive action soft-archives the objective', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Archive Grow revenue' }))
    await waitFor(() => expect(setObjectiveArchived).toHaveBeenCalledWith('obj-1', true))
  })

  it('unarchive: the Archived view exposes Unarchive, which restores the objective', async () => {
    vi.mocked(listObjectivesAll).mockResolvedValue([
      { id: 'obj-1', name: 'Grow revenue', archived_at: null },
      { id: 'obj-3', name: 'Retired goal', archived_at: '2026-01-01T00:00:00Z' },
    ])
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    const unarchive = await screen.findByRole('button', { name: 'Unarchive Retired goal' })
    fireEvent.click(unarchive)
    await waitFor(() => expect(setObjectiveArchived).toHaveBeenCalledWith('obj-3', false))
  })

  it('search narrows the visible rows by name', async () => {
    renderPage()
    await screen.findByText('Grow revenue')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by name' }), { target: { value: 'lonely' } })
    await waitFor(() => expect(screen.queryByText('Grow revenue')).toBeNull())
    expect(screen.getByText('Lonely objective')).toBeInTheDocument()
  })
})
