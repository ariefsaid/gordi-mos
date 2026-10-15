import { SearchField } from '@/components/ui/search-field'
import { StatusBadge, ATTENTION_STATUS_KEY } from '@/components/ui/status-badge'
import { useMemo } from 'react'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, FilteredEmptyIcon } from '@/components/ui/state-kit'
import { formatWibWeekdayTime } from '@/lib/format/date'
import { orderSignalsForFeed } from '@/lib/db/signals'
import { type SignalRow } from '@/lib/db/signals.types'
import { signalMatchesText } from './signal-collection-adapter'
import { signalCategoryLabel } from './signal-labels'
import { SignalPhotoStrip } from './signal-photos'
import { useSignalPhotos } from './use-signal-photos'
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
  onOpen?: (signal: SignalRow) => void
  /** Home members can keep the feed toolbar to the Share door only. */
  showSearch?: boolean
  /**
   * `ambient` (default) — the Home tail: no per-row state fill, so Home reads as one calm system.
   * `archive` — the /work/signals Feed: attention-worthy rows carry DESIGN.md's Operations-event
   * row treatment (warning/7% fill + a 2px warning left rule, the owner-approved side-stripe
   * exception, §Operations event tokens). Home's row treatment is unchanged.
   */
  variant?: 'ambient' | 'archive'
  ambientLimit?: number
  /** Exact count of readable, active Signals; null means the archive remainder is unknown. */
  totalCount?: number | null
  /** Home's embedded empty state uses a compact row; the collection page keeps the full state. */
  compactEmpty?: boolean
}

/** The ambient column's depth (signed mockup: `const FEED_CAP = 6`). "A feed column that grows
 *  without limit is the wall of text again, just rotated 90 degrees." The archive Feed IS the full
 *  collection, so it is never capped — hiding records there would defeat the surface's whole job. */
export const AMBIENT_CAP = 6

