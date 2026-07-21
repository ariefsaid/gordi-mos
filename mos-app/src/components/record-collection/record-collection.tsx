// Generic state/presentation host for the V3 RecordCollection engine (Issue 6).
// It renders loading / error / permission / empty / filtered-empty OR the active typed presentation
// exactly once. It owns state order, the selection bar, and status chrome — never a table/card visual
// system, and never a disabled "soon" presentation placeholder.
import type { ReactElement, ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import type { RecordCollectionController } from '@/lib/record-collection/engine'
import type { CollectionPresentationProps } from '@/lib/record-collection/types'
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
  const { controller, controls, selectionBar, empty, filteredEmpty, error, loadingLabel } = props
  const { state, descriptor } = controller

  if (state.status === 'loading') {
    return (
      <div className="record-collection" data-collection-status="loading">
        {controls}
        <LoadingShell label={loadingLabel} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="record-collection" data-collection-status="error">
        {controls}
        <ErrorState message={error.message} onRetry={error.retry} />
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
        <EmptyState variant="quiet" title={empty.title} copy={empty.copy}>
          {empty.create}
        </EmptyState>
      </div>
    )
  }

  if (state.status === 'filtered-empty') {
    return (
      <div className="record-collection" data-collection-status="filtered-empty">
        {controls}
        <EmptyState variant="blank" title={filteredEmpty.title} copy={filteredEmpty.copy}>
          <button type="button" className="record-collection-clear" onClick={filteredEmpty.clear}>
            Clear filters
          </button>
          {filteredEmpty.create}
        </EmptyState>
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
    onOpenRecord: (record) => controller.openRecord(record),
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
  )
}
