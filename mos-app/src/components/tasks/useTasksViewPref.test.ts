import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, it, expect } from 'vitest'
import { useTasksViewPref, __resetTasksViewPrefForTests } from './useTasksViewPref'

beforeEach(() => { localStorage.clear(); __resetTasksViewPrefForTests() })

describe('useTasksViewPref (per-user-global, mirrors useExpandPref)', () => {
  it('AC-127: defaults groupBy=status, view=table, collapsedGroups={}', () => {
    const { result } = renderHook(() => useTasksViewPref())
    expect(result.current.view).toBe('table')
    expect(result.current.groupBy).toBe('status')
    expect(result.current.collapsedGroups).toEqual({})
  })

  it('AC-127: setGroupBy persists to mos.tasks.groupBy and re-reads on remount', () => {
    const { result } = renderHook(() => useTasksViewPref())
    act(() => result.current.setGroupBy('owner'))
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')
    // Reset snapshot to simulate remount
    __resetTasksViewPrefForTests()
    const { result: r2 } = renderHook(() => useTasksViewPref())
    expect(r2.current.groupBy).toBe('owner')
  })

  it('AC-127: multiple consumers share one store — setGroupBy in one updates the other', () => {
    const a = renderHook(() => useTasksViewPref())
    const b = renderHook(() => useTasksViewPref())
    expect(a.result.current.groupBy).toBe('status')
    expect(b.result.current.groupBy).toBe('status')
    act(() => a.result.current.setGroupBy('bu'))
    expect(a.result.current.groupBy).toBe('bu')
    expect(b.result.current.groupBy).toBe('bu') // other consumer also updated
  })

  it('AC-132: toggleCollapsed records the collapsed group key per dimension', () => {
    const { result } = renderHook(() => useTasksViewPref())
    act(() => result.current.toggleCollapsed('Done'))   // collapses under the active groupBy (status)
    expect(JSON.parse(localStorage.getItem('mos.tasks.collapsedGroups')!)).toEqual({ status: ['Done'] })
    expect(result.current.isCollapsed('Done')).toBe(true)
    expect(result.current.isCollapsed('Open')).toBe(false)
  })

  it('AC-132: toggleCollapsed twice removes the key (toggle = expand back)', () => {
    const { result } = renderHook(() => useTasksViewPref())
    act(() => result.current.toggleCollapsed('Done'))
    act(() => result.current.toggleCollapsed('Done'))
    expect(result.current.isCollapsed('Done')).toBe(false)
    expect(JSON.parse(localStorage.getItem('mos.tasks.collapsedGroups')!)).toEqual({ status: [] })
  })

  it('AC-127: setGroupBy("bu") persists correctly', () => {
    const { result } = renderHook(() => useTasksViewPref())
    act(() => result.current.setGroupBy('bu'))
    expect(result.current.groupBy).toBe('bu')
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('bu')
  })

  it('AC-127: collapsedGroups are scoped per dimension (status vs owner)', () => {
    const { result } = renderHook(() => useTasksViewPref())
    // Collapse 'Done' under status
    act(() => result.current.toggleCollapsed('Done'))
    // Switch to owner groupBy
    act(() => result.current.setGroupBy('owner'))
    // 'Done' is not collapsed under owner
    expect(result.current.isCollapsed('Done')).toBe(false)
    // Collapse 'Alice' under owner
    act(() => result.current.toggleCollapsed('Alice'))
    expect(result.current.isCollapsed('Alice')).toBe(true)
    // Both dimensions preserved in storage
    const stored = JSON.parse(localStorage.getItem('mos.tasks.collapsedGroups')!)
    expect(stored.status).toContain('Done')
    expect(stored.owner).toContain('Alice')
  })

  it('handles corrupted localStorage gracefully (falls back to defaults)', () => {
    localStorage.setItem('mos.tasks.collapsedGroups', 'not-json{{{')
    localStorage.setItem('mos.tasks.groupBy', 'invalid-value')
    __resetTasksViewPrefForTests()
    const { result } = renderHook(() => useTasksViewPref())
    expect(result.current.groupBy).toBe('status') // invalid → default
    expect(result.current.collapsedGroups).toEqual({})
  })
})
