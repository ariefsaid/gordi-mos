import { useState, useEffect } from 'react'

const QUERY = '(pointer: coarse)'

/**
 * Synchronously reads matchMedia at first render (no wrong-branch flash) — same contract
 * as useIsDesktop. Census R2 DO-22(a) (admin-people P2-A): input-modality reflow must key
 * off the POINTER, not width alone — a touch tablet at 768–1024 is "desktop" by width but
 * cannot hover, so hover-revealed row actions are unreachable there.
 */
export function useIsCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState<boolean>(
    () => window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsCoarse(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isCoarse
}
