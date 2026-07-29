import { useId, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { correctSignal } from '@/lib/db/signals'
import { wibToday } from '@/lib/home-attention'
import type { SignalRow } from '@/lib/db/signals.types'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { OverlayHostSlot, useOptionalOverlayHost } from '@/shell/overlay-host'
import { useT } from '@/i18n/use-t'
import { ErrorState } from '@/components/ui/state-kit'
import { SignalRecordHost } from './signal-record-host'
import { SignalFeedRows } from './signal-feed-rows'
import './signal-feed-section.css'

// C3b (AC-426/FR-414): the Home ambient feed slot — the FYI-only tail of the Signals split
// (OD-84.1 / Luna P0-1: attention-worthy Signals lead the stream as band 0; FYI stay ambient here).
// Presentational: HomePage owns the ONE shared signal read (FR-V3-013 — no second Signal loader) and
// passes the FYI signals + resolved author/Team names + a reload callback down. A FAILED read renders
// the state-kit ErrorState + Retry (DIV-G5: the old quiet degradation showed "No Signals yet" on a
// load failure — a false all-clear). Task creation remains on the focused Signal record where the real
// follow-up Task flow lives; this card advertises no dead action.

export interface SignalFeedSectionProps {
  /** The ambient (FYI) Signals — the attention-worthy split already leads the stream. */
  signals: readonly SignalRow[]
  /** Author id → display name, from the shared feed's resolved context. */
  authorNamesById: ReadonlyMap<string, string>
  /** Team id → display name, from the shared feed's resolved context. */
  teamNamesById: ReadonlyMap<string, string>
  /** The shared read's initial-load state — Home's own skeleton regions cover it (NFR-405). */
  loading?: boolean
  /** The shared read failed — render ErrorState + Retry, never an empty-looking all-clear (DIV-G5). */
  error?: boolean
  /** Re-run the shared signal read (after a categorize correction, a Share elsewhere, or Retry). */
  onReload?: () => void
}

function namesToRecord(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(map)
}

export function SignalFeedSection({
  signals, authorNamesById, teamNamesById, loading = false, error = false, onReload,
}: SignalFeedSectionProps) {
  const navigate = useNavigate()
  const host = useOptionalOverlayHost()
  const { open: openSignalComposer } = useSignalComposer()
  const t = useT()
  const titleId = useId()
  // "N today" counts the Signals that actually OCCURRED today in WIB — not the feed's depth, which
  // reaches further back. Reuses the app's one WIB day helper on each item's own instant.
  const todayCount = useMemo(() => {
    const today = wibToday()
    return signals.filter((s) => wibToday(new Date(s.occurred_at)) === today).length
  }, [signals])

  function openRecord(signalId: string) {
    if (host) {
      const entry = {
        key: `signal:${signalId}`,
        owner: 'signals' as const,
        tenant: 'record' as const,
        label: 'Signal',
        title: 'Signal',
        pageTo: `/work/signals/${signalId}`,
        content: <SignalRecordHost signalId={signalId} mode="panel" />,
      }
      void host.openRoot(entry, 'route')
      return
    }
    navigate(`/work/signals?record=${signalId}`)
  }

  async function handleCategorize(signalId: string, category: SignalRow['category']) {
    if (!category) return
    await correctSignal(signalId, { category })
    onReload?.()
  }

  if (loading) return null // Home's own skeleton regions cover initial paint (NFR-405)

  return (
    <section className="signal-feed-section" aria-labelledby={titleId}>
      {/* Peer section-label grammar (F1/F5, Nielsen H4 consistency): same small-caps muted label
          + right-aligned link as the stream's OVERDUE / MY WORK TODAY bands — Signals is a peer
          section in the one scroll, not a bolted-on card with its own heading weight. */}
      <div className="signal-feed-head">
        {/* The column is named "Signals" — the word the layout picker's help, the destination link
            and the record type all already use. It was titled "Recent" (F15 / OD-REDESIGN-91 #27),
            whose stated reason was avoiding an attention-level collision with the ranked stream;
            under FR-928 this feed is the ONLY home for Signals (Urgent included), so that collision
            no longer exists — and the head said RECENT while the link beside it said "Signals →":
            three names for one column in one viewport. Head layout follows the signed mockup's
            `.feed-head`: the name, and an honest `N today` count where the link used to sit. The
            way through now hangs off the capped list below, next to the remainder it explains. */}
        {/* h2, matching its peer sections: this renders only on Home, where PageFamilyFrame owns
            the sole h1 and there is no intermediate level — an h3 skipped one (detector:
            skipped-heading). Visual weight is unchanged; `.signal-feed-label` still sets it. */}
        <h2 id={titleId} className="signal-feed-label">{t('signals.feed.title')}</h2>
        {/* Absent, never "0 today", when the read failed — the same rule the work regions follow
            (DIV-G5): a count the viewer cannot trace is worse than no count. */}
        {!error && (
          <span className="signal-feed-count">{t('signals.feed.todayCount', { count: todayCount })}</span>
        )}
      </div>
      {error ? (
        // The error/retry branch every engine collection has (DIV-G5): a failed load must never
        // read as "No Signals yet".
        <ErrorState message={t('signals.feed.error')} onRetry={onReload} retryLabel={t('signals.feed.retry')} />
      ) : (
        <SignalFeedRows
          signals={signals}
          authorNamesById={namesToRecord(authorNamesById)}
          teamNamesById={namesToRecord(teamNamesById)}
          onShareClick={openSignalComposer}
          onCategorize={(signalId, category) => { void handleCategorize(signalId, category) }}
          onOpen={(signal) => openRecord(signal.id)}
        />
      )}
      {host ? <OverlayHostSlot owner="signals" /> : null}
    </section>
  )
}
