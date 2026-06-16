import './ViewTabStrip.css'
import type { TasksView } from './useTasksViewPref'

interface ViewTabStripProps {
  /** The currently active view (only 'table' is valid in v1). */
  active: TasksView
}

/**
 * View-tab strip for the Tasks workspace (FR-121 / AC-122).
 * Table is the only activatable tab; Board and Calendar are aria-disabled "SOON" stubs.
 * Roving tabindex: only the active tab is tabindex=0, stubs are tabindex=-1.
 *
 * Design-plan §2.5 / DESIGN.md §5 view-tab-strip:
 *   active = brand-navy-text + 2px brand-orange bottom border (the one orange sprinkle)
 *   stubs  = muted-foreground + not-allowed cursor + a secondary SOON pill
 */
export function ViewTabStrip({ active }: ViewTabStripProps) {
  const tabs = [
    { key: 'table', label: 'Table' },
    { key: 'board', label: 'Board' },
    { key: 'calendar', label: 'Calendar' },
  ] as const

  return (
    <div role="tablist" aria-label="Workspace view" className="vts-strip">
      {tabs.map(tab => {
        const isActive = active === tab.key
        const isDisabled = tab.key !== 'table'
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled ? 'true' : undefined}
            tabIndex={isDisabled ? -1 : 0}
            type="button"
            className={`vts-tab${isActive ? ' vts-tab-active' : ''}${isDisabled ? ' vts-tab-disabled' : ''}`}
            /* Stubs are not activatable; Table is the only active view in v1 — no onClick either way. */
          >
            {tab.label}
            {isDisabled && (
              <span className="vts-soon" aria-hidden="true">SOON</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
