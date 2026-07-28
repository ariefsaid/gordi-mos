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
      {/* `.stream-group` / `.stream-band` are the band-stack primitives home-stream.css already
          owns (24px between groups, tight within one). List previously named a `.home-band` class
          that was defined nowhere, so every band ran into the next with the same 6px that separates
          a label from its own rows. Reuse beats re-declaring a near-duplicate (AC-932). */}
      <div className="stream-group">
        {regions.map((region) => (
          <section key={region.id} className="stream-band" aria-label={t(region.labelKey)}>
            <div className="stream-band-head">
              {/* h2: PageFamilyFrame owns the page's only h1 and Home has no intermediate level,
                  so an h3 here skipped a heading level (detector: skipped-heading). */}
              <h2 className="stream-band-label">{t(region.labelKey)} · {region.count}</h2>
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
