import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { getRailCounts, type RailCounts } from '@/lib/db/rail-counts'

// The ONE rail-count fetch seam. Loads the cheap aggregate ONCE per mount (no polling) when the
// viewer is authenticated, and hands it to the rail for the E7 count badges. Returns null until the
// count resolves, and stays null on failure — the rail simply omits the badges (E7 quiet: a count
// that is zero or unavailable is not shown). Aborts the in-flight state update if the shell unmounts.
export function useRailCounts(): RailCounts | null {
  const auth = useAuth()
  const authed = auth.status === 'authenticated'
  const [counts, setCounts] = useState<RailCounts | null>(null)

  useEffect(() => {
    if (!authed) { setCounts(null); return }
    let live = true
    getRailCounts()
      .then((next) => { if (live) setCounts(next) })
      .catch(() => { if (live) setCounts(null) })
    return () => { live = false }
  }, [authed])

  return counts
}
