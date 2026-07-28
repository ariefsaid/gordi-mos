import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import {
  listSubmittedKitchenLogs,
  fetchPlanMap,
  approveKitchenLog,
  rejectKitchenLog,
  KitchenRpcError,
} from '@/lib/db/kitchen-logs'
import type { ReviewLogRow, KitchenActionType, PlanMap } from '@/lib/db/kitchen-logs.types'
import { getPeople } from '@/lib/db/directory'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Avatar } from '@/components/ui/avatar'
import { DataTable } from '@/components/dashboard/data-table'
import type { DataTableColumn, DataTableGroup } from '@/components/dashboard/data-table'
import { kitchenStatus } from '@/lib/kitchen-status'
import { canReviewCafe } from '@/lib/kitchen-gates'
import './kitchen-review-page.css'

function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

const ACTION_ORDER: KitchenActionType[] = ['Production', 'Transfer to Radiant', 'Transfer to Bungur']

function isTransfer(a: KitchenActionType): boolean {
  return a === 'Transfer to Radiant' || a === 'Transfer to Bungur'
}

/** plan qty for (date, item, action) — 0 when no plan row (off-plan). */
function planQtyFor(planMap: PlanMap, log: ReviewLogRow): number {
  return planMap[log.wip_item_id]?.[log.action_type] ?? 0
}

/** v4: reuses the Café Log status vocabulary (kitchenStatus) for the review row's
 * plan/logged verdict — same tone map, same Over/Under/On-plan/Logged labels a
 * reviewer already saw on the Log surface, instead of a page-local on/off-plan binary. */
function reviewRowStatus(planMap: PlanMap, log: ReviewLogRow) {
  const planQty = planQtyFor(planMap, log)
  return kitchenStatus({ made: log.qty_porsi, plan: planQty, isOffPlan: planQty <= 0 })
}

/** Format an ISO timestamp to HH:MM (WIB, fixed +7 offset — NFR-007). */
function formatTime(iso: string): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Group header actions — the production-first gate message + the per-group
// "Approve all (N)" bulk button. Lifted out of the retired .kr-group-head so the
// shared DataTable can mount them as a group's `headerActions` (right of the
// desktop group-header row / under the phone heading). Behaviour-identical to the
// retired controls: FR-042 gate, FR-043 bulk (offline / in-flight disables).
// ─────────────────────────────────────────────────────────────────────────────
interface GroupActionsProps {
  /** production-first gate (FR-042): show the "Blocked until Production approved" message. */
  transferGated: boolean
  /** N eligible Submitted rows in the section (0 hides the bulk button). */
  eligibleCount: number
  /** this section's bulk run is in flight → "Approving…". */
  bulkBusy: boolean
  /** disabled while offline, a per-row decision is in flight, or any bulk run is live. */
  disabled: boolean
  actionLabel: string
  onBulkApprove: () => void
}

