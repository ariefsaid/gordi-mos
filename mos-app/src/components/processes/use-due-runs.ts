// useDueRuns (Step-6 design fix wave, item 1). Owns the due-occurrence surface's data + collapse
// state so the compact trigger (rendered near the toolbar) and the expandable row list (rendered
// AFTER the Tasks table, never flooding it — design-review step-6 CRITICAL) share ONE
// fetch/scope/expand state instead of two divergent copies.
//
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { listDueRuns, startRun } from '@/lib/db/processes'
import type { DueProcessRun, SpawnResult } from '@/lib/db/processes.types'

export type DueRunsFetchState = 'loading' | 'ready' | 'error'

export function dueKey(row: DueProcessRun): string {
  return `${row.work_line_id}:${row.owning_team_id}:${row.period_key}`
}

export interface UseDueRunsResult {
  /** Whether an authenticated viewer may receive due rows; the server filters those rows by Team. */
  capable: boolean
  /** Due rows already filtered by mos.due_process_runs for effective Team authority. */
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
  const capable = auth.status === 'authenticated'
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const viewerOrgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : null
  const viewerKey = `${viewerId ?? ''}:${viewerOrgId ?? ''}`

  const [rawDue, setRawDue] = useState<DueProcessRun[]>([])
  const [state, setState] = useState<DueRunsFetchState>('loading')
  const [expanded, setExpanded] = useState(false)
  const [startingKey, setStartingKey] = useState<string | null>(null)
  const [startError, setStartError] = useState(false)
  const loadGenerationRef = useRef(0)
  const loadIdentityRef = useRef('')

  const load = useCallback(() => {
    const generation = ++loadGenerationRef.current
    const requestViewerKey = viewerKey
    const identityChanged = loadIdentityRef.current !== requestViewerKey
    loadIdentityRef.current = requestViewerKey
    const isCurrent = () => loadGenerationRef.current === generation && loadIdentityRef.current === requestViewerKey
    if (identityChanged) {
      setRawDue([])
      setExpanded(false)
      setStartingKey(null)
      setStartError(false)
    }
    if (!capable) {
      setState('ready')
      return
    }
    setState('loading')
    listDueRuns()
      .then((rows) => {
        if (!isCurrent()) return
        setRawDue(rows)
        setState('ready')
      })
      .catch(() => { if (isCurrent()) setState('error') })
  }, [capable, viewerKey])

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

  // FR-612/Rule 4: the due view is server-filtered by effective Team authority; the static role map
  // is not a client gate and cannot hide a runtime grant.
  if (!capable) return NOOP

  return { capable, due: rawDue, state, expanded, toggleExpanded, startingKey, startError, handleStart, load }
}
