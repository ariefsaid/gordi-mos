import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabMemory } from './useTabMemory'

beforeEach(() => sessionStorage.clear())

describe('useTabMemory (AC-106) — per-task session tab memory', () => {
  it('AC-106: defaults to "details"', () => {
    const { result } = renderHook(() => useTabMemory('t1'))
    expect(result.current[0]).toBe('details')
  })

  it('AC-106: remembers the last-used tab per task id in sessionStorage', () => {
    const { result } = renderHook(() => useTabMemory('t1'))
    act(() => result.current[1]('checklist'))
    expect(result.current[0]).toBe('checklist')
    expect(sessionStorage.getItem('mos.tasks.tab.t1')).toBe('checklist')
  })

  it('AC-106: a different task id reads its own memory (defaults to details)', () => {
    sessionStorage.setItem('mos.tasks.tab.t1', 'activity')
    const { result, rerender } = renderHook(({ id }) => useTabMemory(id), {
      initialProps: { id: 't1' },
    })
    expect(result.current[0]).toBe('activity')
    rerender({ id: 't2' })
    expect(result.current[0]).toBe('details')
  })

  it('null task id (create mode) defaults to details and does not throw on set', () => {
    const { result } = renderHook(() => useTabMemory(null))
    expect(result.current[0]).toBe('details')
    act(() => result.current[1]('checklist'))
    expect(result.current[0]).toBe('checklist')
  })
})
