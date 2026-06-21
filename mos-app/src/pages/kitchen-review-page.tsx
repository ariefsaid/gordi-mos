// KitchenReviewPage — /mos/kitchen/review — S3 review/approve queue (desktop-first).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S3.
// The ops_lead surface that completes the capture→approve loop (the GIGO gate).
// Proves (unit): FR-040 (queue lists ONLY Submitted, grouped by action_type),
// FR-041/AC-040/041 (approve/reject + note gates), FR-042/AC-042 (production-first
// gate), FR-050/AC-090 (approve RPC → minted batch_id), FR-003/044 (role gate →
// forbidden panel, not an empty table). (AC-090/091 are owned cross-stack at e2e.)
// - Access-role gated: ops_lead/admin only (RLS is the authority; UI gate is courtesy).
// - First cut: INLINE approve/reject in the queue rows (no drawer — design-plan §7.1 D4).
// - Confirmed-only: a decision reflects the RPC/UPDATE result; the row leaves the queue
//   on success. P0003 (already actioned by someone else) → friendly notice + re-fetch.
// - Online-only writes (NFR-008): actions blocked + a banner when offline.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import {
  listSubmittedKitchenLogs,
  fetchPlanMap,
  approveKitchenLog,
  rejectKitchenLog,
  KitchenRpcError,
} from '@/lib/db/kitchen-logs'
import type { ReviewLogRow, KitchenActionType, PlanMap } from '@/lib/db/kitchen-logs.types'
import { getPeople } from '@/lib/db/directory'
import { KitchenReviewRow } from '@/components/kitchen/kitchen-review-row'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import './kitchen-review-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007) — matches the capture page.
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

// The ordered action_type groups (Production first — the review sequence, FR-042).
const ACTION_ORDER: KitchenActionType[] = ['Production', 'Transfer to Radiant', 'Transfer to Bungur']
const ACTION_LABEL: Record<KitchenActionType, string> = {
  Production: 'Production',
  'Transfer to Radiant': 'Transfer to Radiant',
  'Transfer to Bungur': 'Transfer to Bungur',
}
const PRODUCTION_FIRST_REASON = 'Finish Production approvals first.'

function isTransfer(a: KitchenActionType): boolean {
  return a === 'Transfer to Radiant' || a === 'Transfer to Bungur'
}

