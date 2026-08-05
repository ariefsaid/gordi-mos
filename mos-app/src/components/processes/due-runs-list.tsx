import { useId } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { dueKey } from './use-due-runs'
import type { DueProcessRun } from '@/lib/db/processes.types'
import './due-runs.css'

// DueRunsList (design fix wave item 1b). Renders the actual due-occurrence rows + Start actions —
// ONLY when the DueRunsTrigger's disclosure is expanded. Mounted by the host AFTER the Tasks
// table (not between the toolbar and the table) so the table stays the first substantive content
// on the page regardless of collapse state (design-review step-6 CRITICAL).

export interface DueRunsListProps {
  due: DueProcessRun[]
  expanded: boolean
  startingKey: string | null
  startError: boolean
  onStart: (row: DueProcessRun) => Promise<void>
}

export function DueRunsList({ due, expanded, startingKey, startError, onStart }: DueRunsListProps) {
  const t = useT()
  const idPrefix = useId()
  if (!expanded || due.length === 0) return null

  return (
    <div className="due-runs-panel">
      {startError && <ErrorState message={t('processes.due.startError')} />}
      <ul className="due-runs-list">
        {due.map((row) => {
          const key = dueKey(row)
          const labelsId = `${idPrefix}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
          return (
            <li key={key} className="due-runs-row">
              <div className="due-runs-row-labels" id={labelsId}>
                <span className="due-runs-row-process">{row.process_name}</span>
                <span className="due-runs-row-team">{row.team_name}</span>
              </div>
              {/* Design fix wave item 5 (Rule 7/12, OD-58) FINAL DECISION — the visible/accessible
                  NAME composes "Start · <process name>" (verb+object, the REAL job — never a bare
                  "Start"/"Create"); a long name clamps via CSS (due-runs-start-label). The Team
                  context still rides aria-describedby (WCAG AA) since it's not in the visible
                  label. */}
              <Button
                variant="primary"
                className="due-runs-start-btn"
                disabled={startingKey === key}
                aria-describedby={labelsId}
                onClick={() => { void onStart(row) }}
              >
                <span className="due-runs-start-label">
                  {t('processes.action.startComposed', { name: row.process_name })}
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
