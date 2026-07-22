// TaskRow — one shared E7-measure record row (PR-2). Extracted verbatim from
// TasksWorkspace.renderRow, then given a trailing RowMenu ⋯ (AC-T02). The name
// cell is a real <a href="/work/tasks/:id"> Chip-link (AC-T03); status is a
// soft StatusPill that never wraps (AC-T05); the row fill is bg-secondary on
// hover and the existing neutral row-selected on the open drawer row (AC-T04).
//
// The `row-selected` class stays semantically "the open drawer row" (isSelected),
// unchanged from pre-PR-2.
import type { Ref } from 'react'
import '@/components/collection-grammar.css'
import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { StatusPill } from './status-pill'
import { PicCell } from './pic-cell'
import { formatDate } from './task-formatters'
import { RowMenu } from './row-menu'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'

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
  ownerName: string
  /** Row click + name link activation → opens the split panel. */
  onOpen: (taskId: string) => void
  /** Supervisor display name resolved from the directory. */
  supervisorName?: string
  /** Business Unit display name used in the shared title metadata subline. */
  businessUnitName?: string
  /** Active location.search to preserve the saved view on every record-open path. */
  recordSearch?: string
  /**
   * Design fix wave item 4 (OD-65 mockup regression) — the generated-ownership source: the pic_role
   * NAME the task's generating def bound the PIC through. Only given for occurrence-grouped rows
   * whose def binds a Role (Rule 11 — threaded straight into OwnerCell, no second PIC rendering).
   */
  provenanceRoleName?: string
}

export function TaskRow({
  task, now, isSelected, isCursor, leafIndex, cursorRowRef,
  ownerName, onOpen,
  supervisorName = '', businessUnitName = '', recordSearch = '', provenanceRoleName,
}: TaskRowProps) {
  const t = useT()
  const { locale } = useI18n()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  // C1: only genuinely-overdue (non-Done, non-archived) rows get the red class.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue
      // F3 (design review): one overdue token everywhere — full "Overdue · <date>"
      // label in every density. A bare "!" glyph in the condensed split-drawer list
      // read as a different state than the full table's red "Overdue · <date>";
      // the label itself (not just color) already satisfies WCAG 1.4.1.
      ? t('tasks.overdueDate', { date: formatDate(task.due_date, locale) })
      : formatDate(task.due_date, locale))
    : '—'
  const isArchived = task.archived_at != null
  const recordTo = { pathname: `/work/tasks/${task.id}`, search: recordSearch }
  const panelState = { taskSurface: 'panel' as const }

  return (
    <tr
      ref={isCursor ? cursorRowRef : undefined}
      className={`task-row${isSelected ? ' row-selected' : ''}${isCursor ? ' kfocus' : ''}`}
      // I7 (cohesion-debt 2026-07-19): the rail/breadcrumb own aria-current="page";
      // a row's open/cursor state is a SELECTION, so expose aria-selected — never a
      // second aria-current on the page (interaction-contract I7 "exactly one").
      aria-selected={isSelected || isCursor ? true : undefined}
      data-leaf-index={leafIndex}
      onClick={() => onOpen(task.id)}
    >
      <td className="td-main">
        <Link
          to={recordTo}
          state={panelState}
          className="task-row-link name-chip collection-grammar-title-cell"
          title={task.title}
          tabIndex={0}
          // The href remains the progressive-enhancement/canonical door, but the
          // application interaction grammar is one shared RecordViewer: activate
          // the row opener instead of bypassing it into the route-local drawer.
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onOpen(task.id)
          }}
        >
          <span className="task-title-line">
            {isArchived && <span className="archived-tag">{t('tasks.archived')}</span>}
            <span className={isArchived ? 'task-name task-name-archived collection-grammar-title' : 'task-name collection-grammar-title'}>{task.title}</span>
          </span>
          {businessUnitName && (
            <span className="collection-grammar-meta task-row-meta">{businessUnitName}</span>
          )}
        </Link>
      </td>
      <td className="td-cell td-status td-nowrap"><StatusPill status={task.status} /></td>
      <td className="td-cell td-owner">
        <PicCell fullName={ownerName} provenance={provenanceRoleName} />
      </td>
      {/* Wave 2c (OD-REDESIGN-61..64, e7 priority columns): the desktop row shows ONLY
          the decision columns — Task · Status · PIC · Supervisor · Due (+ cb + menu).
          Work-line/Project-Process, Objective, Team, Source, Activity moved to the
          record drawer/full page (where the typed Task already shows them — OD-62).
          This is column PRIORITY, not data removal. */}
      <td className="td-cell td-supervisor">{supervisorName || <span className="td-empty">—</span>}</td>
      <td className={`td-cell td-nowrap tabular-nums ${dueClass}`}>{dueText}</td>
      <td className="td-cell td-menu">
        <RowMenu taskId={task.id} recordSearch={recordSearch} />
      </td>
    </tr>
  )
}
