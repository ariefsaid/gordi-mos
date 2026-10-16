import { useId } from 'react'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { useT } from '@/i18n/use-t'
import { ViewTabs } from '@/components/ui/view-tabs'
import { RegionCount } from './region-rows'
import { HomeRegionCollection } from './home-region-collection'
import type { HomeLayoutProps } from './home-layout-types'
import './home-layouts.css'

/** Focused keeps one region open while retaining counts on every tab. */
export function HomeFocused({ regions, nextAction, objectives, feed, leading, liftedRegionId }: HomeLayoutProps) {
  const t = useT()
  // The open tab lives in the URL (?region=) so reload, a shared link and Back keep the same view.
  const [activeId, setActiveId] = useSearchParamState('region', regions[0]?.id ?? '')
  const active = regions[Math.max(0, regions.findIndex((region) => region.id === activeId))]
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabId = (id: string) => `${baseId}-tab-${id}`

  return (
    <>
    <div className="home-layout">
      <div className="home-brief-main">
        {leading ? <div className="home-layout-leading">{leading}</div> : null}
        {nextAction}
        {regions.length > 1 ? (
          <>
            <ViewTabs
              ariaLabel={t('home.region.tablist')}
              tabs={regions.map((region) => ({ id: region.id, label: <>{t(region.labelKey)}<RegionCount region={region} className="home-tab-count" /></> }))}
              active={active?.id ?? ''}
              onChange={setActiveId}
              panelId={panelId}
              idPrefix={`${baseId}-tab`}
            />
            {active ? (
              <div id={panelId} role="tabpanel" aria-labelledby={tabId(active.id)} tabIndex={0}>
                <HomeRegionCollection region={active} liftedCount={active.id === liftedRegionId ? 1 : 0} />
              </div>
            ) : null}
          </>
        ) : active ? (
          <HomeRegionCollection region={active} liftedCount={active.id === liftedRegionId ? 1 : 0} />
        ) : null}
      </div>
      <aside className="home-aside">{objectives}</aside>
    </div>
      <div className="home-signals">{feed}</div>
    </>
  )
}
