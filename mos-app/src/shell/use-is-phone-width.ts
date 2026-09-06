import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767.98px)'

/** The phone overlay regime; this is distinct from the 390px phone-fold helper. */
export function useIsPhoneWidth(): boolean {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (event: MediaQueryListEvent) => setIsPhone(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isPhone
}
