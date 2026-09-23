import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsCoarsePointer } from './use-is-coarse-pointer'

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
    change: (matches: boolean) => {
      for (const fn of [...listeners]) fn({ matches } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.length,
  }
}

// Input MODALITY, not width. A touch tablet at 768–1024px is "desktop" by every width query the
// shell owns, yet cannot hover — so anything revealed on hover is unreachable there. That is why
// this is a pointer query and not another breakpoint.
describe('useIsCoarsePointer (pointer modality, not viewport width)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reads matchMedia synchronously on first render — true for a coarse pointer', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useIsCoarsePointer())
    expect(result.current).toBe(true)
  })

  it('is false for a fine pointer', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useIsCoarsePointer())
    expect(result.current).toBe(false)
  })

  it('queries the pointer, never a width — a width query would misread a touch tablet', () => {
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
    renderHook(() => useIsCoarsePointer())
    expect(seen.every((q) => q === '(pointer: coarse)')).toBe(true)
    expect(seen.some((q) => q.includes('width'))).toBe(false)
  })

  it('follows a live modality change, then unsubscribes on unmount', () => {
    const mql = stubMatchMedia(false)
    const { result, unmount } = renderHook(() => useIsCoarsePointer())
    expect(result.current).toBe(false)

    act(() => mql.change(true))
    expect(result.current).toBe(true)

    unmount()
    expect(mql.listenerCount()).toBe(0)
  })
})
