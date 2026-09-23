import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRailCollapsePref, __resetRailCollapsePrefForTests } from './use-rail-collapse-pref'

beforeEach(() => {
  localStorage.clear()
  __resetRailCollapsePrefForTests()
})

// #442 — the rail's collapse preference. The store, on its own, at the lowest layer that can own
// "default expanded" and "survives a remount"; the control that drives it is rail.test.tsx's.
describe('useRailCollapsePref (#442)', () => {
  it('defaults to expanded when nothing is stored', () => {
    const { result } = renderHook(() => useRailCollapsePref())
    expect(result.current.collapsed).toBe(false)
  })

  it('persists the collapsed choice across a full remount', () => {
    const first = renderHook(() => useRailCollapsePref())
    act(() => first.result.current.toggle())
    expect(first.result.current.collapsed).toBe(true)
    first.unmount()

    // A fresh mount reading a fresh store snapshot — the module cache is reset the way a page
    // reload would reset it, so this proves the value came from storage and not from memory.
    __resetRailCollapsePrefForTests()
    const second = renderHook(() => useRailCollapsePref())
    expect(second.result.current.collapsed).toBe(true)
    expect(localStorage.getItem('mos.rail.collapsed')).toBe('true')
  })

  it('toggles back to expanded and persists that too', () => {
    const { result } = renderHook(() => useRailCollapsePref())
    act(() => result.current.setCollapsed(true))
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('mos.rail.collapsed')).toBe('false')
  })

  it('keeps every consumer on one snapshot — a change in one re-renders the other', () => {
    const a = renderHook(() => useRailCollapsePref())
    const b = renderHook(() => useRailCollapsePref())
    act(() => a.result.current.setCollapsed(true))
    expect(b.result.current.collapsed).toBe(true)
  })

  it('falls back to expanded when storage throws (private mode / denied)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage denied') },
    })
    try {
      __resetRailCollapsePrefForTests()
      const { result } = renderHook(() => useRailCollapsePref())
      expect(result.current.collapsed).toBe(false)
      // And a write must not blow up the render tree either.
      expect(() => act(() => result.current.setCollapsed(true))).not.toThrow()
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
      localStorage.clear()
      // The hook is still mounted here, and the reset notifies its subscriber — inside act(),
      // or React reports an unwrapped update from the teardown itself.
      act(() => __resetRailCollapsePrefForTests())
    }
  })
})
