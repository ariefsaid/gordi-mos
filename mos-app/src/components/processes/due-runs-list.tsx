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
              {/* Visible/accessible NAME stays the short verb+object "Start run" (Rule 7); the
                  process+Team context is attached via aria-describedby so screen-reader users
                  still get it (WCAG AA) without duplicating "Start run" repeats into distinct
                  button names across a multi-row due list. */}
              <Button
                variant="primary"
                disabled={startingKey === key}
                aria-describedby={labelsId}
                onClick={() => { void onStart(row) }}
              >
                {t('processes.action.startRun')}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
