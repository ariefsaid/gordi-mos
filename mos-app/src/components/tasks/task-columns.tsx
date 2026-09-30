// The ONE column list of the desktop Tasks table (issue #997 — spec FR-001).
//
// Before this module the column set was declared TWICE by hand — once as <th> elements in
// tasks-table-body.tsx, once as <td> elements in task-row.tsx — kept in sync only by four
// boolean props (showBusinessUnit/showWorkline/showObjective/showActivity) threaded through
// both files. Both renderers now derive their columns from TASK_COLUMN_DEFS below, filtered
// by the ONE visibility mapping (`taskColumnIsVisible`), so a second hand-kept column list
// can no longer drift from the first.
//
// The array is a TanStack column-definition array: the presentation feeds it to
// `useReactTable` with `columnVisibility` state derived from `query.visibleFields`
// (FR-002), renders its <thead> from `table.getHeaderGroups()`, and reads pad-row /
// group-header colSpan from `table.getVisibleLeafColumns().length`. TaskRow (which has no
// table instance) filters the same array with the same mapping via
// `visibleTaskColumnDefs` — never a second list.
//
// Per-column cell CONTENT stays where the behaviour lives: the inline editors, their
// `useInlineCommit` wiring and key handling are TaskRow's (spec FR-011 fences: the keyboard
// layer and inline editing are untouched). TaskRow dispatches content per column id through
// an exhaustive `Record<TaskColumnId, …>`, so the compiler — not a convention — keeps the
// dispatch and this array from drifting apart.
import type { ColumnDef, RowData, SortingState, VisibilityState } from '@tanstack/react-table'
import { dueStatus, isOverdue } from '@/lib/due-status'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { TaskCollectionVisibleField } from '@/lib/record-collection/collection-view-spec'
import type { MessageKey } from '@/i18n/messages'
import type { TaskCollectionSort, TaskColumnId } from './task-collection-query'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TanStack's interface shape fixes the generics; the augmentation carries only data.
  interface ColumnMeta<TData extends RowData, TValue extends RowData> {
    /** i18n key of the column-header label. */
    labelKey: MessageKey
    /** The <th> hook class. Widths/floors pin per class (#743 r3, #930) — never rename. */
    thClass: string
    /** The <td> hook class; a function when the class carries row state (Due's overdue tint). */
    tdClass: string | ((task: TaskListRow, now: Date) => string)
    /** A Fields-chooser-optional column: hidden unless its query field is checked (AC-006, #743). */
    optional?: boolean
    /** The `query.visibleFields` entry that toggles this optional column. */
    field?: TaskCollectionVisibleField
  }
}

/** The ONE column-id <-> URL sort-key map (owner is `pic`). Exhaustive over every sort key the
 * query accepts. Supervisor and Activity are toolbar-only sorts: their columns carry no
 * accessor, so TanStack gives them no header toggle and the table renders no header button. */
const COLUMN_ID_BY_SORT: Record<TaskCollectionSort, TaskColumnId> = {
  task: 'task',
  status: 'status',
  pic: 'owner',
  supervisor: 'supervisor',
  due: 'due',
  activity: 'activity',
}

/** TanStack `sorting` state for the table, derived from the URL-bound query sort. */
export function taskSortingState(
  sort: TaskCollectionSort,
  direction: 'ascending' | 'descending',
): SortingState {
  return [{ id: COLUMN_ID_BY_SORT[sort], desc: direction === 'descending' }]
}

/** The query sort a TanStack `sorting` state stands for; null when it names no column. */
export function taskSortFromSorting(
  sorting: SortingState,
): { sort: TaskCollectionSort; direction: 'ascending' | 'descending' } | null {
  const first = sorting[0]
  if (!first) return null
  const sort = (Object.keys(COLUMN_ID_BY_SORT) as TaskCollectionSort[])
    .find((key) => COLUMN_ID_BY_SORT[key] === first.id)
  return sort ? { sort, direction: first.desc ? 'descending' : 'ascending' } : null
}

/** Due cell's state tint: the C1 rule — only genuinely-overdue (non-Done, non-archived) rows
 * get the red class. Lives here because the class is part of the column definition. */
function dueCellClass(task: TaskListRow, now: Date): string {
  const taskOverdue = isOverdue(task, now)
  const ds = dueStatus(task.due_date, now)
  return `td-cell td-due td-nowrap tabular-nums ${taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'}`
}

