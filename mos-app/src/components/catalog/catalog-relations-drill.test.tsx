// AC-204 — the Objective → Project/Process → Task drill, on the catalog records themselves.
//
// Driven through the REAL descriptor pipeline (load → project → the list presentation), over
// seeded fixtures, so it covers the shared branch projection and its rendering in one pass. The
// cascade SCREEN is not coming back (OD-WAY-32); the last case here asserts its absence, because a
// drill that quietly grew a cascade door again would otherwise pass every other check.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'

vi.mock('@/lib/db/objectives', () => ({ listObjectivesAll: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLinesAll: vi.fn() }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import {
  objectivesCollectionDescriptor,
  projectsProcessesCollectionDescriptor,
  type CatalogCollectionQuery,
} from './catalog-collection-adapter'
import { CatalogCollectionActionsProvider } from './catalog-collection-actions'

const QUERY: CatalogCollectionQuery = {
  layout: 'list', view: 'active', q: '', type: 'all', coverage: 'all', savedViewId: null,
}

function task(over: Partial<TaskListRow> & { id: string; title: string }): TaskListRow {
  return {
    org_id: 'org-1', business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'p1', accountable_person_id: 'p1',
    consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null,
    objective_id: null, work_line_id: null,
    last_activity_at: '2026-08-01T00:00:00Z', archived_at: null, created_by: 'p1',
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

// ── The seeded world. Deliberately shaped so every AC-204 case is present at once: a real branch,
// an Objective's own tasks (No Project/Process), a parentless work line ((Unlinked)), a Done task
// for the count, an archived task that must NOT count, and one branch pushed past the 12-task cap.
const OBJECTIVES = [
  { id: 'obj-1', name: 'Grow revenue', archived_at: null },
  { id: 'obj-2', name: 'Lonely objective', archived_at: null },
]
const WORK_LINES = [
  { id: 'wl-1', name: 'Menu launch', type: 'project' as const, objective_id: 'obj-1', archived_at: null },
  { id: 'wl-2', name: 'Daily prep', type: 'process' as const, objective_id: 'obj-1', archived_at: null },
  { id: 'wl-orphan', name: 'Loose ends', type: 'process' as const, objective_id: null, archived_at: null },
]
const TASKS: TaskListRow[] = [
  task({ id: 't-launch-done', title: 'Print the menus', work_line_id: 'wl-1', status: 'Done' }),
  task({ id: 't-launch-open', title: 'Brief the floor', work_line_id: 'wl-1' }),
  task({ id: 't-launch-archived', title: 'Cancelled idea', work_line_id: 'wl-1', status: 'Done', archived_at: '2026-07-01' }),
  task({ id: 't-direct', title: 'Sign the lease', objective_id: 'obj-1' }),
  task({ id: 't-orphan', title: 'Chase the invoice', work_line_id: 'wl-orphan' }),
]

/** 13 tasks on Daily prep — one past the 12-task cap, so the overflow door must appear. */
const OVERFLOWING = Array.from({ length: 13 }, (_, i) =>
  task({ id: `t-prep-${i}`, title: `Prep step ${i}`, work_line_id: 'wl-2' }))

async function renderCatalog(descriptor: typeof objectivesCollectionDescriptor) {
  const data = await descriptor.load({ query: QUERY, viewerId: null })
  const projection = descriptor.project(data, QUERY, 'list')
  render(
    <I18nProvider>
      <MemoryRouter>
        <CatalogCollectionActionsProvider actions={{
          canManage: true,
          rename: async () => {}, archive: async () => {}, unarchive: async () => {},
        }}>
          {descriptor.presentations.list.render({
            query: QUERY, projection, context: data.context,
            selectedIds: new Set(), onToggleSelected: () => {},
            onOpenRecord: () => {}, onToggleGroup: () => {}, isGroupCollapsed: () => false,
          })}
        </CatalogCollectionActionsProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

/** Open a row's relations disclosure and hand back the panel. */
async function drillInto(name: string) {
  await userEvent.setup().click(screen.getByRole('button', { name: `Show relations for ${name}` }))
  return screen.getByTestId('catalog-relations')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listObjectivesAll).mockResolvedValue(OBJECTIVES)
  vi.mocked(listWorkLinesAll).mockResolvedValue(WORK_LINES)
  vi.mocked(listTasks).mockResolvedValue(TASKS)
})

describe('AC-204: drilling down from an Objective record', () => {
  it('rolls the count up from its Tasks and opens each one at its own record', async () => {
    await renderCatalog(objectivesCollectionDescriptor)
    const panel = await drillInto('Grow revenue')

    // Grow revenue holds 3 active tasks (1 Done) — the archived one is not work, so it is not counted.
    expect(screen.getAllByTestId('catalog-progress')[0]).toHaveTextContent('1 / 3 done')

    const launch = within(panel).getByRole('link', { name: 'Menu launch' })
    expect(launch).toHaveAttribute('href', '/work/projects?q=Menu%20launch')
    expect(within(panel).getByRole('link', { name: 'Print the menus' }))
      .toHaveAttribute('href', '/work/tasks/t-launch-done')
    expect(within(panel).queryByRole('link', { name: 'Cancelled idea' })).toBeNull()
  })

  it('renders the No Project/Process branch instead of hiding the Objective\'s own Tasks', async () => {
    await renderCatalog(objectivesCollectionDescriptor)
    const panel = await drillInto('Grow revenue')

    const branch = within(panel).getByText('No Project/Process').closest('li')!
    expect(branch).toHaveTextContent('0 / 1 done')
    // A synthetic branch is not a record, so it offers no catalog door — but its task does.
    expect(within(branch).queryByRole('link', { name: 'No Project/Process' })).toBeNull()
    expect(within(branch).getByRole('link', { name: 'Sign the lease' }))
      .toHaveAttribute('href', '/work/tasks/t-direct')
  })

  it('gives EVERY capped branch a door through to the rest of its Tasks', async () => {
    vi.mocked(listTasks).mockResolvedValue([...TASKS, ...OVERFLOWING])
    await renderCatalog(objectivesCollectionDescriptor)
    const panel = await drillInto('Grow revenue')

    const capped = within(panel).getByRole('link', { name: 'Menu launch' }).closest('li')!
    expect(within(capped).queryAllByRole('link', { name: /^Prep step/ })).toHaveLength(0)
    const prep = within(panel).getByRole('link', { name: 'Daily prep' }).closest('li')!
    expect(within(prep).getAllByRole('link', { name: /^Prep step/ })).toHaveLength(12)
    const door = within(prep).getByRole('link', { name: 'Daily prep: +1 more — open Tasks' })
    expect(door).toHaveAttribute('href', '/work/tasks?group=objective')
    expect(door).toHaveTextContent('+1 more — open Tasks')
  })

  it('gives the SYNTHETIC branch its overflow door too — the one that hides untracked work', async () => {
    // 13 tasks hanging straight off the Objective with no Project/Process.
    vi.mocked(listTasks).mockResolvedValue(Array.from({ length: 13 }, (_, i) =>
      task({ id: `t-loose-${i}`, title: `Loose task ${i}`, objective_id: 'obj-1' })))
    await renderCatalog(objectivesCollectionDescriptor)
    const panel = await drillInto('Grow revenue')

    const branch = within(panel).getByText('No Project/Process').closest('li')!
    expect(within(branch).getAllByRole('link', { name: /^Loose task/ })).toHaveLength(12)
    expect(within(branch).getByRole('link', { name: 'No Project/Process: +1 more — open Tasks' }))
      .toHaveAttribute('href', '/work/tasks?group=objective')
  })

  it('shows an Objective with no work as empty rather than as a false zero', async () => {
    await renderCatalog(objectivesCollectionDescriptor)
    const panel = await drillInto('Lonely objective')
    expect(panel).toHaveTextContent('No Projects, Processes, or Tasks linked yet.')
  })
})

describe('AC-204: drilling up from a Project/Process record', () => {
  it('names its parent Objective, counts its Tasks, and links both', async () => {
    await renderCatalog(projectsProcessesCollectionDescriptor)
    const panel = await drillInto('Menu launch')

    const parent = within(panel).getByRole('link', { name: 'Grow revenue' })
    expect(parent).toHaveAttribute('href', '/work/objectives?q=Grow%20revenue')
    expect(parent.closest('li')).toHaveTextContent('1 / 2 done')
    expect(within(panel).getByRole('link', { name: 'Brief the floor' }))
      .toHaveAttribute('href', '/work/tasks/t-launch-open')
  })

  it('renders the (Unlinked) branch for a Project/Process with no parent Objective', async () => {
    await renderCatalog(projectsProcessesCollectionDescriptor)
    const panel = await drillInto('Loose ends')

    const branch = within(panel).getByText('(Unlinked)').closest('li')!
    expect(branch).toHaveTextContent('0 / 1 done')
    expect(within(branch).queryByRole('link', { name: '(Unlinked)' })).toBeNull()
    expect(within(branch).getByRole('link', { name: 'Chase the invoice' }))
      .toHaveAttribute('href', '/work/tasks/t-orphan')
  })

  it('offers no cascade navigation anywhere in the drill (OD-WAY-32)', async () => {
    await renderCatalog(objectivesCollectionDescriptor)
    const panel = await drillInto('Grow revenue')
    for (const link of within(panel).getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('cascade')
    }
    expect(document.body.textContent?.toLowerCase()).not.toContain('cascade')
  })
})
