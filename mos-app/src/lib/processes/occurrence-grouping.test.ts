import { describe, it, expect } from 'vitest'
import { groupTasksByOccurrence, type OccurrenceGroupableTask } from './occurrence-grouping'

// B5 (AC-622/FR-611): occurrence grouping is a pure caption-labelled partition over generated
// Tasks. "Process Run" is internal-only vocabulary and must NEVER be produced as a label
// (occurrences surface only as their run's caption).

function task(overrides: Partial<OccurrenceGroupableTask> = {}): OccurrenceGroupableTask {
  return { id: 'task-1', process_run_id: null, ...overrides }
}

describe('groupTasksByOccurrence', () => {
  it('AC-622: partitions generated Tasks into groups labelled by the run caption', () => {
    const tasks = [
      task({ id: 't1', process_run_id: 'run-a' }),
      task({ id: 't2', process_run_id: 'run-a' }),
      task({ id: 't3', process_run_id: 'run-b' }),
    ]
    const captionByRunId = { 'run-a': 'Café Opening · 17 Jul 2026', 'run-b': 'Café Closing · 17 Jul 2026' }

    const { groups } = groupTasksByOccurrence(tasks, captionByRunId)

    expect(groups).toHaveLength(2)
    const byRunId = Object.fromEntries(groups.map((g) => [g.runId, g]))
    expect(byRunId['run-a'].caption).toBe('Café Opening · 17 Jul 2026')
    expect(byRunId['run-a'].tasks.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(byRunId['run-b'].caption).toBe('Café Closing · 17 Jul 2026')
    expect(byRunId['run-b'].tasks.map((t) => t.id)).toEqual(['t3'])
  })

  it('AC-622: ad-hoc Tasks (no process_run_id) stay ungrouped', () => {
    const tasks = [
      task({ id: 'adhoc-1', process_run_id: null }),
      task({ id: 't1', process_run_id: 'run-a' }),
    ]
    const { groups, ungrouped } = groupTasksByOccurrence(tasks, { 'run-a': 'Café Opening · 17 Jul 2026' })

    expect(ungrouped.map((t) => t.id)).toEqual(['adhoc-1'])
    expect(groups).toHaveLength(1)
  })

  it('AC-622: the string "Process Run" is never produced as a group label, even with an unmapped caption', () => {
    const tasks = [task({ id: 't1', process_run_id: 'run-unmapped' })]
    const { groups } = groupTasksByOccurrence(tasks, {})

    expect(groups).toHaveLength(1)
    expect(groups[0].caption).not.toMatch(/Process Run/i)
  })

  it('returns no groups and no ungrouped for an empty task list', () => {
    const { groups, ungrouped } = groupTasksByOccurrence([], {})
    expect(groups).toEqual([])
    expect(ungrouped).toEqual([])
  })
})
