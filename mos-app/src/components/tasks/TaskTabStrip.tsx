import type { TabKey } from './useTabMemory'

export type TaskTabStripProps = {
  active: TabKey
  /** [done, total] — the count badge renders only when total > 0 */
  checklistCount: [number, number]
  activityCount: number
  onSelect: (tab: TabKey) => void
}

const ORDER: TabKey[] = ['details', 'checklist', 'activity']
const LABELS: Record<TabKey, string> = {
  details: 'Details',
  checklist: 'Checklist',
  activity: 'Activity',
}

/**
 * The drawer tab strip (Details · Checklist · Activity) — DESIGN.md §5 Tabs
 * sticky-tab indicator (primary 2px underline). ARIA tabs pattern with roving
 * tabindex + ArrowLeft/Right navigation (AC-106 scaffold, design-plan §5.3).
 */
export function TaskTabStrip({ active, checklistCount, activityCount, onSelect }: TaskTabStripProps) {
  const [done, total] = checklistCount

  function move(dir: 1 | -1) {
    const idx = ORDER.indexOf(active)
    const next = ORDER[(idx + dir + ORDER.length) % ORDER.length]
    onSelect(next)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
  }

  function renderTab(key: TabKey, count: string | null) {
    const selected = active === key
    return (
      <button
        key={key}
        type="button"
        role="tab"
        id={`dw-tab-${key}`}
        aria-selected={selected}
        aria-controls={`dw-tabpanel-${key}`}
        tabIndex={selected ? 0 : -1}
        className={`dw-tab${selected ? ' on' : ''}`}
        onClick={() => onSelect(key)}
        onKeyDown={handleKey}
      >
        {LABELS[key]}
        {count !== null && <span className="tcount tabular-nums">{count}</span>}
      </button>
    )
  }

  return (
    <div className="dw-tabs" role="tablist" aria-label="Task sections">
      {renderTab('details', null)}
      {renderTab('checklist', total > 0 ? `${done}/${total}` : null)}
      {renderTab('activity', activityCount > 0 ? `${activityCount}` : null)}
    </div>
  )
}
