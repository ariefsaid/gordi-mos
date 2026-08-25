import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRailCompact } from './use-rail-compact'
import { useRailCollapsePref, __resetRailCollapsePrefForTests } from './use-rail-collapse-pref'

/**
 * Widths are expressed as which media queries match, because that is what the hooks read.
 *  - phone/tablet  (<920px):  the max-width:919.98px query matches, min-width:1100px does not
 *  - compact band  (920–1099.98px): neither matches
 *  - full rail     (≥1100px): only min-width:1100px matches
 */
function stubWidth(px: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('919.98') ? px <= 919.98 : query.includes('1100') ? px >= 1100 : false,
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
  __resetRailCollapsePrefForTests()
})

function collapse() {
  const pref = renderHook(() => useRailCollapsePref())
  act(() => pref.result.current.setCollapsed(true))
  pref.unmount()
}

// #442 — the one seam that folds "how wide is the window" and "what did the user ask for" into
// the single `compact` boolean the rail already renders from.
describe('useRailCompact (#442)', () => {
  it('at 1280px, default preference: the full labelled rail, and collapsing is offered', () => {
    stubWidth(1280)
    const { result } = renderHook(() => useRailCompact())
    expect(result.current.compact).toBe(false)
    expect(result.current.collapsible).toBe(true)
  })

  it('at 1280px, collapsed preference: the icon-only rail', () => {
    stubWidth(1280)
    collapse()
    const { result } = renderHook(() => useRailCompact())
    expect(result.current.compact).toBe(true)
    expect(result.current.collapsible).toBe(true)
  })

  it('at exactly 1100px the preference still governs — the boundary belongs to the full regime', () => {
    stubWidth(1100)
    const { result } = renderHook(() => useRailCompact())
    expect(result.current.compact).toBe(false)
    expect(result.current.collapsible).toBe(true)
  })

  // The load-bearing rule: 232px of labels does not FIT in the band, which is a measurement and
  // not a taste, so a stored "expanded" must not be able to overrule it.
  it('at 1000px the width regime wins: compact regardless of a stored expanded preference', () => {
    stubWidth(1000)
    const { result } = renderHook(() => useRailCompact())
    expect(result.current.compact).toBe(true)
    // …and the toggle is not offered, because it could not change this answer.
    expect(result.current.collapsible).toBe(false)
  })

  it('at 1000px a stored COLLAPSED preference also changes nothing — still compact, still no toggle', () => {
    stubWidth(1000)
    collapse()
    const { result } = renderHook(() => useRailCompact())
    expect(result.current.compact).toBe(true)
    expect(result.current.collapsible).toBe(false)
  })

  it('below 920px there is no rail at all, and no toggle, whatever is stored', () => {
    stubWidth(390)
    collapse()
    const { result } = renderHook(() => useRailCompact())
    expect(result.current.isNarrow).toBe(true)
    expect(result.current.compact).toBe(false)
    expect(result.current.collapsible).toBe(false)
  })
})
