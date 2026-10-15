import { useT } from '@/i18n/use-t'
import { GroupHeader } from '@/components/ui/group-header'
import { HomeRegionCollection } from './home-region-collection'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

/** List keeps all rows visible, grouped by the same Home regions as the other arrangements. */
export function HomeList({ regions, nextAction, objectives, feed, leading, liftedRegionId }: HomeLayoutProps) {
  const t = useT()
  return (
    <>
    <div className="home-layout">
      <div className="home-brief-main">
        {leading ? <div className="home-layout-leading">{leading}</div> : null}
        {nextAction}
        <div className="stream-group">
          {regions.map((region) => (
            <section key={region.id} className="stream-band" aria-label={t(region.labelKey)}>
              <GroupHeader
                label={t(region.labelKey)}
                count={region.state === 'ready' ? region.items.length + (region.id === liftedRegionId ? 1 : 0) : (region.count ?? '—')}
              />
              <HomeRegionCollection region={region} liftedCount={region.id === liftedRegionId ? 1 : 0} />
            </section>
          ))}
        </div>
      </div>
      <aside className="home-aside">{objectives}</aside>
    </div>
      <div className="home-signals">{feed}</div>
    </>
  )
}
