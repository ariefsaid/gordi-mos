import { useT } from '@/i18n/use-t'
import { RegionCount, RegionDrillLink, RegionRows } from './region-rows'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

/** List keeps all rows visible, grouped by the same Home regions as the other arrangements. */
export function HomeList({ regions, feed, leading }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div>
        {leading ? <div className="home-layout-leading">{leading}</div> : null}
        <div className="stream-group">
          {regions.map((region) => (
            <section key={region.id} className="stream-band" aria-label={t(region.labelKey)}>
              <div className="stream-band-head">
                <h2 className="stream-band-label">{t(region.labelKey)} · <RegionCount region={region} /></h2>
                <RegionDrillLink region={region} />
              </div>
              <RegionRows region={region} />
            </section>
          ))}
        </div>
      </div>
      {feed}
    </div>
  )
}
