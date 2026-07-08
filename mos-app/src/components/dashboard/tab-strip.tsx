// TabStrip — the Summary/Detail view-tab strip (design-plan §2.7, FR-015/AC-015).
// This is the DESIGN.md view-tab strip grammar (OD-P3-6): active tab = brand-navy-text
// + a 2px brand-orange bottom border (the one orange sprinkle per screen). role=tablist/
// tab/aria-selected + roving tabindex (arrow-key nav — mirrors CutToggle's keyboard
// handling). The composition owns ?tab= URL persistence (this primitive just reports
// onChange). Trailing hint node renders right-aligned (the "Applies to both" hint).
import type { ReactNode, KeyboardEvent } from 'react'
import './tab-strip.css'

export interface TabStripTab {
  id: string
  label: string
  /** optional row-count affordance (the "86 rows" pill — cheap signal of size) */
  count?: number
}

export interface TabStripProps {
  tabs: TabStripTab[]
  active: string
  onChange: (id: string) => void
  /** right-aligned hint (e.g. "Applies to both: Branch · 30d") */
  trailing?: ReactNode
}

export function TabStrip({ tabs, active, onChange, trailing }: TabStripProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1
    }
    if (nextIndex !== null) {
      e.preventDefault()
      onChange(tabs[nextIndex].id)
    }
  }

  return (
    <div role="tablist" aria-label="Dashboard view" className="tab-strip">
      {tabs.map((tab, index) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-touch-target="true"
            className={`tab-strip-tab${isActive ? ' tab-strip-tab--active' : ''}`}
            onClick={() => {
              if (!isActive) onChange(tab.id)
            }}
            onKeyDown={e => handleKeyDown(e, index)}
          >
            {tab.label}
            {tab.count != null && (
              <span className="tab-strip-count tabular">{tab.count}</span>
            )}
          </button>
        )
      })}
      {trailing && <span className="tab-strip-trailing">{trailing}</span>}
    </div>
  )
}
