import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { RegionDrillLink, RegionRows } from './region-rows'
import type { HomeRegion } from './home-regions'
import './home-layouts.css'

export interface HomeLayoutProps {
  regions: HomeRegion[]
  feed: ReactNode
}

// List — one continuous list grouped by kind, attention-first. The most complete of the three:
// nothing is behind a click.
export function HomeList({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div>
        {regions.map((region) => (
          <section key={region.id} className="home-band" aria-label={t(region.labelKey)}>
            <div className="stream-band-head">
              <h3 className="stream-band-label">{t(region.labelKey)} · {region.count}</h3>
              <RegionDrillLink region={region} />
            </div>
            <RegionRows region={region} />
          </section>
        ))}
      </div>
      {feed}
    </div>
  )
}
