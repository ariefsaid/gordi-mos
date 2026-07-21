import { useT } from '@/i18n/use-t'
import { formatWibDateTime } from '@/lib/wib-time'
import { attentionSlug, type SignalCategory, type SignalRow } from '@/lib/db/signals.types'
import { SignalCategoryPicker } from './signal-category-picker'
import './signal-card.css'

// Posted Signal card (PORT convergence `sigCard` — Rule 11). FB grammar: avatar+name+occurred-at+
// attention pill; body; Site/time meta; the visibility/shield line; and "Add category" (until set).
// Task creation belongs to the focused Signal record, not this ambient card. A retracted Signal
// renders only the tombstone + reason (D31) — no body, no actions.

export interface SignalCardProps {
  signal: SignalRow
  authorName: string
  teamName: string
  siteName?: string | null
  shieldLine?: string
  onCategorize?: (category: SignalCategory) => void
  onOpen?: () => void
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function SignalCard({
  signal, authorName, teamName, siteName, shieldLine, onCategorize, onOpen,
}: SignalCardProps) {
  const t = useT()

  if (signal.retracted_at) {
    return (
      <div className="signal-card signal-card--retracted" data-signal-id={signal.id}>
        <p className="signal-tombstone">
          {t('signals.retracted')} {signal.retract_reason ? <span>{signal.retract_reason}</span> : null}
        </p>
      </div>
    )
  }

  return (
    <div className="signal-card" data-signal-id={signal.id}>
      <div className="signal-head">
        <span className="signal-avatar" aria-hidden="true">{initials(authorName)}</span>
        <span className="signal-who">{authorName}</span>
        <span className="signal-when">{formatWibDateTime(signal.occurred_at)}</span>
        <span className={`signal-attention signal-attention--${attentionSlug(signal.attention)}`}>
          {signal.attention}
        </span>
      </div>

      <div className="signal-body">
        {onOpen ? (
          <button type="button" className="signal-body-link" onClick={onOpen}>{signal.body}</button>
        ) : (
          signal.body
        )}
      </div>

      <div className="signal-meta">
        {siteName && <span className="signal-meta-pill">{siteName}</span>}
        <span className="signal-meta-pill">{teamName}</span>
      </div>

      {shieldLine && <div className="signal-vis">{shieldLine}</div>}

      <div className="signal-actions">
        <SignalCategoryPicker category={signal.category} onCategorize={onCategorize} />
      </div>
    </div>
  )
}
