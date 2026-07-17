import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { getTodayOpeningForTeam, startTodayOpening } from '@/lib/db/cafe-opening'
import { listPendingTasks } from '@/lib/db/processes'
import { getPeople } from '@/lib/db/directory'
import type { PersonOption } from '@/lib/db/directory'
import { PendingResolution } from '@/components/processes/pending-resolution'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import './cafe-opening-panel.css'

// CafeOpeningPanel (Step 7 / cafe-retrofit.spec.md §4, B5/B6). The Café Module home's
// "Start today's opening" surface — capability-gated Start (FR-702/707), the occurrence caption +
// derived roll-up + a link into /work/tasks (FR-704/710), and pending-PIC resolution reusing the
// Step-6 PendingResolution (FR-705, Rule 11). "Process Run" is never rendered as vocabulary
// (FR-611) — the panel speaks only in "opening"/"run" (the caption) and "assign" verbs.

type FetchState = 'loading' | 'ready' | 'error'

export interface CafeOpeningPanelProps {
  processId: string
  teamId: string
  /** Unused by the panel body directly; kept for a future per-branch heading (host may render it). */
  teamName: string
}

export function CafeOpeningPanel({ processId, teamId }: CafeOpeningPanelProps) {
  const t = useT()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canStart = can(accessRoles, 'process.start')

  const [state, setState] = useState<FetchState>('loading')
  const [started, setStarted] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [rollup, setRollup] = useState<{
    caption: string; done: number; total: number; overdue: number; pending_unresolved: number
  } | null>(null)
  const [starting, setStarting] = useState(false)

  const [pending, setPending] = useState<PendingTaskRow[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)

  const load = useCallback(() => {
    setState('loading')
    getTodayOpeningForTeam(processId, teamId)
      .then((opening) => {
        setStarted(opening.started)
        setRunId(opening.runId)
        setRollup(opening.rollup)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [processId, teamId])

  useEffect(() => { load() }, [load])

  const loadPending = useCallback((run: string) => {
    setPendingLoading(true)
    Promise.all([listPendingTasks(run), getPeople()])
      .then(([pendingRows, peopleRows]) => {
        setPending(pendingRows)
        setPeople(peopleRows)
        setPendingLoading(false)
      })
      .catch(() => setPendingLoading(false))
  }, [])

  // Only a process.start-capable viewer fetches/sees the resolve queue (AC-715) — a non-capable
  // viewer already sees the pending count via the roll-up summary, no separate fetch needed.
  useEffect(() => {
    if (started && runId && canStart && (rollup?.pending_unresolved ?? 0) > 0) {
      loadPending(runId)
    } else {
      setPending([])
    }
  }, [started, runId, canStart, rollup?.pending_unresolved, loadPending])

  async function handleStart() {
    setStarting(true)
    try {
      await startTodayOpening(processId, teamId)
      load()
    } finally {
      setStarting(false)
    }
  }

  function handlePendingResolved(pendingId: string) {
    setPending((prev) => prev.filter((p) => p.id !== pendingId))
    load() // refresh the roll-up + surface the newly-materialized Task
  }

  if (state === 'loading') return <SkeletonRows count={2} />
  if (state === 'error') return <ErrorState message={t('tasks.error.load')} onRetry={load} />

  if (!started) {
    return (
      <div className="cafe-opening-panel">
        {canStart ? (
          <EmptyState variant="next-step" title={t('cafe.opening.notStartedLead')}>
            <Button variant="primary" disabled={starting} onClick={() => { void handleStart() }}>
              {t('cafe.opening.start')}
            </Button>
          </EmptyState>
        ) : (
          <EmptyState variant="quiet" title={t('cafe.opening.notStartedMember')} />
        )}
      </div>
    )
  }

  // started === true implies rollup is non-null (getTodayOpeningForTeam's contract).
  if (!rollup || !runId) return null

  return (
    <div className="cafe-opening-panel cafe-opening-panel--started">
      <h2 className="cafe-opening-caption">{rollup.caption}</h2>
      <p className="cafe-opening-rollup tabular-nums">
        {t('processes.rollup.summary', {
          done: rollup.done, total: rollup.total, overdue: rollup.overdue, pending: rollup.pending_unresolved,
        })}
      </p>
      <Link to={`/work/tasks?occurrence=${runId}`} className="btn btn-outline">
        {t('cafe.opening.viewTasks')}
      </Link>

      {canStart && rollup.pending_unresolved > 0 && (
        <div className="cafe-opening-pending">
          {pendingLoading && <SkeletonRows count={1} />}
          {!pendingLoading && pending.map((p) => (
            <PendingResolution
              key={p.id}
              pending={p}
              people={people}
              onResolved={() => handlePendingResolved(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
