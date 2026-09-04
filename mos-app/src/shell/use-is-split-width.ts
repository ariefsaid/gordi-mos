import { useState, useEffect } from 'react'

// 232px rail + 48px desktop frame gutters + 400px drawer + 12px gap + (160 + 108 + 128 + 120 + 104 + 40)px table/menu floors.
export const TASKS_SPLIT_MIN_WIDTH = 1352
const QUERY = `(min-width: ${TASKS_SPLIT_MIN_WIDTH}px) and (min-width: 1100px)`

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
