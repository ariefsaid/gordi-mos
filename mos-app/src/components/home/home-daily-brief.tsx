/*
 * Home's arrangement host. The three arrangements share one region model and one
 * RecordCollection-backed region body; this component only applies the viewer's composition rules.
 */
import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
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
  composition?: 'member' | 'cockpit'
  showFailedChecks?: boolean
  /** Explicitly selects the only supported Home arrangement. */
  layout: HomeLayout
}

export function HomeDailyBrief({
  regions,
  feed,
  objectives,
  cafeDoor,
  composition = 'cockpit',
  showFailedChecks = true,
  layout,
}: HomeDailyBriefProps) {
  const t = useT()
  // Persona rules decide which regions exist; the arrangement only decides how those readable
  // regions are shaped. Members keep their Café opening and assigned-work union, while cockpit
  // viewers retain the full Needs you / Failed checks / My work model.
  const needsYou = regions.find((region) => region.id === 'needs-you')
  const myWork = regions.find((region) => region.id === 'my-work')
  if (!needsYou || !myWork) throw new Error('Home regions missing required work regions')
  const memberAssigned: HomeRegion = {
    ...needsYou,
    labelKey: 'home.stream.band.myWork',
    items: [...needsYou.items, ...myWork.items],
    count: needsYou.count === null || myWork.count === null
      ? null
      : myWork.drillTo?.count ?? needsYou.count + myWork.count,
    drillTo: myWork.drillTo ?? needsYou.drillTo,
  }
  const layoutRegions = composition === 'member'
    ? [memberAssigned]
    : showFailedChecks
      ? regions
      : regions.filter((region) => region.id !== 'failed-checks')
  const layoutFeed = (
    <aside className="home-brief-aside" aria-label={t('home.brief.secondaryLabel')}>
      <div className="home-brief-feed">{feed}</div>
      {objectives ? <div className="home-brief-objectives">{objectives}</div> : null}
    </aside>
  )
  const layoutProps = {
    regions: layoutRegions,
    feed: layoutFeed,
    leading: composition === 'member' ? cafeDoor : undefined,
  }
  const arrangement = layout === 'overview'
    ? <HomeOverview {...layoutProps} />
    : layout === 'list'
      ? <HomeList {...layoutProps} />
      : <HomeFocused {...layoutProps} />

  return <div className="home-layout-host" data-testid="home-daily-brief">{arrangement}</div>
}
