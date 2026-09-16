import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { getTodayOpeningForTeam, startTodayOpening } from '@/lib/db/cafe-opening'
import { canStartProcessForTeam, listPendingTasks } from '@/lib/db/processes'
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
  /** The branch location this opening belongs to — canonical Team id stays internal. */
  teamName: string
  /** DD-MVP-17: 'door' is the compact status row the Café capture root renders above the
   *  capture form. Same information, same capability-gated actions, laid out as one row —
   *  the standalone page's centered empty-state frame costs a phone's whole first screen
   *  before the worker reaches the job the surface exists for. */
  presentation?: 'page' | 'door'
}

export function CafeOpeningPanel({ processId, teamId, teamName, presentation = 'page' }: CafeOpeningPanelProps) {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const viewerOrgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : null
  const [canStart, setCanStart] = useState(false)

  const [state, setState] = useState<FetchState>('loading')
  const [started, setStarted] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [rollup, setRollup] = useState<{
    caption: string; done: number; total: number; overdue: number; pending_unresolved: number
  } | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(false)

  const [pending, setPending] = useState<PendingTaskRow[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const loadGeneration = useRef(0)

  const load = useCallback(() => {
    const generation = ++loadGeneration.current
    setState('loading')
    getTodayOpeningForTeam(processId, teamId)
      .then((opening) => {
        if (generation !== loadGeneration.current) return
        setStarted(opening.started)
        setRunId(opening.runId)
        setRollup(opening.rollup)
        setState('ready')
      })
      .catch(() => {
        if (generation === loadGeneration.current) setState('error')
      })
  }, [processId, teamId])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { loadGeneration.current += 1 }, [])

  useEffect(() => {
    let live = true
    setCanStart(false)
    if (!viewerId || !viewerOrgId) return () => { live = false }
    canStartProcessForTeam(teamId)
      .then((allowed) => { if (live) setCanStart(allowed) })
    .catch(() => { if (live) setCanStart(false) })
    return () => { live = false }
  }, [teamId, viewerId, viewerOrgId])

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
    setStartError(false)
    try {
      await startTodayOpening(processId, teamId)
      load()
    } catch {
      setStartError(true)
    } finally {
      setStarting(false)
    }
  }

  function handlePendingResolved(pendingId: string) {
    setPending((prev) => prev.filter((p) => p.id !== pendingId))
    load() // refresh the roll-up + surface the newly-materialized Task
  }

  const door = presentation === 'door'

  if (state === 'loading') return <LoadingShell count={door ? 1 : 2} />
  if (state === 'error') return <ErrorState message={t('tasks.error.load')} onRetry={load} />

  if (!started) {
    if (door) {
      return (
        <div className="cafe-opening-panel cafe-opening-panel--door">
          {startError ? <ErrorState message={t('processes.due.startError')} onRetry={() => { void handleStart() }} /> : null}
          <div className="cafe-opening-door-row">
            <p className="cafe-opening-team">{t('cafe.opening.teamCaption', { team: teamName })}</p>
            <p className="cafe-opening-status">
              {t(canStart ? 'cafe.opening.notStartedLead' : 'cafe.opening.notStartedMember')}
            </p>
            {canStart && (
              <Button variant="primary" disabled={starting} onClick={() => { void handleStart() }}>
                {t('cafe.opening.start')}
              </Button>
            )}
          </div>
        </div>
      )
    }
    return (
      <div className="cafe-opening-panel">
        {/* Name the bound branch location in every state. The canonical Team id is the server
            context, while the branch label is the operator's useful orientation. */}
        <header className="cafe-opening-head">
          <p className="cafe-opening-team">{t('cafe.opening.teamCaption', { team: teamName })}</p>
        </header>
        {canStart ? (
          <>
            {startError ? <ErrorState message={t('processes.due.startError')} onRetry={() => { void handleStart() }} /> : null}
            <EmptyState
              variant="next-step"
              headingLevel={2}
              title={t('cafe.opening.notStartedLead')}
            >
              <Button variant="primary" disabled={starting} onClick={() => { void handleStart() }}>
                {t('cafe.opening.start')}
              </Button>
            </EmptyState>
          </>
        ) : (
          <EmptyState
            variant="awaiting"
            headingLevel={2}
            title={t('cafe.opening.notStartedMember')}
          />
        )}
      </div>
    )
  }

  // started === true implies rollup is non-null (getTodayOpeningForTeam's contract).
  if (!rollup || !runId) return null

  const rollupSummary = t(
    rollup.pending_unresolved === 0 || canStart
      ? 'processes.rollup.summary'
      : 'processes.rollup.summaryUnassigned',
    { done: rollup.done, total: rollup.total, overdue: rollup.overdue, pending: rollup.pending_unresolved },
  )

  if (door) {
    return (
      <div className="cafe-opening-panel cafe-opening-panel--door cafe-opening-panel--started">
        <div className="cafe-opening-door-row">
          <p className="cafe-opening-team">{t('cafe.opening.teamCaption', { team: teamName })}</p>
          <p className="cafe-opening-status">{rollup.caption}</p>
          <p className="cafe-opening-rollup tabular-nums">{rollupSummary}</p>
          <Link to={`/work/tasks?occurrence=${runId}`} className="btn btn-outline">
            {t('cafe.opening.viewTasks')}
          </Link>
        </div>
        {canStart && rollup.pending_unresolved > 0 && (
          <div className="cafe-opening-pending">
            {pendingLoading && <LoadingShell count={1} />}
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

  return (
    <div className="cafe-opening-panel cafe-opening-panel--started">
      {/* Same subject label as the not-started body — the bound branch location now heads the
          panel in every state, not only before Start. layout pass (v4):
          eyebrow + caption + rollup are one semantic header block (kicker/title/subtitle),
          grouped into its own tight rhythm (cafe-opening-head, 4px) rather than sharing the
          panel's looser 16px rhythm with the unrelated action link and pending-resolution
          section below — a single blanket gap between every child had made a title and an
          unrelated button read as equally related (layout.md "Rhythm"). */}
      <header className="cafe-opening-head">
        <p className="cafe-opening-team">{t('cafe.opening.teamCaption', { team: teamName })}</p>
        <h2 className="cafe-opening-caption">{rollup.caption}</h2>
        <p className="cafe-opening-rollup tabular-nums">
          {/* Design fix wave item 6 — the café member dead-end minor: a non-capable member has no
              resolve editor below (canStart-gated), so "N to assign" read like an instruction with
              nothing to click. Neutral "N unassigned" wording for that viewer only — a capable
              viewer keeps "to assign" (the editor is right below, no stutter risk here). */}
          {t(
            rollup.pending_unresolved === 0 || canStart
              ? 'processes.rollup.summary'
              : 'processes.rollup.summaryUnassigned',
            { done: rollup.done, total: rollup.total, overdue: rollup.overdue, pending: rollup.pending_unresolved },
          )}
        </p>
      </header>
      <Link to={`/work/tasks?occurrence=${runId}`} className="btn btn-outline">
        {t('cafe.opening.viewTasks')}
      </Link>

      {canStart && rollup.pending_unresolved > 0 && (
        <div className="cafe-opening-pending">
          {pendingLoading && <LoadingShell count={1} />}
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
