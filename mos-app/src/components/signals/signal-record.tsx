import { StatusBadge, ATTENTION_STATUS_KEY } from '@/components/ui/status-badge'
import { ArrowRightIcon } from '@/shell/icons'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link as RouterLink } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { RecordMenu, type RecordMenuItem } from '@/components/record/record-menu'
import { usePhoneActionBar } from '@/shell/page-action-bar'
import { CommentThread, type TaskComment } from '@/components/tasks/CommentThread'
import type { PersonOption } from '@/lib/db/directory'
import { type Attention, type MentionKind, type SignalCategory } from '@/lib/db/signals.types'
import { SignalCategoryPicker } from './signal-category-picker'
import { SignalAttentionPicker } from './signal-attention-picker'
import { SignalRecordPhotos } from './signal-photos'
import './signal-card.css'
import './signal-record.css'
import { useIsOffline } from '@/shell/use-is-offline'
import { OfflineNotice } from '@/components/ui/offline-notice'

// Signal record — JTBD anatomy (docs/specs/record-page-anatomy.spec.md §2.1, OD-REDESIGN-90;
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

export interface LinkedTaskView {
  id: string
  title: string
  status: string
  href?: string
  onOpen?: () => void
}

// ── Message — read what happened ───────────────────────────────────────────────────────────────
// The Signal body continues here after the record heading (which owns the first line); a retracted
// Signal keeps its original line in the tombstone. The attention level and occurred time sit in
// the record header, not here.
export function SignalMessage({
  signalId, body, retracted, retractReason, retractedBy, retractedAtLabel, onRepost,
}: {
  signalId?: string
  body: string
  onRepost?: () => void
  retracted?: boolean
  retractReason?: string | null
  retractedBy?: string | null
  retractedAtLabel?: string | null
}) {
  const t = useT()
  const lines = body.trim().split(/\r?\n/)
  const titleLine = lines[0] ?? ''
  const displayBody = body.trim()
  if (retracted) {
    return (
      <div className="signal-tombstone">
        <p className="signal-tombstone-original">{titleLine}</p>
        <p className="signal-tombstone-status">{t('signals.retracted')}</p>
        <dl className="signal-tombstone-meta">
          <div><dt>{t('signals.record.retractedBy')}</dt><dd>{retractedBy ?? t('signals.record.retractorUnknown')}</dd></div>
          {retractedAtLabel ? <div><dt>{t('signals.record.retractedAt')}</dt><dd>{retractedAtLabel}</dd></div> : null}
          {retractReason ? <div><dt>{t('signals.record.retractedReason')}</dt><dd>{retractReason}</dd></div> : null}
        </dl>
        {onRepost && <Button variant="primary" onClick={onRepost}>{t('signals.record.repost')}</Button>}
      </div>
    )
  }
  return (
    <div className="signal-message">
      {displayBody ? <p className="signal-message-body">{displayBody}</p> : null}
      {signalId ? <SignalRecordPhotos signalId={signalId} /> : null}
    </div>
  )
}

/** The record header: the whole first line as the heading, the attention level and when it happened
 *  as facts, one primary action top-right (on a phone it rides the sticky bar), and the ⋯ menu. */
export function SignalRecordHeader({
  title, headingLevel, attention, onAttentionChange, occurredLabel, primary, menu, menuLabel, factsLabel,
}: {
  title: string
  headingLevel: 1 | 2
  attention: Attention | null
  onAttentionChange?: (attention: Attention) => void
  occurredLabel: string
  primary?: { label: string; onClick: () => void; disabled?: boolean }
  menu: readonly RecordMenuItem[]
  menuLabel: string
  factsLabel: string
}) {
  const t = useT()
  const barSlot = usePhoneActionBar()
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const primaryButton = primary ? (
    <Button variant="primary" onClick={primary.onClick} disabled={primary.disabled}>{primary.label}</Button>
  ) : null
  return (
    <header className="rp-head" data-record-header="true">
      <div className="rp-title"><Heading className="signal-record-title">{title}</Heading></div>
      {primary && !barSlot ? <div className="rp-head__primary">{primaryButton}</div> : null}
      {primary && barSlot ? createPortal(primaryButton, barSlot) : null}
      <div className="rp-head__more"><RecordMenu items={menu} label={menuLabel} minItems={1} /></div>
      <ul className="rp-facts" aria-label={factsLabel}>
        {attention ? (
          <li className="rp-fact">
            {onAttentionChange
              ? <SignalAttentionEditor value={attention} onChange={onAttentionChange} />
              : <StatusBadge status={ATTENTION_STATUS_KEY[attention]} />}
          </li>
        ) : null}
        <li className="rp-fact"><span className="signal-message-occurred">{t('signals.record.occurredAt', { when: occurredLabel })}</span></li>
      </ul>
    </header>
  )
}

function SignalAttentionEditor({ value, onChange }: { value: Attention; onChange: (value: Attention) => void }) {
  const t = useT()
  return <SignalAttentionPicker id="signals-record-attention" value={value} label={t('signals.record.editAttention')} onChange={onChange} />
}

