// useDueRuns (Step-6 design fix wave, item 1). Owns the due-occurrence surface's data + collapse
// state so the compact trigger (rendered near the toolbar) and the expandable row list (rendered
// AFTER the Tasks table, never flooding it — design-review step-6 CRITICAL) share ONE
// fetch/scope/expand state instead of two divergent copies.
//
// Scope (1a): due rows are filtered to Teams the viewer is an ACTIVE MEMBER of — reuses the
// existing listAuthorTeams membership loader (signals.ts, Rule 11), never a parallel membership
// query. A capable viewer with ZERO memberships (a pure admin/capability grant, no Team seat) keeps
// every due row — there is nothing to scope down to for that viewer.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { listDueRuns, startRun } from '@/lib/db/processes'
import { listAuthorTeams } from '@/lib/db/signals'
import type { DueProcessRun, SpawnResult } from '@/lib/db/processes.types'

export type DueRunsFetchState = 'loading' | 'ready' | 'error'

export function dueKey(row: DueProcessRun): string {
  return `${row.work_line_id}:${row.owning_team_id}:${row.period_key}`
}

export interface UseDueRunsResult {
  /** Whether the viewer holds process.start (RLS remains the real gate on the spawn RPC). */
  capable: boolean
  /** Due rows scoped to the viewer's active Team memberships (1a). */
  due: DueProcessRun[]
  state: DueRunsFetchState
  /** Collapsed by default (design-review step-6 CRITICAL) — the row list only renders on demand. */
  expanded: boolean
  toggleExpanded: () => void
  startingKey: string | null
  startError: boolean
  handleStart: (row: DueProcessRun) => Promise<void>
  load: () => void
}

const NOOP: UseDueRunsResult = {
  capable: false, due: [], state: 'ready', expanded: false, toggleExpanded: () => {},
  startingKey: null, startError: false, handleStart: async () => {}, load: () => {},
}

export function useDueRuns(
  onStarted?: (result: SpawnResult & { workLineId: string; teamId: string }) => void,
): UseDueRunsResult {
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const capable = can(accessRoles, 'process.start')

  const [rawDue, setRawDue] = useState<DueProcessRun[]>([])
  const [memberTeamIds, setMemberTeamIds] = useState<Set<string>>(new Set())
  const [state, setState] = useState<DueRunsFetchState>('loading')
  const [expanded, setExpanded] = useState(false)
  const [startingKey, setStartingKey] = useState<string | null>(null)
  const [startError, setStartError] = useState(false)

  const load = useCallback(() => {
    if (!capable) return
    setState('loading')
    Promise.all([listDueRuns(), viewerId ? listAuthorTeams(viewerId) : Promise.resolve([])])
      .then(([rows, teams]) => {
        setRawDue(rows)
        setMemberTeamIds(new Set(teams.map(team => team.id)))
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [capable, viewerId])

  useEffect(() => { load() }, [load])

  const toggleExpanded = useCallback(() => setExpanded(e => !e), [])

  const handleStart = useCallback(async (row: DueProcessRun) => {
    setStartingKey(dueKey(row))
    setStartError(false)
    try {
      const result = await startRun(row.work_line_id, row.owning_team_id, row.scheduled_date)
      onStarted?.({ ...result, workLineId: row.work_line_id, teamId: row.owning_team_id })
      load()
    } catch {
      setStartError(true)
    } finally {
      setStartingKey(null)
    }
  }, [onStarted, load])

  // FR-612/Rule 4: no route hiding elsewhere gates this — a non-capable viewer simply never
  // fetches/sees due work (RLS remains the real boundary on the spawn RPC itself).
  if (!capable) return NOOP

  // 1a — scope to active memberships; zero memberships (pure admin capability, no Team seat) keeps
  // every row rather than scoping to an empty set.
  const due = memberTeamIds.size > 0
    ? rawDue.filter(row => memberTeamIds.has(row.owning_team_id))
    : rawDue

  return { capable, due, state, expanded, toggleExpanded, startingKey, startError, handleStart, load }
}
