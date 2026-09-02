// React binding for the RecordCollection engine (Issue 6). `useSearchParams` lives ONLY here.
// synced: reads/writes the canonical collection query; search/filter changes replace the history
// entry, while presentation and saved-view changes create a shareable entry.
// fixed: the Home embedded Signal Feed — a fixed query that never steals the Home route's URL.
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import { createRecordCollectionController, type RecordCollectionController } from './engine'
import { writeCollectionQuery } from './query-state'
import type {
  CollectionOverlayHost,
  PresentationSwitchResult,
  RecordCollectionDescriptor,
} from './types'

export interface UseRecordCollectionOptions<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  descriptor: RecordCollectionDescriptor<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>
  urlMode: 'synced' | 'fixed'
  fixedQuery?: TQuery
  /** Initial typed query used by compatibility embedders when the URL has no collection query. */
  initialQuery?: TQuery
  /** Phone hosts are state-constrained to the collection's default presentation. */
  isDesktop?: boolean
  viewerId: string | null
  accessRoles: readonly string[]
  /**
   * Explicit overlay host override. When omitted, the hook binds the ambient Issue 4
   * `useOverlayHost()` controller if one is present in the tree (see below).
   */
  host?: CollectionOverlayHost
}

export function useRecordCollection<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
>(
  options: UseRecordCollectionOptions<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>,
): RecordCollectionController<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation> {
  const { descriptor, urlMode, fixedQuery, initialQuery, viewerId, accessRoles, isDesktop = true } = options
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  // Prefer an explicit host override; otherwise bind the ambient Issue 4 overlay controller when a
  // provider is present. Absent both (e.g. an embedded collection with no record-opening), the
  // engine's host stays undefined and openRecord is a no-op — exactly as before this wiring.
  const ambientHost = useOptionalOverlayHost()
  const host = options.host ?? ambientHost ?? undefined

  // Build the controller exactly once. Initial query/presentation come from the URL (synced) or the
  // caller's fixed query (fixed). Malformed URL values fall back to the neutral query, not a crash.
  const controllerRef = useRef<RecordCollectionController<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  > | null>(null)

  // What the URL/saved view asked for, independent of the phone constraint — restored verbatim if
  // isDesktop flips back true while it's still a compatible presentation for the live query.
  const desiredPresentationRef = useRef<TPresentation>(descriptor.defaultPresentation)
  const wasDesktopRef = useRef(isDesktop)

  if (controllerRef.current === null) {
    let query: TQuery
    let desired: TPresentation
    if (urlMode === 'fixed' && fixedQuery) {
      query = fixedQuery
      desired = presentationOf(fixedQuery, descriptor.defaultPresentation)
    } else if (initialQuery && location.search === '') {
      query = initialQuery
      desired = presentationOf(initialQuery, descriptor.defaultPresentation)
    } else {
      const parsed = descriptor.query.parse(new URLSearchParams(searchParams), descriptor.defaultPresentation)
      query = parsed.ok ? parsed.query : parsed.query ?? descriptor.query.neutral
      desired = presentationOf(query, descriptor.defaultPresentation)
    }
    desiredPresentationRef.current = desired
    const presentation = isDesktop ? desired : descriptor.defaultPresentation
    controllerRef.current = createRecordCollectionController(
      { ...descriptor, host },
      { query, presentation, viewerId, accessRoles, isDesktop },
    )
  }

  const controller = controllerRef.current

  // React to isDesktop FLIPPING (not merely being false) — a mount that starts on phone is already
  // handled above by the constructor branch. Narrowing pins the presentation to the collection
  // default at the state layer (Issue #607: CSS alone left a desktop session showing Table with its
  // switcher tabs gone — a dead end). Widening restores what was asked for, but only if the query
  // that accumulated while narrow still supports it; otherwise the default stands, same as a
  // rejected switchPresentation would leave it.
  useEffect(() => {
    if (wasDesktopRef.current === isDesktop) return
    wasDesktopRef.current = isDesktop
    controller.setViewport(isDesktop)
    if (!isDesktop) {
      desiredPresentationRef.current = controller.state.presentation
      controller.constrainPresentation(descriptor.defaultPresentation)
      return
    }
    const desired = desiredPresentationRef.current
    if (desired !== controller.state.presentation && controller.canSwitchPresentation(desired)) {
      controller.constrainPresentation(desired)
    }
  }, [isDesktop, controller, descriptor])
  const state = useSyncExternalStore(controller.subscribe, () => controller.state, () => controller.state)

  // Re-bind the live overlay host every render. The controller is built once, but the ambient host
  // object is recreated whenever its session changes; without this the engine would read a stale
  // (forever-empty) session and could never tell an open panel from a closed one.
  controller.bindOverlayHost(host)

  // Bind the live location so a presentation can open a record without threading router props.
  controller.setSourceBuilder(() => ({
    collectionId: descriptor.id,
    presentation: state.presentation,
    pathname: location.pathname,
    search: location.search,
    query: state.query,
  }))

  // In synced mode, mirror the controller's typed query into the URL, overriding `layout` with the
  // live presentation so the URL stays canonical without storing presentation twice in the engine.
  useEffect(() => {
    if (urlMode !== 'synced') return
    const canonical = { ...state.query, layout: state.presentation } as unknown as TQuery
    const next = writeCollectionQuery(descriptor.query, canonical, new URLSearchParams(location.search))
    if (next.toString() !== new URLSearchParams(location.search).toString()) {
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.query, state.presentation])

  // Return a stable wrapper so a synced saved-view/presentation change adds a shareable history entry.
  return useMemo(() => {
    if (urlMode !== 'synced') return controller
    const writeUrl = (replace: boolean) => {
      const canonical = { ...controller.state.query, layout: controller.state.presentation } as unknown as TQuery
      const next = writeCollectionQuery(descriptor.query, canonical, new URLSearchParams(location.search))
      setSearchParams(next, { replace })
    }
    return {
      ...controller,
      get state() {
        return controller.state
      },
      switchPresentation: (next: TPresentation): PresentationSwitchResult<TQuery, TPresentation> => {
        const result = controller.switchPresentation(next)
        if (result.ok) writeUrl(false)
        return result
      },
      applySavedView: async (id: string) => {
        const result = await controller.applySavedView(id)
        if (result.ok) {
          // The engine already constrained state.presentation to the collection default when narrow
          // (Issue #614); `result.presentation` still carries what the saved view itself asked for,
          // so THAT — not the value captured at the last narrow transition — is what a later widen
          // must restore.
          desiredPresentationRef.current = result.presentation
          writeUrl(false)
        }
        return result
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, location.search, urlMode])
}

function presentationOf<TQuery extends object, TPresentation extends string>(
  query: TQuery,
  fallback: TPresentation,
): TPresentation {
  const layout = (query as { layout?: unknown }).layout
  return typeof layout === 'string' ? (layout as TPresentation) : fallback
}
