import { useId } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { dueKey } from './use-due-runs'
import type { DueProcessRun } from '@/lib/db/processes.types'
import './due-runs.css'

// Renders due-occurrence rows and Start actions. Process records pass their context so each Team,
// rather than the already-visible Process title, identifies its ready run.

export interface DueRunsListProps {
  due: DueProcessRun[]
  expanded: boolean
  startingKey: string | null
  startError: boolean
  onStart: (row: DueProcessRun) => Promise<void>
  context?: 'process-record'
}

export function DueRunsList({ due, expanded, startingKey, startError, onStart, context }: DueRunsListProps) {
  const t = useT()
  const idPrefix = useId()
  const processRecordContext = context === 'process-record'
  if (!expanded || due.length === 0) return null

  return (
    <div className="due-runs-panel">
      {startError && <ErrorState message={t('processes.due.startError')} />}
      <ul className="due-runs-list">
        {due.map((row) => {
          const key = dueKey(row)
          const labelsId = `${idPrefix}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
          return (
            <li key={key} className={`due-runs-row${processRecordContext ? ' due-runs-row--process-record' : ''}`}>
              <div className="due-runs-row-labels" id={!processRecordContext ? labelsId : undefined}>
                {processRecordContext ? (
                  <span className="due-runs-row-team">{row.team_name}</span>
                ) : (
                  <>
                    <span className="due-runs-row-process">{row.process_name}</span>
                    <span className="due-runs-row-team">{row.team_name}</span>
                  </>
                )}
              </div>
              {/* Generic lists name the Process action and describe its Team. Inside a Process
                  record, the Team is the distinct start target and is named in the action itself. */}
              <Button
                variant="primary"
                className="due-runs-start-btn"
                disabled={startingKey === key}
                aria-describedby={!processRecordContext ? labelsId : undefined}
                onClick={() => { void onStart(row) }}
              >
                <span className="due-runs-start-label">
                  {t('processes.action.startComposed', { name: processRecordContext ? row.team_name : row.process_name })}
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