/** The Tasks table's column definition: a TanStack column def whose `id` is the typed
 * TaskColumnId union (not a bare string), so consumers like the per-row content dispatch
 * are exhaustive-checked against the column list. */
export type TaskColumnDef = ColumnDef<TaskListRow> & { id: TaskColumnId }

/** The desktop Tasks table's single column list, in rendered order: the five decision
 * columns (Task · Status · PIC · Supervisor · Due) with each Fields-chooser-optional column
 * inserted before Due (Wave 2c / AC-006, #743 — Due MUST stay the last decision column and
 * inside the first paint). Order here is the order both the <thead> and every <tr> render. */
export const TASK_COLUMN_DEFS: TaskColumnDef[] = [
  {
    id: 'task',
    accessorFn: (task) => task.title,
    meta: { labelKey: 'tasks.label.task', thClass: 'th-task', tdClass: 'td-main' },
  },
  {
    id: 'status',
    accessorFn: (task) => task.status,
    meta: { labelKey: 'tasks.filter.status', thClass: 'th-status', tdClass: 'td-cell td-status td-nowrap' },
  },
  {
    id: 'owner',
    accessorFn: (task) => task.responsible_person_id,
    meta: { labelKey: 'tasks.pic', thClass: 'th-owner', tdClass: 'td-cell td-owner' },
  },
  {
    id: 'supervisor',
    meta: { labelKey: 'tasks.supervisor', thClass: 'th-supervisor', tdClass: 'td-cell td-supervisor' },
  },
  {
    id: 'businessUnit',
    meta: {
      labelKey: 'tasks.filter.businessUnit', thClass: 'th-business-unit', tdClass: 'td-cell td-business-unit',
      optional: true, field: 'businessUnit',
    },
  },
  {
    id: 'workline',
    meta: {
      labelKey: 'tasks.filter.projectProcess', thClass: 'th-workline', tdClass: 'td-cell td-workline',
      optional: true, field: 'workline',
    },
  },
  {
    id: 'objective',
    meta: {
      labelKey: 'tasks.objective', thClass: 'th-objective', tdClass: 'td-cell td-objective',
      optional: true, field: 'objective',
    },
  },
  {
    id: 'activity',
    meta: {
      labelKey: 'tasks.fields.activity', thClass: 'th-activity', tdClass: 'td-cell td-activity td-nowrap',
      optional: true, field: 'activity',
    },
  },
  {
    id: 'due',
    accessorFn: (task) => task.due_date,
    meta: { labelKey: 'tasks.dueLabel', thClass: 'th-due', tdClass: dueCellClass },
  },
]

/** The ONE visibility mapping: a column renders iff it is a decision column (no `field`) or
 * its Fields-chooser field is checked. Both consumers — TanStack's `columnVisibility` state
 * and TaskRow's instance-less filter — read this function, never their own copy. */
export function taskColumnIsVisible(
  column: TaskColumnDef,
  visibleFields: readonly TaskCollectionVisibleField[],
): boolean {
  const field = column.meta?.field
  return !field || visibleFields.includes(field)
}

/** TanStack `columnVisibility` state for the Tasks table (FR-002): derived from
 * `query.visibleFields` through `taskColumnIsVisible`, so the table instance's
 * `getVisibleLeafColumns()` is exactly the columns TaskRow renders. */
export function taskColumnVisibilityState(
  visibleFields: readonly TaskCollectionVisibleField[],
): VisibilityState {
  return Object.fromEntries(
    TASK_COLUMN_DEFS.map((column) => [column.id, taskColumnIsVisible(column, visibleFields)]),
  )
}

/** The visible columns in rendered order, for the per-row renderer (which has no table
 * instance). Identical by construction to `table.getVisibleLeafColumns()` — both filter
 * TASK_COLUMN_DEFS with the one `taskColumnIsVisible` mapping (spec AC-003). */
export function visibleTaskColumnDefs(
  visibleFields: readonly TaskCollectionVisibleField[],
): TaskColumnDef[] {
  return TASK_COLUMN_DEFS.filter((column) => taskColumnIsVisible(column, visibleFields))
}

/** Resolve a column's <td> hook class (the Due column's is row-state dependent). */
export function taskColumnTdClass(
  column: TaskColumnDef,
  task: TaskListRow,
  now: Date,
): string {
  const tdClass = column.meta?.tdClass
  if (typeof tdClass === 'function') return tdClass(task, now)
  return tdClass ?? ''
}
