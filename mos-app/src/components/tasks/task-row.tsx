// TaskRow — one dense 50px record row (PR-2). Extracted verbatim from
// TasksWorkspace.renderRow, then given a hover-revealed leading RowCheckbox
// (AC-T02/T07) + trailing RowMenu ⋯ (AC-T02). The name cell is a real
// <a href="/tasks/:id"> Chip-link (AC-T03); status is a soft StatusPill that
// never wraps (AC-T05); the row fill is bg-secondary on hover and the existing
// neutral row-selected on the open drawer row (AC-T04).
//
// Selection (RowCheckbox) is presentational scaffolding — it toggles a local
// set only and does NOT change row styling. The `row-selected` class stays
// semantically "the open drawer row" (isSelected), unchanged from pre-PR-2.
import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { StatusPill } from './status-pill'
import { OwnerCell } from './owner-cell'
import type { OwnerCellRaciMember } from './owner-cell'
import { formatAge, formatDate } from './task-formatters'
import { RowCheckbox } from './row-checkbox'
import { RowMenu } from './row-menu'

export type TaskRowProps = {
  task: TaskListRow
  now: Date
  condensed: boolean
  /** Open-drawer row → the `row-selected` class (existing semantics, unchanged). */
  isSelected: boolean
  /** Keyboard cursor row → the `kfocus` class + aria-current. */
  isCursor: boolean
  leafIndex: number
  /** Ref applied to the <tr> when it is the cursor row (scrollIntoView wiring). */
  cursorRowRef?: Ref<HTMLTableRowElement>
  buName: string
  ownerName: string
  others: OwnerCellRaciMember[]
  /** Row click + name link activation → navigate to /tasks/:id. */
  onOpen: (taskId: string) => void
  /** Checkbox selection (local set only — no bulk action ships this PR). */
  checked: boolean
  onCheck: (next: boolean) => void
}

export function TaskRow({
  task, now, condensed, isSelected, isCursor, leafIndex, cursorRowRef,
  buName, ownerName, others, onOpen, checked, onCheck,
}: TaskRowProps) {
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  // C1: only genuinely-overdue (non-Done, non-archived) rows get the red class.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue
      // M1: condensed drops the "Overdue · " prefix but keeps a "!" glyph (WCAG 1.4.1).
      ? (condensed ? `! ${formatDate(task.due_date)}` : `Overdue · ${formatDate(task.due_date)}`)
      : formatDate(task.due_date))
    : '—'
  const isArchived = task.archived_at != null

  return (
    <tr
      ref={isCursor ? cursorRowRef : undefined}
      className={`task-row${isSelected ? ' row-selected' : ''}${isCursor ? ' kfocus' : ''}`}
      // I1: expose cursor to AT via aria-current; isSelected keeps 'true' for the open drawer row.
      aria-current={isSelected ? 'true' : (isCursor ? 'true' : undefined)}
      data-leaf-index={leafIndex}
      onClick={() => onOpen(task.id)}
    >
      <td className="td-cell td-cb">
        <RowCheckbox
          checked={checked}
          label={`Select ${task.title}`}
          onChange={onCheck}
        />
      </td>
      <td className="td-main">
        <Link
          to={`/tasks/${task.id}`}
          className="task-row-link name-chip"
          title={task.title}
          tabIndex={0}
          // AC-T02/T03: clicking the name link must not also double-fire the row's
          // onOpen — the link navigates itself to the same canonical /tasks/:id.
          onClick={(e) => e.stopPropagation()}
        >
          <span className="task-title-line">
            {isArchived && <span className="archived-tag">Archived</span>}
            <span className={isArchived ? 'task-name task-name-archived' : 'task-name'}>{task.title}</span>
          </span>
        </Link>
      </td>
      <td className="td-cell td-status td-nowrap"><StatusPill status={task.status} /></td>
      <td className="td-cell td-owner">
        <OwnerCell fullName={ownerName} otherCount={others.length} others={others} />
      </td>
      {!condensed && <td className="td-cell td-bu">{buName}</td>}
      <td className={`td-cell td-nowrap tabular-nums ${dueClass}`}>{dueText}</td>
      {!condensed && <td className="td-cell td-nowrap tabular-nums act">{formatAge(task.last_activity_at, now)}</td>}
      <td className="td-cell td-menu">
        <RowMenu taskId={task.id} />
      </td>
    </tr>
  )
}
