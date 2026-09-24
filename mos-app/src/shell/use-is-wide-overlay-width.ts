import { useState, useEffect } from 'react'

// Below it every Work collection opens its record as a modal or page, never beside the list.
export const WIDE_OVERLAY_MIN_WIDTH = 1100
const QUERY = `(min-width: ${WIDE_OVERLAY_MIN_WIDTH}px)`

/** Generic shell overlay breakpoint; Tasks uses useIsSplitWidth for its table-fit threshold. */
export function useIsWideOverlayWidth(): boolean {
  const [isWide, setIsWide] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (event: MediaQueryListEvent) => setIsWide(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isWide
}
