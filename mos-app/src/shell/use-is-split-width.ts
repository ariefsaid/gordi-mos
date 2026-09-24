import { useState, useEffect } from 'react'

export const TASKS_RAIL_WIDTH = 232
export const TASKS_FRAME_GUTTER_PX = 32
// Tasks' record column is --record-panel-w (index.css); the threshold below assumes the
// SMALLEST the panel can ever render, since that's the narrowest gap the table's floors must
// still fit beside.
export const TASKS_RECORD_PANEL_FLOOR_PX = 440
export const TASKS_SPLIT_GAP_PX = 12
export const TASKS_TABLE_BORDER_PX = 2 // the .assembly card's 1px left + 1px right border (a width budget)
export const TASKS_SPLIT_FLOOR_TOTAL = 690 // the five decision-column floors authored in TasksWorkspace.css

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
