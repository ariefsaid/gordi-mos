import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'
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
  const byKind = new Map(lanes.map(l => [l.kind, l]))
  const ordered = LANE_ORDER.map(kind => byKind.get(kind)).filter((l): l is AttentionLane => l != null)

  // All lanes ready + all empty → the single all-caught-up state (the region persists — FR-506).
  const allClear = ordered.length > 0 && ordered.every(l => l.state === 'ready' && l.items.length === 0)

  return (
    <section role="region" aria-label={t('home.attention.title')} id="attention-brief" className="attention-brief">
      {allClear ? (
        <EmptyState title={t('home.attention.allClear')} variant="quiet" />
      ) : (
        ordered.map(lane => {
          // ready + 0 items → the lane is omitted (no "0" tile — never a misleading zero).
          if (lane.state !== 'ready' || lane.items.length === 0) return null

          return (
            <div key={lane.kind} className="attention-lane">
              <h3 className="attention-lane-title">{t(LANE_TITLE_KEY[lane.kind])}</h3>
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
