import { useState, useEffect } from 'react'

export const TASKS_RAIL_WIDTH = 232
export const TASKS_FRAME_GUTTER_PX = 32
// #930 — Tasks' record column is --record-panel-w (index.css: clamp(440px, 40%, 640px)), the
// same track every Work collection's split uses; it no longer has a private fixed 400px width.
// The threshold below has to assume the SMALLEST the panel can ever render, because that is the
// narrowest gap the table's floors must still fit beside — at the threshold viewport the 40%
// term is under its floor, so the floor (440) is what actually renders.
export const TASKS_RECORD_PANEL_FLOOR_PX = 440
export const TASKS_SPLIT_GAP_PX = 12
export const TASKS_TABLE_BORDER_PX = 2 // the .assembly card's 1px left + 1px right border (a width budget)
// Title's floor is 120 (it is `width: auto` in split mode — the column that gives when the
// table narrows, never the status pill); Status's floor is 132, wide enough for the longest
// closed-vocabulary word, "Sedang berjalan", so it never wraps; Due's floor is 208, wide enough
// for the stacked "Overdue · <date>" state to stay on one line (#930).
// Total: 120 + 132 + 112 + 104 + 208 = 676.
export const TASKS_SPLIT_FLOOR_TOTAL = 676 // the five decision-column floors authored in TasksWorkspace.css

// Keep this arithmetic beside the media query: it is the viewport width at which the rail,
// wide-frame gutters, the smallest the record panel can render, the gap, table floors, and the
// .assembly card's border all fit.
export const TASKS_SPLIT_MIN_WIDTH =
  TASKS_RAIL_WIDTH + (TASKS_FRAME_GUTTER_PX * 2) + TASKS_RECORD_PANEL_FLOOR_PX +
  TASKS_SPLIT_GAP_PX + TASKS_SPLIT_FLOOR_TOTAL + TASKS_TABLE_BORDER_PX
const QUERY = `(min-width: ${TASKS_SPLIT_MIN_WIDTH}px)`

/**
 * The table + drawer render as a live push/squash split only when the decision columns fit.
 * Below the derived threshold the record opens as a standalone page instead of a drawer.
 *
 * Synchronous first read (no wrong-branch flash); subscribes to live changes.
 * Distinct from useIsDesktop (768px card reflow) and useIsNarrow (920px rail).
 */
export function useIsSplitWidth(): boolean {
  const [isSplit, setIsSplit] = useState<boolean>(
    () => window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsSplit(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isSplit
}
