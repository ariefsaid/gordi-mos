import { describe, it, expect, beforeEach } from 'vitest'
import { readRecentTasks, pushRecentTask, RECENT_TASKS_KEY } from './recent-tasks'

beforeEach(() => localStorage.clear())

// AC-K03: the Recent group is sourced from a client-only localStorage ring buffer
// (last ~5 opened /tasks/:id), no backend. (OD-P4-9/11, Director resolution.)
describe('recent-tasks ring buffer', () => {
  it('AC-K03: reads an empty list when nothing has been opened', () => {
    expect(readRecentTasks()).toEqual([])
  })

  it('AC-K03: pushes the most-recently-opened task to the front', () => {
    pushRecentTask({ id: 'a', title: 'Alpha' })
    pushRecentTask({ id: 'b', title: 'Beta' })
    expect(readRecentTasks()).toEqual([
      { id: 'b', title: 'Beta' },
      { id: 'a', title: 'Alpha' },
    ])
  })

  it('AC-K03: de-duplicates by id, moving a re-opened task to the front', () => {
    pushRecentTask({ id: 'a', title: 'Alpha' })
    pushRecentTask({ id: 'b', title: 'Beta' })
    pushRecentTask({ id: 'a', title: 'Alpha (renamed)' })
    expect(readRecentTasks()).toEqual([
      { id: 'a', title: 'Alpha (renamed)' },
      { id: 'b', title: 'Beta' },
    ])
  })

  it('AC-K03: caps the buffer at 5 entries', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) pushRecentTask({ id, title: id })
    const ids = readRecentTasks().map((r) => r.id)
    expect(ids).toEqual(['f', 'e', 'd', 'c', 'b'])
  })

  it('AC-K03: tolerates corrupt localStorage by returning []', () => {
    localStorage.setItem(RECENT_TASKS_KEY, 'not json')
    expect(readRecentTasks()).toEqual([])
  })
})
