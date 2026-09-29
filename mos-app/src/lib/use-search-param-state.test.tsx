import { describe, it, expect, vi, beforeEach } from 'vitest'
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
let mockState: unknown = null

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [
    { get: () => mockParamValue } as unknown as URLSearchParams,
    setParams,
  ],
  useLocation: () => ({ state: mockState }),
}))

beforeEach(() => {
  setParams.mockClear()
  mockParamValue = null
  mockState = null
})

// The router echoing one of the hook's own writes: the URL value plus the navigation state the
// hook passed to `setParams`. Anything committed without that state is an external navigation.
const ownState = () => (setParams.mock.calls.at(-1)?.[1] as { state: unknown }).state
const echoOwnWrite = (value: string | null) => {
  mockParamValue = value
  mockState = ownState()
}
const navigateExternally = (value: string | null) => {
  mockParamValue = value
  mockState = null
}

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
    echoOwnWrite('ab')
    rerender()
    expect(result.current[0]).toBe('ab') // no regression once the URL agrees
  })

  it('a URL change from elsewhere (back/forward) IS adopted once it differs from our last write', () => {
    mockParamValue = 'ab'
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))
    expect(result.current[0]).toBe('ab')

    // Something outside this hook changed the URL (browser back button, a shared reset).
    navigateExternally('x')
    rerender()
    expect(result.current[0]).toBe('x')
  })

  it('an external navigation to a value typed seconds ago replaces the field', () => {
    mockParamValue = null
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))
    act(() => result.current[1]('a'))
    act(() => result.current[1]('ab'))
    echoOwnWrite('ab')
    rerender()
    expect(result.current[0]).toBe('ab')

    // Back/forward, a link or a reset lands on "a" — a value this hook wrote moments ago.
    navigateExternally('a')
    rerender()
    expect(result.current[0]).toBe('a')
  })

  it('an old history entry that still carries this hook\'s tag is adopted after an external change', () => {
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))
    act(() => result.current[1]('ab'))
    const staleState = ownState()
    echoOwnWrite('ab')
    rerender()

    navigateExternally('zzz') // a link pushes another entry
    rerender()
    expect(result.current[0]).toBe('zzz')

    mockParamValue = 'ab' // back onto the entry this hook once wrote
    mockState = staleState
    rerender()
    expect(result.current[0]).toBe('ab')
  })

  it('keeps unrelated navigation state and other keys\' tags when it writes', () => {
    mockState = { taskSurface: 'panel', __sps: { status: 'other-token' } }
    const { result } = renderHook(() => useSearchParamState('q', ''))
    act(() => result.current[1]('a'))
    expect(ownState()).toMatchObject({
      taskSurface: 'panel',
      __sps: { status: 'other-token', q: expect.any(String) },
    })
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
    echoOwnWrite('a')
    rerender()
    expect(result.current[0]).toBe('ab') // must NOT regress to the stale value

    // The newer "ab" write then lands too.
    echoOwnWrite('ab')
    rerender()
    expect(result.current[0]).toBe('ab')
  })
})

describe('useSearchParamState — delayed, reordered echoes under load', () => {
  it('own echoes landing late and out of order never overwrite newer typed text; an external reset still does', () => {
    const { result, rerender } = renderHook(() => useSearchParamState('q', ''))
    const typed = ['C', 'Ca', 'Cah', 'Cahy', 'Cahya', 'Cahya ', 'Cahya C', 'Cahya Ca', 'Cahya Caf', 'Cahya Cafe']
    for (const v of typed) act(() => result.current[1](v))
    // Echoes arrive after typing finished: in-order, then a stale one AFTER newer ones, then the
    // same value again.
    for (const echo of ['Cahya Ca', 'Cah', 'Cahya Caf', 'Cahya', 'Cahya Cafe', 'Cahya C', 'Cahya Cafe']) {
      echoOwnWrite(echo)
      rerender()
      expect(result.current[0]).toBe('Cahya Cafe')
    }
    // Typing continues on top of the full string, not a stale one.
    act(() => result.current[1]('Cahya Cafes'))
    expect(result.current[0]).toBe('Cahya Cafes')

    // External reset (Clear filters) is adopted.
    navigateExternally(null)
    rerender()
    expect(result.current[0]).toBe('')

    // External back to an old value, right after it was typed, is adopted too.
    navigateExternally('Cahya')
    rerender()
    expect(result.current[0]).toBe('Cahya')
  })
})
