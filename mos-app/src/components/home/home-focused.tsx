import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useT } from '@/i18n/use-t'
import { RegionCount, RegionDrillLink, RegionRows } from './region-rows'
import type { HomeLayoutProps } from './home-list'
import './home-layouts.css'

// Focused — one region at a time. Counts stay on EVERY tab, including unselected ones, so nothing
// is hidden even though only one region is present (FR-925). That is the whole safety argument for
// making this the default.
//
// The strip is a REAL tab contract, built to the same shape as this repo's other one
// (`components/dashboard/cut-toggle.tsx`): roving tabindex (the strip is ONE stop in the page Tab
// order), ArrowLeft/Right/Up/Down + Home/End to move within it, and `aria-controls` → the
// `role="tabpanel"` that holds the selected region's body. Shipping the roles without the keyboard
// is worse than plain buttons: it PROMISES arrow navigation to AT users and then does nothing.
//
// ONE panel node, not one per tab: Focused renders a single region at a time by design, so every
// tab points `aria-controls` at that one live panel and the panel is named by whichever tab is
// currently selected. The alternative — an id per tab — would leave three `aria-controls` pointing
// at elements that do not exist.
export function HomeFocused({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  const [activeId, setActiveId] = useState(regions[0]?.id)
  const activeIndex = Math.max(0, regions.findIndex((r) => r.id === activeId))
  const active = regions[activeIndex]
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabId = (id: string) => `${baseId}-tab-${id}`
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % regions.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + regions.length) % regions.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = regions.length - 1
    }
    if (nextIndex === null) return
    e.preventDefault()
    setActiveId(regions[nextIndex].id)
    // r5 F-4 (cut-toggle.tsx carries the same note): roving tabindex must move FOCUS with
    // selection — without this the old tab keeps focus while its tabIndex drops to -1, stranding
    // keyboard/AT users on a non-tabbable node.
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="home-layout">
      <div>
        <div className="home-tabs" role="tablist" aria-label={t('home.region.tablist')}>
          {regions.map((region, index) => {
            const isSelected = region.id === active?.id
            return (
              <button
                key={region.id}
                id={tabId(region.id)}
                ref={(el) => { tabRefs.current[index] = el }}
                type="button"
                role="tab"
                className="home-tab"
                aria-selected={isSelected}
                aria-controls={panelId}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveId(region.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                {t(region.labelKey)}<RegionCount region={region} className="home-tab-count" />
              </button>
            )
          })}
        </div>
        {active && (
          // tabIndex 0 per the APG Tabs pattern: an all-clear or error body can hold nothing
          // focusable, and without this the panel would be unreachable from the strip above it.
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(active.id)} tabIndex={0}>
            <RegionRows region={active} />
            <RegionDrillLink region={active} />
          </div>
        )}
      </div>
      {feed}
    </div>
  )
}
