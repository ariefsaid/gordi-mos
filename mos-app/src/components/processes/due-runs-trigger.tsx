import { Chevron } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import type { DueProcessRun } from '@/lib/db/processes.types'
import './due-runs.css'

// DueRunsTrigger (design fix wave item 1b). The COLLAPSED-by-default compact summary affordance
// ("N due to start" + chevron) that used to be a full-width flood of Start-run rows burying the
// Tasks table (design-review step-6 CRITICAL). Rendered inline in the Tasks toolbar, beside the
// "N overdue" attention count (F5 design fix, 2026-07-22) — not a separate row/band of its own —
// so the two toolbar attention-count affordances share one placement and grammar; renders nothing
// when there's no due work to surface. The actual row list (DueRunsList) is a SEPARATE component
// rendered after the table so the table stays the first substantive content regardless of
// collapse state.

export interface DueRunsTriggerProps {
  due: DueProcessRun[]
  expanded: boolean
  onToggle: () => void
}

export function DueRunsTrigger({ due, expanded, onToggle }: DueRunsTriggerProps) {
  const t = useT()
  if (due.length === 0) return null
  return (
    <button
      type="button"
      className="due-runs-trigger"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span>{t('processes.due.summary', { count: due.length })}</span>
      <Chevron className={`due-runs-chev${expanded ? '' : ' due-runs-chev-collapsed'}`} />
    </button>
  )
}
