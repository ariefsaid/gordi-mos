import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'
import { formatWibDateTime } from '@/lib/wib-time'
import { orderSignalsForFeed } from '@/lib/db/signals'
import { attentionSlug, type SignalCategory, type SignalRow } from '@/lib/db/signals.types'
import { signalMatchesText } from './signal-collection-adapter'
import { attentionLabel } from './signal-attention-label'
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
  onCreateTask?: (signal: SignalRow) => void
  createTaskHref?: (signal: SignalRow) => string | undefined
  onOpen?: (signal: SignalRow) => void
  /**
   * `ambient` (default) — the Home tail: no per-row state fill, so Home reads as one calm system.
   * `archive` — the /work/signals Feed: attention-worthy rows carry DESIGN.md's Operations-event
   * row treatment (warning/7% fill + a 2px warning left rule, the owner-approved side-stripe
   * exception, §Operations event tokens). Home's row treatment is unchanged.
   */
  variant?: 'ambient' | 'archive'
}

/** The ambient column's depth (signed mockup: `const FEED_CAP = 6`). "A feed column that grows
 *  without limit is the wall of text again, just rotated 90 degrees." The archive Feed IS the full
 *  collection, so it is never capped — hiding records there would defeat the surface's whole job. */
export const AMBIENT_CAP = 6

export function SignalFeedRows({
  signals, authorNamesById, teamNamesById, onShareClick, onCategorize, onCreateTask, createTaskHref, onOpen,
  variant = 'ambient',
}: SignalFeedRowsProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const searchable = variant === 'ambient' && !!onShareClick
  // Matching reuses the collection engine's OWN predicate (`signalMatchesText` — body + author +
  // owning Team) rather than a second definition. The engine already owns text search as the `q`
  // query key on the Signal collection; what it cannot do here is scope the filter to the ambient
  // tail alone. Home splits ONE signal read into the attention band (stream band 0) and this FYI
  // tail, so driving the shared `q` would also empty the attention band — searching the quiet feed
  // must not hide what needs you. Hence: engine's matcher, ambient-only scope.
  const ordered = useMemo(() => {
    const all = orderSignalsForFeed([...signals])
    const q = query.trim().toLowerCase()
    if (!searchable || q === '') return all
    const names = {
      authorNamesById: new Map(Object.entries(authorNamesById)),
      teamNamesById: new Map(Object.entries(teamNamesById)),
    }
    return all.filter((s) => signalMatchesText(s, q, names))
  }, [signals, query, searchable, authorNamesById, teamNamesById])
  const filteredEmpty = ordered.length === 0 && query.trim() !== ''
  const capped = variant === 'ambient' ? ordered.slice(0, AMBIENT_CAP) : ordered
  const hidden = ordered.length - capped.length
  // The remainder is a real DOOR, not a bare fact: it carries any active filter through as the
  // collection's own `q` key, so the rows it names are actually where it says they are.
  const moreHref = query.trim() === ''
    ? '/work/signals'
    : `/work/signals?${new URLSearchParams({ q: query.trim() }).toString()}`

  return (
    <div
      className={`home-signal-feed${variant === 'archive' ? ' home-signal-feed--archive' : ''}`}
      data-testid="signal-feed"
    >
      {/* Feed toolbar — the composer entry plus search. Ambient-only (D-D2): on Home (the ambient
          tail) this IS the compose door, since Home has no CollectionToolbar. In the /work/signals
          archive the toolbar hosts the ONE layout-independent Share door, so this would be a SECOND,
          layout-dependent door — omitted there so the archive has exactly one compose door.

          Owner, 2026-07-28: the previous single full-width rounded row READ as a search field and
          behaved as a composer. Shape sets expectation, so the field is now search and creating a
          Signal is a button — the two jobs stop competing for one control. */}
      {variant === 'ambient' && onShareClick ? (
        <div className="home-signal-tools">
          <input
            type="search"
            className="home-signal-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('signals.feed.searchPlaceholder')}
            aria-label={t('signals.feed.searchLabel')}
          />
          {/* Secondary weight on purpose: this is a door in an AMBIENT tail, so it must not
              outrank the overdue work above it. The one action blue stays reserved for the page's
              own primary action (DESIGN.md §5 Buttons — the ONE button hierarchy). */}
          <button type="button" className="btn btn-outline home-signal-add" onClick={onShareClick}>
            {t('signals.feed.addSignal')}
          </button>
        </div>
      ) : null}

      {ordered.length === 0 ? (
        // A filtered-empty is a different state from "no Signals yet": it names the active query and
        // offers a way out, rather than implying the feed is empty (state-kit / clarify.md).
        filteredEmpty ? (
          <EmptyState title={t('signals.feed.noMatches', { query: query.trim() })} nested>
            <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
              {t('signals.feed.clearSearch')}
            </button>
          </EmptyState>
        ) : (
          <EmptyState title={t('signals.feed.empty')} nested />
        )
      ) : (
        <ul className="home-signal-list">
          {capped.map((signal) => {
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
            const taskHref = createTaskHref?.(signal)
            // F3 (OD-REDESIGN-91 #18): the archive row-fill is URGENT ONLY — the amber fill + 2px
            // rule is the "act now" top tier. Needs attention keeps its amber pill on a calm row.
            // The CSS treatment is scoped to `.home-signal-feed--archive`, so tagging the row here
            // is inert on Home and lights up only in the archive Feed.
            const attentionRow = signal.attention === 'Urgent' ? ' home-signal-row--urgent' : ''
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
                  {/* Meta subline: author name · team · time. The author is NAMED, never drawn as
                      an initials disc (owner, 2026-07-28) — in a 300px feed column that disc cost
                      28px of the measure the name itself needs. Each separator is bound into one
                      group with the fact it introduces, so a narrow feed column wraps BETWEEN
                      facts and can never strand a bare "·" on a line of its own. */}
                  <div className="home-signal-meta">
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
                    {teamName && (
                      <span className="home-signal-visible-to">
                        {t('signals.composer.visibleTo', { team: teamName })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="home-signal-tail">
                  <span className={`home-signal-attention home-signal-attention--${attentionSlug(signal.attention)}`}>
                    {attentionLabel(t, signal.attention)}
                  </span>
                  {(onCreateTask || taskHref) && (
                    taskHref ? (
                      <Link to={taskHref} className="btn btn-outline home-signal-create-task">
                        {t('tasks.new')}
                      </Link>
                    ) : (
                      <button type="button" className="btn btn-outline home-signal-create-task" onClick={() => onCreateTask?.(signal)}>
                        {t('tasks.new')}
                      </button>
                    )
                  )}
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

      {hidden > 0 && (
        <Link to={moreHref} className="signal-feed-link signal-feed-link--more tap-floor">
          {t('signals.feed.seeMore', { count: hidden })}
        </Link>
      )}
    </div>
  )
}
