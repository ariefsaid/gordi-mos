import { useCallback, useEffect, useState } from 'react'
import {
  getCafeStreamLocationDefaults,
  listCafeLocations,
  type CafeLocation,
  type StreamLocationDefaults,
  type StreamRef,
} from '@/lib/db/cafe-locations'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

type ChoiceStatus = 'idle' | 'loading' | 'ready' | 'error'

export function availableCafeLocationDefault(
  locations: readonly CafeLocation[],
  defaultId: string | null | undefined,
  use: 'production' | 'storage',
): string | null {
  return defaultId && locations.some(location => location.id === defaultId && (location.use === use || location.use === 'both'))
    ? defaultId
    : null
}
type ChoiceSnapshot = {
  scope: string | null
  status: ChoiceStatus
  locations: CafeLocation[]
  defaults: StreamLocationDefaults | null
}

const EMPTY: ChoiceSnapshot = { scope: null, status: 'idle', locations: [], defaults: null }

// Capture bootstrap needs the same choices before restoring a saved movement.
export async function readCafeLocationChoices(stream: StreamRef | null) {
  if (!stream) return { locations: [], defaults: null }
  const [locations, defaults] = await Promise.all([
    listCafeLocations({ branch_id: stream.branch_id, archived: false }),
    getCafeStreamLocationDefaults(stream),
  ])
  return { locations, defaults }
}

/** Reads only active locations offered to this branch and convenience defaults for this stream. */
export function useCafeLocationChoices(stream: ProductionStream | null) {
  const branchId = stream?.branch.id ?? null
  const activity = stream?.activity ?? null
  const scope = branchId && activity ? `${branchId}:${activity}` : null
  const [retryKey, setRetryKey] = useState(0)
  const [snapshot, setSnapshot] = useState<ChoiceSnapshot>(EMPTY)

  useEffect(() => {
    if (!branchId || !activity || !scope) {
      setSnapshot(EMPTY)
      return
    }
    let active = true
    setSnapshot({ scope, status: 'loading', locations: [], defaults: null })
    void readCafeLocationChoices({ branch_id: branchId, activity }).then(({ locations, defaults }) => {
      if (active) setSnapshot({ scope, status: 'ready', locations, defaults })
    }).catch(() => {
      if (active) setSnapshot({ scope, status: 'error', locations: [], defaults: null })
    })
    return () => { active = false }
  }, [activity, branchId, retryKey, scope])

  const retry = useCallback(() => setRetryKey(value => value + 1), [])
  const current = scope ? snapshot.scope === scope ? snapshot : {
    scope, status: 'loading' as const, locations: [], defaults: null,
  } : EMPTY
  return { ...current, retry }
}
