// The Process record's occurrence data: its occurrences, the runs the viewer may start now, and who
// may start or close which. One hook so the record header (the Start primary) and the Current and
// next action section read the same fetch instead of two copies.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import { listProcessOccurrenceAuthorities, listProcessOccurrenceSummaries, listStartableProcessRuns, startRun } from '@/lib/db/processes'
import type { DueProcessRun, ProcessOccurrenceSummary } from '@/lib/db/processes.types'
import type { ProcessOccurrenceCursor } from '@/lib/db/processes'
import { dueKey, narrowToViewerTeams } from './use-due-runs'

type ProcessOccurrencesFetchState = 'loading' | 'ready' | 'error'

export type ProcessOccurrencesData = {
  state: ProcessOccurrencesFetchState
  occurrences: readonly ProcessOccurrenceSummary[]
  hasMore: boolean
  loadingMore: boolean
  moreError: boolean
  loadMore: () => Promise<void>
  // Runs the viewer may start now, narrowed to their own Teams when they hold any.
  startable: readonly DueProcessRun[]
  startableTeamIds: ReadonlySet<string>
  closableRunIds: ReadonlySet<string>
  authorityError: boolean
  actionError: boolean
  setActionError: (failed: boolean) => void
  startingKey: string | null
  startError: boolean
  // Re-read everything; resolves once the occurrences and runs have settled.
  load: () => Promise<void>
  retry: () => void
  start: (row: DueProcessRun) => Promise<void>
}

// `workLineId` null keeps the hook inert (no reads), for a host that owns the data elsewhere.
export function useProcessOccurrences(workLineId: string | null, onChanged?: () => void): ProcessOccurrencesData {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const [state, setState] = useState<ProcessOccurrencesFetchState>('loading')
  const [occurrences, setOccurrences] = useState<ProcessOccurrenceSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
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
  const cursorRef = useRef<ProcessOccurrenceCursor | null>(null)
  const moreInFlightRef = useRef(false)
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
    setHasMore(false)
    setLoadingMore(false)
    setMoreError(false)
    cursorRef.current = null
    moreInFlightRef.current = false
    setStartableTeamIds(new Set())
    setClosableRunIds(new Set())
    try {
      const [occurrencePage, nextStartable, viewerTeams] = await Promise.all([
        listProcessOccurrenceSummaries(workLineId),
        listStartableProcessRuns(workLineId),
        viewerId ? listCafeViewerTeams(viewerId).catch(() => []) : Promise.resolve([]),
      ])
      if (!isCurrent()) return
      cursorRef.current = occurrencePage.nextCursor
      setOccurrences(occurrencePage.rows)
      setHasMore(occurrencePage.hasMore)
      setStartable(narrowToViewerTeams(nextStartable, viewerTeams.map((team) => team.id)))
      setState('ready')

      // Authority is enrichment: readable occurrences paint independently, but a failed batch
      // leaves every affordance closed.
      const teamIds = [...new Set(occurrencePage.rows.map((summary) => summary.run.owning_team_id))]
      try {
        const authorities = await listProcessOccurrenceAuthorities(
          teamIds,
          occurrencePage.rows.map((summary) => summary.run.id),
        )
        if (!isCurrent()) return
        setStartableTeamIds(new Set(authorities
          .filter((authority) => authority.authority_kind === 'start' && authority.allowed)
          .map((authority) => authority.target_id)))
        setClosableRunIds(new Set(authorities
          .filter((authority) => authority.authority_kind === 'close' && authority.allowed)
          .map((authority) => authority.target_id)))
      } catch {
        if (isCurrent()) setAuthorityError(true)
      }
    } catch {
      if (!isCurrent()) return
      setState('error')
    }
  }, [workLineId, viewerId])

  useEffect(() => { void load() }, [load, retryNonce])

  const loadMore = useCallback(async () => {
    const before = cursorRef.current
    if (!workLineId || !before || moreInFlightRef.current || !mountedRef.current) return
    const generation = loadGenerationRef.current
    const isCurrent = () => mountedRef.current
      && loadGenerationRef.current === generation
      && loadIdentityRef.current.workLineId === workLineId
    moreInFlightRef.current = true
    setLoadingMore(true)
    setMoreError(false)
    try {
      const page = await listProcessOccurrenceSummaries(workLineId, before)
      if (!isCurrent()) return
      cursorRef.current = page.nextCursor
      setOccurrences((current) => [...current, ...page.rows])
      setHasMore(page.hasMore)
      const teamIds = [...new Set(page.rows.map((summary) => summary.run.owning_team_id))]
      try {
        const authorities = await listProcessOccurrenceAuthorities(
          teamIds,
          page.rows.map((summary) => summary.run.id),
        )
        if (!isCurrent()) return
        setStartableTeamIds((current) => new Set([
          ...current,
          ...authorities.filter((authority) => authority.authority_kind === 'start' && authority.allowed)
            .map((authority) => authority.target_id),
        ]))
        setClosableRunIds((current) => new Set([
          ...current,
          ...authorities.filter((authority) => authority.authority_kind === 'close' && authority.allowed)
            .map((authority) => authority.target_id),
        ]))
      } catch {
        if (isCurrent()) setAuthorityError(true)
      }
    } catch {
      if (isCurrent()) setMoreError(true)
    } finally {
      if (isCurrent()) {
        moreInFlightRef.current = false
        setLoadingMore(false)
      }
    }
  }, [workLineId])

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
    state, occurrences, hasMore, loadingMore, moreError, loadMore,
    startable, startableTeamIds, closableRunIds, authorityError, actionError, setActionError,
    startingKey, startError, load, retry, start,
  }
}
