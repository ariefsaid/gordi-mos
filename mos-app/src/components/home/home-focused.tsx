import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useT } from '@/i18n/use-t'
import { RegionCount, RegionDrillLink, RegionRows } from './region-rows'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

/** Focused keeps one region open while retaining counts on every tab. */
export function HomeFocused({ regions, feed, leading }: HomeLayoutProps) {
  const t = useT()
  const [activeId, setActiveId] = useState(regions[0]?.id)
  const activeIndex = Math.max(0, regions.findIndex((region) => region.id === activeId))
  const active = regions[activeIndex]
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabId = (id: string) => `${baseId}-tab-${id}`
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % regions.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + regions.length) % regions.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = regions.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    setActiveId(regions[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="home-layout">
      <div>
        {leading ? <div className="home-layout-leading">{leading}</div> : null}
        <div className="home-tabs" role="tablist" aria-label={t('home.region.tablist')}>
          {regions.map((region, index) => {
            const selected = region.id === active?.id
            return (
              <button
                key={region.id}
                id={tabId(region.id)}
                ref={(element) => { tabRefs.current[index] = element }}
                type="button"
                role="tab"
                className="home-tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(region.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {t(region.labelKey)}<RegionCount region={region} className="home-tab-count" />
              </button>
            )
          })}
        </div>
        {active ? (
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(active.id)} tabIndex={0}>
            <RegionRows region={active} />
            <RegionDrillLink region={active} />
          </div>
        ) : null}
      </div>
      {feed}
    </div>
  )
}
