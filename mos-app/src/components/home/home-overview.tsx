import { useT } from '@/i18n/use-t'
import { GroupHeader } from '@/components/ui/group-header'
import { HomeRegionCollection } from './home-region-collection'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

/** Overview shows every readable region at once as parallel ruled lists. */
export function HomeOverview({ regions, nextAction, objectives, feed, leading, liftedRegionId }: HomeLayoutProps) {
  const t = useT()
  return (
    <>
    <div className="home-layout">
      <div className="home-brief-main">
        {leading ? <div className="home-layout-leading">{leading}</div> : null}
        {nextAction}
        <div className="stream-group home-overview-regions">
          {regions.map((region) => (
            <section key={region.id} className="stream-band" aria-label={t(region.labelKey)}>
              <GroupHeader label={t(region.labelKey)} count={region.count ?? '—'} />
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
