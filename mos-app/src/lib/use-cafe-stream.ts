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

import { useCallback, useState } from 'react'
import { resolveCafeStream, rememberStream } from '@/lib/cafe-stream'
import { listStreamPairs, streamCatalogFrom } from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import type { BranchOption, ProductionStream } from '@/lib/db/kitchen-logs.types'

/** What one bootstrap read resolved — nothing is on screen until `adopt` takes it. */
export interface CafeStreamCatalog {
  /** The live branch catalog. Movement labels and destinations are derived from it. */
  branches: BranchOption[]
  /** The enumerated six-stream catalog (FR-005) — never a branch × activity cross-product. */
  options: ProductionStream[]
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
  const [catalog, setCatalog] = useState<CafeStreamCatalog>({
    branches: [],
    options: [],
    stream: null,
  })

  const resolve = useCallback(async (): Promise<CafeStreamCatalog> => {
    const [branches, pairs] = await Promise.all([listActiveBranches(), listStreamPairs()])
    const options = streamCatalogFrom(pairs, branches)
    // fetchDefaultStream needs the branch catalog, so it runs after the parallel pair.
    const stream = resolveCafeStream(options, await fetchDefaultStream(branches))
    return { branches, options, stream }
  }, [])

  const adopt = useCallback((next: CafeStreamCatalog) => setCatalog(next), [])

  const setStream = useCallback((next: ProductionStream) => {
    setCatalog(prev => ({ ...prev, stream: next }))
    rememberStream(next) // the whole Café module follows this choice (#440)
  }, [])

  return { ...catalog, resolve, adopt, setStream }
}
