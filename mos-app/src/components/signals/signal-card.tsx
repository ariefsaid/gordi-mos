import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { SIGNAL_CATEGORIES, type SignalCategory, type SignalRow } from '@/lib/db/signals.types'

// Posted Signal card (PORT convergence `sigCard` — Rule 11). FB grammar: avatar+name+occurred-at+
// attention pill; body; Site/time meta; the visibility/shield line; "Add category" (until set); and
// "Create Task" — the follow-up bridge lives on the card, NOT the composer (D25/OD-39). A retracted
// Signal renders only the tombstone + reason (D31) — no body, no actions.

export interface SignalCardProps {
  signal: SignalRow
  authorName: string
  teamName: string
  siteName?: string | null
  shieldLine?: string
  onCategorize?: (category: SignalCategory) => void
  onCreateTask?: () => void
  onOpen?: () => void
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function SignalCard({
  signal, authorName, teamName, siteName, shieldLine, onCategorize, onCreateTask, onOpen,
}: SignalCardProps) {
  const t = useT()
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)

  if (signal.retracted_at) {
    return (
      <div className="signal-card signal-card--retracted" data-signal-id={signal.id}>
        <p className="signal-tombstone">
          {t('signals.retracted')} {signal.retract_reason ? <span>{signal.retract_reason}</span> : null}
        </p>
      </div>
    )
  }

  function pickCategory(category: SignalCategory) {
    onCategorize?.(category)
    setCategoryPickerOpen(false)
  }

  return (
    <div className="signal-card" data-signal-id={signal.id}>
      <div className="signal-head">
        <span className="signal-avatar" aria-hidden="true">{initials(authorName)}</span>
        <span className="signal-who">{authorName}</span>
        <span className="signal-when">{signal.occurred_at}</span>
        <span className={`signal-attention signal-attention--${signal.attention.replace(/\s+/g, '-').toLowerCase()}`}>
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
        {signal.category ? (
          <span className="signal-category-pill">{signal.category}</span>
        ) : (
          <Button variant="ghost" onClick={() => setCategoryPickerOpen((open) => !open)}>
            {t('signals.record.addCategory')}
          </Button>
        )}
        <span className="signal-actions-spacer" />
        {onCreateTask && (
          <Button variant="outline" onClick={onCreateTask}>
            {t('signals.record.createTask')}
          </Button>
        )}
      </div>

      {categoryPickerOpen && (
        <div role="listbox" aria-label={t('signals.record.categoryPickerLabel')} className="signal-category-picker">
          {SIGNAL_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              role="option"
              aria-selected={signal.category === category}
              className="signal-category-option"
              onClick={() => pickCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
