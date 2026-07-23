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
import { Tag } from '@/components/ui/tag'
import { DataTable } from '@/components/dashboard/data-table'
import type { DataTableColumn, DataTableGroup } from '@/components/dashboard/data-table'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { useReviewKpis } from '@/lib/kitchen-review-kpis'
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
      ? `Reject note for ${log.wip_item_name}`
      : `Approve note for ${log.wip_item_name}`
  const notePlaceholder =
    pending === 'reject' ? 'Reason for rejection (required)' : 'Reason for the off-plan qty (required)'

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
    </div>
  )
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

export function KitchenReviewPage() {
  useDocumentTitle('Café Review — Gordi MOS')
  const t = useT()
  const auth = useAuth()

  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

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
  const kpiData = useReviewKpis(logs, planMap)

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
      setNotice(`Approved · batch ${batch_id}`)
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
      setNotice('Rejected — removed from the queue.')
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
      setNotice(`${approved} approved · ${failed} failed — the failed rows remain in the queue.`)
    } else if (approved > 0) {
      setNotice(
        approved === 1
          ? `Approved · batch ${lastBatch}`
          : `${approved} approved · last batch ${lastBatch}`,
      )
    } else if (stale.length > 0) {
      setNotice('Already reviewed by someone else — refreshing the queue…')
      setRetryKey(k => k + 1)
    }
  }

  function handleDecisionError(err: unknown) {
    if (err instanceof KitchenRpcError && err.code === 'P0003') {
      setNotice('Already reviewed by someone else — refreshing the queue…')
      setRetryKey(k => k + 1)
      return
    }
    if (err instanceof KitchenRpcError && err.code === '42501') {
      setActionError('You are not permitted to review this log.')
      return
    }
    setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
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

  // ── Per-row columns mirror the retired review row: item + variance Tag, plan vs
  //    logged, submitter, time, submit note, and an Actions column whose render
  //    returns the inline approve/reject + review-note gate (KitchenReviewDecision). ─
  const columns: DataTableColumn<ReviewLogRow>[] = [
    {
      key: 'item',
      header: 'Item',
      cardLabel: '',
      render: (log) => {
        const offPlan = log.qty_porsi !== planQtyFor(planMap, log)
        return (
          <>
            <span className="krow-name">{log.wip_item_name}</span>
            <span className="krow-variance">
              <Tag color={offPlan ? 'amber' : 'green'}>
                <span className="krow-dot" aria-hidden="true" />
                {offPlan ? 'off-plan' : 'on-plan'}
              </Tag>
            </span>
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

  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title="Café · Review" jobSentence={t('job.cafe')} state="loading">
        <LoadingShell count={3} />
      </PageFamilyFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title="Café · Review" jobSentence={t('job.cafe')} state="permission">
        <div className="kr-block kr-forbidden">
          <p className="kr-forbidden-msg">You need to sign in to review Café logs.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  if (!allowed) {
    return (
      <PageFamilyFrame family="workspace" title="Café · Review" jobSentence={t('job.cafe')} state="permission">
        <div className="kr-block kr-forbidden" role="region" aria-label="Access restricted">
          <p className="kr-forbidden-title">Review is available to ops leads only.</p>
          <p className="kr-forbidden-msg">
            Ask an ops lead to review your submitted café logs.
          </p>
          <Link to="/cafe/log" className="btn btn-outline">Back to Log</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  const submittedCount = logs.length

  return (
    <PageFamilyFrame
      family="workspace"
      title="Café · Review"
      jobSentence={t('job.cafe')}
      count={load.kind === 'ready' ? submittedCount : null}
      meta={<span className="kr-date tabular">{logDate}</span>}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : submittedCount === 0 ? 'empty' : 'default'}
    >

      {load.kind === 'ready' && submittedCount > 0 && (
        <KitchenKpiStrip data={kpiData} isDesktop={isDesktop} />
      )}

      {!isOnline && (
        <div role="alert" className="kr-banner kr-banner-offline kr-block">
          You're offline — reviewing needs a connection. Reconnect to approve or reject.
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
          message="Couldn't load the queue — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && submittedCount === 0 && (
        <EmptyState
          variant="awaiting"
          title="Nothing to review"
          copy={`No submitted logs for ${logDate}.`}
          note="Pull again to check for newly submitted Café logs."
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRetryKey(k => k + 1)}
          >
            Refresh
          </button>
        </EmptyState>
      )}

      {load.kind === 'ready' && submittedCount > 0 && (
        <DataTable
          columns={columns}
          rows={[]}
          groups={tableGroups}
          isDesktop={isDesktop}
          caption="Submitted Café logs awaiting review"
        />
      )}
    </PageFamilyFrame>
  )
}
