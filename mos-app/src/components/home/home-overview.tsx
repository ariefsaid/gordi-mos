import { useT } from '@/i18n/use-t'
import { RegionCount, RegionDrillLink, RegionRows } from './region-rows'
import { HOME_TILE_WEIGHT, OVERVIEW_TILE_ROWS } from './home-tile-weight'
import type { HomeLayoutProps } from './home-list'
import './home-layouts.css'

// Overview — every region at once as tiles, sized by consequence (HOME_TILE_WEIGHT). `needs-you`
// leads: first, top-left, and in the widest tier.

export function HomeOverview({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div className="home-bento">
        {/* `data-region` (not the weight) is what the lead tile's tonal lift keys off: BOTH
            needs-you and my-work are `wide`, so a weight-keyed rule would raise them equally and
            mark neither. */}
        {regions.map((region) => (
          <section
            key={region.id}
            className="home-tile"
            data-region={region.id}
            data-weight={HOME_TILE_WEIGHT[region.id]}
          >
            <div className="home-tile-head">
              {/* h2: PageFamilyFrame owns the page's only h1 and Home has no intermediate level,
                  so an h3 here skipped a heading level (detector: skipped-heading). */}
              <h2 className="home-tile-name">{t(region.labelKey)}</h2>
              <RegionCount region={region} className="home-tile-count" />
            </div>
            {/* The cap never cuts a pinned row (needs-you's Daily Log flags, #302): the "N more"
                remainder drills to the region's ONE destination, and a pinned row's content is
                precisely what that destination cannot show. Pins lead, so max() keeps them all. */}
            <RegionRows
              region={region}
              items={region.items.slice(0, Math.max(OVERVIEW_TILE_ROWS, region.pinnedCount ?? 0))}
            />
            <RegionDrillLink region={region} />
          </section>
        ))}
      </div>
      {feed}
    </div>
  )
}
