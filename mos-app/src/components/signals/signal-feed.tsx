import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'
import { orderSignalsForFeed } from '@/lib/db/signals'
import type { SignalCategory, SignalRow } from '@/lib/db/signals.types'
import { SignalCard } from './signal-card'
import './signal-feed.css'

// Home ambient feed (Q1, OD-59, provisional — RATIFY-7): the region below the (Step-5) attention
// brief. Renders the "Share a Signal" composer-entry row, then Signal cards the viewer can read,
// newest-first with Urgent/Needs-attention weighted above FYI (FR-414). Every card drills to the
// Signal's canonical record via onOpen.

export interface SignalFeedProps {
  signals: SignalRow[]
  authorNamesById: Record<string, string>
  teamNamesById: Record<string, string>
  siteNamesByTeamId?: Record<string, string>
  onShareClick?: () => void
  onCategorize?: (signalId: string, category: SignalCategory) => void
  onCreateTask?: (signalId: string) => void
  onOpen?: (signalId: string) => void
}

export function SignalFeed({
  signals, authorNamesById, teamNamesById, siteNamesByTeamId = {},
  onShareClick, onCategorize, onCreateTask, onOpen,
}: SignalFeedProps) {
  const t = useT()
  const ordered = orderSignalsForFeed(signals)

  return (
    <div className="signal-feed" data-testid="signal-feed">
      <button type="button" className="signal-feed-share-row" onClick={onShareClick}>
        {t('signals.feed.shareRow')}
      </button>

      {ordered.length === 0 ? (
        <EmptyState title={t('signals.feed.empty')} />
      ) : (
        ordered.map((signal) => (
          <SignalCard
            key={signal.id}
            signal={signal}
            authorName={authorNamesById[signal.author_id] ?? t('signals.card.unknownAuthor')}
            teamName={teamNamesById[signal.owning_team_id] ?? ''}
            siteName={siteNamesByTeamId[signal.owning_team_id]}
            onCategorize={onCategorize ? (category) => onCategorize(signal.id, category) : undefined}
            onCreateTask={onCreateTask ? () => onCreateTask(signal.id) : undefined}
            onOpen={onOpen ? () => onOpen(signal.id) : undefined}
          />
        ))
      )}
    </div>
  )
}
