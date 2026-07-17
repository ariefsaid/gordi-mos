import { useCallback, useEffect, useId, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { listDueRuns, startRun } from '@/lib/db/processes'
import type { DueProcessRun, SpawnResult } from '@/lib/db/processes.types'
import './start-run-control.css'

// StartRunControl (Step 6 / ADR-0051, B6, AC-623). Surfaces mos.due_process_runs() for
// process.start-capable viewers only (spec §5) — a hidden control here is convenience, not the
// security boundary (RLS is the authority, mirrors RequireCapability). "Start run" — never a bare
// "Create" (Rule 7); "Process Run" never appears (FR-611).

type FetchState = 'loading' | 'ready' | 'error'

export interface StartRunControlProps {
  /** Fires after a successful Start so a host (e.g. the Tasks page) can refresh its own data. */
  onStarted?: (result: SpawnResult & { workLineId: string; teamId: string }) => void
}

function dueKey(row: DueProcessRun): string {
  return `${row.work_line_id}:${row.owning_team_id}:${row.period_key}`
}

export function StartRunControl({ onStarted }: StartRunControlProps = {}) {
  const t = useT()
  const idPrefix = useId()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const capable = can(accessRoles, 'process.start')

  const [due, setDue] = useState<DueProcessRun[]>([])
  const [state, setState] = useState<FetchState>('loading')
  const [startingKey, setStartingKey] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!capable) return
    setState('loading')
    listDueRuns()
      .then((rows) => { setDue(rows); setState('ready') })
      .catch(() => setState('error'))
  }, [capable])

  useEffect(() => { load() }, [load])

  // FR-612/Rule 4: no route hiding elsewhere gates this — the control simply doesn't render for a
  // viewer who lacks process.start (RLS remains the real boundary on the spawn RPC itself).
  if (!capable) return null

  async function handleStart(row: DueProcessRun) {
    const key = dueKey(row)
    setStartingKey(key)
    try {
      const result = await startRun(row.work_line_id, row.owning_team_id, row.scheduled_date)
      onStarted?.({ ...result, workLineId: row.work_line_id, teamId: row.owning_team_id })
      load()
    } finally {
      setStartingKey(null)
    }
  }

  return (
    <div className="start-run-control">
      {state === 'loading' && <SkeletonRows count={2} />}
      {state === 'error' && <ErrorState message={t('home.attention.laneError')} onRetry={load} />}
      {state === 'ready' && due.length === 0 && (
        <EmptyState variant="quiet" title={t('processes.due.empty')} />
      )}
      {state === 'ready' && due.length > 0 && (
        <ul className="start-run-control-list">
          {due.map((row) => {
            const key = dueKey(row)
            const labelsId = `${idPrefix}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
            return (
              <li key={key} className="start-run-row">
                <div className="start-run-row-labels" id={labelsId}>
                  <span className="start-run-row-process">{row.process_name}</span>
                  <span className="start-run-row-team">{row.team_name}</span>
                </div>
                {/* Visible/accessible NAME stays the short verb+object "Start run" (Rule 7); the
                    process+Team context is attached via aria-describedby so screen-reader users
                    still get it (WCAG AA) without duplicating "Start run" repeats into distinct
                    button names across a multi-row due list. */}
                <Button
                  variant="primary"
                  disabled={startingKey === key}
                  aria-describedby={labelsId}
                  onClick={() => { void handleStart(row) }}
                >
                  {t('processes.action.startRun')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
