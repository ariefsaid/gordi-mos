import type { ReactNode } from 'react'
import type { HomeRegion } from './home-regions'
import type { HomeLayout } from '@/lib/home-layout'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import './home-daily-brief.css'

export interface HomeDailyBriefProps {
  regions: HomeRegion[]
  feed: ReactNode
  objectives?: ReactNode
  cafeDoor?: ReactNode
  showFailedChecks?: boolean
  /** Selects a saved arrangement only; every arrangement retains the same work and context. */
  layout: HomeLayout
}

export function HomeDailyBrief({
  regions,
  feed,
  objectives,
  cafeDoor,
  showFailedChecks = true,
  layout,
}: HomeDailyBriefProps) {
  const visibleRegions = showFailedChecks
    ? regions
    : regions.filter((region) => region.id !== 'failed-checks')
  if (!visibleRegions.some((region) => region.id === 'needs-you')
    || !visibleRegions.some((region) => region.id === 'my-work')) {
    throw new Error('Home regions missing required work regions')
  }
  const layoutProps = { regions: visibleRegions, feed, objectives, cafeDoor }
  const arrangement = layout === 'overview'
    ? <HomeOverview {...layoutProps} />
    : layout === 'list'
      ? <HomeList {...layoutProps} />
      : <HomeFocused {...layoutProps} />

  return <div className="home-layout-host" data-testid="home-daily-brief">{arrangement}</div>
}
