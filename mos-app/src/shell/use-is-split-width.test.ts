import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderHook } from '@testing-library/react'
import {
  TASKS_FRAME_GUTTER_PX,
  TASKS_RAIL_WIDTH,
  TASKS_RECORD_PANEL_FLOOR_PX,
  TASKS_IDENTITY_FLOOR_PX,
  TASKS_SPLIT_GAP_PX,
  TASKS_SPLIT_MIN_WIDTH,
  TASKS_TABLE_BORDER_PX,
  useIsSplitWidth,
} from './use-is-split-width'
import { WIDE_OVERLAY_MIN_WIDTH } from './use-is-wide-overlay-width'

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
  it('derives the threshold from the authored Task floor and the real wide-frame gutter', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    // Every other column drops before Task goes under its floor, so the Task floor is all the
    // list needs beside the smallest record panel.
    const match = css.match(/\.tasks-table th\.th-task[^{]*\{[^}]*width:\s*(\d+)px/)
    expect(match, 'missing authored floor for .th-task').not.toBeNull()
    expect(Number(match![1])).toBe(TASKS_IDENTITY_FLOOR_PX)
    expect(TASKS_SPLIT_MIN_WIDTH).toBe(Math.max(
      WIDE_OVERLAY_MIN_WIDTH,
      TASKS_RAIL_WIDTH + (TASKS_FRAME_GUTTER_PX * 2) + TASKS_RECORD_PANEL_FLOOR_PX +
      TASKS_SPLIT_GAP_PX + TASKS_IDENTITY_FLOOR_PX + TASKS_TABLE_BORDER_PX,
    ))
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
