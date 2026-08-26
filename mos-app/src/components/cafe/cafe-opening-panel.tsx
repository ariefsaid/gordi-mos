import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
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
  /** The Team this opening belongs to — the panel's subject eyebrow names it (issue 457). */
  teamName: string
}

export function CafeOpeningPanel({ processId, teamId, teamName }: CafeOpeningPanelProps) {
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

  if (state === 'loading') return <LoadingShell count={2} />
  if (state === 'error') return <ErrorState message={t('tasks.error.load')} onRetry={load} />

  if (!started) {
    return (
      <div className="cafe-opening-panel">
        {/* Name the bound Team — the page auto-selects one (first due / first membership) and
            hiding WHICH one it chose was audit finding F10. Bound as the panel's subject eyebrow
            (census DO-24a) — same header block as the started body below, so it doesn't read as
            an orphan that disappears on start. */}
        <header className="cafe-opening-head">
          <p className="cafe-opening-team">{t('cafe.opening.teamCaption', { team: teamName })}</p>
        </header>
        {canStart ? (
          <EmptyState variant="next-step" title={t('cafe.opening.notStartedLead')}>
            <Button variant="primary" disabled={starting} onClick={() => { void handleStart() }}>
              {t('cafe.opening.start')}
            </Button>
          </EmptyState>
        ) : (
          // Step 7 minor (item 7a): "awaiting" — never "quiet"'s ✓ glyph, which misreads as
          // "already done" for a state that's actually waiting on the shift lead's action
          // (mirrors kitchen-review-page.tsx's "nothing yet, pull again" usage).
          <EmptyState variant="awaiting" title={t('cafe.opening.notStartedMember')} />
        )}
      </div>
    )
  }

  // started === true implies rollup is non-null (getTodayOpeningForTeam's contract).
  if (!rollup || !runId) return null

  return (
    <div className="cafe-opening-panel cafe-opening-panel--started">
      {/* Same subject eyebrow as the not-started body (census DO-24a) — the bound Team
          now heads the panel in every state, not only before Start. layout pass (v4):
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
