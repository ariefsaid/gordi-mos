// React-free RecordCollection controller (Issue 6). All transitions are synchronous state updates;
// async loading is guarded by a monotonic request id so a stale result never overwrites a newer one.
// The React hook subscribes via `subscribe` and owns URL sync; this module owns no React or Supabase.
import { checkPresentationCompatibility } from './query-state'
import type { CollectionViewSpec, PersistedCollectionView } from './collection-view-spec'
import type {
  CollectionAccess,
  CollectionOpenSource,
  CollectionOverlayHost,
  CollectionProjection,
  CollectionQueryIssue,
  CollectionStatus,
  CollectionViewState,
  PresentationSwitchResult,
  QueryKey,
  RecordCollectionDescriptor,
  RecordCollectionState,
} from './types'

export interface RecordCollectionController<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  readonly state: RecordCollectionState<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>
  readonly descriptor: RecordCollectionDescriptor<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  >
  subscribe(listener: () => void): () => void
  /**
   * Bind the live Issue 4 overlay host so `openRecord` reads the *current* session, not a stale
   * capture. The React hook re-binds each render; a fresh open after the session closes then opens
   * a new root instead of pushing onto an empty session.
   */
  bindOverlayHost(host: CollectionOverlayHost | undefined): void
  setQuery(next: TQuery): void
  switchPresentation(next: TPresentation): PresentationSwitchResult<TQuery, TPresentation>
  toggleSelected(id: TId): void
  selectVisible(ids: readonly TId[]): void
  clearSelection(): void
  toggleGroup(groupId: string): void
  /**
   * Bind a source builder (the React hook supplies the live pathname/search) so the presentation
   * can call `openRecord(record)` without threading router state through fixed surface props.
   */
  setSourceBuilder(builder: () => CollectionOpenSource<TQuery, TPresentation>): void
  openRecord(record: TRecord, source?: CollectionOpenSource<TQuery, TPresentation>): void
  runBulkAction(action: TAction): Promise<void>
  retry(): void
  loadSavedViews(): Promise<void>
  saveCurrentView(
    name: string,
    scope: 'private' | 'shared_team',
  ): Promise<PersistedCollectionView | null>
  applySavedView(id: string): Promise<PresentationSwitchResult<TQuery, TPresentation>>
  renameSavedView(id: string, name: string): Promise<void>
  archiveSavedView(id: string): Promise<void>
}

function deriveStatus<TAction extends string>(
  access: CollectionAccess<TAction>,
  projection: CollectionProjection<unknown, unknown> | null,
): CollectionStatus {
  if (access.mode === 'forbidden') return 'permission'
  if (!projection) return 'loading'
  const base: CollectionStatus =
    projection.totalRecords === 0
      ? 'empty'
      : projection.visibleRecords.length === 0 && projection.visibleRecordsAreFiltered
        ? 'filtered-empty'
        : 'ready'
  if (access.mode === 'read-only' && base === 'ready') return 'read-only'
  return base
}

