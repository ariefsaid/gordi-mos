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
import type { Row, Table } from '@tanstack/react-table'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { EmptyState, ErrorState, FilteredEmptyState } from '@/components/ui/state-kit'
import { MobileGroupedCards } from './mobile-grouped-cards'
import type { TaskTeamOption } from './task-row'
import type { RenderGroup } from './tasks-grouping'
import type { TaskTreeNode } from './task-group-tree'
import type { WorkloadSummary } from './workload-caption'
import { WorkloadCaption } from './workload-caption'
import { useT } from '@/i18n/use-t'


// ── Skeleton row ──────────────────────────────────────────────────────────────
// Wave 2c + AC-020 (#750): matches the 5-column decision row (Task + Status + PIC +
// Supervisor + Due — the ⋯ menu column is gone). Both desktop modes share the set.
function SkeletonRow() {
  return (
    <tr>
      <td className="sk-cell"><div className="sk" style={{ width: '42%' }} /></td>
      <td className="sk-cell"><div className="sk pill" /></td>
      <td className="sk-cell"><div className="sk av" /></td>
      <td className="sk-cell"><div className="sk" style={{ width: 60 }} /></td>
      <td className="sk-cell" style={{ textAlign: 'right' }}>
        <div className="sk" style={{ width: 56, marginLeft: 'auto' }} />
      </td>
    </tr>
  )
}

export type TasksTableBodyProps = {
  // ── State branches ──────────────────────────────────────────────────────
  loading: boolean
  error: string | null
  hasActiveFilter: boolean
  isDesktop: boolean
  /** Retry the failed load (error state). */
  onRetry: () => void
  /** Reset all filters (no-results-after-filter state). */
  onClearFilters: () => void
  emptyTitle: string
  emptyCopy: string

  // ── Desktop table: thead sort + select-all ────────────────────────────────
  /** The TanStack table instance (#997): the <thead> renders from its column-definition
   * array (getHeaderGroups), pad-row colSpan and the `.tasks-table--extended` class derive
   * from `table.getVisibleLeafColumns()` (FR-002) — never a hand-written fallback. Header
   * sorting reads and toggles the table's sort state (#998). */
  table: Table<TaskTreeNode>

  // ── Body row windowing + rendering ────────────────────────────────────────
  /** The table's expanded row model: group headers and the leaf rows of expanded groups. */
  flatRows: Row<TaskTreeNode>[]
  /** Position of each visible leaf row among the visible leaves (keyed by row id). */
  leafIndexByRowId: ReadonlyMap<string, number>
  virtualize: boolean
  scrollRef: Ref<HTMLDivElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  renderRow: (task: TaskListRow, leafIndex: number) => ReactNode
  renderGroupHeader: (group: RenderGroup) => ReactNode
  /** Shared RecordViewer opener for mobile cards. */
  onOpenTask: (taskId: string) => void

  // ── Mobile grouped cards ──────────────────────────────────────────────────
  groups: RenderGroup[]
  recordSearch: string
  now: Date
  buMap: Map<string, string>
  teamMap: Map<string, string>
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
  onEditTitle?: (taskId: string, title: string) => Promise<void>
  onEditPic?: (taskId: string, personId: string) => Promise<void>
  onEditTeam?: (taskId: string, teamId: string) => Promise<void>
  onEditSupervisor?: (taskId: string, personId: string) => Promise<void>
  personOptions?: readonly { id: string; full_name: string }[]
  supervisorOptions?: readonly { id: string; full_name: string }[]
  teamOptions?: readonly TaskTeamOption[]
  draftTaskId?: string | null
  onDiscardNewTask?: () => void
  /** #742 AC-060 — threaded through to MobileGroupedCards' draft-card PIC lock sentence. */
  viewerHasNoDownline?: boolean
}

