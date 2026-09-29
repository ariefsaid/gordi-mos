import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchParamState } from './use-search-param-state'

/**
 * Calibration finding (MVP wave 1, Café Plan item search): fast typing drops characters.
 *
 * `useSearchParamState` used to derive the displayed value STRAIGHT from
 * `params.get(key)` — react-router's own state, refreshed only once a `setSearchParams`
 * call's navigation has actually committed a render. A navigation is not instant (it goes
 * through `navigate()` and a history write before the hook's own `useSearchParams()` call
 * sees the new value on its NEXT render); typing faster than that round trip means the
 * displayed value can still be reading the router's PRE-keystroke state when the next
 * keystroke's `onChange` fires. Mocking `useSearchParams` to control exactly when the
 * router "catches up" reproduces that gap deterministically — no reliance on jsdom/act
 * timing standing in for a real browser's event loop.
 */
const setParams = vi.fn()
let mockParamValue: string | null = null

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [
    { get: () => mockParamValue } as unknown as URLSearchParams,
    setParams,
  ],
}))

describe('useSearchParamState — fast typing must not drop characters', () => {
  it('the displayed value follows every keystroke even while the router has not caught up yet', () => {
    mockParamValue = null // router starts knowing nothing about `q`
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))
    expect(result.current[0]).toBe('')

    // Two keystrokes, back to back, with the router's own state (`mockParamValue`) left
    // UNCHANGED between them — exactly what a navigation still in flight looks like.
    act(() => result.current[1]('a'))
    expect(result.current[0]).toBe('a') // must reflect the keystroke immediately

    act(() => result.current[1]('ab'))
    expect(result.current[0]).toBe('ab') // the second keystroke must not be dropped

    // The router eventually catches up and reports what was actually written last.
    mockParamValue = 'ab'
    rerender()
    expect(result.current[0]).toBe('ab') // no regression once the URL agrees
  })

  it('a URL change from elsewhere (back/forward) IS adopted once it differs from our last write', () => {
    mockParamValue = 'ab'
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))
    expect(result.current[0]).toBe('ab')

    // Something outside this hook changed the URL (browser back button, a shared reset).
    mockParamValue = 'x'
    rerender()
    expect(result.current[0]).toBe('x')
  })
})