// Mentions + visibility line, the ONE action register (LAW-3): Acknowledge + linked-work verbs —
// no Status/resolve/close (a Signal is a fact). The "who's acknowledged" roster + linked summary
// (only when linked work exists — the empty "0 Tasks · 0 open" line was noise, LAW-5).
export function SignalReach({
  mentions, shieldLine,
  canAcknowledge, hasAcknowledged, onAcknowledge,
  acknowledgements, linkedTasksSummary,
  linkedTasks, linkedTasksLoading, linkedTasksError, onRetryLinkedTasks,
  onCreateFollowUpTask, onLinkExistingTask, onRetract, actionForms,
}: {
  mentions: SignalMentionView[]
  shieldLine?: string
  canAcknowledge: boolean
  hasAcknowledged: boolean
  onAcknowledge?: () => void
  acknowledgements: SignalAcknowledgementView[]
  linkedTasksSummary?: LinkedTasksSummary
  linkedTasks?: readonly LinkedTaskView[]
  linkedTasksLoading?: boolean
  linkedTasksError?: boolean
  onRetryLinkedTasks?: () => void
  onCreateFollowUpTask?: () => void
  onLinkExistingTask?: () => void
  onRetract?: () => void
  actionForms?: ReactNode
}) {
  const t = useT()
  // Acknowledge and Retract write to the network: offline they are disabled and the section says why once.
  const offline = useIsOffline()
  const hasLinked = linkedTasksSummary && linkedTasksSummary.total > 0
  return (
    <section className="signal-region signal-reach rp-section" data-signal-region="reach">
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
      {offline && (canAcknowledge || onRetract) ? <OfflineNotice /> : null}
      <div className="signal-reach-actions" data-signal-actions="true">
        {onCreateFollowUpTask && (
          <Button variant="primary" onClick={onCreateFollowUpTask}>{t('signals.record.createFollowUpTask')}</Button>
        )}
        {onLinkExistingTask && (
          <Button variant="outline" onClick={onLinkExistingTask}>{t('signals.record.linkExistingTask')}</Button>
        )}
        {canAcknowledge && (
          <Button
            variant="outline"
            aria-pressed={hasAcknowledged}
            aria-label={t('signals.record.seen')}
            disabled={hasAcknowledged || offline}
            onClick={() => onAcknowledge?.()}
          >
            {t('signals.record.seen')}
          </Button>
        )}
        {onRetract && <Button variant="outline" disabled={offline} onClick={onRetract}>{t('signals.record.retract')}</Button>}
      </div>

      {actionForms}

      {linkedTasksError ? (
        <div className="signal-reach-linked-error" role="alert">
          <span>{t('signals.record.linkedWorkError')}</span>
          {onRetryLinkedTasks && (
            <Button variant="outline" onClick={onRetryLinkedTasks}>{t('common.retry')}</Button>
          )}
        </div>
      ) : linkedTasksLoading ? (
        <p className="signal-reach-linked" aria-live="polite">{t('signals.record.linkedWorkLoading')}</p>
      ) : linkedTasks && linkedTasks.length > 0 ? (
        <div className="signal-linked-work" aria-label={t('signals.record.linkedWork')}>
          <h3 className="signal-linked-work-title">{t('signals.record.linkedWork')}</h3>
          <ul className="signal-linked-work-list">
            {linkedTasks.map((task) => (
              <li key={task.id}>
                {task.href ? (
                  <RouterLink
                    to={task.href}
                    className="signal-linked-work-row"
                    onClick={(event) => {
                      // Keep the real router href for modified/middle clicks, while a normal
                      // click stays inside the existing record stack when the host supplies it.
                      if (
                        !task.onOpen || event.button !== 0 || event.metaKey || event.altKey
                        || event.ctrlKey || event.shiftKey
                      ) return
                      event.preventDefault()
                      task.onOpen()
                    }}
                  >
                    <span className="signal-linked-work-name">{task.title}</span>
                    <span className="signal-linked-work-status">{task.status}</span>
                    <ArrowRightIcon />
                  </RouterLink>
                ) : (
                  <button type="button" className="signal-linked-work-row" onClick={task.onOpen}>
                    <span className="signal-linked-work-name">{task.title}</span>
                    <span className="signal-linked-work-status">{task.status}</span>
                    <ArrowRightIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : hasLinked ? (
        <p className="signal-reach-linked">
          {t('signals.record.linkedWorkSummary', { total: linkedTasksSummary!.total, open: linkedTasksSummary!.open })}
        </p>
      ) : null}

      {acknowledgements.length > 0 && (
        <div className="signal-reach-ack" aria-label={t('signals.record.seenBy')}>
          <span className="signal-reach-ack-label">{t('signals.record.seenBy')}</span>
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
    <section className="signal-region signal-discussion rp-section" data-signal-region="discussion">
      <h2 className="signal-region-title">{t('signals.record.region.discussion')}</h2>
      <CommentThread comments={comments} people={people} canPost={canComment} onPost={onPostComment} heading="srOnly" />
    </section>
  )
}

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
    // The Team fact exists only on retired team-audience rows — an All Teams Signal has no owning
    // Team (ticket 867), so no Team chip is rendered.
    ...(teamName ? [{ label: t('signals.record.owningTeam'), value: teamName }] : []),
    ...(businessUnitName ? [{ label: t('signals.record.businessUnit'), value: businessUnitName }] : []),
    ...(siteName ? [{ label: t('signals.record.site'), value: siteName }] : []),
  ]
  return (
    <section className="signal-region" data-signal-region="facts">
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
    <section className="signal-region signal-history rp-section" data-signal-region="history">
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
