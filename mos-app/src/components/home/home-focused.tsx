import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { RegionCount, RegionDrillLink, RegionRows } from './region-rows'
import type { HomeLayoutProps } from './home-list'
import './home-layouts.css'

// Focused — one region at a time. Counts stay on EVERY tab, including unselected ones, so nothing
// is hidden even though only one region is present (FR-925). That is the whole safety argument for
// making this the default.
export function HomeFocused({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  const [activeId, setActiveId] = useState(regions[0]?.id)
  const active = regions.find((r) => r.id === activeId) ?? regions[0]

  return (
    <div className="home-layout">
      <div>
        <div className="home-tabs" role="tablist">
          {regions.map((region) => (
            <button
              key={region.id}
              type="button"
              role="tab"
              className="home-tab"
              aria-selected={region.id === active?.id}
              onClick={() => setActiveId(region.id)}
            >
              {t(region.labelKey)}<RegionCount region={region} className="home-tab-count" />
            </button>
          ))}
        </div>
        {active && <RegionRows region={active} />}
        {active && <RegionDrillLink region={active} />}
      </div>
      {feed}
    </div>
  )
}
