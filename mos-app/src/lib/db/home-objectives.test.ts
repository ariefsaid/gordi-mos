import { describe, expect, it } from 'vitest'
import { buildHomeObjectiveProgress } from './home-objectives'
import type { TaskListRow } from './tasks.types'

const task = (overrides: Partial<TaskListRow>): TaskListRow => ({
  id: 'task', org_id: 'org', title: 'Task', business_unit_id: 'bu',
  status: 'Open', responsible_person_id: 'person', accountable_person_id: 'person',
  consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null,
  objective_id: null, work_line_id: null, last_activity_at: '2026-01-01T00:00:00Z', archived_at: null,
  created_by: 'person', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('Home Objective progress', () => {
  it('counts real active tasks through direct and Work-line Objective edges', () => {
    const progress = buildHomeObjectiveProgress({
      objectives: [{ id: 'o1', name: 'Q3 Growth' }, { id: 'o2', name: 'Operations' }],
      workLines: [{ id: 'wl1', name: 'Launch', type: 'project', objective_id: 'o1' }],
      tasks: [
        task({ id: 'direct-done', objective_id: 'o1', status: 'Done' }),
        task({ id: 'through-line', work_line_id: 'wl1', status: 'Open' }),
        task({ id: 'through-line-done', work_line_id: 'wl1', status: 'Done' }),
        task({ id: 'archived', objective_id: 'o1', status: 'Done', archived_at: '2026-09-01T00:00:00Z' }),
        task({ id: 'unlinked' }),
      ],
    })

    expect(progress).toEqual([
      { id: 'o1', name: 'Q3 Growth', done: 2, total: 3 },
      { id: 'o2', name: 'Operations', done: 0, total: 0 },
    ])
  })
})

it('never fabricates an Objective link from a dangling Task or Work-line edge', () => {
  expect(buildHomeObjectiveProgress({
    objectives: [],
    workLines: [{ id: 'wl', name: 'Project', type: 'project', objective_id: 'missing' }],
    tasks: [task({ objective_id: 'missing' }), task({ id: 'indirect', work_line_id: 'wl' })],
  })).toEqual([])
})
