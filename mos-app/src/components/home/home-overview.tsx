import { useT } from '@/i18n/use-t'
import { RegionCount } from './region-rows'
import { HomeRegionCollection } from './home-region-collection'
import { HOME_TILE_WEIGHT, OVERVIEW_TILE_ROWS } from './home-tile-weight'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

/** Overview shows every readable region at once, with tiles weighted by consequence. */
export function HomeOverview({ regions, feed, leading }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div>
        {leading ? <div className="home-layout-leading">{leading}</div> : null}
        <div className="home-bento">
          {regions.map((region) => (
            <section key={region.id} className="home-tile" data-region={region.id} data-weight={HOME_TILE_WEIGHT[region.id]}>
              <div className="home-tile-head">
                <h2 className="home-tile-name">{t(region.labelKey)}</h2>
                <RegionCount region={region} className="home-tile-count" />
              </div>
              <HomeRegionCollection region={region} items={region.items.slice(0, OVERVIEW_TILE_ROWS)} />
            </section>
          ))}
        </div>
      </div>
      {feed}
    </div>
  )
}
