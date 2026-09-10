/*
 * DIRECTION CONTRACT — Home daily dispatch sheet
 * THESIS: Home answers “what needs me now?” through three v4 shapes over one consequence-ranked
 * queue; the shapes change scan geometry, not the underlying data or persona scope.
 * OWN-WORLD: approved warm-paper surfaces, hairline dividers, Plus Jakarta headings, DM Sans rows,
 * and One Blue reserved for routes and actions.
 * STORY: scan the day, open the most consequential item, then work through the remaining queue
 * while keeping recent signals and objectives in peripheral reach.
 * FIRST VIEWPORT: the shared greeting carries the day identity; Needs you now and My work occupy
 * the readable main track, while the live Signals feed and Objectives door stay concise at right.
 * FORM: grounded candidate 7 — a dispatch sheet; Impeccable surface seed 2917e604 assigned it.
 */
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { RegionCount, RegionDrillLink, RegionRows } from './region-rows'
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
  /** When set, render the owner's selected v4 shape over the same regions and supporting feed. */
  layout?: HomeLayout
}

function regionById(regions: HomeRegion[], id: HomeRegion['id']): HomeRegion {
  const region = regions.find((candidate) => candidate.id === id)
  if (!region) throw new Error(`Home region missing: ${id}`)
  return region
}

function BriefRouteLink({ region, label }: { region: HomeRegion; label: string }) {
  if (!region.drillTo) return null
  return (
    <Link to={region.drillTo.route} className="home-brief-route-link tap-floor">
      {label}
    </Link>
  )
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
  const attentionId = useId()
  const failedChecksId = useId()
  const myWorkId = useId()
  const needsYou = regionById(regions, 'needs-you')
  const failedChecks = regionById(regions, 'failed-checks')
  const myWork = regionById(regions, 'my-work')

  const memberAssigned: HomeRegion = {
    ...needsYou,
    labelKey: 'home.stream.band.myWork',
    items: [...needsYou.items, ...myWork.items],
    count: needsYou.count === null || myWork.count === null
      ? null
      : myWork.drillTo?.count ?? needsYou.count + myWork.count,
    drillTo: myWork.drillTo ?? needsYou.drillTo,
  }

  if (layout) {
    // Persona rules decide which regions exist; the arrangement only decides how those readable
    // regions are shaped. Members keep their Café opening and assigned-work union, while cockpit
    // viewers retain the full Needs you / Failed checks / My work model. Signals and Objectives
    // remain the same standing aside in all three arrangements.
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

  if (composition === 'member') {
    return (
      <div className="home-daily-brief home-daily-brief--member" data-testid="home-daily-brief">
        <div className="home-brief-main home-brief-main--member">
          {cafeDoor}
          <section className="home-brief-attention home-brief-member-assigned" aria-labelledby={attentionId}>
            <header className="home-brief-section-head">
              <div className="home-brief-section-title">
                <h2 id={attentionId}>
                  {t(memberAssigned.labelKey)}
                  <span className="home-brief-count tabular-nums"><RegionCount region={memberAssigned} /></span>
                </h2>
              </div>
              <div className="home-brief-section-side">
                <BriefRouteLink region={memberAssigned} label={t('home.brief.viewTasks')} />
              </div>
            </header>
            <div className="home-brief-lane home-brief-lane--tasks">
              <RegionRows region={memberAssigned} />
            </div>
          </section>
        </div>
        <aside className="home-brief-aside" aria-label={t('home.brief.secondaryLabel')}>
          <div className="home-brief-feed">{feed}</div>
        </aside>
      </div>
    )
  }

  return (
    <div className="home-daily-brief" data-testid="home-daily-brief">
      <div className="home-brief-main">
        <section className="home-brief-attention" aria-labelledby={attentionId}>
          <header className="home-brief-section-head">
            <div className="home-brief-section-title">
              <h2 id={attentionId}>
                {t(needsYou.labelKey)}
                <span className="home-brief-count tabular-nums"><RegionCount region={needsYou} /></span>
              </h2>
            </div>
            <div className="home-brief-section-side">
              <BriefRouteLink region={needsYou} label={t('home.brief.viewTasks')} />
            </div>
          </header>

          <div className="home-brief-lane home-brief-lane--tasks">
            <RegionRows region={needsYou} />
          </div>

          {showFailedChecks && (
            failedChecks.state === 'ready' && failedChecks.items.length === 0 ? (
              <p className="home-brief-checks-status">
                <span>{t(failedChecks.labelKey)}</span>
                <span className="home-brief-count tabular-nums"><RegionCount region={failedChecks} /></span>
                <span className="home-brief-checks-clear">{t('home.brief.failedChecksClear')}</span>
              </p>
            ) : (
              <section className="home-brief-lane home-brief-lane--checks" aria-labelledby={failedChecksId}>
                <header className="home-brief-lane-head">
                  <div className="home-brief-section-title">
                    <h3 id={failedChecksId}>
                      {t(failedChecks.labelKey)}
                      <span className="home-brief-count tabular-nums"><RegionCount region={failedChecks} /></span>
                    </h3>
                  </div>
                  <div className="home-brief-section-side">
                    <BriefRouteLink region={failedChecks} label={t('home.brief.reviewChecks')} />
                  </div>
                </header>
                <RegionRows region={failedChecks} />
              </section>
            )
          )}
        </section>

        <section className="home-brief-secondary home-brief-my-work" aria-labelledby={myWorkId}>
          <header className="home-brief-section-head">
            <div className="home-brief-section-title">
              <h2 id={myWorkId}>
                {t(myWork.labelKey)}
              </h2>
            </div>
            <div className="home-brief-section-side">
              <RegionDrillLink region={myWork} />
            </div>
          </header>
          <RegionRows region={myWork} />
        </section>
      </div>

      <aside className="home-brief-aside" aria-label={t('home.brief.secondaryLabel')}>
        <div className="home-brief-feed">{feed}</div>
        {objectives ? <div className="home-brief-objectives">{objectives}</div> : null}
      </aside>
    </div>
  )
}
