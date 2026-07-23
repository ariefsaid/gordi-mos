import { useState, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { CommentThread, type TaskComment } from '@/components/tasks/CommentThread'
import type { PersonOption } from '@/lib/db/directory'
import { attentionSlug, type Attention, type MentionKind, type SignalCategory } from '@/lib/db/signals.types'
import { SignalCategoryPicker } from './signal-category-picker'
import './signal-card.css'
import './signal-record.css'

// Signal record — JTBD anatomy (docs/specs/record-page-anatomy.spec.md §2.1, OD-REDESIGN-90;
// visual reference: scratchpad ds-bundle/mockups/signal-record-anatomy.html). The record reads
// top-to-bottom as the reader's job sequence:
//   Message → Reach & response → Discussion → Facts (provenance) → History (audit).
// Each region is a small presentational component fed by props; the host (signal-record-host.tsx)
// wires data + handlers and the adapter (wrapSignalRecord) orders them into the shared
// RecordViewer's content slots (identity stays region 0). A Signal never gains Status/PIC/
// Supervisor/due/resolution (jtbd A1/A2, OD-REDESIGN-45): it is a fact, not work.

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

// ── Region 1 · Message — read what happened ────────────────────────────────────
// The Signal body IS the record: full, unclipped prose (the identity h1 above carries the first
// line; the full body always renders here so the heading is never an ellipsized slice — F2). The
// attention level + occurred time ride WITH it (LAW-2), never hoisted to a downstream facts block.
export function SignalMessage({
  body, attention, occurredLabel, retracted, retractReason,
}: {
  body: string
  attention: Attention
  occurredLabel: string
  retracted?: boolean
  retractReason?: string | null
}) {
  const t = useT()
  if (retracted) {
    return (
      <p className="signal-tombstone">
        {t('signals.retracted')} {retractReason ? <span>{retractReason}</span> : null}
      </p>
    )
  }
  return (
    <div className="signal-message">
      <div className="signal-message-urgency">
        <span className={`signal-attention signal-attention--${attentionSlug(attention)}`}>{attention}</span>
        <span className="signal-message-occurred">{t('signals.record.occurredAt', { when: occurredLabel })}</span>
      </div>
      <p className="signal-message-body">{body}</p>
    </div>
  )
}

// ── Region 2 · Reach & response — know the audience, take the one factual response ─────────────
// Mentions + visibility line, the ONE action register (LAW-3): Acknowledge + linked-work verbs —
// no Status/resolve/close (a Signal is a fact). The "who's acknowledged" roster + linked summary
// (only when linked work exists — the empty "0 Tasks · 0 open" line was noise, LAW-5).
export function SignalReach({
  mentions, shieldLine,
  canAcknowledge, hasAcknowledged, onAcknowledge,
  acknowledgements, linkedTasksSummary,
  onCreateFollowUpTask, onLinkExistingTask, actionForms,
}: {
  mentions: SignalMentionView[]
  shieldLine?: string
  canAcknowledge: boolean
  hasAcknowledged: boolean
  onAcknowledge?: () => void
  acknowledgements: SignalAcknowledgementView[]
  linkedTasksSummary?: LinkedTasksSummary
  onCreateFollowUpTask?: () => void
  onLinkExistingTask?: () => void
  actionForms?: ReactNode
}) {
  const t = useT()
  const hasLinked = linkedTasksSummary && linkedTasksSummary.total > 0
  return (
    <section className="signal-region signal-reach" data-signal-region="reach">
      <h2 className="signal-region-title">{t('signals.record.region.reach')}</h2>

      {(mentions.length > 0 || shieldLine) && (
        <div className="signal-reach-audience">
          {mentions.length > 0 && (
            <ul className="signal-record-mentions" aria-label={t('signals.record.mentionsLabel')}>
              {mentions.map((m, i) => (
                <li key={`${m.kind}-${m.label}-${i}`}>@{m.label}</li>
              ))}
            </ul>
          )}
          {shieldLine && <p className="signal-record-vis">{shieldLine}</p>}
        </div>
      )}

      {/* The one action register — Acknowledge (factual response) + linked-work verbs. */}
      <div className="signal-reach-actions" data-signal-actions="true">
        {onCreateFollowUpTask && (
          <Button variant="primary" onClick={onCreateFollowUpTask}>{t('signals.record.createFollowUpTask')}</Button>
        )}
        {onLinkExistingTask && (
          <Button variant="outline" onClick={onLinkExistingTask}>{t('signals.record.linkExistingTask')}</Button>
        )}
        {canAcknowledge && (
          <Button variant="outline" disabled={hasAcknowledged} onClick={() => onAcknowledge?.()}>
            {hasAcknowledged ? t('signals.record.acknowledged') : t('signals.record.acknowledge')}
          </Button>
        )}
      </div>

      {actionForms}

      {hasLinked && (
        <p className="signal-reach-linked">
          {t('signals.record.linkedWorkSummary', { total: linkedTasksSummary!.total, open: linkedTasksSummary!.open })}
        </p>
      )}

      {acknowledgements.length > 0 && (
        <div className="signal-reach-ack" aria-label={t('signals.record.acknowledgeLabel')}>
          <span className="signal-reach-ack-label">{t('signals.record.acknowledgedBy')}</span>
          <ul className="signal-ack-list">
            {acknowledgements.map((ack) => (
              <li key={ack.personId} className="signal-ack-name">{ack.personName}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Region 3 · Discussion — discuss without turning fact into work ─────────────────────────────
export function SignalDiscussion({
  comments, people, canComment, onPostComment,
}: {
  comments: TaskComment[]
  people: PersonOption[]
  canComment: boolean
  onPostComment: (body: string) => Promise<void> | void
}) {
  const t = useT()
  return (
    <section className="signal-region signal-discussion" data-signal-region="discussion">
      <h2 className="signal-region-title">{t('signals.record.region.discussion')}</h2>
      <CommentThread comments={comments} people={people} canPost={canComment} onPost={onPostComment} heading="srOnly" />
    </section>
  )
}

// ── Region 4 · Facts (provenance) — verify who/where/when when needed ───────────────────────────
// Quiet, compact, near the end. NO per-field "fixed after posting" caption on every row (LAW-6):
// ONE whole-section note. Category renders here as its value + the correct affordance.
export function SignalFacts({
  authorName, teamName, businessUnitName, siteName,
  category, onCategorize,
}: {
  authorName: string
  teamName: string
  businessUnitName: string | null
  siteName: string | null
  category: SignalCategory | null
  onCategorize?: (category: SignalCategory) => void
}) {
  const t = useT()
  const rows: { label: string; value: ReactNode }[] = [
    { label: t('signals.record.reportedBy'), value: authorName },
    { label: t('signals.record.owningTeam'), value: teamName },
    ...(businessUnitName ? [{ label: t('signals.record.businessUnit'), value: businessUnitName }] : []),
    ...(siteName ? [{ label: t('signals.record.site'), value: siteName }] : []),
  ]
  return (
    <section className="signal-region" data-signal-region="facts">
      <h2 className="signal-region-title">{t('signals.record.region.facts')}</h2>
      <dl className="signal-facts">
        {rows.map((r) => (
          <div key={r.label} className="signal-facts-row">
            <dt className="signal-facts-label">{r.label}</dt>
            <dd className="signal-facts-value">{r.value}</dd>
          </div>
        ))}
        <div className="signal-facts-row">
          <dt className="signal-facts-label">{t('signals.record.category')}</dt>
          <dd className="signal-facts-value signal-facts-value--category">
            <SignalCategoryPicker category={category} onCategorize={onCategorize} />
          </dd>
        </div>
      </dl>
      {/* ONE quiet provenance note — replaces the per-field "fixed after posting" captions (LAW-6). */}
      <p className="signal-facts-note">{t('signals.record.factsNote')}</p>
    </section>
  )
}

// ── Region 5 · History (audit) — honest revision history, quiet, disclosed ──────────────────────
// "Edited N times" is a disclosure entry point → a human-readable summary. The old→new values
// render as readable prose ONLY behind the disclosure (never in the default view — F4/LAW-5), and
// the revision list renders in exactly ONE region.
export function SignalHistory({
  edited, revisions,
}: {
  edited: boolean
  revisions: SignalRevisionView[]
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!edited || revisions.length === 0) return null
  return (
    <section className="signal-region signal-history" data-signal-region="history">
      <h2 className="signal-region-title">{t('signals.record.region.history')}</h2>
      <button
        type="button"
        className="signal-history-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t(revisions.length === 1 ? 'signals.record.editedOnce' : 'signals.record.editedTimes', { count: revisions.length })}
      </button>
      {open && (
        <ul className="signal-history-list">
          {revisions.map((rev) => (
            <li key={rev.id} className="signal-history-item">
              <span className="signal-history-who">{rev.actorName}</span>{' '}
              <span className="signal-history-what">
                {t('signals.record.revisionSummary', { field: t(`signals.record.field.${rev.field}`) })}
              </span>
              {(rev.old_value !== null || rev.new_value !== null) && (
                <div className="signal-history-diff">
                  {t('signals.record.revisionDiff', { from: rev.old_value ?? '—', to: rev.new_value ?? '—' })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
