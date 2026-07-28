import { useT } from '@/i18n/use-t'
import { RegionDrillLink, RegionRows } from './region-rows'
import type { HomeLayoutProps } from './home-list'
import './home-layouts.css'

// Overview — every region at once as tiles, sized by consequence. `needs-you` leads.
const WEIGHT: Record<string, string> = {
  'needs-you': 'lead', 'failed-checks': 'major', mentions: 'major', 'my-work': 'full',
}

export function HomeOverview({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div className="home-bento">
        {regions.map((region) => (
          <section key={region.id} className="home-tile" data-weight={WEIGHT[region.id] ?? 'major'}>
            <div className="home-tile-head">
              <h3 className="home-tile-name">{t(region.labelKey)}</h3>
              <span className="home-tile-count">{region.count}</span>
            </div>
            <RegionRows region={region} items={region.items.slice(0, 4)} />
            <RegionDrillLink region={region} />
          </section>
        ))}
      </div>
      {feed}
    </div>
  )
}
