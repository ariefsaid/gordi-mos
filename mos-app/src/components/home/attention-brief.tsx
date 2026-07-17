import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import type { AttentionLane, AttentionLaneKind } from '@/lib/home-attention'
import type { MessageKey } from '@/i18n/messages'
import './attention-brief.css'

// AttentionBrief — the Home attention brief (Step 5, spec §4 / Rule 6 / Rule 8). Presentation-only:
// takes `lanes` as props (HomePage does the fetching + region ordering) so it stays trivially unit-
// tested. Fixed lane order (overdue → due-today → failed-checks → mentions, spec §4). Composed from
// <Link> + the shared EmptyState primitive — StateKit's error/loading branches land in C3.

export interface AttentionBriefProps {
  lanes: AttentionLane[]
}

const LANE_ORDER: AttentionLaneKind[] = ['overdue', 'due-today', 'failed-checks', 'mentions']

const LANE_TITLE_KEY: Record<AttentionLaneKind, MessageKey> = {
  overdue: 'home.attention.lane.overdue',
  'due-today': 'home.attention.lane.dueToday',
  mentions: 'home.attention.lane.mentions',
  'failed-checks': 'home.attention.lane.failedChecks',
}

export function AttentionBrief({ lanes }: AttentionBriefProps) {
  const t = useT()
  const titleId = useId()
  const byKind = new Map(lanes.map(l => [l.kind, l]))
  const ordered = LANE_ORDER.map(kind => byKind.get(kind)).filter((l): l is AttentionLane => l != null)

  // All lanes ready + all empty → the single all-caught-up state (the region persists — FR-506).
  const allClear = ordered.length > 0 && ordered.every(l => l.state === 'ready' && l.items.length === 0)

  return (
    <section role="region" aria-labelledby={titleId} id="attention-brief" className="attention-brief">
      {/* RI-4 — a real visible heading (not aria-label only); the region's accessible name is
          sourced from it (aria-labelledby), so there's exactly one place a screen reader gets
          "Needs attention" from — never a double announcement. */}
      <h2 id={titleId} className="attention-brief-title">{t('home.attention.title')}</h2>
      {allClear ? (
        // Minor (a) — compact, left-aligned calm affirmation (not the centered checkmark
        // floating in a void). Same EmptyState primitive; usage/CSS adjusted via className.
        <EmptyState title={t('home.attention.allClear')} variant="quiet" className="attention-all-clear" />
      ) : (
        ordered.map(lane => {
          // Minor (b) — loading/error lanes keep their title visible ("which list failed?").
          const laneTitle = t(LANE_TITLE_KEY[lane.kind])

          if (lane.state === 'loading') {
            return (
              <div key={lane.kind} className="attention-lane" aria-busy="true">
                <h3 className="attention-lane-title">{laneTitle}</h3>
                <SkeletonRows count={2} />
              </div>
            )
          }

          if (lane.state === 'error') {
            return (
              <div key={lane.kind} className="attention-lane">
                <h3 className="attention-lane-title">{laneTitle}</h3>
                <ErrorState message={t('home.attention.laneError')} />
              </div>
            )
          }

          // ready + 0 items → the lane is omitted (no "0" tile — never a misleading zero).
          if (lane.items.length === 0) return null

          return (
            <div key={lane.kind} className="attention-lane">
              {/* Minor (d) — per-lane count in the title ("Overdue · 2"); only ready lanes with
                  items reach here, so the count is always meaningful (never "· 0"). */}
              <h3 className="attention-lane-title">
                {t('home.attention.laneTitleCount', { title: laneTitle, count: lane.items.length })}
              </h3>
              <ul className="attention-lane-list">
                {lane.items.map(item => (
                  <li key={item.id} className="attention-lane-item">
                    <Link to={item.route} className="attention-lane-link">
                      <span className="attention-lane-item-title">{item.title}</span>
                      {item.meta && <span className="attention-lane-item-meta">{item.meta}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}
