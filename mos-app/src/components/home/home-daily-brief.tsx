/*
 * DIRECTION CONTRACT — Home daily dispatch sheet
 * THESIS: Home answers “what needs me now?” in one queue; the category-default dashboard of equal
 * cards and switchable layouts is intentionally retired.
 * OWN-WORLD: E7 ink-navy structure, warm paper surfaces, hairline dividers, Plus Jakarta headings,
 * DM Sans rows, and One Blue reserved for routes and actions.
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
import './home-daily-brief.css'

export interface HomeDailyBriefProps {
  regions: HomeRegion[]
  feed: ReactNode
  objectives?: ReactNode
  cafeDoor?: ReactNode
  composition?: 'member' | 'cockpit'
  showFailedChecks?: boolean
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
              <RegionRows region={memberAssigned} actionLabel={t('home.brief.openTask')} />
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
            <RegionRows region={needsYou} actionLabel={t('home.brief.openTask')} />
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
                <RegionRows region={failedChecks} actionLabel={t('home.brief.review')} />
              </section>
            )
          )}
        </section>

        <section className="home-brief-secondary home-brief-my-work" aria-labelledby={myWorkId}>
          <header className="home-brief-section-head">
            <div className="home-brief-section-title">
              <h2 id={myWorkId}>
                {t(myWork.labelKey)}
                <span className="home-brief-count tabular-nums"><RegionCount region={myWork} /></span>
              </h2>
            </div>
            <div className="home-brief-section-side">
              <RegionDrillLink region={myWork} />
            </div>
          </header>
          <RegionRows region={myWork} actionLabel={t('home.brief.openTask')} />
        </section>
      </div>

      <aside className="home-brief-aside" aria-label={t('home.brief.secondaryLabel')}>
        {objectives ? <div className="home-brief-objectives">{objectives}</div> : null}
        <div className="home-brief-feed">{feed}</div>
      </aside>
    </div>
  )
}
