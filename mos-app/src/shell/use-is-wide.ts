import { useEffect, useState } from 'react'

const QUERY = '(min-width: 1280px)'

/** Matches the Two-Measure Rule's wide operating layout breakpoint. */
export function useIsWide(): boolean {
  const [isWide, setIsWide] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const handler = (event: MediaQueryListEvent) => setIsWide(event.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return isWide
}
