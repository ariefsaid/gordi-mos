// TasksTableBody — the records-workspace body region: every load state
// (loading skeleton, error, empty-no-tasks, no-results-after-filter), the
// desktop <table> (sortable <thead> with the select-all checkbox + the plain /
// virtualized <tbody>), and the mobile grouped-card fallback.
//
// The per-row + per-group rendering is threaded in as render props
// (renderRow / renderGroupHeader) so this component stays free of TaskRow's
// data plumbing (selection set, cursor ref, navigate) — those live in the
// orchestrator. Virtualization (refs, padTop/padBottom spacer rows) and the
// keyboard-cursor scroll element stay co-located here so the windowing seam is
// not split across files. Extracted from TasksWorkspace (conventions §1).
import type { ReactNode, Ref } from 'react'
import type { To } from 'react-router-dom'
import { Link } from 'react-router-dom'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { ErrorState, EmptyState } from '@/components/ui/state-kit'
import { MobileGroupedCards } from './mobile-grouped-cards'
import { RowCheckbox } from './row-checkbox'
import type { RenderGroup } from './tasks-grouping'
import type { WorkloadSummary } from './workload-caption'
import { WorkloadCaption } from './workload-caption'
import { useT } from '@/i18n/use-t'

type SortCol = 'task' | 'status' | 'owner' | 'due' | 'activity'

// Flat visible-row model (group headers + expanded-group leaf rows) — the shape
// the plain + virtualized bodies iterate over.
export type FlatRow =
  | { kind: 'header'; group: RenderGroup }
  | { kind: 'leaf'; task: TaskListRow; leafIndex: number }

// ── Skeleton row ──────────────────────────────────────────────────────────────
// Wave 2c: matches the 7-column priority row (cb + Task + Status + PIC + Supervisor
// + Due + menu). Both desktop modes share the priority column set.
function SkeletonRow() {
  return (
    <tr>
      {/* leading checkbox col (empty - hover-reveal is irrelevant while loading) */}
      <td className="sk-cell td-cb" />
      <td className="sk-cell"><div className="sk" style={{ width: '42%' }} /></td>
      <td className="sk-cell"><div className="sk pill" /></td>
      <td className="sk-cell"><div className="sk av" /></td>
      <td className="sk-cell"><div className="sk" style={{ width: 60 }} /></td>
      <td className="sk-cell" style={{ textAlign: 'right' }}>
        <div className="sk" style={{ width: 56, marginLeft: 'auto' }} />
      </td>
      {/* trailing row-menu col (empty) */}
      <td className="sk-cell td-menu" />
    </tr>
  )
}

export type TasksTableBodyProps = {
  // ── State branches ──────────────────────────────────────────────────────
  loading: boolean
  error: string | null
  /** Leaf (non-header) rows currently visible — drives empty/populated branching. */
  leafTasks: TaskListRow[]
  hasActiveFilter: boolean
  isDesktop: boolean
  /** Retry the failed load (error state). */
  onRetry: () => void
  /** Reset all filters (no-results-after-filter state). */
  onClearFilters: () => void
  emptyTitle: string
  emptyCopy: string

  // ── Desktop table: thead sort + select-all ────────────────────────────────
  sortCol: SortCol
  /** thead column-header click → cycle the sort for that column. */
  onSort: (col: SortCol) => void
  /** aria-sort for a column (active col → its direction, else 'none'). */
  ariaSort: (col: SortCol) => 'ascending' | 'descending' | 'none'
  /** The inline sort-direction affordance for the active column (else null). */
  sortIndicator: (col: SortCol) => ReactNode
  allChecked: boolean
  someChecked: boolean
  onToggleSelectAll: () => void

  // ── Body row windowing + rendering ────────────────────────────────────────
  flatRows: FlatRow[]
  virtualize: boolean
  scrollRef: Ref<HTMLDivElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  renderRow: (task: TaskListRow, leafIndex: number) => ReactNode
  renderGroupHeader: (group: RenderGroup) => ReactNode

  // ── Mobile grouped cards ──────────────────────────────────────────────────
  groups: RenderGroup[]
  recordSearch: string
  now: Date
  buMap: Map<string, string>
  personMap: Map<string, string>
  isCollapsed: (key: string) => boolean
  toggleCollapsed: (key: string) => void
  openAddTask: (prefillParam: string) => void
  setOverdueOnly: (next: boolean) => void
  /** FR-234: resolved work-line names (id → name). */
  workLineMap: Map<string, string>
  /** FR-234: resolved objective names (id → name). */
  objectiveMap: Map<string, string>
  /** FR-236: workload summary for the caption (workline groupBy + single person). */
  workloadSummary: WorkloadSummary | null
  createHref: To
  /** Design fix wave item 3 — threaded through to MobileGroupedCards' occurrence-group assign
   * affordance (Rule 9 parity with desktop's GroupHeaderRow). Undefined when the viewer cannot
   * resolve pending items. */
  onAssignPending?: (runId: string) => void
  /** Design fix wave item 4 — threaded through to MobileGroupedCards' "via <role name>"
   * generated-ownership line. */
  provenanceByTaskDefId?: Map<string, string>
}

