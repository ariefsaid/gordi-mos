import { useState, useEffect } from 'react'

const QUERY = '(min-width: 1100px)'

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
