import { useState, useEffect } from 'react'

const QUERY = '(min-width: 1100px)'

/**
 * The split-view fallback threshold (design-plan §4, ADR-0007 §4): at ≥1100px
 * the table + drawer render as a live push/squash split (drawer is non-modal).
 * Below 1100px the squashed table is too cramped to triage, so the drawer becomes
 * a modal overlay/full-screen surface (focus-trap + scrim + Esc).
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