function GroupActions({
  transferGated,
  eligibleCount,
  bulkBusy,
  disabled,
  actionLabel,
  onBulkApprove,
}: GroupActionsProps): ReactNode {
  return (
    <>
      {transferGated && (
        <span className="kr-group-gate">
          <span aria-hidden="true" className="kr-info-glyph">ⓘ</span>
          {' '}Blocked until Production approved
        </span>
      )}
      {eligibleCount > 0 && (
        <button
          type="button"
          className="btn btn-primary kr-bulk-btn"
          aria-label={`Approve all (${eligibleCount}) — ${actionLabel}`}
          disabled={disabled}
          onClick={onBulkApprove}
        >
          {bulkBusy ? 'Approving…' : `Approve all (${eligibleCount})`}
        </button>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row Actions column — inline approve/reject + the variance-note gate
// (AC-040 approve note required on variance; AC-041 reject note always required;
// AC-042 production-first gate disables Approve, Reject stays live). Lifted out of
// the retired kitchen-review-row so the DataTable Actions column render can mount
// it as a stable element (its pending/note state survives re-render). Proves
// (unit, via the page suite): FR-040/041, AC-040/041/042. Token-only (DESIGN.md).
// reviewed_by/at are NEVER sent client-side.
// ─────────────────────────────────────────────────────────────────────────────
type Pending = 'none' | 'approve' | 'reject'

interface KitchenReviewDecisionProps {
  log: ReviewLogRow
  /** plan qty for this (date, item, action) — 0 when no plan row (off-plan). */
  planQty: number
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

function KitchenReviewDecision({
  log,
  planQty,
  approveDisabled,
  approveDisabledReason,
  submitting,
  onApprove,
  onReject,
}: KitchenReviewDecisionProps): ReactNode {
  const t = useT()
  const [pending, setPending] = useState<Pending>('none')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(false)

  // FR-040 variance: off-plan when logged ≠ plan (incl. no-plan rows where planQty===0).
  const offPlan = log.qty_porsi !== planQty

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
      ? t('kitchen.review.noteAriaReject', { dish: log.wip_item_name })
      : t('kitchen.review.noteAriaApprove', { dish: log.wip_item_name })
  const notePlaceholder =
    pending === 'reject'
      ? t('kitchen.review.notePlaceholder.reject')
      : t('kitchen.review.notePlaceholder.approve')

  return (
    <div className="krow-actions">
      {pending === 'none' ? (
        <>
          <button
            type="button"
            // census DEFECT-2: one solid primary per surface. The bulk "Approve all (N)" is
            // that primary; each row's Approve is a quiet outline (the 10 solid blues were a
            // hierarchy blur). Reject stays outline too — the resting row has no solid fill.
            className="btn btn-outline krow-btn"
            aria-label={t('kitchen.review.approveAria', { dish: log.wip_item_name })}
            disabled={approveDisabled || submitting}
            title={approveDisabled ? approveDisabledReason : undefined}
            onClick={startApprove}
          >
            {submitting ? t('common.working') : t('kitchen.review.approve')}
          </button>
          <button
            type="button"
            className="btn btn-outline krow-btn"
            aria-label={t('kitchen.review.rejectAria', { dish: log.wip_item_name })}
            disabled={submitting}
            onClick={startReject}
          >
            {t('kitchen.review.reject')}
          </button>
        </>
      ) : (
        <div className="krow-decide">
          <label className="krow-note-label" htmlFor={`krow-note-${log.id}`}>
            {pending === 'reject' ? t('kitchen.review.note.reject') : t('kitchen.review.note.approve')}
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
            <span role="alert" className="krow-note-cue">{t('kitchen.review.note.required')}</span>
          )}
          <div className="krow-decide-actions">
            <button
              type="button"
              className={`btn krow-btn ${pending === 'reject' ? 'btn-destructive' : 'btn-primary'}`}
              aria-label={
                pending === 'reject'
                  ? t('kitchen.review.confirm.reject', { dish: log.wip_item_name })
                  : t('kitchen.review.confirm.approve', { dish: log.wip_item_name })
              }
              disabled={submitting}
              onClick={confirm}
            >
              {submitting
                ? t('common.working')
                : pending === 'reject'
                  ? t('kitchen.review.confirm.reject', { dish: log.wip_item_name })
                  : t('kitchen.review.confirm.approve', { dish: log.wip_item_name })}
            </button>
            <button
              type="button"
              className="btn btn-ghost krow-btn"
              aria-label={t('kitchen.review.cancel')}
              disabled={submitting}
              onClick={cancel}
            >
              {t('kitchen.review.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

export function KitchenReviewPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafeReview') }))
  const auth = useAuth()
  // I18N sweep: the H1 was a literal "Café · Review" — the bilingual audit measured
  // this live at 320px in `id`: breadcrumb correctly read "Kafe · Tinjauan" while the H1
  // beneath it stayed "Café · Review". Reuses the existing nav.cafe.* family.
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.review')}`

  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = canReviewCafe(accessRoles)

  const [logDate] = useState(wibToday)
  const [logs, setLogs] = useState<ReviewLogRow[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [peopleMap, setPeopleMap] = useState<Map<string, string>>(new Map())
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<KitchenActionType | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const fetchQueue = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const [rows, plan, people] = await Promise.all([
        listSubmittedKitchenLogs(logDate),
        fetchPlanMap(logDate),
        getPeople(),
      ])
      setLogs(rows)
      setPlanMap(plan)
      setPeopleMap(new Map(people.map(p => [p.id, p.full_name])))
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate])

  useEffect(() => {
    if (auth.status !== 'authenticated' || !allowed) return
    fetchQueue()
  }, [auth.status, allowed, fetchQueue, retryKey])

  const productionPending = useMemo(
    () => logs.some(l => l.action_type === 'Production'),
    [logs],
  )

  // v4 (DD-1): the metric summary rule replaces the retired 4-tile KitchenKpiStrip —
  // one line of derived figures in the PageHead meta slot, not a KPI-tile band eating
  // the first viewport on a surface whose job is deciding, not reading. Only the
  // actionable counts render (off-plan needs a note; blocked needs Production cleared
  // first) — a clean queue states just its size, per the rule's "omit neutral/restating".
  const summary = useMemo(() => {
    let offPlan = 0
    let blocked = 0
    for (const log of logs) {
      if (log.qty_porsi !== planQtyFor(planMap, log)) offPlan += 1
      if (isTransfer(log.action_type) && productionPending) blocked += 1
    }
    return { submitted: logs.length, offPlan, blocked }
  }, [logs, planMap, productionPending])

  const removeRow = useCallback((id: string) => {
    setLogs(prev => prev.filter(l => l.id !== id))
  }, [])

  async function handleApprove(logId: string, reviewNote: string | null) {
    if (!isOnline) return
    setSubmittingId(logId)
    setActionError('')
    try {
      const { batch_id } = await approveKitchenLog(logId, reviewNote)
      removeRow(logId)
      setNotice(t('kitchen.review.notice.approved', { batchId: batch_id }))
    } catch (err) {
      handleDecisionError(err)
    } finally {
      setSubmittingId(null)
    }
  }

  async function handleReject(logId: string, reviewNote: string) {
    if (!isOnline) return
    setSubmittingId(logId)
    setActionError('')
    try {
      await rejectKitchenLog(logId, reviewNote)
      removeRow(logId)
      setNotice(t('kitchen.review.notice.rejected'))
    } catch (err) {
      handleDecisionError(err)
    } finally {
      setSubmittingId(null)
    }
  }

  const bulkEligible = useCallback(
    (action: KitchenActionType): ReviewLogRow[] => {
      if (isTransfer(action) && productionPending) return []
      return logs.filter(l => l.action_type === action)
    },
    [logs, productionPending],
  )

  async function handleBulkApprove(action: KitchenActionType) {
    if (!isOnline) return
    const eligible = bulkEligible(action)
    if (eligible.length === 0) return
    setBulkAction(action)
    setActionError('')
    setNotice('')
    let approved = 0
    let failed = 0
    let lastBatch = ''
    const stale: string[] = []
    for (const log of eligible) {
      try {
        const { batch_id } = await approveKitchenLog(log.id, null)
        approved += 1
        lastBatch = batch_id
        removeRow(log.id)
      } catch (err) {
        if (err instanceof KitchenRpcError && err.code === 'P0003') {
          stale.push(log.id)
          removeRow(log.id)
        } else {
          failed += 1
        }
      }
    }
    setBulkAction(null)
    if (failed > 0) {
      setNotice(t('kitchen.review.notice.bulkPartial', { approved, failed }))
    } else if (approved > 0) {
      setNotice(
        approved === 1
          ? t('kitchen.review.notice.approved', { batchId: lastBatch })
          : t('kitchen.review.notice.bulkApproved', { approved, batchId: lastBatch }),
      )
    } else if (stale.length > 0) {
      setNotice(t('kitchen.review.notice.staleRefresh'))
      setRetryKey(k => k + 1)
    }
  }

  function handleDecisionError(err: unknown) {
    if (err instanceof KitchenRpcError && err.code === 'P0003') {
      setNotice(t('kitchen.review.notice.staleRefresh'))
      setRetryKey(k => k + 1)
      return
    }
    if (err instanceof KitchenRpcError && err.code === '42501') {
      setActionError(t('kitchen.review.error.forbidden'))
      return
    }
    setActionError(err instanceof Error ? err.message : t('kitchen.review.error.generic'))
  }

  // ── ONE DataTable: one group per action_type (Production, Transfer to …),
  //    preserving ACTION_ORDER + the productionPending gate. Each group's
  //    headerActions carries its bulk "Approve all (N)" button + the gate message
  //    (disabled/hidden exactly as the retired bespoke header — transfer gate
  //    blocks it until Production approved; offline disables it). ───────────────
  const bulkDisabled = !isOnline || submittingId !== null || bulkAction !== null
  const tableGroups: DataTableGroup<ReviewLogRow>[] = ACTION_ORDER
    .map(action => {
      const rows = logs.filter(l => l.action_type === action)
      const transferGated = isTransfer(action) && productionPending
      const eligibleCount = bulkEligible(action).length
      const showActions = transferGated || eligibleCount > 0
      return {
        key: action,
        label: action,
        rows,
        headerActions: showActions
          ? (
              <GroupActions
                transferGated={transferGated}
                eligibleCount={eligibleCount}
                bulkBusy={bulkAction === action}
                disabled={bulkDisabled}
                actionLabel={action}
                onBulkApprove={() => handleBulkApprove(action)}
              />
            )
          : null,
      }
    })
    .filter(g => g.rows.length > 0)

  // ── Per-row columns mirror the retired review row: item + status text, plan vs
  //    logged, submitter, time, submit note, and an Actions column whose render
  //    returns the inline approve/reject + review-note gate (KitchenReviewDecision). ─
  const columns: DataTableColumn<ReviewLogRow>[] = [
    {
      key: 'item',
      header: 'Item',
      cardLabel: '',
      render: (log) => {
        // v4: was a filled Tag pill on EVERY row — a status present at rest on the
        // whole column is colour that marks everything and out-shouts Approve/Reject,
        // the controls that are the actual job here (Row-status-as-text, DESIGN.md).
        // Same tone semantics, fill dropped; text alone still carries the meaning (WCAG 1.4.1).
        const status = reviewRowStatus(planMap, log)
        return (
          <>
            <span className="krow-name">{log.wip_item_name}</span>
            <span className={`krow-status krow-status--${status.tone}`}>{status.label}</span>
          </>
        )
      },
    },
    {
      key: 'planVsLogged',
      header: 'Plan vs logged',
      render: (log) => (
        <span className="krow-qty">
          <span className="krow-meta">plan</span>
          <strong>{planQtyFor(planMap, log)}</strong>
          <span className="krow-meta">· logged</span>
          <strong>{log.qty_porsi}</strong>
        </span>
      ),
    },
    {
      key: 'submitter',
      header: 'Submitter',
      render: (log) => {
        const name = peopleMap.get(log.submitted_by ?? '') ?? '—'
        return (
          <span className="krow-by">
            <Avatar size="sm" placeholder={name} />
            <span className="krow-byname">{name}</span>
          </span>
        )
      },
    },
    {
      key: 'time',
      header: 'Time',
      render: (log) => <span className="krow-time">{formatTime(log.created_at)}</span>,
    },
    {
      key: 'note',
      header: 'Note',
      render: (log) => log.notes
        ? <span className="krow-submitnote">“{log.notes}”</span>
        : <span className="krow-nonote">—</span>,
    },
    {
      key: 'decision',
      header: 'Decision',
      render: (log) => {
        const gated = isTransfer(log.action_type) && productionPending
        return (
          <KitchenReviewDecision
            log={log}
            planQty={planQtyFor(planMap, log)}
            approveDisabled={gated || !isOnline}
            approveDisabledReason={gated ? 'Finish Production approvals first.' : ''}
            submitting={submittingId === log.id}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )
      },
    },
  ]

  // v4 (compact capture row seam, DataTable renderCard — DD-4 pattern): the queue's
  // phone job is running a stack of submitted logs and deciding each, the same shape
  // as Café Log's capture list — not reading one record's full field set. The generic
  // <dl> card would stack all six columns as labelled rows (~6 lines before the
  // Approve/Reject controls); this card keeps identity + status on one head line,
  // plan/submitter/time on one muted meta line, the note only when there is one, and
  // the SAME KitchenReviewDecision used by the desktop table (identical aria-labels/
  // behaviour — only the layout around it changes).
  const renderReviewCard = (log: ReviewLogRow) => {
    const planQty = planQtyFor(planMap, log)
    const status = reviewRowStatus(planMap, log)
    const name = peopleMap.get(log.submitted_by ?? '') ?? '—'
    const gated = isTransfer(log.action_type) && productionPending
    return (
      <div className="krow-card">
        <div className="krow-card-head">
          <span className="krow-name">{log.wip_item_name}</span>
          <span className={`krow-status krow-status--${status.tone}`}>{status.label}</span>
        </div>
        <div className="krow-card-meta">
          <span className="krow-qty">
            <span className="krow-meta">plan</span>
            <strong>{planQty}</strong>
            <span className="krow-meta">· logged</span>
            <strong>{log.qty_porsi}</strong>
          </span>
          <span className="krow-by">
            <Avatar size="sm" placeholder={name} />
            <span className="krow-byname">{name}</span>
          </span>
          <span className="krow-time">{formatTime(log.created_at)}</span>
        </div>
        {log.notes && <div className="krow-card-note">“{log.notes}”</div>}
        <KitchenReviewDecision
          log={log}
          planQty={planQty}
          approveDisabled={gated || !isOnline}
          approveDisabledReason={gated ? 'Finish Production approvals first.' : ''}
          submitting={submittingId === log.id}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </div>
    )
  }

  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="loading">
        <LoadingShell count={3} />
      </PageFamilyFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kr-block kr-forbidden">
          <p className="kr-forbidden-msg">{t('kitchen.review.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('kitchen.review.signIn')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  if (!allowed) {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kr-block kr-forbidden" role="region" aria-label={t('kitchen.review.forbidden.region')}>
          <p className="kr-forbidden-title">{t('kitchen.review.forbidden.title')}</p>
          <p className="kr-forbidden-msg">
            {t('kitchen.review.forbidden.msg')}
          </p>
          <Link to="/cafe/log" className="btn btn-outline">{t('kitchen.review.backToLog')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  const submittedCount = logs.length

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={
        // v4 (DD-1, metric summary rule): the derived figures live in ONE line here —
        // date + the always-shown queue size, plus off-plan/blocked ONLY when they carry
        // a state worth acting on (DESIGN.md "Metric summary rule" — neutral/zero counts
        // are omitted, not zeroed-out tiles). Replaces the retired 4-tile KitchenKpiStrip,
        // which consumed the first viewport before a single row was visible.
        <span className="kr-meta-line">
          <span className="kr-date tabular">{logDate}</span>
          {load.kind === 'ready' && (
            <span className="kr-meta-metric">
              <span className="kr-meta-label">{t('kitchen.review.meta.submitted')}</span>
              <strong className="tabular">{summary.submitted}</strong>
            </span>
          )}
          {load.kind === 'ready' && summary.offPlan > 0 && (
            <span className="kr-meta-metric kr-meta-metric--destructive">
              <span className="kr-meta-label">{t('kitchen.review.meta.offPlan')}</span>
              <strong className="tabular">{summary.offPlan}</strong>
            </span>
          )}
          {load.kind === 'ready' && summary.blocked > 0 && (
            <span className="kr-meta-metric kr-meta-metric--destructive">
              <span className="kr-meta-label">{t('kitchen.review.meta.blocked')}</span>
              <strong className="tabular">{summary.blocked}</strong>
            </span>
          )}
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : submittedCount === 0 ? 'empty' : 'default'}
    >

      {!isOnline && (
        <div role="alert" className="kr-banner kr-banner-offline kr-block">
          {t('kitchen.review.offline')}
        </div>
      )}

      {notice && (
        <div role="status" aria-live="polite" className="kr-banner kr-banner-notice kr-block">
          {notice}
        </div>
      )}

      {actionError && (
        <div role="alert" className="kr-banner kr-banner-error kr-block">
          {actionError}
        </div>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.queue') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && submittedCount === 0 && (
        <EmptyState
          variant="awaiting"
          title={t('kitchen.review.empty.title')}
          copy={t('kitchen.review.empty.copy', { date: logDate })}
          note={t('kitchen.review.empty.note')}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRetryKey(k => k + 1)}
          >
            {t('kitchen.refresh')}
          </button>
        </EmptyState>
      )}

      {load.kind === 'ready' && submittedCount > 0 && (
        <DataTable
          columns={columns}
          rows={[]}
          groups={tableGroups}
          renderCard={renderReviewCard}
          isDesktop={isDesktop}
          caption={t('kitchen.review.caption')}
        />
      )}
    </PageFamilyFrame>
  )
}
