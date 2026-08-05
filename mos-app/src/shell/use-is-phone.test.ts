import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsPhone } from './use-is-phone'

type Listener = (e: MediaQueryListEvent) => void

function stubMatchMedia(initial: boolean) {
  const listeners: Listener[] = []
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: initial,
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: Listener) => { listeners.push(fn) },
      removeEventListener: (_: string, fn: Listener) => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      },
      dispatchEvent: () => false,
    }),
  })
  return {
    /** Simulate the viewport crossing the breakpoint after mount. */
    change: (matches: boolean) => {
      for (const fn of [...listeners]) fn({ matches } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.length,
  }
}

// The 390px phone-fold breakpoint — `OD-WAY-22`'s shipping width. Distinct from useIsDesktop's
// 768px table→card reflow and useIsNarrow's 920px rail collapse, so it gets its own hook rather
// than a second reading of an existing one.
describe('useIsPhone (≤390px phone fold)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reads matchMedia synchronously on first render — true at ≤390px', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useIsPhone())
    // Synchronous, not after an effect: a false first frame would flash the wrong branch.
    expect(result.current).toBe(true)
  })

  it('is false above 390px', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useIsPhone())
    expect(result.current).toBe(false)
  })

  it('queries the 390px breakpoint, not another one', () => {
    const seen: string[] = []
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => {
        seen.push(query)
        return {
          matches: false, media: query, onchange: null,
          addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
        }
      },
    })
    renderHook(() => useIsPhone())
    expect(seen.every((q) => q === '(max-width: 390px)')).toBe(true)
  })

  it('follows a live viewport change, then unsubscribes on unmount', () => {
    const mql = stubMatchMedia(false)
    const { result, unmount } = renderHook(() => useIsPhone())
    expect(result.current).toBe(false)

    act(() => mql.change(true))
    expect(result.current).toBe(true)

    unmount()
    expect(mql.listenerCount()).toBe(0)
  })
})
