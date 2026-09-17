// useCafeStream — the ONE bootstrap every stream-scoped Café surface runs (issue 456).
//
// #440 deepened the stream DECISION into `cafe-stream.ts` (resolveCafeStream: the module's
// remembered choice, else the person's own stream, else ask). The WIRING around that decision
// was left pasted across the surfaces: the same catalog read, the same
// `streamCatalogFrom → resolveCafeStream(…, fetchDefaultStream)` order, the same
// `[branches, streamOptions, stream]` state clump, and the same "set → remember" switch. Five
// copies, and the clump had already drifted its own name (`streamOptions` on four surfaces,
// `streamCatalog` on the queue).
//
// SEAM, and why it is two calls rather than one. `resolve()` reads and decides but touches no
// state; `adopt()` commits. The capture and stock surfaces guard against a slow bootstrap
// landing on top of a newer switch (their `requestGen` ref), and a hook that set state at its
// own completion time would set it BEHIND that guard — pairing one stream's name with another
// stream's rows, which is the whole defect FR-061 exists to end. Splitting the two lets each
// caller keep the guard it already had.
//
// The `resolve()` promise is also the caller's to compose: every surface runs it inside its own
// `Promise.all` beside its own reads, so folding the catalog read in here costs no parallelism.
//
// NOT the review queue. That surface never calls resolveCafeStream: its filter is a stream KEY
// that may be `ALL_STREAMS` (OD-WAY-48 — it is the one cross-stream surface), and running the
// resolver there would RECORD a stream for the whole module from a queue that is deliberately
// looking at all of them. Its catalog read stays its own; sharing this hook would be a
// behaviour change wearing a refactor's clothes.

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { resolveCafeStream, rememberStream } from '@/lib/cafe-stream'
import { listStreamPairs, streamCatalogFrom } from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import { activeCafeLocation } from '@/lib/cafe-opening-location'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import type { BranchOption, ProductionStream } from '@/lib/db/kitchen-logs.types'

/** What one bootstrap read resolved — nothing is on screen until `adopt` takes it. */
export interface CafeStreamCatalog {
  /** The live branch catalog. Movement labels and destinations are derived from it. */
  branches: BranchOption[]
  /** The enumerated stream catalog (FR-005) — never a branch × activity cross-product. */
  options: ProductionStream[]
  /**
   * OD-CAFE-1: `options` narrowed to the branch the viewer is working at — what a stream PICKER
   * should offer. `options` stays whole because transfer movements are derived from it and a
   * transfer's destination is by definition another branch; filtering the catalog itself would
   * delete the cross-location workflow. With no active location this is `options`.
   */
  locationOptions: ProductionStream[]
  /** The stream this surface should open on; null = ask (FR-002). */
  stream: ProductionStream | null
}

export interface CafeStreamState extends CafeStreamCatalog {
  /** Read the catalog and resolve the module's stream. Pure apart from the #440 recording. */
  resolve: () => Promise<CafeStreamCatalog>
  /** Commit a resolved catalog to state — call it AFTER your own supersede guard. */
  adopt: (next: CafeStreamCatalog) => void
  /** The person switched. Records it module-wide so the next surface opens on it (#440). */
  setStream: (next: ProductionStream) => void
}

export function useCafeStream(): CafeStreamState {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  // The branch the viewer is working at, recorded by the Café root when a location resolves or is
  // switched. Plan and Stock never pass through that root, so this is how they learn it.
  const activeBranchId = activeCafeLocation(viewerId)?.branchId ?? null
  const [catalog, setCatalog] = useState<CafeStreamCatalog>({
    branches: [],
    options: [],
    locationOptions: [],
    stream: null,
  })

  // An auth switch can leave a Café route mounted. Drop the previous person's catalog before the
  // new viewer's bootstrap completes, so a stale branch/activity label cannot sit beside their
  // loading state or be mistaken for the new person's context.
  useEffect(() => {
    setCatalog({ branches: [], options: [], locationOptions: [], stream: null })
  }, [viewerId])

  const resolve = useCallback(async (): Promise<CafeStreamCatalog> => {
    const [branches, pairs] = await Promise.all([listActiveBranches(), listStreamPairs()])
    const options = streamCatalogFrom(pairs, branches)
    const locationOptions = activeBranchId
      ? options.filter(option => option.branch.id === activeBranchId)
      : options
    // Resolved against the LOCATION's catalog, so a remembered stream from elsewhere simply is not
    // found and falls through to the person's own stream, then to null — the same safe ladder a
    // stale pair already took, with no special case for "wrong branch".
    // fetchDefaultStream needs the branch catalog, so it runs after the parallel pair.
    const stream = resolveCafeStream(
      locationOptions, await fetchDefaultStream(branches), viewerId, activeBranchId,
    )
    return { branches, options, locationOptions, stream }
  }, [activeBranchId, viewerId])

  const adopt = useCallback((next: CafeStreamCatalog) => setCatalog(next), [])

  const setStream = useCallback((next: ProductionStream) => {
    setCatalog(prev => ({ ...prev, stream: next }))
    // Every Café surface AT THIS LOCATION follows the choice (#440), and no other location does.
    rememberStream(next, viewerId, activeBranchId)
  }, [activeBranchId, viewerId])

  return { ...catalog, resolve, adopt, setStream }
}
