import { useState, useEffect } from 'react'

const QUERY = '(min-width: 768px)'

/**
 * Synchronously reads matchMedia at first render (no wrong-branch flash).
 * Matches DESIGN.md §Navigation "DataTable reflow (OD-W4-4)": table→card-list at 768px.
 * Distinct from useIsNarrow (920px rail collapse) — two separate breakpoints, do not conflate.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isDesktop
}