export function SignalFeedRows({
  signals, authorNamesById, teamNamesById, onOpen,
  showSearch = true,
  variant = 'ambient', ambientLimit = AMBIENT_CAP, totalCount = null, compactEmpty = false,
}: SignalFeedRowsProps) {
  const t = useT()
  // Home's Signals search lives in the URL (?feedq=) so reload and Back keep it (NV4). The archive variant has no search.
  const [rawQuery, setQuery] = useSearchParamState('feedq')
  const query = variant === 'ambient' ? rawQuery : ''
  const searchable = variant === 'ambient' && showSearch
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
  const capped = variant === 'ambient' ? ordered.slice(0, ambientLimit) : ordered
  const exactRemainder = variant === 'ambient' && query.trim() === '' && totalCount !== null
    ? Math.max(0, totalCount - capped.length)
    : null
  const hidden = exactRemainder ?? ordered.length - capped.length
  const moreLabel = exactRemainder === null
    ? t('signals.feed.seeMoreUncounted')
    : t('signals.feed.seeMore', { count: exactRemainder })
  const photosBySignal = useSignalPhotos(capped.filter((signal) => !signal.retracted_at).map((signal) => signal.id))
  // The door carries active queries to the archive. Only an unfiltered Home feed with an exact
  // total gets a number; loaded-page or query remainders can understate the full archive.
  const moreHref = query.trim() === ''
    ? '/work/signals'
    : `/work/signals?${new URLSearchParams({ q: query.trim() }).toString()}`

  return (
    <div
      className={`home-signal-feed${variant === 'archive' ? ' home-signal-feed--archive' : ''}`}
      data-testid="signal-feed"
    >
      {/* Feed search — ambient-only (cockpit Home). The compose door is the Home page head's one
          "Share signal" button; the /work/signals archive hosts its own. No second door here. */}
      {variant === 'ambient' && showSearch ? (
        <div className="home-signal-tools">
          <SearchField
            className="home-signal-search-field"
            label={t('signals.feed.searchLabel')}
            placeholder={t('signals.feed.searchPlaceholder')}
            value={query}
            onChange={setQuery}
          />
        </div>
      ) : null}

      {ordered.length === 0 ? (
        // A filtered-empty is a different state from "no Signals yet": it names the active query and
        // offers a way out, rather than implying the feed is empty (state-kit / clarify.md).
        filteredEmpty ? (
          <EmptyState
            variant="blank"
            icon={<FilteredEmptyIcon />}
            title={t('signals.feed.noMatchesTitle')}
            copy={t('signals.feed.noMatches', { query: query.trim() })}
            nested
          >
            <button type="button" className="btn btn-outline" onClick={() => setQuery('')}>
              {t('signals.feed.clearSearch')}
            </button>
          </EmptyState>
        ) : (
          <EmptyState
            title={t(compactEmpty ? 'signals.feed.emptyHome' : 'signals.feed.empty')}
            nested
            className={compactEmpty ? 'stream-all-clear' : undefined}
          >
            {compactEmpty && (
              <Link to="/work/signals" className="signal-feed-link tap-floor">
                {t('signals.feed.openArchive')}
              </Link>
            )}
          </EmptyState>
        )
      ) : (
        <ul className="home-signal-list">
          {capped.map((signal) => {
            if (signal.retracted_at) {
              return (
                <li key={signal.id}>
                  <div className="home-signal-row home-signal-row--retracted" data-signal-id={signal.id}>
                  <p className="home-signal-tombstone">
                    {t('signals.retracted')} {signal.retract_reason ? <span>{signal.retract_reason}</span> : null}
                  </p>
                  </div>
                </li>
              )
            }
            const authorName = authorNamesById[signal.author_id] ?? t('signals.card.unknownAuthor')
            const teamName = signal.owning_team_id ? (teamNamesById[signal.owning_team_id] ?? '') : ''
            const categoryLabel = signal.category ? signalCategoryLabel(t, signal.category) : null
            // F3 (OD-REDESIGN-91 #18): the archive row-fill is URGENT ONLY — the amber fill + 2px
            // rule is the "act now" top tier. Needs attention keeps its amber pill on a calm row.
            // The CSS treatment is scoped to `.home-signal-feed--archive`, so tagging the row here
            // is inert on Home and lights up only in the archive Feed.
            const attentionRow = signal.attention === 'Urgent' ? ' home-signal-row--urgent' : ''
            // Both collection and ambient rows are one record activation target. The row keeps its
            // canonical data attribute and accessible name; no action button is nested inside it.
            const openRow = onOpen ? ' home-signal-row--open' : ''
            return (
              <li key={signal.id}>
                <div
                className={`home-signal-row${attentionRow}${openRow}`}
                data-signal-id={signal.id}
                {...(onOpen ? {
                  role: 'button',
                  tabIndex: 0,
                  // The row derives its accessible name from its visible content, keeping both names aligned.
                  onClick: () => onOpen(signal),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpen(signal)
                    }
                  },
                } : {})}
              >
                <div className="home-signal-main">
                  {variant === 'archive' ? <time className="home-signal-date" dateTime={signal.occurred_at}>{formatWibWeekdayTime(signal.occurred_at)}</time> : null}
                  {/* Body = the row title. The parent row owns activation in both variants. */}
                  <span className="home-signal-body">
                    <span className="home-signal-body-text">{signal.body}</span>
                  </span>
                  <SignalPhotoStrip photos={photosBySignal[signal.id]} />
                  {/* Meta subline: author · Team · time · category-when-set — PLAIN TEXT in BOTH
                      variants (P1, #770: never bordered chips, never a visibility sentence; Home
                      and the archive render the same component and a difference between them is a
                      defect — AC-026 pins that byte-exactly). The author is NAMED, never drawn as
                      an initials disc (owner, 2026-07-28) — in a 300px feed column that disc cost
                      28px of the measure the name itself needs. Each separator is bound into one
                      group with the fact it introduces, so a narrow feed column wraps BETWEEN
                      facts and can never strand a bare "·" on a line of its own. */}
                  <div className="home-signal-meta">
                    <span className="home-signal-who-name" title={authorName}>{authorName}</span>
                    {teamName && (
                      <span className="home-signal-meta-item">
                        <span className="home-signal-sep" aria-hidden="true">·</span>
                        <span className="home-signal-meta-fact" title={teamName}>{teamName}</span>
                      </span>
                    )}
                    {variant !== 'archive' ? <span className="home-signal-meta-item">
                      <span className="home-signal-sep" aria-hidden="true">·</span>
                      <span className="home-signal-meta-fact">{formatWibWeekdayTime(signal.occurred_at)}</span>
                    </span> : null}
                    {categoryLabel && (
                      <span className="home-signal-meta-item">
                        <span className="home-signal-sep" aria-hidden="true">·</span>
                        <span className="home-signal-meta-fact" title={categoryLabel}>{categoryLabel}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="home-signal-tail">
                  <StatusBadge status={ATTENTION_STATUS_KEY[signal.attention]} />
                </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hidden > 0 && (
        <Link to={moreHref} className="signal-feed-link signal-feed-link--more tap-floor">
          {moreLabel}
        </Link>
      )}
    </div>
  )
}
