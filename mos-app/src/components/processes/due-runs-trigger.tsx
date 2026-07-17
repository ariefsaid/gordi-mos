import { Chevron } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import type { DueProcessRun } from '@/lib/db/processes.types'
import './due-runs.css'

// DueRunsTrigger (design fix wave item 1b). The COLLAPSED-by-default compact summary affordance
// ("N due to start" + chevron) that used to be a full-width flood of Start-run rows burying the
// Tasks table (design-review step-6 CRITICAL). Rendered near the toolbar, before the table, on
// every group mode and both breakpoints; renders nothing when there's no due work to surface.
// The actual row list (DueRunsList) is a SEPARATE component rendered after the table so the table
// stays the first substantive content regardless of collapse state.

export interface DueRunsTriggerProps {
  due: DueProcessRun[]
  expanded: boolean
  onToggle: () => void
}

export function DueRunsTrigger({ due, expanded, onToggle }: DueRunsTriggerProps) {
  const t = useT()
  if (due.length === 0) return null
  return (
    <div className="due-runs-trigger-row">
      <button
        type="button"
        className="due-runs-trigger"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span>{t('processes.due.summary', { count: due.length })}</span>
        <Chevron className={`due-runs-chev${expanded ? '' : ' due-runs-chev-collapsed'}`} />
      </button>
    </div>
  )
}
