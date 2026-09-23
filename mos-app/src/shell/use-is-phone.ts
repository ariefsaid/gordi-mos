import { useState, useEffect } from 'react'

const QUERY = '(max-width: 390px)'

/**
 * Synchronously reads matchMedia at first render (no wrong-branch flash).
 * The phone-fold breakpoint (RI-2, design fix wave) — distinct from `useIsDesktop`'s
 * 768px table→card reflow and `useIsNarrow`'s 920px rail collapse. Used to fold a
 * page-level configuration control (e.g. Home's order toggle) behind a single compact
 * disclosure at the smallest phone widths, per Rule 8 (capture-first, config never leads).
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState<boolean>(
    () => window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsPhone(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isPhone
}
