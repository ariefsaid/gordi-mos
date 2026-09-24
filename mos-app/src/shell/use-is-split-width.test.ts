import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook } from '@testing-library/react'
import {
  TASKS_FRAME_GUTTER_PX,
  TASKS_RAIL_WIDTH,
  TASKS_RECORD_PANEL_FLOOR_PX,
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
    // #930 — every decision column is sized by CLASS, applying whether or not a record is open
    // (see TasksWorkspace.css); Title's floor is its `min-width` (it is `width: auto` — the
    // column that gives, never the status pill), the rest are plain `width`.
    const floorOf = (className: string, property: 'width' | 'min-width') => {
      const match = css.match(new RegExp(`\\.tasks-table th\\.${className}[^{]*\\{[^}]*${property}:\\s*(\\d+)px`))
      expect(match, `missing authored floor for .${className}`).not.toBeNull()
      return Number(match![1])
    }
    const floors = [
      floorOf('th-task', 'min-width'),
      floorOf('th-status', 'width'),
      floorOf('th-owner', 'width'),
      floorOf('th-supervisor', 'width'),
      floorOf('th-due', 'width'),
    ]
    const parsedFloorTotal = floors.reduce((sum, floor) => sum + floor, 0)
    // Status is wide enough that the longest closed-vocabulary word never wraps; Due is wide
    // enough that the stacked "Overdue · <date>" state stays on one line (#930).
    // 120 + 132 + 112 + 104 + 208 = 676.
    expect(parsedFloorTotal).toBe(676)
    expect(parsedFloorTotal).toBe(TASKS_SPLIT_FLOOR_TOTAL)
    expect(TASKS_SPLIT_MIN_WIDTH).toBe(
      TASKS_RAIL_WIDTH + (TASKS_FRAME_GUTTER_PX * 2) + TASKS_RECORD_PANEL_FLOOR_PX +
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
