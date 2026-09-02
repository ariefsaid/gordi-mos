import { describe, expect, it } from 'vitest'
import { getActiveTaskView } from './task-collection-view'
import type { TaskCollectionQuery } from './task-collection-adapter'

const labels = {
  all: 'All', 'my-work': 'My work', 'my-pic': 'My work', 'my-supervisor': 'My work',
  overdue: 'Overdue', followups: 'Follow-ups',
}
const query = (patch: Partial<TaskCollectionQuery> = {}) => ({
  view: 'all' as const, savedViewId: null, ...patch,
})

describe('getActiveTaskView', () => {
  it('uses the typed built-in label', () => {
    expect(getActiveTaskView({ query: query({ view: 'my-work' }), savedViews: [], labels })).toEqual({
      savedViewId: null, label: 'My work', hasNonDefaultView: true,
    })
  })

  it('treats unselected PIC and supervisor views like the default chip state', () => {
    expect(getActiveTaskView({ query: query({ view: 'my-pic' }), savedViews: [], labels })).toEqual({
      savedViewId: null, label: 'All', hasNonDefaultView: false,
    })
    expect(getActiveTaskView({ query: query({ view: 'my-supervisor' }), savedViews: [], labels })).toEqual({
      savedViewId: null, label: 'All', hasNonDefaultView: false,
    })
  })

  it('uses the matching persisted custom name', () => {
    expect(getActiveTaskView({
      query: query({ savedViewId: 'custom' }),
      savedViews: [{ id: 'custom', name: 'My queue' }], labels,
    })).toEqual({ savedViewId: 'custom', label: 'My queue', hasNonDefaultView: true })
  })

  it('keeps an unloaded saved id non-default and falls back to the typed label', () => {
    expect(getActiveTaskView({ query: query({ savedViewId: 'pending' }), savedViews: [], labels })).toEqual({
      savedViewId: null, label: 'All', hasNonDefaultView: true,
    })
  })
})
