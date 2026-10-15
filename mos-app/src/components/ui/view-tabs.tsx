// ViewTabs — the ONE shared view-tab strip primitive (DESIGN.md OD-P3-6, Wave-5
// archetype de-duplication). Reconciles the two forked tab grammars that had drifted
// apart — the dashboard TabStrip + the tasks `.vtab` block — into a single component
// so the workspace + the dashboard read as one product.
//
// Grammar (OD-P3-6): transparent tabs, muted-foreground default → brand-navy-text +
// a 2px brand-orange bottom underline when active (the ONE orange sprinkle per
// screen — Orange-Sprinkle Rule); roving tabindex (only the active tab is tabindex=0)
// + Arrow/Home/End key nav across ENABLED tabs only. `soon`/`disabled` tabs render
// muted + non-interactive (disabled + aria-disabled, out of the tab order, click is a
// no-op) — the Table/Board/Calendar "soon" placeholders. `count` renders the small
// tabular pill (the dashboard's "N rows"). The composition owns active-state + URL
// persistence; this primitive just reports onChange.
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { useT } from '@/i18n/use-t'
import './view-tabs.css'

interface ViewTab {
  id: string
  label: ReactNode
  /** optional row-count affordance (the "86 rows" pill — cheap signal of size) */
  count?: number | string
  /** fully non-interactive tab (muted + aria-disabled, out of the tab order) */
  disabled?: boolean
  /** "coming soon" placeholder — same non-interactive treatment as `disabled` */
  soon?: boolean
}

export interface ViewTabsProps {
  tabs: ViewTab[]
  active: string
  onChange: (id: string) => void
  /** right-aligned hint node (e.g. "Applies to both: Branch · 30d") */
  trailing?: ReactNode
  /** accessible name for the tablist (e.g. "View", "Dashboard view") */
  ariaLabel?: string
  /** id of the panel the tabs control (sets aria-controls on every tab). */
  panelId?: string
  /** When set, each tab button gets id `${idPrefix}-${tab.id}` so the panel can be labelled by it. */
  idPrefix?: string
}

export function ViewTabs({ tabs, active, onChange, trailing, ariaLabel, panelId, idPrefix }: ViewTabsProps) {
  const t = useT()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  // A strip that scrolls inside itself (phone, many tabs) keeps the active tab in view; only the strip moves, never the page.
  useEffect(() => {
    const strip = tabRefs.current.find((el) => el?.getAttribute('aria-selected') === 'true')
    const row = strip?.parentElement
    if (!strip || !row || row.scrollWidth <= row.clientWidth) return
    if (strip.offsetLeft < row.scrollLeft || strip.offsetLeft + strip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = strip.offsetLeft - (row.clientWidth - strip.offsetWidth) / 2
    }
  }, [active])
  // Keyboard nav roves across ENABLED tabs only — soon/disabled stubs are skipped.
  const enabledOrder = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => !tab.soon && !tab.disabled)
    .map(({ index }) => index)

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const pos = enabledOrder.indexOf(index)
    if (pos === -1) return
    let nextPos: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextPos = (pos + 1) % enabledOrder.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextPos = (pos - 1 + enabledOrder.length) % enabledOrder.length
    } else if (e.key === 'Home') {
      nextPos = 0
    } else if (e.key === 'End') {
      nextPos = enabledOrder.length - 1
    }
    if (nextPos !== null) {
      e.preventDefault()
      const nextIndex = enabledOrder[nextPos]
      onChange(tabs[nextIndex].id)
      // The active tab owns tabindex=0 and every other tab is -1, so selection and DOM focus
      // have to move together: without this the keyboard user is left focused on a tab that
      // just became tabindex=-1, and the next Tab escapes the strip entirely. This is the
      // roving-tabindex contract (DESIGN.md / interaction-contract I7), not a visual nicety.
      tabRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="view-tabs" data-tabs={tabs.length}>
      {tabs.map((tab, index) => {
        const isActive = tab.id === active
        const inert = tab.soon || tab.disabled
        const className = [
          'view-tabs__tab',
          isActive ? 'view-tabs__tab--active' : null,
          inert ? 'view-tabs__tab--soon' : null,
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            ref={(element) => { tabRefs.current[index] = element }}
            key={tab.id}
            id={idPrefix ? `${idPrefix}-${tab.id}` : undefined}
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={isActive}
            aria-disabled={inert ? 'true' : undefined}
            disabled={inert}
            title={tab.soon ? t('common.comingSoon') : undefined}
            tabIndex={isActive ? 0 : -1}
            data-touch-target="true"
            className={className}
            onClick={() => {
              if (!inert && !isActive) onChange(tab.id)
            }}
            onKeyDown={e => handleKeyDown(e, index)}
          >
            {tab.label}
            {tab.count != null && (
              <span className="view-tabs__count tabular">{tab.count}</span>
            )}
          </button>
        )
      })}
      {trailing && <span className="view-tabs__trailing">{trailing}</span>}
    </div>
  )
}
