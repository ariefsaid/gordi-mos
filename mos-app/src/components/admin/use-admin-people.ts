// The People data both admin pages read: every person (the last-admin guard needs all of them), the
// Positions, Teams and revenue branches the pickers offer. `refresh` re-reads people only and keeps the
// last good rows on failure, so a write never blanks the screen behind it.
import { useCallback, useEffect, useState } from 'react'
import { listAdminPeople, listRevenueScopeOptions, listRoles, listTeams } from '@/lib/db/admin-users'
import type { AdminPersonRow, RevenueScopeOption, RoleOption, TeamOption } from '@/lib/db/admin-users.types'

export type PeopleLoadState = 'loading' | 'loaded' | 'error'

export function useAdminPeople() {
  const [state, setState] = useState<PeopleLoadState>('loading')
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [people, setPeople] = useState<AdminPersonRow[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [scopeOptions, setScopeOptions] = useState<RevenueScopeOption[]>([])

  const load = useCallback(async () => {
    setState('loading')
    setRefreshError(null)
    try {
      setPeople(await listAdminPeople())
      setRoles(await listRoles())
      setScopeOptions(await listRevenueScopeOptions())
      setTeams(await listTeams())
      setState('loaded')
    } catch {
      setState('error')
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const next = await listAdminPeople()
      setPeople(next)
      setRefreshError(null)
    } catch (err) {
      // Keep the last good rows; expose the refresh error and re-throw so callers
      // do not claim the displayed data has refreshed until the reread succeeds.
      const message = err instanceof Error && err.message ? err.message : 'refresh-failed'
      setRefreshError(message)
      throw err
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { state, people, roles, teams, scopeOptions, load, refresh, refreshError }
}
