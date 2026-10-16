// useCafeTodayJobs — what each Café job looks like right now, for Café home's "Next up".
//
// Every number here is a read a Café page already makes for the same stream and day (plan, today's
// submitted actuals, the item list, the person's own locked receipt and last request). Nothing new is
// stored and nothing is shown to someone who could not already open the page it belongs to.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { computeKitchenKpis } from '@/lib/kitchen-kpis'
import { fetchActualsMap, fetchPlanMap, listCaptureFormItems } from '@/lib/db/kitchen-logs'
import { listCafeReceipts } from '@/lib/db/cafe-receipts'
import { listCafePurchaseRequests, type CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { canManageCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeCaptureDrafts, type CafeCaptureForm } from '@/lib/cafe-capture-storage'
import { movementKey, movementsForStream, streamProduces, PRODUCE } from '@/lib/kitchen-action-label'
import { wibToday } from '@/lib/format/date'
import type { BranchOption, CafeDestination, ProductionStream } from '@/lib/db/kitchen-logs.types'

interface TodayTransfer {
  destinationBranchId: string
  /** The destination's branch, so the row can name it the way the Transfer page does. */
  branch: BranchOption | null
  planned: number
}

export interface TodayJobs {
  state: 'loading' | 'ready' | 'error'
  /** The stream can produce (a receiving-only stream has no Production or Transfer to do). */
  producing: boolean
  planned: number
  made: number
  transfers: TodayTransfer[]
  wasteLogged: number
  /** Browser-saved unsent entries for today, by job. */
  drafts: Partial<Record<CafeCaptureForm, string>>
  lockedReceipts: number
  /** null = none yet; undefined = could not be read. */
  lastRequest: CafePurchaseRequest | null | undefined
  /** Whether the stream has any item set up for its lists; null while unknown. */
  itemsReady: boolean | null
  /** Whether the viewer may set items up (only asked when none are). */
  canSetUpItems: boolean
  retry: () => void
}

const EMPTY: Omit<TodayJobs, 'retry' | 'state'> = {
  producing: false, planned: 0, made: 0, transfers: [], wasteLogged: 0, drafts: {}, lockedReceipts: 0,
  lastRequest: null, itemsReady: null, canSetUpItems: false,
}

export function useCafeTodayJobs({ stream, allOptions, destinations, branches, canCapture }: {
  stream: ProductionStream | null
  allOptions: readonly ProductionStream[]
  destinations: readonly CafeDestination[]
  branches: readonly BranchOption[]
  canCapture: boolean
}): TodayJobs {
  const auth = useAuth()
  const person = auth.status === 'authenticated' ? auth.viewer.person : null
  const personId = person?.id ?? null
  const orgId = person?.org_id ?? null
  const [data, setData] = useState<Omit<TodayJobs, 'retry' | 'state'>>(EMPTY)
  const [state, setState] = useState<TodayJobs['state']>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const retry = useCallback(() => setRetryKey(key => key + 1), [])
  const streamId = stream ? `${stream.branch.id}|${stream.activity}` : null

  const transferMoves = useMemo(
    () => (stream ? movementsForStream(stream, allOptions, destinations).filter(move => move.action === 'transfer') : []),
    [allOptions, destinations, stream],
  )

  useEffect(() => {
    let live = true
    if (!stream || !personId || !orgId || !canCapture) {
      setData(EMPTY)
      setState(personId ? 'ready' : 'loading')
      return () => { live = false }
    }
    setState('loading')
    const today = wibToday()
    const producing = streamProduces(stream, allOptions)
    const drafts: TodayJobs['drafts'] = {}
    for (const form of ['production', 'transfer', 'waste'] as const) {
      const found = listCafeCaptureDrafts<unknown>(orgId, personId, form).find(record => record.scope.logDate === today
        && record.scope.branchId === stream.branch.id && record.scope.activity === stream.activity)
      if (found) drafts[form] = found.updatedAt
    }
    void (async () => {
      try {
        // The day's numbers are the page's reason to exist: a failed read here is an error, not a zero.
        const [plan, actuals] = await Promise.all([fetchPlanMap(today, stream), fetchActualsMap(today, stream)])
        // The rest degrade quietly: a row without its detail is still a working link.
        const [items, receipts, requests] = await Promise.allSettled([
          listCaptureFormItems(stream, 'produce'),
          listCafeReceipts(['Counted'], { receivedBy: personId, stream, photosFor: [] }),
          listCafePurchaseRequests(['Submitted', 'Approved', 'Rejected'], { requestedBy: personId, limit: 1 }),
        ])
        const itemsReady = items.status === 'fulfilled' ? items.value.length > 0 : null
        const canSetUpItems = itemsReady === false
          ? await canManageCafeItemSettings(stream.activity).catch(() => false)
          : false
        if (!live) return
        const produce = computeKitchenKpis(plan, actuals, movementKey(PRODUCE))
        setData({
          producing,
          planned: produce.plannedItemCount,
          made: produce.loggedItemCount,
          transfers: transferMoves.map(move => ({
            destinationBranchId: move.destinationBranchId ?? '',
            branch: branches.find(branch => branch.id === move.destinationBranchId) ?? null,
            planned: computeKitchenKpis(plan, actuals, movementKey(move)).plannedItemCount,
          })),
          wasteLogged: computeKitchenKpis(plan, actuals, 'waste').loggedItemCount,
          drafts,
          lockedReceipts: receipts.status === 'fulfilled' ? receipts.value.length : 0,
          lastRequest: requests.status === 'fulfilled' ? requests.value[0] ?? null : undefined,
          itemsReady,
          canSetUpItems,
        })
        setState('ready')
      } catch {
        if (live) setState('error')
      }
    })()
    return () => { live = false }
  // streamId stands for `stream`: a new object for the same stream must not re-read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, personId, orgId, canCapture, retryKey, transferMoves.length])

  return { state, ...data, retry }
}
