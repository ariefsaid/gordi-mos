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
  const { descriptor, urlMode, fixedQuery, viewerId, accessRoles } = options
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

  if (controllerRef.current === null) {
    let query: TQuery
    let presentation: TPresentation
    if (urlMode === 'fixed' && fixedQuery) {
      query = fixedQuery
      presentation = presentationOf(fixedQuery, descriptor.defaultPresentation)
    } else {
      const parsed = descriptor.query.parse(new URLSearchParams(searchParams), descriptor.defaultPresentation)
      query = parsed.ok ? parsed.query : parsed.query ?? descriptor.query.neutral
      presentation = presentationOf(query, descriptor.defaultPresentation)
    }
    controllerRef.current = createRecordCollectionController(
      { ...descriptor, host },
      { query, presentation, viewerId, accessRoles },
    )
  }

  const controller = controllerRef.current
  const state = useSyncExternalStore(controller.subscribe, () => controller.state, () => controller.state)

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
        if (result.ok) writeUrl(false)
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
