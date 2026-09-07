import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { getRailCounts, type RailCounts } from '@/lib/db/rail-counts'
import { getPersonTeams } from '@/lib/db/directory'
import { getTaskDefaultView } from '@/lib/task-default-view'

// The ONE rail-count fetch seam. Loads the cheap aggregate ONCE per mount (no polling) when the
// viewer is authenticated, and hands it to the rail for the E7 count badges. Returns null until the
// count resolves, and stays null on failure — the rail simply omits the badges (E7 quiet: a count
// that is zero or unavailable is not shown). Aborts the in-flight state update if the shell unmounts.
export function useRailCounts(): RailCounts | null {
  const auth = useAuth()
  const authed = auth.status === 'authenticated'
  const viewer = authed && 'viewer' in auth ? auth.viewer : null
  const personId = viewer?.person?.id
  const viewerAccessRoles = viewer?.accessRoles
  const viewerRoles = viewerAccessRoles?.join(',')
  const viewerIsManager = viewer?.isManager
  const [counts, setCounts] = useState<RailCounts | null>(null)

  useEffect(() => {
    if (!authed) { setCounts(null); return }
    let live = true
    // OD-WAY-94(3) resolution: the badge is the default view's count, not a separate
    // viewer-owned aggregate. This selector is shared with TasksWorkspace's landing view.
    const defaultView = getTaskDefaultView({
      accessRoles: viewerAccessRoles ?? [],
      hasReport: viewerIsManager ?? false,
    })
    const teams = defaultView === 'team-work' && personId
      ? getPersonTeams(personId)
      : Promise.resolve([])
    teams.then((teamRows) => getRailCounts(
      personId,
      defaultView,
      teamRows.map((team) => team.id),
      [...new Set(teamRows.map((team) => team.business_unit_id))],
    ))
      .then((next) => { if (live) setCounts(next) })
      .catch(() => { if (live) setCounts(null) })
    return () => { live = false }
  }, [authed, personId, viewerAccessRoles, viewerRoles, viewerIsManager])

  return counts
}
