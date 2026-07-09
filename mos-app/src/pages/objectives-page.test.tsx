// AC-406 (FR-422): ObjectivesPage down-trace — each objective shows its child work_lines + the
// non-archived task count per work_line, computed over listTasks + listWorkLinesAll (no schema
// change). The existing create/rename/archive behavior is unchanged (reused via CatalogManager).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { ObjectivesPage } from './objectives-page'

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
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
    { id: 'obj-2', name: 'Lonely objective', archived_at: null },
  ])
  vi.mocked(listWorkLinesAll).mockResolvedValue([
    { id: 'wl-1', name: 'Menu launch', type: 'project', archived_at: null },
    { id: 'wl-2', name: 'Daily prep', type: 'process', archived_at: null },
  ])
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

describe('Catalog-Manage archetype conformance (Wave 2: W2-1, W2-2)', () => {
  it('W2-1: the frame is full-bleed — no 1080 prose cap', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    const inner = container.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('none')
  })

  it('W2-1: the content head renders the count pill and the inline Add form still renders', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    expect(container.querySelector('.content-header')).toBeTruthy()
    const pill = container.querySelector('.ch-count')
    expect(pill).toBeTruthy()
    expect(pill!.textContent).toBe('2') // two active objectives in the fixture
    // inline create bar still renders its Add submit
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('W2-2: exactly ONE create affordance in the ready state — the inline Add form (head carries no action)', async () => {
    const { container } = renderPage()
    await screen.findByText('Grow revenue')
    // head carries NO action slot → no duplicate create CTA (State-Kit Rule)
    expect(container.querySelector('.ch-action')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1)
  })

  it('W2-2: in the empty state the create affordance is the SAME inline form, not a second CTA', async () => {
    vi.mocked(listObjectivesAll).mockResolvedValue([])
    vi.mocked(listTasks).mockResolvedValue([])
    const { container } = renderPage()
    await screen.findByText('No objectives yet')
    // empty state owns no action of its own; the inline Add form is the sole create surface
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1)
    expect(container.querySelector('.ch-action')).toBeNull()
  })
})
