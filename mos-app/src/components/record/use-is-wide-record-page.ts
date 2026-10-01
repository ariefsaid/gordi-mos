import { useEffect, useState } from 'react'

const QUERY = '(min-width: 1280px)'

/** True where a record page splits into the main column and the About/History aside. */
export function useIsWideRecordPage(): boolean {
  const [wide, setWide] = useState<boolean>(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return wide
}
