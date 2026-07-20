import type { ReactNode } from 'react'
// RATIFY-BEFORE-MERGE: Issue 5 owns `@/components/record-viewer/record-viewer-contract`. Until it
// lands we import the identical opening-contract shape from the local integration seam.
import type {
  OverlayHostApi,
  RecordViewerOpenSource,
  RecordViewerOpeningContract,
} from './integration-contracts'
import type {
  CollectionViewSpec,
  CollectionViewValidationResult,
  PersistedCollectionView,
} from './collection-view-spec'

export type { OverlayHostApi, RecordViewerOpenSource, RecordViewerOpeningContract }

export type CollectionStatus =
  | 'loading' | 'ready' | 'empty' | 'filtered-empty' | 'error'
  | 'permission' | 'read-only'

export type QueryKey<TQuery extends object> = Extract<keyof TQuery, string>

export interface CollectionQueryIssue {
  key: string
  code: 'invalid-value' | 'unsupported-by-presentation' | 'missing-required'
  value?: string
}

export type CollectionQueryParse<TQuery extends object> =
  | { ok: true; query: TQuery }
  | { ok: false; query: TQuery | null; issues: readonly CollectionQueryIssue[] }

export interface CollectionQuerySchema<TQuery extends object> {
  readonly keys: readonly QueryKey<TQuery>[]
  /** The neutral/default query. A key is "populated" when its value differs from this. */
  readonly neutral: TQuery
  parse(params: URLSearchParams, presentation: string): CollectionQueryParse<TQuery>
  serialize(query: TQuery): URLSearchParams
  normalize(query: TQuery): TQuery
}

export interface CollectionCapabilities<TQuery extends object, TAction extends string> {
  search: boolean
  filterKeys: readonly QueryKey<TQuery>[]
  sortKeys: readonly QueryKey<TQuery>[]
  groupKeys: readonly QueryKey<TQuery>[]
  savedViews: boolean
  selection: boolean
  recordOpening: boolean
  bulkActions: readonly TAction[]
}

export type SavedViewOperation = 'save' | 'apply' | 'rename' | 'archive'

export interface CollectionViewStore {
  list(collectionId: CollectionViewSpec['collectionId']): Promise<readonly PersistedCollectionView[]>
  get(id: string): Promise<PersistedCollectionView | null>
  create(input: {
    name: string
    scope: 'private' | 'shared_team'
    spec: CollectionViewSpec
  }): Promise<PersistedCollectionView>
  rename(id: string, name: string): Promise<void>
  archive(id: string): Promise<void>
}

export type CollectionViewOperationStatus =
  | 'idle' | 'loading' | 'saving' | 'renaming' | 'archiving' | 'error'

export interface CollectionViewState {
  readonly items: readonly PersistedCollectionView[]
  readonly operation: CollectionViewOperationStatus
  readonly error: string | null
}

export interface CollectionAccess<TAction extends string> {
  mode: 'full' | 'read-only' | 'forbidden'
  visibleActions: readonly TAction[]
}

export interface CollectionData<TRecord, TContext> {
  records: readonly TRecord[]
  context: TContext
}

export interface CollectionProjection<TRecord, TGroup> {
  visibleRecords: readonly TRecord[]
  groups: readonly TGroup[]
  totalRecords: number
  visibleRecordsAreFiltered: boolean
}

export interface CollectionPresentationProps<
  TRecord,
  TQuery extends object,
  TProjection,
  TContext,
  TId extends string,
> {
  query: TQuery
  projection: TProjection
  context: TContext
  selectedIds: ReadonlySet<TId>
  onToggleSelected: (id: TId) => void
  onOpenRecord: (record: TRecord) => void
  onToggleGroup: (groupId: string) => void
  isGroupCollapsed: (groupId: string) => boolean
}

export interface CollectionPresentationDescriptor<
  TRecord,
  TId extends string,
  TQuery extends object,
  TProjection,
  TContext,
  TAction extends string,
  TPresentation extends string,
> {
  readonly id: TPresentation
  readonly label: string
  readonly compatibleQueryKeys: readonly QueryKey<TQuery>[]
  readonly capabilities: CollectionCapabilities<TQuery, TAction>
  render(props: CollectionPresentationProps<TRecord, TQuery, TProjection, TContext, TId>): ReactNode
}

export interface CollectionSavedViewDescriptor<
  TQuery extends object,
  TPresentation extends string,
> {
  readonly enabled: true
  readonly store: CollectionViewStore
  readonly operations: readonly SavedViewOperation[]
  buildSpec(args: { query: TQuery; presentation: TPresentation }): CollectionViewSpec
  parseAndValidate(input: unknown): CollectionViewValidationResult
  applySpec(spec: CollectionViewSpec): { query: TQuery; presentation: TPresentation }
}

export interface CollectionOpenSource<TQuery extends object, TPresentation extends string>
  extends RecordViewerOpenSource {
  query: TQuery
  presentation: TPresentation
}

export interface RecordCollectionDescriptor<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  readonly id: string
  readonly defaultPresentation: TPresentation
  readonly query: CollectionQuerySchema<TQuery>
  readonly savedViews: CollectionSavedViewDescriptor<TQuery, TPresentation>
  readonly presentations: Readonly<Record<
    TPresentation,
    CollectionPresentationDescriptor<
      TRecord,
      TId,
      TQuery,
      CollectionProjection<TRecord, TGroup>,
      TContext,
      TAction,
      TPresentation
    >
  >>
  load(args: { query: TQuery; viewerId: string | null }): Promise<CollectionData<TRecord, TContext>>
  project(
    data: CollectionData<TRecord, TContext>,
    query: TQuery,
    presentation: TPresentation,
  ): CollectionProjection<TRecord, TGroup>
  getId(record: TRecord): TId
  getAccess(args: {
    viewerId: string | null
    accessRoles: readonly string[]
  }): CollectionAccess<TAction>
  viewer: RecordViewerOpeningContract<TRecord>
  /** Issue 4 overlay host, injected by the React hook. React-free engine calls this seam. */
  host?: OverlayHostApi
  runBulkAction?: (args: {
    action: TAction
    ids: readonly TId[]
    viewerId: string
  }) => Promise<void>
}

export interface RecordCollectionState<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  status: CollectionStatus
  query: TQuery
  presentation: TPresentation
  data: CollectionData<TRecord, TContext> | null
  projection: CollectionProjection<TRecord, TGroup> | null
  selectedIds: ReadonlySet<TId>
  collapsedGroupIds: ReadonlySet<string>
  queryIssues: readonly CollectionQueryIssue[]
  error: string | null
  access: CollectionAccess<TAction>
  savedViews: CollectionViewState
}

export type PresentationSwitchResult<TQuery extends object, TPresentation extends string> =
  | { ok: true; query: TQuery; presentation: TPresentation }
  | {
      ok: false
      query: TQuery
      presentation: TPresentation
      issues: readonly CollectionQueryIssue[]
    }
