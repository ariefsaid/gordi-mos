import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { CommentThread, type TaskComment } from '@/components/tasks/CommentThread'
import type { PersonOption } from '@/lib/db/directory'
import type { MentionKind, SignalCategory, SignalRow } from '@/lib/db/signals.types'
import { SignalCategoryPicker } from './signal-category-picker'
import './signal-card.css'
import './signal-record.css'

// Signal record surface (Rule 6 anatomy; reuses the record-panel host pattern — mode
// "panel"|"page", OD-63/Rule 4). A presentational renderer: all data (the resolved Signal +
// names + comments + revisions + acknowledgements + linked-work summary) and every mutating
// action arrive as props — the caller (a future drawer/page host) owns fetch/mutate wiring
// (mirrors TaskSurface/RecordFeed's split, kept thin here since there is no Signal-specific tab
// strip). The Signal never gains Status/PIC/Supervisor/due date/resolution (OD-39/D25).
//
// P1-3 (anatomy parity, docs/reviews): identity (author/team/site/occurred/attention) and the
// full body prose moved OUT to the shared RecordViewer identity + Facts metadata + body content
// slot (signal-record-adapter.tsx wrapSignalRecord) — the SAME grammar Task's record uses. This
// component now renders only the typed Signal WORKFLOW that grammar has no generic slot for:
// mentions, the shield line, category correction (the shared 8-family picker, unchanged — Rule
// 11, the same widget feed rows/cards use), the revision-history disclosure, the "who's
// acknowledged" roster (the Acknowledge ACTION itself now lives in RecordViewer's shared actions
// footer, matching Task's Mark-complete/Archive placement), linked-work actions, and comments.

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
  mentions: SignalMentionView[]
  shieldLine?: string
  revisions: SignalRevisionView[]
  acknowledgements: SignalAcknowledgementView[]
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
  mode, signal,
  mentions, shieldLine, revisions, acknowledgements, onCategorize,
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

      {/* P1-3: the Acknowledge ACTION moved to RecordViewer's shared actions footer (matching
          Task's Mark-complete/Archive placement) — this stays the "who's acknowledged" roster
          only, a live list rather than a one-shot action, so it renders just like Mentions above
          (nothing when nobody has acknowledged yet). */}
      {acknowledgements.length > 0 && (
        <section className="signal-record-ack" aria-label={t('signals.record.acknowledgeLabel')}>
          <ul className="signal-ack-list">
            {acknowledgements.map((ack) => (
              <li key={ack.personId} className="signal-ack-name">{ack.personName}</li>
            ))}
          </ul>
        </section>
      )}

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
