import { useT } from '@/i18n/use-t'
import { Link } from 'react-router-dom'
import { formatWibDateTime } from '@/lib/wib-time'
import { attentionSlug } from '@/lib/db/signals.types'
import { attentionLabel } from '@/components/signals/signal-attention-label'
import type { HomeAttentionSignal } from '@/lib/db/home-attention-data'
import { homeAttentionSignalHref } from './home-needs-attention-signal-href'
import '@/components/signals/signal-feed-rows.css'
import '@/components/signals/signal-record.css'

// Home Needs-you-now — Signal rows (#773 / OD-WAY-96 (3, 6)).
//
// Owns the ROW inside the "Needs you now" region: the shared feed-row anatomy (body, meta,
// tail), the attention pill in the tail, and the Seen ✓ chip. NO per-row buttons (no "Acknowledge",
// no "Create Task" — that verb lives in the record, #746). One tap opens the record page; the
// Seen ✓ chip is its own click target and does not bubble up as "open".
//
// The chip has two visual states, keyed on `is_mentioned` from mos.home_attention_signals():
//   prompted (filled-outline, `signal-seen-chip--prompted`) — the viewer is mentioned;
//   plain     (outline,                                   ) — the viewer is not.
// Toggling on removes the row from THIS viewer's Needs you now (the parent refetches). A lead's
// toggle removes the row for every lead of the owning Team; a mentioned viewer's toggle removes
// only their own view — the split is decided by the DB, not the row.
//
// Another ticket owns WHERE this region sits per persona (which layouts, which arrangement).
// This component owns the DATA + the ROW only.

export interface HomeNeedsAttentionSignalRowProps {
  signal: HomeAttentionSignal
  authorName: string
  teamName: string
  onSeen: (signalId: string) => void
}

export function HomeNeedsAttentionSignalRow({
  signal, authorName, teamName, onSeen,
}: HomeNeedsAttentionSignalRowProps) {
  const t = useT()
  const href = homeAttentionSignalHref(signal.id)
  return (
    <li
      className="home-signal-row home-signal-row--open"
      data-signal-id={signal.id}
      data-signal-attention-row="true"
      data-mentioned={signal.is_mentioned ? 'true' : 'false'}
    >
      <Link
        to={href}
        className="home-signal-main"
        aria-label={t('signals.card.openSignal', { body: signal.body })}
      >
        <span className="home-signal-body home-signal-body--static">
          <span className="home-signal-body-text">{signal.body}</span>
        </span>
        <span className="home-signal-meta">
          <span className="home-signal-who-name">{authorName}</span>
          {teamName && (
            <span className="home-signal-meta-item">
              <span className="home-signal-sep" aria-hidden="true">·</span>
              <span className="home-signal-location-chip">{teamName}</span>
            </span>
          )}
          <span className="home-signal-meta-item">
            <span className="home-signal-sep" aria-hidden="true">·</span>
            <span className="home-signal-time-chip">{formatWibDateTime(signal.occurred_at)}</span>
          </span>
        </span>
      </Link>
      <div className="home-signal-tail">
        <span className={`home-signal-attention home-signal-attention--${attentionSlug(signal.attention)}`}>
          {attentionLabel(t, signal.attention)}
        </span>
        <button
          type="button"
          className={`signal-seen-chip${signal.is_mentioned ? ' signal-seen-chip--prompted' : ''}`}
          data-mentioned={signal.is_mentioned ? 'true' : 'false'}
          aria-pressed="false"
          onClick={(event) => {
            // The row body opens the record on click; the chip must not open the record too —
            // it is the ack toggle. Stop the click at the chip.
            event.stopPropagation()
            event.preventDefault()
            onSeen(signal.id)
          }}
        >
          {t('signals.record.seen')}
        </button>
      </div>
    </li>
  )
}

export interface HomeNeedsAttentionSignalsProps {
  signals: readonly HomeAttentionSignal[]
  authorNamesById: ReadonlyMap<string, string>
  teamNamesById: ReadonlyMap<string, string>
  onSeen: (signalId: string) => void
}

/** The Signal rows inside the "Needs you now" region. Empty when the caller has no rows to see;
 *  the empty state is owned by the region shell, not by this component. */
export function HomeNeedsAttentionSignals({
  signals, authorNamesById, teamNamesById, onSeen,
}: HomeNeedsAttentionSignalsProps) {
  const t = useT()
  if (signals.length === 0) return null
  return (
    <ul
      className="home-signal-list"
      data-testid="home-needs-attention-signals"
      aria-label={t('home.region.needsYou')}
    >
      {signals.map((signal) => (
        <HomeNeedsAttentionSignalRow
          key={signal.id}
          signal={signal}
          authorName={authorNamesById.get(signal.author_id) ?? t('signals.card.unknownAuthor')}
          teamName={teamNamesById.get(signal.owning_team_id) ?? ''}
          onSeen={onSeen}
        />
      ))}
    </ul>
  )
}
