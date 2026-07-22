// Generic state/presentation host for the V3 RecordCollection engine (Issue 6).
// It renders loading / error / permission / empty / filtered-empty OR the active typed presentation
// exactly once. It owns state order, the selection bar, and status chrome — never a table/card visual
// system, and never a disabled "soon" presentation placeholder.
import type { ReactElement, ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import type { RecordCollectionController } from '@/lib/record-collection/engine'
import type { CollectionPresentationProps } from '@/lib/record-collection/types'
import { useT } from '@/i18n/use-t'
import './record-collection.css'

export interface RecordCollectionSurfaceProps<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  controller: RecordCollectionController<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>
  /** Typed domain toolbar (search / filters / sort / group / saved views). Manager disclosure. */
  controls?: ReactNode
  /** Typed bulk-action bar; rendered only when the descriptor grants selection and rows are picked. */
  selectionBar?: ReactNode
  empty: { title: string; copy?: string; create?: ReactNode }
  filteredEmpty: { title: string; copy?: string; clear: () => void; create?: ReactNode }
  error: { message: string; retry: () => void }
  loadingLabel: string
  /** Shared E7 result-header framing: collection eyebrow, the active view label, and the result count. */
  resultHeader?: RecordCollectionResultHeader
  /** Page-level route seam for opening a record while preserving collection URL state. */
  onOpenRecord?: (record: TRecord) => void
}

/**
 * Shared result-header contract (OD-REDESIGN-72/79). Tasks and Signals pass the same three
 * fields so every RecordCollection region reads as one E7 family — the collection context,
 * the active view, and how many results it currently shows — without collapsing typed models.
 */
export interface RecordCollectionResultHeader {
  /** Quiet eyebrow naming the collection (e.g. "Tasks", "Signals"). */
  collectionLabel: string
  /** The active result view (e.g. "All", "Overdue", "Needs attention"). */
  viewLabel: string
  /** Visible result count for the active view; null while unknown (loading/error). */
  count: number | null
}

export function RecordCollectionSurface<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
>(
  props: RecordCollectionSurfaceProps<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>,
): ReactElement {
  const { controller, controls, selectionBar, empty, filteredEmpty, error, loadingLabel, resultHeader, onOpenRecord } = props
  const { state, descriptor } = controller
  const t = useT()
  // One consistent result-header line for every opted-in collection. Rendered in every state
  // where the collection is framed (all but permission-denied); the count is null-safe so a
  // loading/error region still shows which collection and view it represents. E7 result-card
  // anatomy (owner score gate, 2026-07-22): "<view> · <collection>" leads left, the result count
  // trails right — this is the header's first row, sharing one card frame with what follows it
  // (record-collection-results below removes the gap so the header reads as attached, not floating).
  const header = resultHeader ? (
    <div className="record-collection-result" data-testid="collection-result-header">
      <span className="record-collection-result__label">
        <span className="record-collection-result__view">{resultHeader.viewLabel}</span>
        <span className="record-collection-result__sep" aria-hidden="true"> · </span>
        <span className="record-collection-result__collection">{resultHeader.collectionLabel}</span>
      </span>
      <span className="record-collection-result__count tabular-nums">
        {resultHeader.count === null ? '—' : t('common.resultCount', { count: resultHeader.count })}
      </span>
    </div>
  ) : null

  if (state.status === 'loading') {
    return (
      <div className="record-collection" data-collection-status="loading">
        {controls}
        <div className="record-collection-results">
          {header}
          <LoadingShell label={loadingLabel} />
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="record-collection" data-collection-status="error">
        {controls}
        <div className="record-collection-results">
          {header}
          <ErrorState message={error.message} onRetry={error.retry} />
        </div>
      </div>
    )
  }

  if (state.status === 'permission') {
    return (
      <div className="record-collection" data-collection-status="permission">
        <EmptyState
          variant="blank"
          title="You don’t have access to this collection"
          copy="Ask an admin if you think you should be able to see it."
        />
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="record-collection" data-collection-status="empty">
        {controls}
        <div className="record-collection-results">
          {header}
          <EmptyState variant="quiet" title={empty.title} copy={empty.copy}>
            {empty.create}
          </EmptyState>
        </div>
      </div>
    )
  }

  if (state.status === 'filtered-empty') {
    return (
      <div className="record-collection" data-collection-status="filtered-empty">
        {controls}
        <div className="record-collection-results">
          {header}
          <EmptyState variant="blank" title={filteredEmpty.title} copy={filteredEmpty.copy}>
            <button type="button" className="record-collection-clear" onClick={filteredEmpty.clear}>
              Clear filters
            </button>
            {filteredEmpty.create}
          </EmptyState>
        </div>
      </div>
    )
  }

  // status === 'ready' | 'read-only'
  const readOnly = state.status === 'read-only'
  const presentation = descriptor.presentations[state.presentation]
  const context = state.data?.context as TContext
  const projection = state.projection
  if (!projection) {
    return (
      <div className="record-collection" data-collection-status="loading">
        <LoadingShell label={loadingLabel} />
      </div>
    )
  }

  const presentationProps: CollectionPresentationProps<
    TRecord,
    TQuery,
    typeof projection,
    TContext,
    TId
  > = {
    query: state.query,
    projection,
    context,
    selectedIds: state.selectedIds,
    onToggleSelected: (id) => controller.toggleSelected(id),
    onOpenRecord: onOpenRecord ?? ((record) => controller.openRecord(record)),
    onToggleGroup: (groupId) => controller.toggleGroup(groupId),
    isGroupCollapsed: (groupId) => state.collapsedGroupIds.has(groupId),
  }

  const showSelectionBar =
    !readOnly &&
    presentation.capabilities.selection &&
    state.selectedIds.size > 0 &&
    selectionBar !== undefined

  return (
    <div className="record-collection" data-collection-status={state.status}>
      {controls}
      <div className="record-collection-results">
        {header}
        {readOnly && (
          <p className="record-collection-readonly" role="status">
            You can view this collection but not edit it.
          </p>
        )}
        {showSelectionBar && (
          <div className="record-collection-selection" data-testid="collection-selection-bar">
            {selectionBar}
          </div>
        )}
        <div className="record-collection-body">{presentation.render(presentationProps)}</div>
      </div>
    </div>
  )
}
