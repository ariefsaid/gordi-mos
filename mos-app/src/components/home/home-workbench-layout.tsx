import { useId } from 'react'
import { useT } from '@/i18n/use-t'
import { RegionCount } from './region-rows'
import { HomeRegionCollection } from './home-region-collection'
import type { HomeLayout } from '@/lib/home-layout'
import type { HomeRegion } from './home-regions'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

function RegionSection({ region }: { region: HomeRegion }) {
  const t = useT()
  const headingId = useId()
  return (
    <section className={`stream-band home-region home-region--${region.id}`} aria-labelledby={headingId}>
      <div className="stream-band-head">
        <h2 id={headingId} className="stream-band-label">
          {t(region.labelKey)}
          {region.count !== null ? <span className="home-region-count"> · {region.count}</span> : <RegionCount region={region} className="home-region-count" />}
        </h2>
      </div>
      <HomeRegionCollection region={region} />
    </section>
  )
}

function StandingContext({ cafeDoor, objectives, feed }: Omit<HomeLayoutProps, 'regions'>) {
  return (
    <aside className="home-standing">
      {cafeDoor}
      {objectives}
      {feed ? <div className="home-signals">{feed}</div> : null}
    </aside>
  )
}

/** The three saved arrangements place one ranked queue and one shared set of standing context. */
export function HomeWorkbenchLayout({ regions, cafeDoor, objectives, feed, layout }: HomeLayoutProps & { layout: HomeLayout }) {
  const needsYou = regions.find((region) => region.id === 'needs-you')
  const failedChecks = regions.find((region) => region.id === 'failed-checks')
  const otherOpen = regions.find((region) => region.id === 'my-work')
  if (!needsYou || !otherOpen) throw new Error('Home regions missing required work regions')

  const attention = <><RegionSection region={needsYou} />{failedChecks ? <RegionSection region={failedChecks} /> : null}</>
  const standing = <StandingContext cafeDoor={cafeDoor} objectives={objectives} feed={feed} />

  if (layout === 'overview') {
    return (
      <div className="home-layout home-layout--overview">
        <div className="home-brief-main home-attention-queue">{attention}</div>
        <section className="home-other-open"><RegionSection region={otherOpen} /></section>
        {standing}
      </div>
    )
  }

  if (layout === 'list') {
    return (
      <div className="home-layout home-layout--list">
        <div className="home-brief-main home-attention-queue">
          {attention}
          <RegionSection region={otherOpen} />
        </div>
        {standing}
      </div>
    )
  }

  return (
    <div className="home-layout home-layout--focused">
      <div className="home-brief-main home-attention-queue">
        {attention}
        <RegionSection region={otherOpen} />
      </div>
      {standing}
    </div>
  )
}