export function createRecordCollectionController<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
>(
  descriptor: RecordCollectionDescriptor<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>,
  initial: {
    query: TQuery
    presentation: TPresentation
    viewerId: string | null
    accessRoles: readonly string[]
  },
): RecordCollectionController<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation> {
  type State = RecordCollectionState<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>

  const access = descriptor.getAccess({
    viewerId: initial.viewerId,
    accessRoles: initial.accessRoles,
  })

  let state: State = {
    status: access.mode === 'forbidden' ? 'permission' : 'loading',
    query: descriptor.query.normalize(initial.query),
    presentation: initial.presentation,
    data: null,
    projection: null,
    selectedIds: new Set<TId>(),
    collapsedGroupIds: new Set<string>(),
    queryIssues: [],
    error: null,
    access,
    savedViews: { items: [], operation: 'idle', error: null },
  }

  const listeners = new Set<() => void>()
  let loadToken = 0
  let overlayHost = descriptor.host
  let sourceBuilder: (() => CollectionOpenSource<TQuery, TPresentation>) | null = null

  const emit = () => {
    for (const l of listeners) l()
  }
  const set = (patch: Partial<State>) => {
    state = { ...state, ...patch }
    emit()
  }
  const setSavedViews = (patch: Partial<CollectionViewState>) => {
    set({ savedViews: { ...state.savedViews, ...patch } })
  }

  const runLoad = () => {
    if (state.access.mode === 'forbidden') {
      set({ status: 'permission', data: null, projection: null })
      return
    }
    const token = ++loadToken
    set({ status: 'loading', error: null })
    void descriptor
      .load({ query: state.query, viewerId: initial.viewerId })
      .then((data) => {
        if (token !== loadToken) return // stale result — dropped
        const projection = descriptor.project(data, state.query, state.presentation)
        set({ data, projection, status: deriveStatus(state.access, projection), error: null })
      })
      .catch((err: unknown) => {
        if (token !== loadToken) return
        set({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  const reproject = () => {
    if (!state.data) return
    const projection = descriptor.project(state.data, state.query, state.presentation)
    set({ projection, status: deriveStatus(state.access, projection) })
  }

  // Kick off the initial load.
  runLoad()

  const compatibleKeyMap = () => {
    const map = {} as Record<TPresentation, readonly QueryKey<TQuery>[]>
    for (const key of Object.keys(descriptor.presentations) as TPresentation[]) {
      map[key] = descriptor.presentations[key].compatibleQueryKeys
    }
    return map
  }

  const controller: RecordCollectionController<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  > = {
    get state() {
      return state
    },
    descriptor,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    bindOverlayHost(host) {
      overlayHost = host
    },
    setQuery(next) {
      set({ query: descriptor.query.normalize(next), queryIssues: [] })
      runLoad()
    },
    switchPresentation(next) {
      const result = checkPresentationCompatibility<TQuery, TPresentation>({
        query: state.query,
        schema: descriptor.query,
        from: state.presentation,
        to: next,
        compatibleQueryKeys: compatibleKeyMap(),
      })
      if (!result.ok) {
        set({ queryIssues: result.issues })
        return result
      }
      set({ presentation: next, queryIssues: [] })
      reproject() // same data, different presentation — no reload
      return result
    },
    toggleSelected(id) {
      const nextSel = new Set(state.selectedIds)
      if (nextSel.has(id)) nextSel.delete(id)
      else nextSel.add(id)
      set({ selectedIds: nextSel })
    },
    selectVisible(ids) {
      const nextSel = new Set(state.selectedIds)
      for (const id of ids) nextSel.add(id)
      set({ selectedIds: nextSel })
    },
    clearSelection() {
      set({ selectedIds: new Set<TId>() })
    },
    toggleGroup(groupId) {
      const next = new Set(state.collapsedGroupIds)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      set({ collapsedGroupIds: next })
    },
    setSourceBuilder(builder) {
      sourceBuilder = builder
    },
    openRecord(record, source) {
      const resolvedSource = source ?? sourceBuilder?.()
      if (!resolvedSource) return
      const entry = descriptor.viewer.buildPanelEntry(record, resolvedSource)
      const host = overlayHost
      if (!host) return
      // Dispatch off the LIVE session, not a monotonic counter: an open while a panel is already
      // live pushes a linked frame; a fresh open after the session has closed opens a new root.
      const hasOpenPanel = (host.session?.frames.length ?? 0) > 0
      if (hasOpenPanel) void host.push(entry)
      else void host.openRoot(entry, 'route')
    },
    async runBulkAction(action) {
      if (!descriptor.runBulkAction || initial.viewerId === null) return
      const ids = [...state.selectedIds]
      await descriptor.runBulkAction({ action, ids, viewerId: initial.viewerId })
      runLoad()
    },
    retry() {
      runLoad()
    },
    async loadSavedViews() {
      setSavedViews({ operation: 'loading', error: null })
      try {
        const items = await descriptor.savedViews.store.list(descriptor.id as CollectionViewSpec['collectionId'])
        setSavedViews({ items, operation: 'idle', error: null })
      } catch (err) {
        setSavedViews({ operation: 'error', error: errText(err) })
      }
    },
    async saveCurrentView(name, scope) {
      setSavedViews({ operation: 'saving', error: null })
      const spec = descriptor.savedViews.buildSpec({
        query: state.query,
        presentation: state.presentation,
      })
      const validation = descriptor.savedViews.parseAndValidate(spec)
      if (!validation.ok) {
        setSavedViews({ operation: 'error', error: 'This view cannot be saved: ' + summarize(validation.issues) })
        return null
      }
      try {
        const created = await descriptor.savedViews.store.create({ name, scope, spec: validation.spec })
        set({ query: { ...state.query, ['savedViewId' as keyof TQuery]: created.id } as TQuery })
        setSavedViews({ items: [...state.savedViews.items, created], operation: 'idle', error: null })
        return created
      } catch (err) {
        setSavedViews({ operation: 'error', error: errText(err) })
        return null
      }
    },
    async applySavedView(id) {
      setSavedViews({ operation: 'loading', error: null })
      let view: PersistedCollectionView | null
      try {
        view = await descriptor.savedViews.store.get(id)
      } catch (err) {
        setSavedViews({ operation: 'error', error: errText(err) })
        return failSwitch(state.query, state.presentation, 'load-failed')
      }
      if (!view) {
        setSavedViews({ operation: 'error', error: 'Saved view not found.' })
        return failSwitch(state.query, state.presentation, 'not-found')
      }
      const validation = descriptor.savedViews.parseAndValidate(view.spec)
      if (!validation.ok) {
        setSavedViews({ operation: 'error', error: 'This saved view is no longer valid: ' + summarize(validation.issues) })
        return failSwitch(state.query, state.presentation, 'invalid-spec')
      }
      const applied = descriptor.savedViews.applySpec(validation.spec)
      const compat = checkPresentationCompatibility<TQuery, TPresentation>({
        query: applied.query,
        schema: descriptor.query,
        from: state.presentation,
        to: applied.presentation,
        compatibleQueryKeys: compatibleKeyMap(),
      })
      if (!compat.ok) {
        setSavedViews({ operation: 'error', error: 'This saved view is incompatible with its presentation.' })
        return compat
      }
      const nextQuery = { ...applied.query, ['savedViewId' as keyof TQuery]: id } as TQuery
      set({ query: descriptor.query.normalize(nextQuery), presentation: applied.presentation })
      setSavedViews({ operation: 'idle', error: null })
      runLoad()
      return { ok: true, query: nextQuery, presentation: applied.presentation }
    },
    async renameSavedView(id, name) {
      setSavedViews({ operation: 'renaming', error: null })
      try {
        await descriptor.savedViews.store.rename(id, name)
        const items = state.savedViews.items.map((v) => (v.id === id ? { ...v, name } : v))
        setSavedViews({ items, operation: 'idle', error: null })
      } catch (err) {
        setSavedViews({ operation: 'error', error: errText(err) })
      }
    },
    async archiveSavedView(id) {
      setSavedViews({ operation: 'archiving', error: null })
      try {
        await descriptor.savedViews.store.archive(id)
        const items = state.savedViews.items.filter((v) => v.id !== id)
        // Archive clears only the saved identity; the compatible current collection state stays.
        const currentSavedId = (state.query as { savedViewId?: string | null }).savedViewId
        const clearedId = currentSavedId === id
        setSavedViews({ items, operation: 'idle', error: null })
        if (clearedId) set({ query: { ...state.query, ['savedViewId' as keyof TQuery]: null } as TQuery })
      } catch (err) {
        setSavedViews({ operation: 'error', error: errText(err) })
      }
    },
  }

  return controller

  function failSwitch(
    query: TQuery,
    presentation: TPresentation,
    reason: string,
  ): PresentationSwitchResult<TQuery, TPresentation> {
    const issues: CollectionQueryIssue[] = [{ key: 'saved', code: 'invalid-value', value: reason }]
    return { ok: false, query, presentation, issues }
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function summarize(issues: readonly { code: string }[]): string {
  return issues.map((i) => i.code).join(', ')
}
