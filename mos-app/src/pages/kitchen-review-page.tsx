import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
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
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenReviewTable } from '@/components/kitchen/kitchen-review-table'
import { KitchenReviewCards } from '@/components/kitchen/kitchen-review-cards'
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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

export function KitchenReviewPage() {
  useDocumentTitle('Kitchen Review — Gordi MOS')
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

  const groups = useMemo(() => {
    return ACTION_ORDER
      .map(action => ({ action, rows: logs.filter(l => l.action_type === action) }))
      .filter(g => g.rows.length > 0)
  }, [logs])

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

  if (auth.status === 'loading') {
    return <PageFrame><LoadingState /></PageFrame>
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFrame>
        <div className="kr-block kr-forbidden">
          <p className="kr-forbidden-msg">You need to sign in to review kitchen logs.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFrame>
    )
  }

  if (!allowed) {
    return (
      <PageFrame>
        <PageHead variant="content" title="Kitchen · Review" count={null} />
        <div className="kr-block kr-forbidden" role="region" aria-label="Access restricted">
          <p className="kr-forbidden-title">Review is available to ops leads only.</p>
          <p className="kr-forbidden-msg">
            Ask an ops lead to review your submitted kitchen logs.
          </p>
          <Link to="/kitchen/log" className="btn btn-outline">Back to Log</Link>
        </div>
      </PageFrame>
    )
  }

  const submittedCount = logs.length

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title="Kitchen · Review"
        count={load.kind === 'ready' ? submittedCount : null}
        meta={<span className="kr-date tabular">{logDate}</span>}
      />

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
        isDesktop ? (
          <KitchenReviewTable
            groups={groups}
            planMap={planMap}
            peopleMap={peopleMap}
            productionPending={productionPending}
            bulkEligible={bulkEligible}
            bulkAction={bulkAction}
            submittingId={submittingId}
            isOnline={isOnline}
            onApprove={handleApprove}
            onReject={handleReject}
            onBulkApprove={handleBulkApprove}
          />
        ) : (
          <KitchenReviewCards
            groups={groups}
            planMap={planMap}
            peopleMap={peopleMap}
            productionPending={productionPending}
            bulkEligible={bulkEligible}
            bulkAction={bulkAction}
            submittingId={submittingId}
            isOnline={isOnline}
            onApprove={handleApprove}
            onReject={handleReject}
            onBulkApprove={handleBulkApprove}
          />
        )
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
