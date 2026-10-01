// The Process record's occurrence data: its occurrences, the runs the viewer may start now, and who
// may start or close which. One hook so the record header (the Start primary) and the Current and
// next action section read the same fetch instead of two copies.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import { canCloseProcessRun, canStartProcessForTeam, listProcessOccurrenceSummaries, listStartableProcessRuns, startRun } from '@/lib/db/processes'
import type { DueProcessRun, ProcessOccurrenceSummary } from '@/lib/db/processes.types'
import { dueKey, narrowToViewerTeams } from './use-due-runs'

export type ProcessOccurrencesFetchState = 'loading' | 'ready' | 'error'

export type ProcessOccurrencesData = {
  state: ProcessOccurrencesFetchState
  occurrences: readonly ProcessOccurrenceSummary[]
  /** Runs the viewer may start now, narrowed to their own Teams when they hold any. */
  startable: readonly DueProcessRun[]
  startableTeamIds: ReadonlySet<string>
  closableRunIds: ReadonlySet<string>
  authorityError: boolean
  actionError: boolean
  setActionError: (failed: boolean) => void
  startingKey: string | null
  startError: boolean
  /** Re-read everything; resolves once the occurrences and runs have settled. */
  load: () => Promise<void>
  retry: () => void
  start: (row: DueProcessRun) => Promise<void>
}

/** `workLineId` null keeps the hook inert (no reads), for a host that owns the data elsewhere. */
export function useProcessOccurrences(workLineId: string | null, onChanged?: () => void): ProcessOccurrencesData {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const [state, setState] = useState<ProcessOccurrencesFetchState>('loading')
  const [occurrences, setOccurrences] = useState<ProcessOccurrenceSummary[]>([])
  const [startable, setStartable] = useState<DueProcessRun[]>([])
  const [startableTeamIds, setStartableTeamIds] = useState<Set<string>>(new Set())
  const [closableRunIds, setClosableRunIds] = useState<Set<string>>(new Set())
  const [authorityError, setAuthorityError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [startingKey, setStartingKey] = useState<string | null>(null)
  const [startError, setStartError] = useState(false)
  const mountedRef = useRef(true)
  const loadGenerationRef = useRef(0)
  const loadIdentityRef = useRef({ workLineId })
  loadIdentityRef.current = { workLineId }

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (workLineId === null || !mountedRef.current || loadIdentityRef.current.workLineId !== workLineId) return
    const generation = ++loadGenerationRef.current
    const isCurrent = () => mountedRef.current
      && loadGenerationRef.current === generation
      && loadIdentityRef.current.workLineId === workLineId
    setState('loading')
    setStartError(false)
    setActionError(false)
    setAuthorityError(false)
    setStartableTeamIds(new Set())
    setClosableRunIds(new Set())
    try {
      const [nextOccurrences, nextStartable, viewerTeams] = await Promise.all([
        listProcessOccurrenceSummaries(workLineId),
        listStartableProcessRuns(workLineId),
        viewerId ? listCafeViewerTeams(viewerId).catch(() => []) : Promise.resolve([]),
      ])
      if (!isCurrent()) return
      setOccurrences(nextOccurrences)
      setStartable(narrowToViewerTeams(nextStartable, viewerTeams.map((team) => team.id)))
      setState('ready')

      // Authority calls are enrichment: readable occurrences and the server-filtered due list
      // paint independently, while stale/erroring checks fail closed for their affordances.
      const teamIds = [...new Set(nextOccurrences.map((summary) => summary.run.owning_team_id))]
      const [startAnswers, closeAnswers] = await Promise.all([
        Promise.allSettled(teamIds.map(async (teamId) => [teamId, await canStartProcessForTeam(teamId)] as const)),
        Promise.allSettled(nextOccurrences.map(async (summary) => [summary.run.id, await canCloseProcessRun(summary.run.id)] as const)),
      ])
      if (!isCurrent()) return
      setStartableTeamIds(new Set(startAnswers
        .filter((answer): answer is PromiseFulfilledResult<readonly [string, boolean]> => answer.status === 'fulfilled' && answer.value[1])
        .map((answer) => answer.value[0])))
      setClosableRunIds(new Set(closeAnswers
        .filter((answer): answer is PromiseFulfilledResult<readonly [string, boolean]> => answer.status === 'fulfilled' && answer.value[1])
        .map((answer) => answer.value[0])))
      setAuthorityError(
        startAnswers.some((answer) => answer.status === 'rejected')
        || closeAnswers.some((answer) => answer.status === 'rejected'),
      )
    } catch {
      if (!isCurrent()) return
      setState('error')
    }
  }, [workLineId, viewerId])

  useEffect(() => { void load() }, [load, retryNonce])

  const start = useCallback(async (row: DueProcessRun) => {
    setStartingKey(dueKey(row))
    setStartError(false)
    try {
      await startRun(row.work_line_id, row.owning_team_id, row.scheduled_date)
      await load()
      if (mountedRef.current) onChanged?.()
    } catch {
      if (mountedRef.current) setStartError(true)
    } finally {
      if (mountedRef.current) setStartingKey(null)
    }
  }, [load, onChanged])

  const retry = useCallback(() => setRetryNonce((nonce) => nonce + 1), [])

  return {
    state, occurrences, startable, startableTeamIds, closableRunIds, authorityError, actionError, setActionError,
    startingKey, startError, load, retry, start,
  }
}
