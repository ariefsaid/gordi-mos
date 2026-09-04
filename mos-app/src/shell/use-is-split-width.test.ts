import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { TASKS_SPLIT_MIN_WIDTH, useIsSplitWidth } from './use-is-split-width'

function stubMatchMedia(matchesFor: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: matchesFor(query), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

describe('useIsSplitWidth (decision-column split threshold)', () => {
  it('derives the threshold from the five decision floors plus the menu floor', () => {
    const floors = [160, 108, 128, 120, 104]
    const menuFloor = 40
    const tableTrackAtThreshold = TASKS_SPLIT_MIN_WIDTH - 232 - 48 - 400 - 12
    expect(floors.reduce((sum, floor) => sum + floor, menuFloor)).toBe(660)
    expect(tableTrackAtThreshold).toBeGreaterThanOrEqual(floors.reduce((sum, floor) => sum + floor, menuFloor))
    expect(TASKS_SPLIT_MIN_WIDTH).toBe(1352)
  })
  beforeEach(() => vi.restoreAllMocks())

  it('returns true at the derived threshold', () => {
    stubMatchMedia(q => q.includes('1100'))
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(true)
  })

  it('returns false below the derived threshold', () => {
    stubMatchMedia(() => false)
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(false)
  })
})