export function TasksTableBody(props: TasksTableBodyProps) {
  const t = useT()
  const {
    loading, error, hasActiveFilter, isDesktop,
    onRetry, onClearFilters, emptyTitle, emptyCopy,
    table,
    flatRows, leafIndexByRowId, virtualize, scrollRef, rowVirtualizer, renderRow, renderGroupHeader,
    onOpenTask,
    groups, recordSearch, now, buMap, teamMap, personMap, isCollapsed, toggleCollapsed,
    openAddTask, setOverdueOnly,
    workLineMap, objectiveMap, workloadSummary, createHref, onAssignPending, provenanceByTaskDefId,
    onEditTitle, onEditPic, onEditTeam, onEditSupervisor,
    personOptions, supervisorOptions, teamOptions,
    draftTaskId, onDiscardNewTask, viewerHasNoDownline,
  } = props

  if (loading) {
    return (
      <div aria-busy="true" aria-label={t('tasks.loading')}>
        <span className="sr-only" role="status">{t('tasks.loading')}</span>
        {isDesktop ? (
          <table className="tasks-table record-collection-table collection-grammar-table" aria-label={t('tasks.loading')}>
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

  if (flatRows.length === 0 && hasActiveFilter) {
    // No-results-after-filter is shared with every collection; the true-empty copy stays separate.
    return (
      <FilteredEmptyState items={t('collection.items.tasks')} onClear={onClearFilters}>
        <Link to={createHref} className="btn btn-primary">{t('tasks.new')}</Link>
      </FilteredEmptyState>
    )
  }

  if (flatRows.length === 0) {
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
        onOpenTask={onOpenTask}
        now={now}
        buMap={buMap}
        teamMap={teamMap}
        personMap={personMap}
        isCollapsed={isCollapsed}
        toggleCollapsed={toggleCollapsed}
        openAddTask={openAddTask}
        setOverdueOnly={setOverdueOnly}
        workLineMap={workLineMap}
        objectiveMap={objectiveMap}
        onAssignPending={onAssignPending}
        provenanceByTaskDefId={provenanceByTaskDefId}
        onEditTitle={onEditTitle}
        onEditPic={onEditPic}
        onEditTeam={onEditTeam}
        onEditSupervisor={onEditSupervisor}
        personOptions={personOptions}
        supervisorOptions={supervisorOptions}
        teamOptions={teamOptions}
        draftTaskId={draftTaskId}
        onDiscardNewTask={onDiscardNewTask}
        viewerHasNoDownline={viewerHasNoDownline}
      />
    )
  }

  // FR-236: workload summary caption (workline groupBy + single person filter)
  const captionEl = workloadSummary ? <WorkloadCaption summary={workloadSummary} /> : null

  // #743 r3: any optional Fields column on → the table drops onto its floored track
  // (`.tasks-table--extended`): class-based px floors everywhere, and the horizontal overflow
  // lives INSIDE .tasks-scroll — never the page, never a squeezed identity column. #997: the
  // condition reads the table's visible columns (any optional column present), the same
  // "any optional field visible" semantics the four show* booleans used to carry.
  const extended = table.getVisibleLeafColumns().some((column) => column.columnDef.meta?.optional)

  return (
    <div ref={scrollRef} className={virtualize ? 'tasks-scroll tasks-scroll-virtual' : 'tasks-scroll'}>
      {captionEl}
      <table
        className={`tasks-table record-collection-table collection-grammar-table${extended ? ' tasks-table--extended' : ''}`}
        aria-label={t('tasks.title')}
      >
        {/* #997: the column set comes from the ONE TanStack column-definition array
            (task-columns.tsx) via getHeaderGroups — no second hand-authored <th> list. th-task /
            th-status / th-supervisor: the extended tier (#743 r3) pins decision columns by CLASS
            (meta.thClass) — optional Fields columns shift every nth-child position, so
            position-based widths land on the wrong column exactly when fields are on. */}
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta
                if (!meta) return null
                const canSort = header.column.getCanSort()
                const sorted = canSort && header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    className={`th-cell ${meta.thClass}${canSort ? ' th-sortable' : ''}${sorted ? ' th-sorted' : ''}`}
                    aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                  >
                    {/* Real <button>: keyboard-sortable (WCAG 2.1.1 — convention audit 2026-07-18). */}
                    {canSort ? (
                      <button type="button" className="th-sort-btn collection-grammar-sort-button" onClick={header.column.getToggleSortingHandler()}>
                        {t(meta.labelKey)}
                        {sorted ? (
                          <span className="collection-grammar-sort-indicator" aria-hidden="true">
                            {sorted === 'asc' ? '↑' : '↓'}
                          </span>
                        ) : null}
                      </button>
                    ) : t(meta.labelKey)}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        {virtualize ? (
          (() => {
            const items = rowVirtualizer.getVirtualItems()
            const totalSize = rowVirtualizer.getTotalSize()
            // #997 (FR-002): the pad rows' colSpan derives from the table's visible leaf
            // columns — the same number the group headers use — never from a hand-written
            // fallback expression.
            const colSpan = table.getVisibleLeafColumns().length
            const padTop = items.length > 0 ? items[0].start : 0
            const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
            return (
              <tbody>
                {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }}><td colSpan={colSpan} /></tr>}
                {items.map(vi => {
                  const node = flatRows[vi.index].original
                  return node.kind === 'group'
                    ? renderGroupHeader(node.group)
                    : renderRow(node.task, leafIndexByRowId.get(flatRows[vi.index].id)!)
                })}
                {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }}><td colSpan={colSpan} /></tr>}
              </tbody>
            )
          })()
        ) : (
          <tbody>
            {flatRows.map(({ id, original: node }) =>
              node.kind === 'group'
                ? renderGroupHeader(node.group)
                : renderRow(node.task, leafIndexByRowId.get(id)!))}
          </tbody>
        )}
      </table>
      {/* Quiet E7-style inline-edit hint (matches the F2 activation the row wires). Sits under the
          table, muted, so the affordance is discoverable without shouting. */}
      {flatRows.some(({ original }) => original.kind !== 'group') && (
        <p className="tasks-inline-edit-hint">{t('tasks.inlineEdit.hint')}</p>
      )}
    </div>
  )
}
