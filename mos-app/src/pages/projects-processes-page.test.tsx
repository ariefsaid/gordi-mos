// AC-406 (FR-422): ProjectsProcessesPage up-trace — each project/process shows its parent
// objective(s) + the per-objective task count, inferred from task linkage (work_lines has no
// objective_id column) over listTasks + listObjectivesAll (no schema change). Reuses CatalogManager.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listObjectivesAll } from '@/lib/db/objectives'
import { listTasks } from '@/lib/db/tasks'
import { ProjectsProcessesPage } from './projects-processes-page'

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
        <ProjectsProcessesPage />
      </MemoryRouter>
    </I18nProvider>,
  )
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
})

describe('AC-406: ProjectsProcessesPage up-trace (FR-422)', () => {
  it('shows the parent objective(s) + per-objective task count, inferred from task linkage', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1'),
      task('t2', 'obj-1', 'wl-1'),
      task('t3', 'obj-2', 'wl-1'),
    ])
    renderPage()
    await screen.findByText('Menu launch')
    const trace = await screen.findByTestId('catalog-trace')
    // Menu launch ladders up to Grow revenue (2) + Brand love (1)
    expect(trace.textContent).toContain('Under:')
    expect(trace.textContent).toContain('Grow revenue (2)')
    expect(trace.textContent).toContain('Brand love (1)')
  })

  it('surfaces "no parent objective (N)" for a work_line whose tasks have a work_line but no objective (FR-422 edge case)', async () => {
    // wl-1 has an objective-linked task; wl-2 has only an unlinked task → wl-2 must NOT be dropped:
    // it shows a "no parent objective" trace with the count (the review-flagged edge case).
    vi.mocked(listTasks).mockResolvedValue([
      task('t1', 'obj-1', 'wl-1'),
      task('t2', null, 'wl-2'),
    ])
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    await screen.findByText('Daily prep')
    await waitFor(() => {
      // both work_lines are traced now (wl-1 → parent objective; wl-2 → no parent objective)
      expect(container.querySelectorAll('[data-testid="catalog-trace"]')).toHaveLength(2)
    })
    const traces = [...container.querySelectorAll('[data-testid="catalog-trace"]')].map((n) => n.textContent)
    expect(traces.some((t) => t?.includes('no parent objective (1)'))).toBe(true)
  })
})

describe('Catalog-Manage archetype conformance (Wave 2: W2-1)', () => {
  it('W2-1: the typed-field surface shares the full-bleed data frame (no 1080 cap)', async () => {
    vi.mocked(listTasks).mockResolvedValue([])
    const { container } = renderPage()
    await screen.findByText('Menu launch')
    const inner = container.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('none')
  })
})
