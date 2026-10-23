import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { getCafeLocations } from '@/lib/cafe-visit-cache'
import type { CafeLocation } from '@/lib/db/cafe-locations'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

type ChoiceStatus = 'idle' | 'loading' | 'ready' | 'error'

/** The active Locations offered to one branch (from the visit's single read). */
export async function readCafeLocationChoices(viewerId: string | null, branchId: string | null): Promise<CafeLocation[]> {
  if (!branchId) return []
  const all = await getCafeLocations(viewerId)
  return all.filter(place => !place.archived_at && place.branch_ids.includes(branchId))
}

/**
 * Where stock goes when the person does not say: the Location they are working at, when stock can sit
 * there. Nothing else is guessed; every other case starts Unassigned.
 */
export function defaultStorageLocationId(
  stream: ProductionStream | null,
  locations: readonly CafeLocation[],
): string | null {
  const here = stream?.location
  return here?.holdsStock && locations.some(place => place.id === here.id) ? here.id : null
}

type ChoiceSnapshot = { scope: string | null; status: ChoiceStatus; locations: CafeLocation[] }
const EMPTY: ChoiceSnapshot = { scope: null, status: 'idle', locations: [] }

/** Reads the active Locations offered to this stream's branch. */
export function useCafeLocationChoices(stream: ProductionStream | null) {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const scope = stream?.branch.id ?? null
  const [retryKey, setRetryKey] = useState(0)
  const [snapshot, setSnapshot] = useState<ChoiceSnapshot>(EMPTY)

  useEffect(() => {
    if (!scope) { setSnapshot(EMPTY); return }
    let active = true
    setSnapshot({ scope, status: 'loading', locations: [] })
    void readCafeLocationChoices(viewerId, scope).then(locations => {
      if (active) setSnapshot({ scope, status: 'ready', locations })
    }).catch(() => {
      if (active) setSnapshot({ scope, status: 'error', locations: [] })
    })
    return () => { active = false }
  }, [retryKey, scope, viewerId])

  const retry = useCallback(() => setRetryKey(value => value + 1), [])
  const current = scope ? snapshot.scope === scope ? snapshot : { scope, status: 'loading' as const, locations: [] } : EMPTY
  return { ...current, retry }
}

/** Every active Location's name by id (any branch), for labelling where a plan or log went. */
export function useCafeLocationNames(): ReadonlyMap<string, string> {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  useEffect(() => {
    let active = true
    void getCafeLocations(viewerId).then(all => {
      if (active) setNames(new Map(all.map(place => [place.id, place.name] as const)))
    }).catch(() => {})
    return () => { active = false }
  }, [viewerId])
  return names
}
