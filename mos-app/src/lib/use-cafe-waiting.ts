// useCafeWaiting — how much is waiting for a Café lead, one count per queue.
// Each count is a read the queue's own page already makes (logs and counts to review, receipts and requests
// to review, receipt issues that block a PO, ESB pushes that failed), and a row exists only for the roles that
// can open that page. ONE shared read: the shell mounts `CafeWaitingProvider` once, and the nav badge, Café home's
// "Waiting for you" and the Review page's tabs all read the same counts, never a request per consumer.
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeWaitingContext } from '@/lib/cafe-waiting-context'
import { countSubmittedKitchenLogs } from '@/lib/db/kitchen-logs'
import { countSubmittedCafeCountLines } from '@/lib/db/cafe-count'
import { countCafeReceipts } from '@/lib/db/cafe-receipts'
import { listCafePurchaseRequests } from '@/lib/db/cafe-purchase-requests'
import { countCafeReceiptIssuesNeedingPo } from '@/lib/db/cafe-receipt-issues'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import { canPushCafe, canReviewCafe } from '@/lib/kitchen-gates'

export type WaitingKey = 'logs' | 'counts' | 'receipts' | 'requests' | 'issues' | 'failed'
export type WaitingState = { status: 'loading' } | { status: 'ready'; count: number; bounded: boolean } | { status: 'error' }

const ALL: readonly WaitingKey[] = ['logs', 'counts', 'receipts', 'requests', 'issues', 'failed']
const initial = (): Record<WaitingKey, WaitingState> => ({
  logs: { status: 'loading' }, counts: { status: 'loading' }, receipts: { status: 'loading' },
  requests: { status: 'loading' }, issues: { status: 'loading' }, failed: { status: 'loading' },
})

export interface CafeWaiting {
  admitted: boolean
  viewerId: string | null
  keys: readonly WaitingKey[]
  queues: Record<WaitingKey, WaitingState>
  /** Re-read one queue's count (shows loading, or the previous figure while a refresh is in flight when `quiet`). */
  load: (key: WaitingKey, quiet?: boolean) => void
  /** Re-read every count the viewer may see, keeping the figures on screen until the new ones arrive. */
  reload: () => void
}

export function useCafeWaitingSource(enabled: boolean): CafeWaiting {
  const auth = useAuth()
  const [queues, setQueues] = useState(initial)
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const admitted = canReviewCafe(roles)
  // Pushes are an ops lead's / admin's page; a supervisor is never shown a row that leads there.
  const seesPushes = canPushCafe(roles)
  const keys = useMemo(() => ALL.filter(key => key !== 'failed' || seesPushes), [seesPushes])

  const load = useCallback((key: WaitingKey, quiet = false) => {
    if (!enabled || !viewerId || !admitted) return
    if (!quiet) setQueues(current => ({ ...current, [key]: { status: 'loading' } }))
    const read: Promise<number | unknown[]> = key === 'logs' ? countSubmittedKitchenLogs()
      : key === 'counts' ? countSubmittedCafeCountLines()
        : key === 'receipts' ? countCafeReceipts(['Submitted'])
          : key === 'requests' ? listCafePurchaseRequests(['Submitted'])
            : key === 'failed' ? Promise.all([listEsbPushes({ status: 'dead_letter' }, 50), listEsbPushes({ status: 'failed' }, 50)]).then(([a, b]) => [...a, ...b])
              : countCafeReceiptIssuesNeedingPo()
    void read.then(result => {
      const count = Array.isArray(result) ? result.length : result
      setQueues(current => ({ ...current, [key]: { status: 'ready', count, bounded: key !== 'issues' && count >= 50 } }))
    }).catch(() => setQueues(current => ({ ...current, [key]: { status: 'error' } })))
  }, [admitted, enabled, viewerId])

  const reload = useCallback(() => { keys.forEach(key => load(key, true)) }, [keys, load])

  useEffect(() => {
    if (!enabled || !admitted || !viewerId) return
    keys.forEach(key => load(key))
  }, [admitted, enabled, keys, load, viewerId])

  return { admitted, viewerId, keys, queues, load, reload }
}

export { CafeWaitingContext }

export function useCafeWaiting(): CafeWaiting {
  const shared = useContext(CafeWaitingContext)
  const own = useCafeWaitingSource(shared === null)
  return shared ?? own
}

/** Actionable objects across the queues the viewer may open; null while any count is unknown (never shown as zero). */
export function reviewBadgeCount(waiting: CafeWaiting): { count: number; bounded: boolean } | null {
  if (!waiting.admitted) return null
  let count = 0
  let bounded = false
  for (const key of waiting.keys) {
    if (key === 'issues') continue // receipt issues are their own count, never added to receipt approvals
    const state = waiting.queues[key]
    if (state.status !== 'ready') return null
    count += state.count
    bounded ||= state.bounded
  }
  return { count, bounded }
}

/** A queue's own waiting number; null while it is being read or could not be (never 0). */
export function queueWaiting(queue: { waiting: readonly WaitingKey[] }, waiting: CafeWaiting): number | null {
  let total = 0
  for (const key of queue.waiting) {
    const state = waiting.queues[key]
    if (state.status !== 'ready') return null
    total += state.count
  }
  return total
}

/** The figure on a queue's tab: its own actionable count, "…" while reading, "—" when unknown (never 0). */
export function queueFigure(queue: { waiting: readonly WaitingKey[] }, waiting: CafeWaiting): string {
  let total = 0
  let bounded = false
  for (const key of queue.waiting) {
    const state = waiting.queues[key]
    if (state.status === 'error') return '—'
    if (state.status === 'loading') return '…'
    total += state.count
    bounded ||= state.bounded
  }
  return bounded ? `${total}+` : String(total)
}
