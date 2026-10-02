// useCafeStream — the ONE bootstrap every stream-scoped Café surface runs (issue 456).
//
// #440 deepened the stream DECISION into `cafe-stream.ts` (resolveCafeStream: the module's
// OD-CAFE-6 ladder: home stream, else the only Café Team, else the last choice, else ask). The WIRING around that decision
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
import { listCafeDestinations, listStreamPairs, streamCatalogFrom } from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import { activeCafeLocation, rememberCafeLocation } from '@/lib/cafe-opening-location'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import { reportError } from '@/lib/telemetry'
import { streamKey } from '@/lib/kitchen-action-label'
import type { BranchOption, CafeDestination, ProductionStream } from '@/lib/db/kitchen-logs.types'

const EMPTY_STREAM_KEYS: ReadonlySet<string> = new Set()

/** What one bootstrap read resolved — nothing is on screen until `adopt` takes it. */
export interface CafeStreamCatalog {
  /** The live branch catalog used to label movements and resolve configured destinations. */
  branches: BranchOption[]
  /** The enumerated stream catalog (FR-005) — never a branch × activity cross-product. */
  options: ProductionStream[]
  /** Org-scoped cross-branch movement routes, read from ops.cafe_destinations. */
  destinations: CafeDestination[]
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
   * Stream keys (`streamKey(branch_id, activity)`, `lib/kitchen-action-label`) for every stream
   * Team the person is a CURRENT member of — home included, but not only home. Marking is not
   * defaulting: the binding rule only bars a SECONDARY membership from becoming `stream`'s
   * default, it says nothing about display, so a person can be a current member of more than one
   * stream and CafeStreamBar/CafeStreamChoices need all of them to tag "Your Team" and rank them
   * first (issue #781 follow-up).
   */
  myStreamKeys: ReadonlySet<string>
  /**
   * The branch `locationOptions` was narrowed to — the explicit location, else the one the
   * person's own stream names. Null only when neither exists. A switch is remembered against it,
   * so a choice never lands in another location's slot.
   */
  branchId?: string | null
}

export interface CafeStreamState extends CafeStreamCatalog {
  /** Read the catalog and resolve the module's stream. Pure: only `setStream` records a choice. */
  resolve: () => Promise<CafeStreamCatalog>
  /** Commit a resolved catalog to state — call it AFTER your own supersede guard. */
  adopt: (next: CafeStreamCatalog) => void
  /** The person switched. Records it module-wide so the next surface opens on it (#440). */
  setStream: (next: ProductionStream) => void
}

export function useCafeStream(): CafeStreamState {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  // The branch the viewer is working at (`activeCafeLocation`) is read when `resolve`/`setStream`
  // run, not at render: a location switch must not give `resolve` a new identity, or the surface
  // would re-bootstrap underneath the switch that caused it.
  const [catalog, setCatalog] = useState<CafeStreamCatalog>({
    branches: [],
    options: [],
    destinations: [],
    locationOptions: [],
    stream: null,
    homeStream: null,
    myStreamKeys: EMPTY_STREAM_KEYS,
    branchId: null,
  })

  // An auth switch can leave a Café route mounted. Drop the previous person's catalog before the
  // new viewer's bootstrap completes, so a stale branch/activity label cannot sit beside their
  // loading state or be mistaken for the new person's context.
  useEffect(() => {
    setCatalog({
      branches: [], options: [], destinations: [], locationOptions: [], stream: null,
      homeStream: null, myStreamKeys: EMPTY_STREAM_KEYS, branchId: null,
    })
  }, [viewerId])

  const resolve = useCallback(async (): Promise<CafeStreamCatalog> => {
    const [branches, pairs, destinations, myTeams] = await Promise.all([
      listActiveBranches(),
      listStreamPairs(),
      viewerId ? listCafeDestinations() : Promise.resolve([]),
      // Current profile memberships (effective-dated, home included) — the read the "Your Team"
      // tag needs beyond the single default (issue #781 follow-up). Skipped when unauthenticated.
      // Display only: a failure drops the tags, never the surface.
      viewerId
        ? listCafeViewerTeams(viewerId).catch((error: unknown) => {
          reportError(error, { read: 'cafe viewer teams' })
          return []
        })
        : Promise.resolve([]),
    ])
    const options = streamCatalogFrom(pairs, branches)
    const myStreamKeys = new Set(
      myTeams
        .filter((team) => team.branch_id !== null && team.activity !== null)
        .map((team) => streamKey(team.branch_id as string, team.activity!)),
    )
    // fetchDefaultStream needs the branch catalog, so it runs after the parallel pair.
    const ownDefault = await fetchDefaultStream(branches)
    // OD-CAFE-6 rung 2: the person's only Café stream Team. Inferred, so never recorded in the
    // shared session slot — only a choice is.
    const soleKey = myStreamKeys.size === 1 ? [...myStreamKeys][0] : null
    const soleStream = soleKey
      ? options.find(option => streamKey(option.branch.id, option.activity) === soleKey) ?? null
      : null
    // Where the viewer is working (OD-CAFE-1): an explicit session choice, else the home stream's
    // branch, else the only branch they have a Café stream Team at. Only when none exists is the
    // catalog left whole — "ask": nothing has claimed a location, so the first choice does.
    const memberBranchIds = new Set(
      options.filter(option => myStreamKeys.has(streamKey(option.branch.id, option.activity)))
        .map(option => option.branch.id),
    )
    const onlyBranchId = memberBranchIds.size === 1 ? [...memberBranchIds][0] : null
    const effectiveBranchId = (activeCafeLocation(viewerId)?.branchId ?? null) ?? ownDefault?.branch.id ?? onlyBranchId ?? null
    const locationOptions = effectiveBranchId
      ? options.filter(option => option.branch.id === effectiveBranchId)
      : options
    // Resolved against the LOCATION's catalog, so a stream from elsewhere simply is not found and
    // falls through to the next rung — no special case for "wrong branch".
    const stream = resolveCafeStream(locationOptions, ownDefault, viewerId, effectiveBranchId, soleStream)
    return {
      branches, options, destinations, locationOptions, stream,
      homeStream: ownDefault, myStreamKeys, branchId: effectiveBranchId,
    }
  }, [viewerId])

  const adopt = useCallback((next: CafeStreamCatalog) => setCatalog(next), [])

  const setStream = useCallback((next: ProductionStream) => {
    // A person who opens Plan or Stock first — no Café root, no chosen location, and no own stream
    // to derive one from — is offered the whole catalog because nothing has claimed a location yet.
    // Their first deliberate choice IS that claim: it names the branch they are working at, so
    // every later surface is bounded to it and none of them can quietly file into another's books.
    // A choice in another branch's stream IS the explicit switch of location (OD-CAFE-1): it
    // commits that location before anything is captured, so no surface mixes branches.
    const branchId = next.branch.id
    if (viewerId && branchId !== (catalog.branchId ?? (activeCafeLocation(viewerId)?.branchId ?? null))) {
      rememberCafeLocation(viewerId, { branchId, branchName: next.branch.name })
    }
    // Every Café surface AT THIS LOCATION follows the choice (#440), and no other location does.
    rememberStream(next, viewerId, branchId)
    // #868: the claim narrows THIS mount's picker too, not only the next surface's bootstrap read.
    // Without this, `locationOptions` kept the pre-claim (wider) list until the surface remounted
    // and re-ran resolve() — so a second pick, in the same session, could still offer another
    // branch's streams.
    setCatalog(prev => ({
      ...prev,
      stream: next,
      branchId,
      locationOptions: prev.options.filter(option => option.branch.id === branchId),
    }))
  }, [catalog.branchId, viewerId])

  return { ...catalog, resolve, adopt, setStream }
}
