import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchParamState } from './use-search-param-state'

// Calibration finding (MVP wave 1, Café Plan item search): fast typing drops characters.
// `useSearchParamState` used to read the displayed value straight from `params.get(key)`,
// react-router's own state, which only refreshes once a `setSearchParams` navigation has
// actually committed — typing faster than that round trip read the PRE-keystroke state.
// Mocking `useSearchParams` controls exactly when the router "catches up", reproducing the
// gap deterministically instead of relying on jsdom/act timing to stand in for a real
// browser's event loop.
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

  // gpt-6-luna review (74d4ebf7): comparing only against the LATEST write let a STALE echo of
  // an older keystroke regress the box once it finally landed out of order.
  it('a stale write for an older keystroke landing after a newer one is already shown does not regress the box', () => {
    mockParamValue = null
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))

    // "a" then "ab" typed back to back, before the router has committed either navigation.
    act(() => result.current[1]('a'))
    act(() => result.current[1]('ab'))
    expect(result.current[0]).toBe('ab')

    // The router finally commits the STALE "a" write — out of order, after "ab" is on screen.
    mockParamValue = 'a'
    rerender()
    expect(result.current[0]).toBe('ab') // must NOT regress to the stale value

    // The newer "ab" write then lands too.
    mockParamValue = 'ab'
    rerender()
    expect(result.current[0]).toBe('ab')
  })
})