function planQtyFor(planMap: PlanMap, log: ReviewLogRow): number {
  return planMap[log.wip_item_id]?.[log.action_type] ?? 0
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

export function KitchenReviewPage() {
  useDocumentTitle('Kitchen Review — Gordi MOS')
  const auth = useAuth()

  // ── Access-role gate (FR-003/044) ──────────────────────────────────────────
  // ops_lead/admin only; RLS is the authority — this is the UI courtesy + forbidden state.
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — S2/owner OQ-7)
  const [logs, setLogs] = useState<ReviewLogRow[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [peopleMap, setPeopleMap] = useState<Map<string, string>>(new Map())
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<KitchenActionType | null>(null) // group with a batch in flight
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('') // friendly post-action confirmation / P0003 refresh
  const [isOnline, setIsOnline] = useState(navigator.onLine)

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

  // Re-fetch only when allowed (a member never triggers the queue read).
  useEffect(() => {
    if (auth.status !== 'authenticated' || !allowed) return
    fetchQueue()
  }, [auth.status, allowed, fetchQueue, retryKey])

  // ── Production-first gate (FR-042) ─────────────────────────────────────────
  const productionPending = useMemo(
    () => logs.some(l => l.action_type === 'Production'),
    [logs],
  )

  // Grouped queue (by action_type, Production first).
  const groups = useMemo(() => {
    return ACTION_ORDER
      .map(action => ({ action, rows: logs.filter(l => l.action_type === action) }))
      .filter(g => g.rows.length > 0)
  }, [logs])

  // ── Decision wiring (confirmed-only) ───────────────────────────────────────
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

  // ── Bulk approve (FR-043) ──────────────────────────────────────────────────
  // "Approve all (N)" per group. Eligible = note-free ON-PLAN Submitted logs in
  // scope (qty === plan), excluding off-plan rows that need a per-row variance note
  // (FR-040/AC-040). There is NO bulk RPC — iterate approveKitchenLog(id, null) per
  // eligible row (each atomic server-side). Partial outcomes: P0003 (already actioned)
  // → drop + continue; other errors → keep the row + a succeeded/failed notice.
  const bulkEligible = useCallback(
    (action: KitchenActionType): ReviewLogRow[] => {
      // Transfer groups respect the production-first gate — zero eligible while pending.
      if (isTransfer(action) && productionPending) return []
      return logs.filter(
        l => l.action_type === action && l.qty_porsi === planQtyFor(planMap, l),
      )
    },
    [logs, planMap, productionPending],
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
    const stale: string[] = [] // P0003 rows — drop them
    for (const log of eligible) {
      try {
        const { batch_id } = await approveKitchenLog(log.id, null)
        approved += 1
        lastBatch = batch_id
        removeRow(log.id)
      } catch (err) {
        if (err instanceof KitchenRpcError && err.code === 'P0003') {
          stale.push(log.id)
          removeRow(log.id) // someone else actioned it — drop, continue
        } else {
          failed += 1 // keep the row in the queue for a retry
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
    // P0003 — the log is no longer Submitted (someone else actioned it). Friendly
    // notice + re-fetch so the stale row drops out (design-plan §3 / behavior brief).
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

  // ── Auth loading / unauth ──────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return <PageFrame><LoadingState /></PageFrame>
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFrame>
        <div className="kr-block kr-forbidden">
          <p className="kr-forbidden-msg">You need to sign in to review kitchen logs.</p>
          <a href="/login" className="btn btn-primary">Sign in</a>
        </div>
      </PageFrame>
    )
  }

  // ── Forbidden (non-lead) — a clean "not for your role" panel, NOT an empty table ──
  if (!allowed) {
    return (
      <PageFrame>
        <PageHead variant="content" title="Kitchen · Review" count={null} />
        <div className="kr-block kr-forbidden" role="region" aria-label="Access restricted">
          <p className="kr-forbidden-title">Review is available to ops leads only.</p>
          <p className="kr-forbidden-msg">
            Ask an ops lead to review your submitted kitchen logs.
          </p>
          <a href="/mos/kitchen/log" className="btn btn-outline">Back to Log</a>
        </div>
      </PageFrame>
    )
  }

  const submittedCount = logs.length

  return (
    <PageFrame>
      <PageHead
        variant="content"
        title="Kitchen · Review"
        count={load.kind === 'ready' ? submittedCount : null}
        meta={<span className="kr-date tabular-nums">{logDate}</span>}
      />

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

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't load the queue — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && submittedCount === 0 && (
        <EmptyState
          title="Nothing to review"
          copy={`No submitted logs for ${logDate}.`}
        />
      )}

      {load.kind === 'ready' && submittedCount > 0 && (
        <div className="kr-queue kr-block">
          {groups.map(group => {
            const transferGated = isTransfer(group.action) && productionPending
            const eligibleCount = bulkEligible(group.action).length
            const bulkBusy = bulkAction === group.action
            return (
              <section key={group.action} className="kr-group" aria-label={ACTION_LABEL[group.action]}>
                <div className="kr-group-head">
                  <span className="kr-group-label">{ACTION_LABEL[group.action]}</span>
                  <span className="kr-group-count tabular-nums">{group.rows.length}</span>
                  {transferGated && (
                    <span className="kr-group-gate">
                      <span aria-hidden="true" className="kr-info-glyph">ⓘ</span>
                      {' '}Blocked until Production approved
                    </span>
                  )}
                  {/* Bulk approve (FR-043): only when eligible on-plan logs exist. N counts
                      note-free on-plan Submitted logs; off-plan rows need a per-row note. */}
                  {eligibleCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary kr-bulk-btn"
                      aria-label={`Approve all (${eligibleCount}) — ${ACTION_LABEL[group.action]}`}
                      disabled={!isOnline || submittingId !== null || bulkAction !== null}
                      onClick={() => handleBulkApprove(group.action)}
                    >
                      {bulkBusy ? 'Approving…' : `Approve all (${eligibleCount})`}
                    </button>
                  )}
                </div>
                <table className="kr-table">
                  <caption className="sr-only">{ACTION_LABEL[group.action]} submitted logs</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Plan vs logged</th>
                      <th scope="col">Submitter</th>
                      <th scope="col">Time</th>
                      <th scope="col">Note</th>
                      <th scope="col">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(log => (
                      <KitchenReviewRow
                        key={log.id}
                        log={log}
                        planQty={planQtyFor(planMap, log)}
                        submitterName={peopleMap.get(log.submitted_by ?? '') ?? '—'}
                        approveDisabled={transferGated || !isOnline}
                        approveDisabledReason={transferGated ? PRODUCTION_FIRST_REASON : ''}
                        submitting={submittingId === log.id}
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
        </div>
      )}
    </PageFrame>
  )
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="kr-block">
      <SkeletonRows count={3} />
    </div>
  )
}
