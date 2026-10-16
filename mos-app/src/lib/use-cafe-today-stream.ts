// useCafeTodayStream — the stream Café home states and works from.
//
// Café home never captures, but it must say WHICH stream the day's numbers belong to, and let the person
// switch it, exactly as every capture page does. This runs the module's one bootstrap (useCafeStream) and
// bounds the picker to the active location the way the capture pages do, so the two never disagree.
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { canPushCafe } from '@/lib/kitchen-gates'
import { streamKey } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

export type TodayStreamState = 'loading' | 'ready' | 'error'

export function useCafeTodayStream() {
  const auth = useAuth()
  const cafeStream = useCafeStream()
  const { resolve, adopt, options, branchId, stream: resolvedStream, homeStream, myStreamKeys, setStream } = cafeStream
  const [state, setState] = useState<TodayStreamState>('loading')

  useEffect(() => {
    let live = true
    setState('loading')
    void resolve().then(catalog => {
      if (!live) return
      adopt(catalog)
      setState('ready')
    }).catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [adopt, resolve])

  const elevated = auth.status === 'authenticated' && canPushCafe(auth.viewer.accessRoles)
  const locationId = branchId ?? undefined
  const streamOptions = useMemo(() => {
    const eligible = (option: ProductionStream) => elevated || myStreamKeys.has(streamKey(option.branch.id, option.activity))
    return locationId
      ? [
        ...options.filter(option => option.branch.id === locationId),
        ...options.filter(option => option.branch.id !== locationId && eligible(option)),
      ]
      : options.filter(eligible)
  }, [elevated, locationId, myStreamKeys, options])
  // A remembered stream from another location is stale, not a default (OD-CAFE-1).
  const stream = locationId && resolvedStream && resolvedStream.branch.id !== locationId ? null : resolvedStream

  return {
    state,
    stream,
    streamOptions,
    allOptions: options,
    destinations: cafeStream.destinations,
    branches: cafeStream.branches,
    homeStream,
    myStreamKeys,
    locationId,
    setStream,
  }
}
