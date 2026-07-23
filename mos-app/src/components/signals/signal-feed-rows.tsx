import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'
import { formatWibDateTime } from '@/lib/wib-time'
import { orderSignalsForFeed } from '@/lib/db/signals'
import { attentionSlug, type SignalCategory, type SignalRow } from '@/lib/db/signals.types'
import { SignalCategoryPicker } from './signal-category-picker'
import './signal-feed-rows.css'

// SignalFeedRows — the ONE Signal row anatomy (owner redirect 2026-07-22: Signals render as ROWS in
// the same record-row grammar as the ranked stream, NOT fat cards, so Home reads as one calm
// system). Shared by BOTH consumers — the Home ambient tail (SignalFeedSection) and the Signals
// archive Feed presentation (SignalFeedPresentation) — so a Signal has exactly one visual anatomy
// across the app, never a bordered card in one place and a row in another
// (rule:product-ban-inconsistent-components). Preserves every contract the feed already had: the
// composer action row, resolved author/Team, the "Open signal: <body>" affordance, "Add category",
// the empty state, and Feed ordering (Urgent/Needs-attention weighted above FYI).

export interface SignalFeedRowsProps {
  signals: readonly SignalRow[]
  authorNamesById: Record<string, string>
  teamNamesById: Record<string, string>
  onShareClick?: () => void
  onCategorize?: (signalId: string, category: SignalCategory) => void
  onOpen?: (signal: SignalRow) => void
  /**
   * `ambient` (default) — the Home tail: no per-row state fill, so Home reads as one calm system.
   * `archive` — the /work/signals Feed: attention-worthy rows carry DESIGN.md's Operations-event
   * row treatment (warning/7% fill + a 2px warning left rule, the owner-approved side-stripe
   * exception, §Operations event tokens). Home's row treatment is unchanged.
   */
  variant?: 'ambient' | 'archive'
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function SignalFeedRows({
  signals, authorNamesById, teamNamesById, onShareClick, onCategorize, onOpen,
  variant = 'ambient',
}: SignalFeedRowsProps) {
  const t = useT()
  const ordered = orderSignalsForFeed([...signals])

  return (
    <div
      className={`home-signal-feed${variant === 'archive' ? ' home-signal-feed--archive' : ''}`}
      data-testid="signal-feed"
    >
      {/* Quiet action row — the composer entry. Ambient-only (D-D2): on Home (the ambient tail) this
          IS the compose door, since Home has no CollectionToolbar. In the /work/signals archive the
          toolbar hosts the ONE layout-independent Share door, so this in-feed row would be a SECOND,
          layout-dependent door — omitted there so the archive has exactly one compose door. */}
      {variant === 'ambient' && onShareClick ? (
        <button type="button" className="home-signal-share-row" onClick={onShareClick}>
          {t('signals.feed.shareRow')}
        </button>
      ) : null}

      {ordered.length === 0 ? (
        <EmptyState title={t('signals.feed.empty')} nested />
      ) : (
        <ul className="home-signal-list">
          {ordered.map((signal) => {
            if (signal.retracted_at) {
              return (
                <li key={signal.id} className="home-signal-row home-signal-row--retracted" data-signal-id={signal.id}>
                  <p className="home-signal-tombstone">
                    {t('signals.retracted')} {signal.retract_reason ? <span>{signal.retract_reason}</span> : null}
                  </p>
                </li>
              )
            }
            const authorName = authorNamesById[signal.author_id] ?? t('signals.card.unknownAuthor')
            const teamName = teamNamesById[signal.owning_team_id] ?? ''
            // Attention-worthy = anything above FYI (Needs attention / Urgent — the same amber
            // family). The CSS treatment is scoped to `.home-signal-feed--archive`, so tagging the
            // row here is inert on Home and lights up only in the archive Feed.
            const attentionRow = signal.attention !== 'FYI' ? ' home-signal-row--attention' : ''
            return (
              <li
                key={signal.id}
                className={`home-signal-row${attentionRow}`}
                data-signal-id={signal.id}
              >
                <div className="home-signal-main">
                  {/* Body = the row title, one truncated line; the clickable record affordance. */}
                  {onOpen ? (
                    <button
                      type="button"
                      className="home-signal-body"
                      onClick={() => onOpen(signal)}
                      aria-label={t('signals.card.openSignal', { body: signal.body })}
                    >
                      <span className="home-signal-body-text">{signal.body}</span>
                    </button>
                  ) : (
                    <span className="home-signal-body home-signal-body--static">
                      <span className="home-signal-body-text">{signal.body}</span>
                    </span>
                  )}
                  {/* Meta subline: author (avatar + name) · team · time. */}
                  <div className="home-signal-meta">
                    <span className="home-signal-who">
                      <span className="home-signal-avatar" aria-hidden="true">{initials(authorName)}</span>
                      <span className="home-signal-who-name">{authorName}</span>
                    </span>
                    {teamName && <><span className="home-signal-sep" aria-hidden="true">·</span><span>{teamName}</span></>}
                    <span className="home-signal-sep" aria-hidden="true">·</span>
                    <span className="home-signal-when">{formatWibDateTime(signal.occurred_at)}</span>
                  </div>
                </div>
                <div className="home-signal-tail">
                  <span className={`home-signal-attention home-signal-attention--${attentionSlug(signal.attention)}`}>
                    {signal.attention}
                  </span>
                  <SignalCategoryPicker
                    category={signal.category}
                    onCategorize={onCategorize ? (category) => onCategorize(signal.id, category) : undefined}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
