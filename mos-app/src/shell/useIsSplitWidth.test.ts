import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsSplitWidth } from './useIsSplitWidth'

function stubMatchMedia(matchesFor: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: matchesFor(query), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

describe('useIsSplitWidth (≥1100px split threshold)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns true at ≥1100px', () => {
    stubMatchMedia(q => q.includes('1100'))
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(true)
  })

  it('returns false below 1100px', () => {
    stubMatchMedia(() => false)
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(false)
  })
})
