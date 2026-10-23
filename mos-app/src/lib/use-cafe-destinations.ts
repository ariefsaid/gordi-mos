// Where the stream in view can send: Production, then one transfer per destination Location. The
// answer is the database's (rule 2); this reads it once per Location per Café visit.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { getCafeDestinationLocations } from '@/lib/cafe-visit-cache'
import { movementsFromDestinations, PRODUCE, streamProduces } from '@/lib/kitchen-action-label'
import type { KitchenMovement, ProductionStream } from '@/lib/db/kitchen-logs.types'

type Status = 'idle' | 'loading' | 'ready' | 'error'

/** The movements a stream offers, for code that is not a hook (page loaders). */
export async function readCafeMovements(
  viewerId: string | null,
  stream: ProductionStream,
  catalog: readonly ProductionStream[],
): Promise<KitchenMovement[]> {
  if (!streamProduces(stream, catalog)) return []
  if (!stream.location) return [PRODUCE]
  return movementsFromDestinations(await getCafeDestinationLocations(viewerId, stream.location.id))
}

export function useCafeDestinations(stream: ProductionStream | null, catalog: readonly ProductionStream[]) {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const locationId = stream?.location?.id ?? null
  const produces = streamProduces(stream, catalog)
  const scope = stream ? `${stream.branch.id}|${stream.activity}|${locationId ?? ''}|${produces}` : null
  const [retryKey, setRetryKey] = useState(0)
  const [state, setState] = useState<{ scope: string | null; status: Status; movements: KitchenMovement[] }>({ scope: null, status: 'idle', movements: [] })

  useEffect(() => {
    if (!scope || !stream) { setState({ scope: null, status: 'idle', movements: [] }); return }
    if (!produces) { setState({ scope, status: 'ready', movements: [] }); return }
    if (!locationId) { setState({ scope, status: 'ready', movements: [PRODUCE] }); return }
    let active = true
    setState({ scope, status: 'loading', movements: [] })
    void readCafeMovements(viewerId, stream, catalog).then(movements => {
      if (active) setState({ scope, status: 'ready', movements })
    }).catch(() => { if (active) setState({ scope, status: 'error', movements: [] }) })
    return () => { active = false }
    // The stream object is rebuilt on every catalog read; its scope string is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, viewerId, retryKey])

  const retry = useCallback(() => setRetryKey(value => value + 1), [])
  const current = state.scope === scope ? state : { scope, status: (scope ? 'loading' : 'idle') as Status, movements: [] as KitchenMovement[] }
  return { status: current.status, movements: current.movements, retry }
}
