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
  it('derives the threshold from a list width that holds the Task floor, Status and Due', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    const widthOf = (className: string, pattern: string) => {
      const match = css.match(new RegExp(`\\.tasks-table th\\.${className}[^{]*\\{[^}]*width:\\s*${pattern}(\\d+)px`))
      expect(match, `missing authored width for .${className}`).not.toBeNull()
      return Number(match![1])
    }
    // Beside a record the list sheds PIC and Supervisor before Task drops under its floor, so the
    // split needs room for the three columns it keeps.
    const kept = widthOf('th-task', 'clamp\\(') + widthOf('th-status', '') + widthOf('th-due', '')
    expect(kept).toBeLessThanOrEqual(TASKS_SPLIT_FLOOR_TOTAL)
    expect(TASKS_SPLIT_MIN_WIDTH).toBe(
      TASKS_RAIL_WIDTH + (TASKS_FRAME_GUTTER_PX * 2) + TASKS_RECORD_PANEL_FLOOR_PX +
      TASKS_SPLIT_GAP_PX + TASKS_SPLIT_FLOOR_TOTAL + TASKS_TABLE_BORDER_PX,
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
