import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { getRailCounts, type RailCounts } from '@/lib/db/rail-counts'
import { getPersonTeams } from '@/lib/db/directory'
import { getTaskDefaultView } from '@/lib/task-default-view'
import { isOwnerDirector } from '@/lib/role-scope'

// The ONE rail-count fetch seam. Loads the cheap aggregate ONCE per mount (no polling) when the
// viewer is authenticated, and hands it to the rail for the E7 count badges. Returns null until the
// count resolves, and stays null on failure — the rail simply omits the badges (E7 quiet: a count
// that is zero or unavailable is not shown). Aborts the in-flight state update if the shell unmounts.
export function useRailCounts(): RailCounts | null {
  const auth = useAuth()
  const authed = auth.status === 'authenticated'
  const personId = authed ? auth.viewer?.person?.id : undefined
  const defaultView = getTaskDefaultView({
    accessRoles: authed ? auth.viewer?.accessRoles ?? [] : [],
    hasReport: authed ? auth.viewer?.isManager ?? false : false,
    isOwnerDirector: authed ? isOwnerDirector(auth.viewer?.roles ?? []) : false,
  })
  const scopeKey = `${authed}:${personId ?? ''}:${defaultView}`
  const [result, setResult] = useState<{ scopeKey: string; counts: RailCounts | null } | null>(null)

  useEffect(() => {
    if (!authed) return
    let live = true
    async function read() {
      const teams = defaultView === 'team-work' && personId ? await getPersonTeams(personId) : []
      return getRailCounts(personId, defaultView, teams.map((team) => team.id))
    }
    read()
      .then((counts) => { if (live) setResult({ scopeKey, counts }) })
      .catch(() => { if (live) setResult({ scopeKey, counts: null }) })
    return () => { live = false }
  }, [authed, personId, defaultView, scopeKey])

  return result?.scopeKey === scopeKey ? result.counts : null
}
