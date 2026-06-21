// KitchenReviewRow — one Submitted-log row in the ops_lead review queue (S3).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S3.
// First cut: INLINE approve/reject in the queue row (no drawer — design-plan §7.1
// D4 ships the drawer when the revamp record-page lands).
// Proves (unit): FR-040 (plan-vs-logged + variance Tag), FR-041/AC-040 (approve note
// required on variance), AC-041 (reject note always required), AC-042 (production-
// first gate disables Approve, Reject stays live).
// Token-only (DESIGN.md). All quantities tabular-nums. Status never by color alone
// (the variance Tag carries dot+text). reviewed_by/at are NEVER sent client-side.

import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Tag } from '@/components/ui/tag'
import type { ReviewLogRow } from '@/lib/db/kitchen-logs.types'
import './kitchen-review-row.css'

interface KitchenReviewRowProps {
  log: ReviewLogRow
  /** plan qty for this (date, item, action) — 0 when no plan row (off-plan). */
  planQty: number
  /** submitter display name (resolved from the directory at the page). */
  submitterName: string
  /** production-first gate (FR-042): Approve disabled; Reject stays live. */
  approveDisabled: boolean
  /** tooltip explaining why Approve is disabled (AC-042). */
  approveDisabledReason: string
  /** while a decision is in flight for this row — both actions disabled (confirmed-only). */
  submitting: boolean
  /** approve note is null when on-plan (no note needed), or the entered note on variance. */
  onApprove: (logId: string, reviewNote: string | null) => void
  onReject: (logId: string, reviewNote: string) => void
}

type Pending = 'none' | 'approve' | 'reject'

export function KitchenReviewRow({
  log,
  planQty,
  submitterName,
  approveDisabled,
  approveDisabledReason,
  submitting,
  onApprove,
  onReject,
}: KitchenReviewRowProps) {
  const [pending, setPending] = useState<Pending>('none')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(false)

  // FR-040 variance: off-plan when logged ≠ plan (incl. no-plan rows where planQty===0).
  const offPlan = log.qty_porsi !== planQty
  const time = formatTime(log.created_at)

  function startApprove() {
    if (!offPlan) {
      // on-plan → approve immediately, no forced note (FR-041)
      onApprove(log.id, null)
      return
    }
    // off-plan (AC-040) → reveal the required approve-note gate
    setPending('approve')
    setNote('')
    setNoteError(false)
  }

  function startReject() {
    // reject ALWAYS requires a note (AC-041)
    setPending('reject')
    setNote('')
    setNoteError(false)
  }

  function cancel() {
    setPending('none')
    setNote('')
    setNoteError(false)
  }

  function confirm() {
    if (pending === 'approve') {
      if (!note.trim()) { setNoteError(true); return } // AC-040: variance approve needs a note
      onApprove(log.id, note.trim())
    } else if (pending === 'reject') {
      if (!note.trim()) { setNoteError(true); return } // AC-041: reject needs a note
      onReject(log.id, note.trim())
    }
  }

  const noteLabel =
    pending === 'reject'
      ? `Reject note for ${log.wip_item_name}`
      : `Approve note for ${log.wip_item_name}`
  const notePlaceholder =
    pending === 'reject' ? 'Reason for rejection (required)' : 'Reason for the off-plan qty (required)'

  return (
    <tr className="krow">
      <td className="krow-cell krow-main">
        <span className="krow-name">{log.wip_item_name}</span>
        <span className="krow-variance">
          <Tag color={offPlan ? 'amber' : 'green'}>
            <span className="krow-dot" aria-hidden="true" />
            {offPlan ? 'off-plan' : 'on-plan'}
          </Tag>
        </span>
      </td>

      <td className="krow-cell krow-qty tabular-nums">
        <span className="krow-meta">plan</span>
        <strong>{planQty}</strong>
        <span className="krow-meta">· logged</span>
        <strong>{log.qty_porsi}</strong>
      </td>

      <td className="krow-cell krow-by">
        <Avatar size="sm" placeholder={submitterName} />
        <span className="krow-byname">{submitterName}</span>
      </td>

      <td className="krow-cell krow-time tabular-nums">{time}</td>

      <td className="krow-cell krow-note">
        {log.notes ? <span className="krow-submitnote">“{log.notes}”</span> : <span className="krow-nonote">—</span>}
      </td>

      <td className="krow-cell krow-actions">
        {pending === 'none' ? (
          <>
            <button
              type="button"
              className="btn btn-primary krow-btn"
              aria-label={`Approve ${log.wip_item_name}`}
              disabled={approveDisabled || submitting}
              title={approveDisabled ? approveDisabledReason : undefined}
              onClick={startApprove}
            >
              {submitting ? 'Working…' : 'Approve'}
            </button>
            <button
              type="button"
              className="btn btn-outline krow-btn"
              aria-label={`Reject ${log.wip_item_name}`}
              disabled={submitting}
              onClick={startReject}
            >
              Reject
            </button>
          </>
        ) : (
          <div className="krow-decide">
            <label className="krow-note-label" htmlFor={`krow-note-${log.id}`}>
              {pending === 'reject' ? 'Reject note' : 'Approve note'}
            </label>
            <textarea
              id={`krow-note-${log.id}`}
              aria-label={noteLabel}
              className={`krow-note-input${noteError ? ' krow-note-input-error' : ''}`}
              rows={2}
              value={note}
              placeholder={notePlaceholder}
              disabled={submitting}
              onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setNoteError(false) }}
            />
            {noteError && (
              <span role="alert" className="krow-note-cue">A note is required.</span>
            )}
            <div className="krow-decide-actions">
              <button
                type="button"
                className={`btn krow-btn ${pending === 'reject' ? 'btn-destructive' : 'btn-primary'}`}
                aria-label={pending === 'reject' ? 'Confirm reject' : 'Confirm approve'}
                disabled={submitting}
                onClick={confirm}
              >
                {submitting ? 'Working…' : pending === 'reject' ? 'Confirm reject' : 'Confirm approve'}
              </button>
              <button
                type="button"
                className="btn btn-ghost krow-btn"
                aria-label="Cancel"
                disabled={submitting}
                onClick={cancel}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

/** Format an ISO timestamp to HH:MM (WIB, fixed +7 offset — NFR-007). */
function formatTime(iso: string): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
