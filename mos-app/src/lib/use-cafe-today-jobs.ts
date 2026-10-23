// useCafeTodayJobs — what each Café job looks like right now, for Café home's "Next up".
//
// Every number here is a read a Café page already makes for the same stream and day (plan, today's
// submitted actuals, the item list, the person's own locked receipt and last request). Nothing new is
// stored and nothing is shown to someone who could not already open the page it belongs to.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { computeKitchenKpis } from '@/lib/kitchen-kpis'
import { fetchActualsMap, fetchPlanMap, listCaptureFormItems } from '@/lib/db/kitchen-logs'
import { listCafeReceipts } from '@/lib/db/cafe-receipts'
import { listCafePurchaseRequests, type CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { canManageCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeCaptureDrafts, type CafeCaptureForm } from '@/lib/cafe-capture-storage'
import { movementKey, streamOptionKey, streamProduces, PRODUCE } from '@/lib/kitchen-action-label'
import { readCafeMovements } from '@/lib/use-cafe-destinations'
import { wibToday } from '@/lib/format/date'
import type { BranchOption, ProductionStream } from '@/lib/db/kitchen-logs.types'

interface TodayTransfer {
  key: string
  /** The destination's name, as the Transfer page reads it. */
  name: string
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

export function useCafeTodayJobs({ stream, allOptions, branches, canCapture }: {
  stream: ProductionStream | null
  allOptions: readonly ProductionStream[]
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
  const streamId = stream ? streamOptionKey(stream) : null

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
        const [plan, actuals, moves] = await Promise.all([
          fetchPlanMap(today, stream), fetchActualsMap(today, stream), readCafeMovements(personId, stream, allOptions),
        ])
        const transferMoves = moves.filter(move => move.action === 'transfer')
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
            key: movementKey(move),
            name: move.toLocationName ?? branches.find(branch => branch.id === move.destinationBranchId)?.name ?? '',
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
  }, [streamId, personId, orgId, canCapture, retryKey])

  return { state, ...data, retry }
}
