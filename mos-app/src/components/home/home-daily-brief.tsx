/*
 * Home's arrangement host. The three arrangements share one region model and one
 * RecordCollection-backed region body; this component only applies the viewer's composition rules.
 */
import type { ReactNode } from 'react'
import type { HomeRegion } from './home-regions'
import type { HomeLayout } from '@/lib/home-layout'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import { HomeNextAction } from './home-next-action'
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
    // DD-COUNT-1 (#1194): the union's heading count is the SAME shared open-task figure my-work
    // carries (needs-you items are a subset of the viewer's open work) — never a sum that caps
    // or double-counts.
    count: myWork.count,
    totalItemCount: needsYou.items.length + (myWork.totalItemCount ?? myWork.items.length),
    drillTo: myWork.drillTo ?? needsYou.drillTo,
  }
  const layoutRegions = composition === 'member'
    ? [memberAssigned]
    : showFailedChecks
      ? regions
      : regions.filter((region) => region.id !== 'failed-checks')
  const workRegions = layoutRegions.filter((region) => region.id !== 'failed-checks')
  const workReadState = workRegions.some((region) => region.state === 'loading') ? 'loading'
    : workRegions.some((region) => region.state === 'error') ? 'error' : 'ready'
  const liftedRegion = layoutRegions.find((region) => region.items.length > 0)
  const liftedItem = liftedRegion?.items[0] ?? null
  const visibleRegions = layoutRegions.map((region) => region === liftedRegion
    ? {
        ...region,
        totalItemCount: region.totalItemCount ?? region.items.length,
        items: region.items.slice(1),
      }
    : region)
  const layoutProps = {
    regions: visibleRegions,
    nextAction: <HomeNextAction item={liftedItem} readState={workReadState} />,
    objectives,
    feed,
    liftedRegionId: liftedRegion?.id,
    leading: composition === 'member' ? cafeDoor : undefined,
  }
  const arrangement = layout === 'overview'
    ? <HomeOverview {...layoutProps} />
    : layout === 'list'
      ? <HomeList {...layoutProps} />
      : <HomeFocused {...layoutProps} />

  return (
    <div className="home-layout-host" data-testid="home-daily-brief">
      {arrangement}
    </div>
  )
}
