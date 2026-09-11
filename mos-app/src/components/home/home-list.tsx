import { useT } from '@/i18n/use-t'
import { RegionCount } from './region-rows'
import { HomeRegionCollection } from './home-region-collection'
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
                <h2 className="stream-band-label">
                  {t(region.labelKey)} · <RegionCount region={region} /> {t('home.region.shown')}
                </h2>
              </div>
              <HomeRegionCollection region={region} />
            </section>
          ))}
        </div>
      </div>
      {feed}
    </div>
  )
}
