import { useState, useEffect } from 'react'

const QUERY = '(max-width: 919.98px)'

/**
 * Synchronously reads matchMedia on first render (no wrong-branch flash).
 * Subscribes to the MediaQueryList change event for live updates.
 * Matches DESIGN.md §Navigation Mobile — rail collapses below 920px.
 */
export function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState<boolean>(
    () => window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isNarrow
}
