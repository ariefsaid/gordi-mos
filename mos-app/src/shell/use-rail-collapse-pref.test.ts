// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// The store is module state; a fresh import is how a page reload resets it.
async function freshHook() {
  vi.resetModules()
  return (await import('./use-rail-collapse-pref')).useRailCollapsePref
}

beforeEach(() => {
  localStorage.clear()
})

// #442 — the rail's collapse preference. The store, on its own, at the lowest layer that can own
// "default expanded" and "survives a remount"; the control that drives it is rail.test.tsx's.
describe('useRailCollapsePref (#442)', () => {
  it('defaults to expanded when nothing is stored', async () => {
    const useRailCollapsePref = await freshHook()
    const { result } = renderHook(() => useRailCollapsePref())
    expect(result.current.collapsed).toBe(false)
  })

  it('persists the collapsed choice across a full remount', async () => {
    const useRailCollapsePref = await freshHook()
    const first = renderHook(() => useRailCollapsePref())
    act(() => first.result.current.toggle())
    expect(first.result.current.collapsed).toBe(true)
    first.unmount()

    // A fresh mount reading a fresh store snapshot — the module cache is reset the way a page
    // reload would reset it, so this proves the value came from storage and not from memory.
    const useRailCollapsePref2 = await freshHook()
    const second = renderHook(() => useRailCollapsePref2())
    expect(second.result.current.collapsed).toBe(true)
    expect(localStorage.getItem('mos.rail.collapsed')).toBe('true')
  })

  it('toggles back to expanded and persists that too', async () => {
    const useRailCollapsePref = await freshHook()
    const { result } = renderHook(() => useRailCollapsePref())
    act(() => result.current.setCollapsed(true))
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem('mos.rail.collapsed')).toBe('false')
  })

  it('keeps every consumer on one snapshot — a change in one re-renders the other', async () => {
    const useRailCollapsePref = await freshHook()
    const a = renderHook(() => useRailCollapsePref())
    const b = renderHook(() => useRailCollapsePref())
    act(() => a.result.current.setCollapsed(true))
    expect(b.result.current.collapsed).toBe(true)
  })

  it('falls back to expanded when storage throws (private mode / denied)', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage denied') },
    })
    try {
      const useRailCollapsePref = await freshHook()
      const { result } = renderHook(() => useRailCollapsePref())
      expect(result.current.collapsed).toBe(false)
      // And a write must not blow up the render tree either.
      expect(() => act(() => result.current.setCollapsed(true))).not.toThrow()
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
      localStorage.clear()
    }
  })
})
