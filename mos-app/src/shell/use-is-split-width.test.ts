import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook } from '@testing-library/react'
import {
  TASKS_DRAWER_MAX_WIDTH,
  TASKS_FRAME_GUTTER_PX,
  TASKS_RAIL_WIDTH,
  TASKS_SPLIT_FLOOR_TOTAL,
  TASKS_SPLIT_GAP_PX,
  TASKS_SPLIT_MIN_WIDTH,
  TASKS_TABLE_BORDER_PX,
  useIsSplitWidth,
} from './use-is-split-width'

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
  it('derives the threshold from the authored decision floors and real wide-frame gutter', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    const floors = [1, 2, 3, 4, 5, 6].map((column) => {
      const match = css.match(new RegExp(
        `\\.split:not\\(\\.nodrawer\\) \\.tasks-table th:nth-child\\(${column}\\)[^\\{]*\\{[^}]*width:\\s*(\\d+)px`,
      ))
      expect(match, `missing authored split floor for column ${column}`).not.toBeNull()
      return Number(match![1])
    })
    const parsedFloorTotal = floors.reduce((sum, floor) => sum + floor, 0)
    expect(parsedFloorTotal).toBe(TASKS_SPLIT_FLOOR_TOTAL)
    expect(TASKS_SPLIT_MIN_WIDTH).toBe(
      TASKS_RAIL_WIDTH + (TASKS_FRAME_GUTTER_PX * 2) + TASKS_DRAWER_MAX_WIDTH +
      TASKS_SPLIT_GAP_PX + parsedFloorTotal + TASKS_TABLE_BORDER_PX,
    )
  })
  beforeEach(() => vi.restoreAllMocks())

  it('returns true at the derived threshold', () => {
    stubMatchMedia(q => q.includes(`${TASKS_SPLIT_MIN_WIDTH}`))
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(true)
  })

  it('returns false below the derived threshold', () => {
    stubMatchMedia(() => false)
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(false)
  })
})
