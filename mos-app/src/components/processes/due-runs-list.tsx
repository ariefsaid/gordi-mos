import { useId } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { formatDayMonthYear } from '@/lib/format/date'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { dueKey } from './use-due-runs'
import type { DueProcessRun } from '@/lib/db/processes.types'
import './due-runs.css'

// Renders due-occurrence rows and Start actions. Process records pass their context so each Team,
// rather than the already-visible Process title, identifies its ready run. The record header may
// own the Start action, leaving these rows as non-interactive context.

export interface DueRunsListProps {
  due: readonly DueProcessRun[]
  expanded: boolean
  startingKey: string | null
  startError: boolean
  onStart: (row: DueProcessRun) => Promise<void>
  context?: 'process-record'
}

export function DueRunsList({ due, expanded, startingKey, startError, onStart, context }: DueRunsListProps) {
  const t = useT()
  const { locale } = useI18n()
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
                  <>
                    <span className="due-runs-row-team">{row.team_name}</span>
                    <time className="due-runs-row-date" dateTime={row.scheduled_date}>
                      {formatDayMonthYear(row.scheduled_date, locale)}
                    </time>
                  </>
                ) : (
                  <>
                    <span className="due-runs-row-process">{row.process_name}</span>
                    <span className="due-runs-row-team">{row.team_name}</span>
                  </>
                )}
              </div>
              {!processRecordContext ? (
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
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
