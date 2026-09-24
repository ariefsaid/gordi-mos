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
import { activeCafeLocation, rememberCafeLocation } from '@/lib/cafe-opening-location'
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
  /**
   * The person's own stream — `shared.default_stream()`, unnarrowed by location or by a session
   * switch (issue #781 AC-016). `stream` above already folds this in as the FALLBACK a session
   * choice outranks; this copy is kept alongside it purely for DISPLAY — the "Your Team" tag and
   * the "Back to <home>" action (CafeStreamBar) need to know what the default WOULD be even while
   * a deliberate switch is overriding it, which `stream` alone cannot say once it has moved on.
   */
  homeStream: ProductionStream | null
  /**
   * The branch `locationOptions` was narrowed to — the explicit location, else the one the
   * person's own stream names. Null only when neither exists. A switch is remembered against it,
   * so a choice never lands in another location's slot.
   */
  branchId?: string | null
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
    homeStream: null,
    branchId: null,
  })

  // An auth switch can leave a Café route mounted. Drop the previous person's catalog before the
  // new viewer's bootstrap completes, so a stale branch/activity label cannot sit beside their
  // loading state or be mistaken for the new person's context.
  useEffect(() => {
    setCatalog({ branches: [], options: [], locationOptions: [], stream: null, homeStream: null, branchId: null })
  }, [viewerId])

  const resolve = useCallback(async (): Promise<CafeStreamCatalog> => {
    const [branches, pairs] = await Promise.all([listActiveBranches(), listStreamPairs()])
    const options = streamCatalogFrom(pairs, branches)
    // fetchDefaultStream needs the branch catalog, so it runs after the parallel pair.
    const ownDefault = await fetchDefaultStream(branches)
    // Where the viewer is working. An explicit choice from the Café root wins; with none — a fresh
    // tab opened straight onto Plan or Stock, which have no location chooser of their own — the
    // person's OWN stream names the branch, which is the profile-derived location the ruling asks
    // for. Only when neither exists is the catalog left whole, and then there is no location to be
    // wrong about: nothing has claimed one.
    const effectiveBranchId = activeBranchId ?? ownDefault?.branch.id ?? null
    const locationOptions = effectiveBranchId
      ? options.filter(option => option.branch.id === effectiveBranchId)
      : options
    // Resolved against the LOCATION's catalog, so a remembered stream from elsewhere simply is not
    // found and falls through to the person's own stream, then to null — the same safe ladder a
    // stale pair already took, with no special case for "wrong branch".
    const stream = resolveCafeStream(locationOptions, ownDefault, viewerId, effectiveBranchId)
    return { branches, options, locationOptions, stream, homeStream: ownDefault, branchId: effectiveBranchId }
  }, [activeBranchId, viewerId])

  const adopt = useCallback((next: CafeStreamCatalog) => setCatalog(next), [])

  const setStream = useCallback((next: ProductionStream) => {
    setCatalog(prev => ({ ...prev, stream: next }))
    // A person who opens Plan or Stock first — no Café root, no chosen location, and no own stream
    // to derive one from — is offered the whole catalog because nothing has claimed a location yet.
    // Their first deliberate choice IS that claim: it names the branch they are working at, so
    // every later surface is bounded to it and none of them can quietly file into another's books.
    // The Café root still overrides this when it resolves its own location, and a stream left over
    // from a different branch is then stale and cleared, which is the safe direction.
    const branchId = catalog.branchId ?? activeBranchId ?? next.branch.id
    if (viewerId && !activeBranchId && !catalog.branchId) {
      rememberCafeLocation(viewerId, { branchId: next.branch.id, branchName: next.branch.name })
    }
    // Every Café surface AT THIS LOCATION follows the choice (#440), and no other location does.
    rememberStream(next, viewerId, branchId)
  }, [activeBranchId, catalog.branchId, viewerId])

  return { ...catalog, resolve, adopt, setStream }
}
