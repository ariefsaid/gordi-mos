import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { CommentThread, type TaskComment } from '@/components/tasks/CommentThread'
import { formatWibDateTime } from '@/lib/wib-time'
import type { PersonOption } from '@/lib/db/directory'
import { attentionSlug, type MentionKind, type SignalCategory, type SignalRow } from '@/lib/db/signals.types'
import { SignalCategoryPicker } from './signal-category-picker'
import './signal-card.css'
import './signal-record.css'

// Signal record surface (Rule 6 anatomy; reuses the record-panel host pattern — mode
// "panel"|"page", OD-63/Rule 4). A presentational renderer: all data (the resolved Signal +
// names + comments + revisions + acknowledgements + linked-work summary) and every mutating
// action arrive as props — the caller (a future drawer/page host) owns fetch/mutate wiring
// (mirrors TaskSurface/RecordFeed's split, kept thin here since there is no Signal-specific tab
// strip). The Signal never gains Status/PIC/Supervisor/due date/resolution (OD-39/D25).

export interface SignalRevisionView {
  id: string
  field: 'body' | 'occurred_at' | 'category' | 'attention'
  old_value: string | null
  new_value: string | null
  created_at: string
  actorName: string
}

export interface SignalMentionView {
  kind: MentionKind
  label: string
}

export interface SignalAcknowledgementView {
  personId: string
  personName: string
}

export interface LinkedTasksSummary {
  total: number
  open: number
}

export interface SignalRecordProps {
  mode: 'panel' | 'page'
  signal: SignalRow
  authorName: string
  teamName: string
  businessUnitName?: string | null
  siteName?: string | null
  mentions: SignalMentionView[]
  shieldLine?: string
  revisions: SignalRevisionView[]
  acknowledgements: SignalAcknowledgementView[]
  hasAcknowledged: boolean
  onAcknowledge?: () => void
  onCategorize?: (category: SignalCategory) => void
  comments: TaskComment[]
  people: PersonOption[]
  canComment: boolean
  onPostComment: (body: string) => Promise<void> | void
  linkedTasksSummary?: LinkedTasksSummary
  onCreateFollowUpTask?: () => void
  onLinkExistingTask?: () => void
}

export function SignalRecord({
  mode, signal, authorName, teamName, businessUnitName, siteName,
  mentions, shieldLine, revisions, acknowledgements, hasAcknowledged, onAcknowledge, onCategorize,
  comments, people, canComment, onPostComment,
  linkedTasksSummary, onCreateFollowUpTask, onLinkExistingTask,
}: SignalRecordProps) {
  const t = useT()
  const [revisionsOpen, setRevisionsOpen] = useState(false)

  if (signal.retracted_at) {
    return (
      <div className="signal-record signal-record--retracted" data-mode={mode} data-signal-id={signal.id}>
        <p className="signal-tombstone">
          {t('signals.retracted')} {signal.retract_reason ? <span>{signal.retract_reason}</span> : null}
        </p>
      </div>
    )
  }

  return (
    <article className="signal-record" data-mode={mode} data-signal-id={signal.id} aria-label={t('signals.record.title')}>
      <header className="signal-record-head">
        <span className="signal-record-author">{authorName}</span>
        <span className="signal-record-team">{teamName}</span>
        {businessUnitName && <span className="signal-record-bu">{businessUnitName}</span>}
        {siteName && <span className="signal-record-site">{siteName}</span>}
        <span className="signal-record-occurred">{formatWibDateTime(signal.occurred_at)}</span>
        <span className={`signal-attention signal-attention--${attentionSlug(signal.attention)}`}>
          {signal.attention}
        </span>
      </header>

      <p className="signal-record-body">{signal.body}</p>

      {mentions.length > 0 && (
        <ul className="signal-record-mentions" aria-label={t('signals.record.mentionsLabel')}>
          {mentions.map((m, i) => (
            <li key={`${m.kind}-${m.label}-${i}`}>@{m.label}</li>
          ))}
        </ul>
      )}

      {shieldLine && <p className="signal-record-vis">{shieldLine}</p>}

      <div className="signal-record-category">
        <SignalCategoryPicker category={signal.category} onCategorize={onCategorize} />
      </div>

      {signal.edited_at && (
        <div className="signal-record-edited">
          <button type="button" onClick={() => setRevisionsOpen((open) => !open)}>
            {t('signals.record.edited')}
          </button>
          {revisionsOpen && (
            <ul className="signal-record-revisions">
              {revisions.map((rev) => (
                <li key={rev.id}>
                  <span>{rev.actorName}</span>
                  <span>{rev.field}</span>
                  <span>{rev.old_value}</span>
                  <span>{rev.new_value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="signal-record-ack" aria-label={t('signals.record.acknowledgeLabel')}>
        <Button
          variant={hasAcknowledged ? 'ghost' : 'outline'}
          disabled={hasAcknowledged || !onAcknowledge}
          onClick={onAcknowledge}
        >
          {hasAcknowledged ? t('signals.record.acknowledged') : t('signals.record.acknowledge')}
        </Button>
        {acknowledgements.length > 0 && (
          <ul className="signal-ack-list">
            {acknowledgements.map((ack) => (
              <li key={ack.personId} className="signal-ack-name">{ack.personName}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="signal-record-linked-work" aria-label={t('signals.record.linkedWorkLabel')}>
        <h2>{t('signals.record.linkedWorkLabel')}</h2>
        {linkedTasksSummary && (
          <p>{t('signals.record.linkedWorkSummary', { total: linkedTasksSummary.total, open: linkedTasksSummary.open })}</p>
        )}
        <div className="signal-record-linked-work-actions">
          {onCreateFollowUpTask && (
            <Button variant="outline" onClick={onCreateFollowUpTask}>{t('signals.record.createFollowUpTask')}</Button>
          )}
          {onLinkExistingTask && (
            <Button variant="ghost" onClick={onLinkExistingTask}>{t('signals.record.linkExistingTask')}</Button>
          )}
        </div>
      </section>

      <CommentThread comments={comments} people={people} canPost={canComment} onPost={onPostComment} />
    </article>
  )
}