export function TasksTableBody(props: TasksTableBodyProps) {
  const t = useT()
  const {
    loading, error, leafTasks, hasActiveFilter, isDesktop,
    onRetry, onClearFilters, emptyTitle, emptyCopy,
    sortCol, onSort, ariaSort, sortIndicator,
    allChecked, someChecked, onToggleSelectAll,
    flatRows, virtualize, scrollRef, rowVirtualizer, renderRow, renderGroupHeader,
    groups, recordSearch, now, buMap, personMap, isCollapsed, toggleCollapsed,
    openAddTask, setOverdueOnly,
    workLineMap, objectiveMap, workloadSummary, createHref, onAssignPending, provenanceByTaskDefId,
  } = props

  if (loading) {
    return (
      <div aria-busy="true" aria-label={t('tasks.loading')}>
        <span className="sr-only" role="status">{t('tasks.loading')}</span>
        {isDesktop ? (
          <table className="tasks-table" aria-label={t('tasks.loading')}>
            <tbody>
              <SkeletonRow /><SkeletonRow />
              <SkeletonRow /><SkeletonRow />
              <SkeletonRow />
            </tbody>
          </table>
        ) : (
          <div className="skeleton-cards">
            {[0, 1, 2].map(i => (
              <div key={i} className="sk-card-row"><div className="sk" style={{ width: '50%' }} /><div className="sk pill" /></div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={t('tasks.error.load')} onRetry={onRetry} />
  }

  if (leafTasks.length === 0 && hasActiveFilter) {
    // No-results-after-filter: distinct from empty-no-tasks (AC-133 / design-plan §3)
    return (
      <EmptyState title={t('tasks.empty.filteredTitle')} copy={t('tasks.empty.filteredCopy')}>
        <button type="button" className="btn btn-outline" onClick={onClearFilters}>{t('tasks.empty.clearFilters')}</button>
        <Link to={createHref} className="btn btn-primary">{t('tasks.new')}</Link>
      </EmptyState>
    )
  }

  if (leafTasks.length === 0) {
    // Empty-no-tasks: no filter is active (segment-aware copy)
    return (
      <EmptyState title={emptyTitle} copy={emptyCopy}>
        <Link to={createHref} className="btn btn-primary">{t('tasks.new')}</Link>
      </EmptyState>
    )
  }

  if (!isDesktop) {
    return (
      <MobileGroupedCards
        groups={groups}
        recordSearch={recordSearch}
        now={now}
        buMap={buMap}
        personMap={personMap}
        isCollapsed={isCollapsed}
        toggleCollapsed={toggleCollapsed}
        openAddTask={openAddTask}
        setOverdueOnly={setOverdueOnly}
        workLineMap={workLineMap}
        objectiveMap={objectiveMap}
        onAssignPending={onAssignPending}
        provenanceByTaskDefId={provenanceByTaskDefId}
      />
    )
  }

  // FR-236: workload summary caption (workline groupBy + single person filter)
  const captionEl = workloadSummary ? <WorkloadCaption summary={workloadSummary} /> : null

  return (
    <div ref={scrollRef} className={virtualize ? 'tasks-scroll tasks-scroll-virtual' : 'tasks-scroll'}>
      {captionEl}
      <table className="tasks-table" aria-label={t('tasks.title')}>
        <thead>
          <tr>
            {/* PR-2 AC-T07 — select-all checkbox header. aria-checked="mixed" when partial. */}
            <th scope="col" className="th-cell th-cb">
              <RowCheckbox
                checked={allChecked}
                indeterminate={someChecked && !allChecked}
                onChange={onToggleSelectAll}
                label={t('tasks.selectAll')}
              />
            </th>
            <th scope="col" className={`th-cell th-sortable${sortCol === 'task' ? ' th-sorted' : ''}`}
              aria-sort={ariaSort('task')} onClick={() => onSort('task')}>
              {t('tasks.label.task')}{sortIndicator('task')}
            </th>
            <th scope="col" className={`th-cell th-sortable${sortCol === 'status' ? ' th-sorted' : ''}`}
              aria-sort={ariaSort('status')} onClick={() => onSort('status')}>
              {t('tasks.filter.status')}{sortIndicator('status')}
            </th>
            <th scope="col" className={`th-cell th-sortable th-owner${sortCol === 'owner' ? ' th-sorted' : ''}`}
              aria-sort={ariaSort('owner')} onClick={() => onSort('owner')}>
              {t('tasks.pic')}{sortIndicator('owner')}
            </th>
            <th scope="col" className="th-cell">{t('tasks.supervisor')}</th>
            {/* Wave 2c: Due is the last decision column before the row-menu — it MUST stay
                inside the first paint. Project/Process, Objective, Team, Source, Activity
                moved to the drawer (OD-62). */}
            <th scope="col" className={`th-cell th-sortable${sortCol === 'due' ? ' th-sorted' : ''}`}
              aria-sort={ariaSort('due')} onClick={() => onSort('due')}>
              {t('tasks.dueLabel')}{sortIndicator('due')}
            </th>
            {/* PR-2 AC-T02 — row-menu column header (visual only; the ⋯ reveals on row hover). */}
            <th scope="col" className="th-cell th-menu" aria-label={t('tasks.rowActions')} />
          </tr>
        </thead>
        {virtualize ? (
          (() => {
            const items = rowVirtualizer.getVirtualItems()
            const totalSize = rowVirtualizer.getTotalSize()
            // Wave 2c: both desktop modes share the 7-column priority set
            // (cb + Task + Status + PIC + Supervisor + Due + menu).
            const colSpan = 7
            const padTop = items.length > 0 ? items[0].start : 0
            const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
            return (
              <tbody>
                {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }}><td colSpan={colSpan} /></tr>}
                {items.map(vi => {
                  const fr = flatRows[vi.index]
                  return fr.kind === 'header'
                    ? renderGroupHeader(fr.group)
                    : renderRow(fr.task, fr.leafIndex)
                })}
                {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }}><td colSpan={colSpan} /></tr>}
              </tbody>
            )
          })()
        ) : (
          <tbody>
            {flatRows.map(fr =>
              fr.kind === 'header'
                ? renderGroupHeader(fr.group)
                : renderRow(fr.task, fr.leafIndex))}
          </tbody>
        )}
      </table>
    </div>
  )
}
