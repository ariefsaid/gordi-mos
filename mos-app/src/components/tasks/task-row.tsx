// TaskRow — one shared E7-measure record row (PR-2). Extracted verbatim from
// TasksWorkspace.renderRow. Row activation is OD-REDESIGN-63 / DESIGN § Data Table A3:
// a click anywhere on the row — the title included — OPENS the record; inline title
// editing starts from the hover/focus pencil, F2, or double-click, never a single
// click (AC-017/AC-018, ticket #750). The title stays a real <a href="/work/tasks/:id">
// for open-in-new-tab; status is a soft StatusPill that never wraps (AC-T05); the row
// fill is bg-secondary on hover and the existing neutral row-selected on the open
// drawer row (AC-T04). The row ⋯ menu is gone (AC-020 — it held one action).
//
// The `row-selected` class stays semantically "the open drawer row" (isSelected),
// unchanged from pre-PR-2.
//
// The isNew draft does not bend this row's columns into a form: it renders TaskCreateForm
// (task-create-form.tsx) inside a single full-width colSpan row, the SAME component the phone
// card path renders (mobile-grouped-cards.tsx TaskCard).
//
// #997: the row's <td> chain is derived from the ONE column list (task-columns.tsx) — the
// same array the <thead> renders — filtered by the shared `taskColumnIsVisible` mapping
// against `visibleFields`. Per-column CONTENT dispatches through an exhaustive
// `Record<TaskColumnId, …>`; the inline editors and their wiring are unchanged.
import type { ReactNode, Ref } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import '@/components/collection-grammar.css'
import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { TaskCollectionVisibleField } from '@/lib/record-collection/collection-view-spec'
import { isOverdue } from '@/lib/due-status'
import { useInlineCommit } from '@/components/ui/use-inline-commit'
import { StatusPill } from './status-pill'
import { statusTone } from './status-tone'
import { Picker } from '@/components/ui/picker'
import { PicCell, PersonCell } from './pic-cell'
import { formatDate, formatAge, TASK_TITLE_MAX_LENGTH } from './task-formatters'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { TaskCreateForm } from './task-create-form'
import { visibleTaskColumnDefs, taskColumnTdClass } from './task-columns'
import { TASK_DECISION_FIELDS, type TaskColumnId } from './task-collection-query'

// An inline editor unmounts its own focus target when it closes; hand focus back to the cell
// trigger that opened it, unless focus already moved somewhere real (Tab, outside click).
function useRestoreFocusOnClose(editing: boolean, triggerRef: { current: HTMLElement | null }) {
  const wasEditing = useRef(false)
  useEffect(() => {
    if (editing) { wasEditing.current = true; return }
    if (!wasEditing.current) return
    wasEditing.current = false
    const active = document.activeElement
    if (!active || active === document.body) triggerRef.current?.focus()
  }, [editing, triggerRef])
}

export type TaskTeamOption = {
  id: string
  name: string
  /** BU is derived from the selected Team; it is never a create-time selector. */
  businessUnitId: string
}

export type TaskRowProps = {
  task: TaskListRow
  now: Date
  condensed: boolean
  /** Open-drawer row → the `row-selected` class (existing semantics, unchanged). */
  isSelected: boolean
  /** Keyboard cursor row → the `kfocus` class + aria-current. */
  isCursor: boolean
  /** GAP-6 (OD-91 #11): the just-created row → the `row-just-created` fade-out accent. */
  justCreated?: boolean
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
  /**
   * Inline title edit (E7 collection promise). When supplied, a double-click (mouse) or F2 (keyboard)
   * on the title swaps it for a text input that commits through this (the same `updateTaskFields`
   * path the record editor uses). Omitted → the title stays a plain opener link (no edit affordance).
   * Returns a Promise so the useInlineCommit primitive drives the optimistic pending + rollback.
   */
  onEditTitle?: (taskId: string, title: string) => Promise<void>
  onEditStatus?: (taskId: string, status: TaskListRow['status']) => Promise<void>
  onEditDue?: (taskId: string, dueDate: string | null) => Promise<void>
  onEditPic?: (taskId: string, personId: string) => Promise<void>
  personOptions?: readonly { id: string; full_name: string }[]
  /** Full directory for the draft Supervisor picker (PIC options remain scoped separately). */
  supervisorOptions?: readonly { id: string; full_name: string }[]
  /** Draft-only Team ownership control. Existing Task Team edits belong to the record surface. */
  onEditTeam?: (taskId: string, teamId: string) => Promise<void>
  /** Draft-only independent Supervisor control. */
  onEditSupervisor?: (taskId: string, personId: string) => Promise<void>
  teamOptions?: readonly TaskTeamOption[]
  /** AC-006 (#743) / #997: the query's visible Fields — each checked field renders its column
   * (column set and order come from task-columns.tsx). Display names resolve through the same
   * catalogs the group headers use. */
  visibleFields?: readonly TaskCollectionVisibleField[]
  workLineName?: string
  objectiveName?: string
  isNew?: boolean
  onDiscardNewTask?: () => void
  createError?: boolean
  onRetryCreate?: (title: string) => void
  /** Total <td>/<th> count the table currently renders — the isNew row spans all of them
   * (the create form occupies the full table width, never a bent column layout). */
  columnSpan?: number
  /** #742 AC-060: the viewer has nobody reporting to them, so the draft's PIC is fixed to self. */
  viewerHasNoDownline?: boolean
}

type InlineCommitFeedbackProps = {
  error: boolean
  retry: () => void
  liveMessage: string
  errorId?: string
}

function InlineCommitFeedback({ error, retry, liveMessage, errorId }: InlineCommitFeedbackProps) {
  const t = useT()
  return <>
    {error && <span id={errorId} role="alert" className="task-row-save-error">
      {t('record.field.saveError')}
      <button type="button" className="task-row-retry" onClick={(event) => { event.stopPropagation(); retry() }}>{t('record.field.retry')}</button>
    </span>}
    {liveMessage && <span role="status" aria-live="polite" className="sr-only">{liveMessage}</span>}
  </>
}

export function TaskRow({
  task, now, condensed, isSelected, isCursor, justCreated = false, leafIndex, cursorRowRef,
  ownerName, onOpen,
  supervisorName = '', businessUnitName = '', recordSearch = '', provenanceRoleName,
  onEditTitle, onEditStatus, onEditDue, onEditPic, personOptions = [],
  supervisorOptions = [], onEditTeam, onEditSupervisor, teamOptions = [],
  visibleFields = TASK_DECISION_FIELDS, workLineName = '', objectiveName = '',
  isNew = false, onDiscardNewTask, createError = false, onRetryCreate,
  columnSpan, viewerHasNoDownline = false,
}: TaskRowProps) {
  const t = useT()
  const { locale } = useI18n()
  const titleEditKeyhintId = useId()
  const taskOverdue = isOverdue(task, now)
  const dueText = task.due_date
    ? (taskOverdue
      // The full table shows the "Overdue · <date>" label (both text and color carry the state).
      // In the CONDENSED (drawer-open split) tier the track is too narrow for that label to fit
      // without clipping, so we show the bare formatted date and let the red `due-overdue` color
      // carry the overdue meaning (owner-eyes item 3 — no mid-word clipping). The color alone is a
      // secondary cue; the drawer beside the table names the state in full.
      ? (condensed
        ? formatDate(task.due_date, locale)
        : t('tasks.overdueDate', { date: formatDate(task.due_date, locale) }))
      : formatDate(task.due_date, locale))
    : '—'
  const isArchived = task.archived_at != null
  const recordTo = { pathname: `/work/tasks/${task.id}`, search: recordSearch }
  const panelState = { taskSurface: 'panel' as const }

  // ── Inline title edit (E7 collection promise) ────────────────────────────────
  // `draft` is the SINGLE display source for the title: while a commit is pending it holds the
  // optimistic new value; on a rejected commit useInlineCommit rolls it back to task.title and
  // announces the revert. Rendering `draft` (not task.title) is what makes the optimistic edit
  // survive the async round-trip without the row needing its own copy of the collection cache.
  const canEdit = Boolean(onEditTitle)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // I2 (#379): the row's opener link is the row's focus home — focused on row-click so the
  // shared panel's close returns focus to the invoking element.
  const titleLinkRef = useRef<HTMLAnchorElement | null>(null)
  const inline = useInlineCommit<string>({
    value: task.title,
    onCommit: (next) => (onEditTitle ? onEditTitle(task.id, next) : undefined),
    rollbackMessage: t('tasks.feedback.rollback'),
  })
  const { draft, setDraft, pending, error: saveError, retry, commit, cancel, liveMessage } = inline
  const displayTitle = draft

  const [statusEditing, setStatusEditing] = useState(false)
  const statusTriggerRef = useRef<HTMLButtonElement>(null)
  useRestoreFocusOnClose(statusEditing, statusTriggerRef)
  const statusInline = useInlineCommit<TaskListRow['status']>({
    value: task.status,
    onCommit: (next) => (onEditStatus ? onEditStatus(task.id, next) : undefined),
    rollbackMessage: t('tasks.feedback.rollback'),
  })
  const statusCommitPending = useRef(false)
  useEffect(() => {
    if (statusInline.pending) statusCommitPending.current = true
    else if (statusCommitPending.current) {
      statusCommitPending.current = false
      if (!statusInline.error) setStatusEditing(false)
    }
  }, [statusInline.error, statusInline.pending])

  const [picEditing, setPicEditing] = useState(false)
  const picTriggerRef = useRef<HTMLButtonElement>(null)
  useRestoreFocusOnClose(picEditing, picTriggerRef)
  const picInline = useInlineCommit<string>({
    value: task.responsible_person_id,
    onCommit: (next) => (onEditPic ? onEditPic(task.id, next) : undefined),
    rollbackMessage: t('tasks.feedback.rollback'),
  })
  const picCommitPending = useRef(false)
  useEffect(() => {
    if (picInline.pending) picCommitPending.current = true
    else if (picCommitPending.current) {
      picCommitPending.current = false
      if (!picInline.error) setPicEditing(false)
    }
  }, [picInline.error, picInline.pending])

  const [dueEditing, setDueEditing] = useState(false)
  const dueInline = useInlineCommit<string>({
    value: task.due_date ?? '',
    onCommit: (next) => (onEditDue ? onEditDue(task.id, next || null) : undefined),
    // The editor keeps the typed date for Retry (below), so the status must not say "reverted".
    rollbackMessage: t('tasks.feedback.dueKept'),
  })
  const dueErrorId = useId()

  // The editor stays open while a save is in flight and after a failure (so the typed date and the
  // error stay visible); it closes once a save lands. Enter hands focus back to the row's trigger.
  const dueTriggerRef = useRef<HTMLButtonElement>(null)
  const dueCommitPending = useRef(false)
  const dueRefocus = useRef(false)
  useEffect(() => {
    if (dueInline.pending) dueCommitPending.current = true
    else if (dueCommitPending.current) {
      dueCommitPending.current = false
      if (!dueInline.error) setDueEditing(false)
    }
  }, [dueInline.error, dueInline.pending])
  useEffect(() => {
    if (!dueEditing && dueRefocus.current) {
      dueRefocus.current = false
      dueTriggerRef.current?.focus()
    }
  }, [dueEditing])
  // The date the person typed. A rejected save rolls the hook's draft back to the saved date, but
  // the editor keeps showing (and Retry keeps sending) what was typed.
  const [dueTyped, setDueTyped] = useState('')
  const commitDue = () => {
    if (dueTyped === (task.due_date ?? '')) { dueInline.cancel(); setDueEditing(false); return }
    dueInline.commit(dueTyped)
  }
  const onDueKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Same isolation as the title editor: the workspace keyboard layer must not read this Enter as "open the row".
      e.preventDefault()
      e.stopPropagation()
      dueRefocus.current = true
      commitDue()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      dueRefocus.current = true
      dueInline.cancel()
      setDueEditing(false)
    }
  }
  const onDueBlur = () => { if (!dueInline.pending && !dueInline.error) commitDue() }

  useEffect(() => {
    if (editing) {
      const el = inputRef.current
      el?.focus()
      el?.select()
    }
  }, [editing])

  const beginEdit = () => { if (canEdit && !editing) setEditing(true) }
  // Enter/blur COMMIT the trimmed draft; an empty or unchanged draft is a no-op restore (never a
  // blank title). Escape DISCARDS. Exiting edit mode is owned here (useInlineCommit is mode-less).
  const finishEdit = () => {
    const next = draft.trim()
    if (pending) return
    if (!next || next === task.title) { cancel(); setEditing(false); return }
    commit(next)
    setEditing(false)
  }
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Enter isolation (same reason as Escape below): commit closes the editor synchronously, so
      // by the time the workspace keyboard layer's window listener runs, activeElement is no longer
      // a typing target and it would treat this Enter as "open the cursor row". stopPropagation
      // shields the ancestor window listener so the commit never leaks into a row-open.
      e.preventDefault()
      e.stopPropagation()
      finishEdit()
    } else if (e.key === 'Escape') {
      // Field-Escape isolation: consume the Escape so the workspace keyboard layer's window
      // listener (Esc → close drawer) never sees it. The table has no intermediate native
      // listener (unlike the record panel), so React's stopPropagation shields the ancestor
      // window listener cleanly here.
      e.preventDefault()
      e.stopPropagation()
      cancel()
      setEditing(false)
    }
    // Tab is left to native focus movement; onBlur commits the draft as it leaves.
  }
  const onTitleKeyDown = (e: React.KeyboardEvent) => {
    // Fix wave item 1 (H7): Enter on a keyboard-focused row title must open THIS row — the same
    // handler the click path uses. The shared window keyboard layer also binds Enter
    // (use-collection-keyboard.ts, outside this file's ownership), but it opens by its own virtual
    // j/k CURSOR index, not by which row is actually DOM-focused. A user who reached a row via Tab
    // (never having pressed j/k) has a cursor still at -1/0, so that global handler opens the
    // WRONG row (or, before this fix, index 0 regardless of which row Tab landed on) while
    // preventDefault() also silently swallows the browser's native anchor-Enter click that would
    // otherwise have opened the right one. Handling Enter HERE, on the actually-focused title, and
    // stopping propagation so the global handler never runs a second, wrong open, fixes both.
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onOpen(task.id)
      return
    }
    // F2 = the standard rename key. Deliberately NOT Enter (Enter opens the record — see above).
    // F2 is collision-free, zero-latency, and works from a keyboard-focused title with no drawer
    // in the way.
    if (canEdit && e.key === 'F2') {
      e.preventDefault()
      beginEdit()
    }
  }
  // Click activation is OD-REDESIGN-63 / A3 row activation: a click on the title OPENS the
  // record — the same journey as a click anywhere else on the row. The title click is deferred
  // for the double-click window; the second click is cancelled by dblclick before edit begins.
  // Modified and middle clicks stay native for open-in-new-tab. Editing starts from the pencil,
  // F2, or double-click — never a single click (AC-017/AC-018, ticket #750).
  const titleOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (titleOpenTimer.current) clearTimeout(titleOpenTimer.current)
  }, [])
  const onTitleClick = (e: React.MouseEvent) => {
    // Keep modified and middle-clicks native so the real href can open a new tab/window.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (titleOpenTimer.current) clearTimeout(titleOpenTimer.current)
    titleOpenTimer.current = setTimeout(() => {
      titleOpenTimer.current = null
      onOpen(task.id)
    }, 250)
  }
  const onTitleDoubleClick = (e: React.MouseEvent) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    if (titleOpenTimer.current) {
      clearTimeout(titleOpenTimer.current)
      titleOpenTimer.current = null
    }
    beginEdit()
  }

  // One tab stop per row — the ACTIVE cell of the roving grid (#1192). Tab enters the row at
  // the active cell and leaves the grid; the active cell follows focus (arrows, click).
  const [activeCell, setActiveCell] = useState<TaskColumnId>('task')

  // Arrow keys move along the row's cells (title, Status, PIC, Supervisor, Due), ↑/↓ move the
  // same column across leaf rows, and Enter/F2 open a cell's editor; F2 renames from the title.
  const onRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const from = event.target
    if (!(from instanceof HTMLElement) || !from.hasAttribute('data-row-stop')) return
    // Cells the list's responsive rules hide (display: none) are not stops; the browser's own
    // computed display decides, so no breakpoint is repeated here.
    const visibleStops = (row: HTMLElement) =>
      Array.from(row.querySelectorAll<HTMLElement>('[data-row-stop]'))
        .filter((stop) => getComputedStyle(stop.closest('td') ?? stop).display !== 'none')
    const visibleTds = (row: HTMLElement) =>
      Array.from(row.children).filter((td) => getComputedStyle(td).display !== 'none')
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const stops = visibleStops(event.currentTarget)
      const to = stops[stops.indexOf(from) + (event.key === 'ArrowRight' ? 1 : -1)]
      if (!to) return
      event.preventDefault()
      to.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Roving grid (#1192): the same column in the next/previous leaf row. Columns line up
      // across rows because one query drives every row's visible <td> chain; a row whose cell
      // in that column has no stop (read-only cell) simply ends the move.
      const table = event.currentTarget.closest('table')
      if (!table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr.task-row:not(.task-row--create)'))
      const target = rows[rows.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)]
      if (!target) return
      const fromTd = from.closest('td')
      if (!fromTd) return
      const column = visibleTds(event.currentTarget).indexOf(fromTd)
      const to = column >= 0
        ? visibleStops(target).find((stop) => stop.closest('td') === visibleTds(target)[column])
        : undefined
      if (!to) return
      event.preventDefault()
      to.focus()
      return
    }
    if (event.key === 'F2' && from instanceof HTMLButtonElement) {
      // F2 opens the focused cell's editor — the same grammar as the title's rename. Enter/Space
      // already activate the button natively; the title keeps owning the row-open keys.
      event.preventDefault()
      from.click()
      return
    }
    if (event.key === 'Enter' && !(from instanceof HTMLButtonElement) && !(from instanceof HTMLAnchorElement)) {
      // Enter on a display-only cell (Supervisor) opens THIS row — the title's own grammar, and
      // it keeps the shared window layer's virtual-cursor Enter from opening a different row.
      // The opener link is the row's focus home (I2), so close returns to the invoking row.
      event.preventDefault()
      event.stopPropagation()
      titleLinkRef.current?.focus()
      onOpen(task.id)
    }
  }

  // The draft is ONE full-width create form, not a bent row. It occupies every column the
  // table currently renders (columnSpan) so it never inherits a column's narrow width.
  if (isNew) {
    return (
      <tr className="task-row task-row--create">
        <td className="td-create" colSpan={columnSpan ?? 5}>
          <TaskCreateForm
            task={task}
            businessUnitName={businessUnitName}
            teamOptions={teamOptions}
            personOptions={personOptions}
            supervisorOptions={supervisorOptions}
            ownerName={ownerName}
            supervisorName={supervisorName}
            onEditTeam={onEditTeam ?? (async () => {})}
            onEditPic={onEditPic ?? (async () => {})}
            onEditSupervisor={onEditSupervisor ?? (async () => {})}
            onCreate={(title) => (onEditTitle ? onEditTitle(task.id, title) : Promise.resolve())}
            onCancel={() => onDiscardNewTask?.()}
            linkError={createError}
            onRetryLink={onRetryCreate}
            viewerHasNoDownline={viewerHasNoDownline}
          />
        </td>
      </tr>
    )
  }

  // #997: per-column CONTENT, dispatched exhaustively by column id (Record<TaskColumnId, …> —
  // adding a column to task-columns.tsx without content here is a compile error, so the two
  // cannot drift). The <td> wrappers themselves (order, hook classes, visibility) come from
  // the column defs below. Every entry is the exact JSX this row rendered before the
  // column-model swap; the inline editors are unchanged.
  const cellBodies: Record<TaskColumnId, ReactNode> = {
    task: (
      <>
        {editing ? (
          // Edit mode: the title text is replaced in place by a bound input (no nested anchor).
          // The onClick stopPropagation keeps a click inside the field from bubbling to the row
          // opener; aria-busy mirrors the pending commit.
          <div
            className="collection-grammar-title-cell task-title-edit"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="task-title-input collection-grammar-title tap-floor"
              value={draft}
              maxLength={TASK_TITLE_MAX_LENGTH}
              disabled={pending}
              aria-busy={pending || undefined}
              aria-label={t('tasks.inlineEdit.aria')}
              aria-describedby={titleEditKeyhintId}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKeyDown}
              onBlur={finishEdit}
            />
            <span id={titleEditKeyhintId} className="task-title-edit-keyhint">{t('tasks.inlineEdit.activeHint')}</span>
            {businessUnitName && (
              <span className="collection-grammar-meta task-row-meta">{businessUnitName}</span>
            )}
          </div>
        ) : (
          <div className="task-title-cell">
            <Link
              to={recordTo}
              state={panelState}
              ref={titleLinkRef}
              className="task-row-link name-chip collection-grammar-title-cell"
              title={task.title}
              tabIndex={activeCell === 'task' ? 0 : -1}
              onFocus={() => setActiveCell('task')}
              data-row-stop=""
              // Double-click renames, F2 renames from the keyboard (the E7 collection promise).
              // aria-keyshortcuts exposes F2 without hijacking the truncation-hover `title` tooltip;
              // the quiet under-table hint carries the visible discovery. Only wired when editable.
              aria-keyshortcuts={canEdit ? 'F2' : undefined}
              // The href remains the progressive-enhancement/canonical door, but the
              // application interaction grammar is one shared RecordViewer: activate
              // the row opener instead of bypassing it into the route-local drawer.
              onClick={onTitleClick}
              onDoubleClick={onTitleDoubleClick}
              onKeyDown={onTitleKeyDown}
            >
              <span className="task-title-line">
                {isArchived && <span className="archived-tag">{t('tasks.archived')}</span>}
                <span className={isArchived ? 'task-name task-name-archived collection-grammar-title' : 'task-name collection-grammar-title'}>{displayTitle}</span>
              </span>
              {businessUnitName && (
                <span className="collection-grammar-meta task-row-meta">{businessUnitName}</span>
              )}
            </Link>
            {canEdit && !editing && !statusEditing && !picEditing && !dueEditing && (
              <button
                type="button"
                className="task-row-pencil"
                tabIndex={-1}
                aria-label={t('tasks.inlineEdit.pencil')}
                title={t('tasks.inlineEdit.pencil')}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); beginEdit() }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
          </div>
        )}
        {/* OD-REDESIGN-22 (D-C1): a failed rename surfaces a VISIBLE error + Retry — not a sr-only
            rollback the sighted user never sees. Retry re-sends the preserved attempt. The sr-only
            live region still announces the revert for AT. */}
        {saveError && (
          <span role="alert" className="task-row-save-error">
            {t('record.field.saveError')}
            <button
              type="button"
              className="task-row-retry"
              // Row click opens the record; a retry click must not leak into that opener.
              onClick={(e) => { e.stopPropagation(); retry() }}
            >
              {t('record.field.retry')}
            </button>
          </span>
        )}
        {liveMessage && (
          <span role="status" aria-live="polite" className="sr-only">{liveMessage}</span>
        )}
      </>
    ),
    status: onEditStatus ? (statusEditing ? (
      <span className={`inline-status-editor inline-status-editor--${statusTone(statusInline.draft)}`} onClick={(event) => event.stopPropagation()}>
        <Picker
          autoFocus
          defaultOpen
          hideLabel
          label={t('tasks.inlineEdit.status')}
          value={statusInline.draft}
          disabled={statusInline.pending}
          busy={statusInline.pending}
          triggerClassName="inline-picker-trigger"
          options={(['Open', 'In Progress', 'Blocked', 'Done'] as const).map((status) => ({ value: status, label: status }))}
          onChange={(value) => {
            const next = value as TaskListRow['status']
            statusCommitPending.current = true
            statusInline.commit(next)
            if (next === task.status) setStatusEditing(false)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') setStatusEditing(false)
          }}
          onOpenChange={(_, reason) => { if (reason === 'escape') setStatusEditing(false) }}
        />
        <InlineCommitFeedback {...statusInline} />
      </span>
    ) : <button type="button" ref={statusTriggerRef} className="inline-cell-trigger" tabIndex={activeCell === 'status' ? 0 : -1} onFocus={() => setActiveCell('status')} data-row-stop="" onClick={(event) => { event.stopPropagation(); setStatusEditing(true) }}><StatusPill status={statusInline.draft} /></button>) : <StatusPill status={task.status} />,
    owner: onEditPic ? (picEditing ? (
      <span className="inline-editor-control" onClick={(event) => event.stopPropagation()}>
        <Picker
          autoFocus
          defaultOpen
          hideLabel
          label={t('tasks.inlineEdit.pic')}
          value={picInline.draft}
          disabled={picInline.pending}
          busy={picInline.pending}
          triggerClassName="inline-picker-trigger"
          options={[
            ...(personOptions.some((person) => person.id === task.responsible_person_id)
              ? []
              : [{ value: task.responsible_person_id, label: ownerName }]),
            ...personOptions.map((person) => ({ value: person.id, label: person.full_name })),
          ]}
          onChange={(value) => { picInline.commit(value) }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') setPicEditing(false)
          }}
          onOpenChange={(_, reason) => { if (reason === 'escape') setPicEditing(false) }}
        />
        <InlineCommitFeedback {...picInline} />
      </span>
    ) : <button type="button" ref={picTriggerRef} className="inline-cell-trigger" tabIndex={activeCell === 'owner' ? 0 : -1} onFocus={() => setActiveCell('owner')} data-row-stop="" onClick={(event) => { event.stopPropagation(); setPicEditing(true) }}><PicCell fullName={ownerName} provenance={provenanceRoleName} /></button>) : <PicCell fullName={ownerName} provenance={provenanceRoleName} />,
    // A2 person cell: one grammar for both person columns (AC-021) — the avatar + first
    // name, never the full-name text (that lives in the record and in pickers).
    // #1192: the Supervisor cell is a grid stop like the editable cells — reachable and
    // discoverable by keyboard even though its editor lives on the record surface.
    supervisor: supervisorName ? (
      <span
        className="supervisor-cell-stop"
        tabIndex={activeCell === 'supervisor' ? 0 : -1}
        onFocus={() => setActiveCell('supervisor')}
        data-row-stop=""
      >
        <PersonCell fullName={supervisorName} />
      </span>
    ) : <span className="td-empty">—</span>,
    businessUnit: businessUnitName || <span className="td-empty">—</span>,
    workline: workLineName || <span className="td-empty">—</span>,
    objective: objectiveName || <span className="td-empty">—</span>,
    // The feed's compact age grammar, as a title-carrying absolute fallback.
    activity: (
      <span className="tabular-nums" title={task.last_activity_at}>{formatAge(task.last_activity_at, now, locale)}</span>
    ),
    due: onEditDue ? (dueEditing ? (
      <span className="inline-editor-control inline-editor-control--due" onClick={(event) => event.stopPropagation()}>
        <input autoFocus type="date" aria-label={t('tasks.inlineEdit.dueInput')} value={dueTyped} readOnly={dueInline.pending} aria-busy={dueInline.pending || undefined}
          aria-invalid={dueInline.error || undefined} aria-describedby={dueInline.error ? dueErrorId : undefined}
          onChange={(event) => { setDueTyped(event.target.value); dueInline.setDraft(event.target.value) }} onKeyDown={onDueKeyDown} onBlur={onDueBlur} />
        <InlineCommitFeedback {...dueInline} errorId={dueErrorId} />
      </span>
    ) : <button type="button" ref={dueTriggerRef} className={`inline-cell-trigger${taskOverdue && !condensed ? ' inline-cell-trigger--stacked' : ''}`} aria-label={t('tasks.inlineEdit.due')} tabIndex={activeCell === 'due' ? 0 : -1} onFocus={() => setActiveCell('due')} data-row-stop="" onClick={(event) => { event.stopPropagation(); setDueTyped(dueInline.draft); setDueEditing(true) }}>{dueInline.draft ? dueText : '—'}</button>) : dueText,
  }

  return (
    <tr
      ref={isCursor ? cursorRowRef : undefined}
      className={`task-row${isSelected ? ' row-selected' : ''}${isCursor ? ' kfocus' : ''}${justCreated ? ' row-just-created' : ''}`}
      // I7 (cohesion-debt 2026-07-19): the rail/breadcrumb own aria-current="page";
      // a row's open/cursor state is a SELECTION, so expose aria-selected — never a
      // second aria-current on the page (interaction-contract I7 "exactly one").
      aria-selected={isSelected || isCursor ? true : undefined}
      data-leaf-index={leafIndex}
      onKeyDown={onRowKeyDown}
      onClick={() => {
        // I2 (issue #379): a click anywhere on the row makes the ROW the invoking control, but a
        // click on a non-focusable cell leaves DOM focus on <body> — the shared panel then captured
        // body as its opener and Escape returned focus to the page, not the row. Focus the row's
        // opener link first so close returns focus to the invoking element.
        titleLinkRef.current?.focus()
        onOpen(task.id)
      }}
    >
      {/* #997: the <td> chain IS the column list — one source (task-columns.tsx) for both
          this row and the <thead>. Order and hook classes come from the defs; visibility
          from the one shared mapping over `visibleFields`. #1192: aria-colindex exposes the
          roving grid's columns to assistive tech on the existing table semantics. */}
      {visibleTaskColumnDefs(visibleFields).map((column, columnIndex) => (
        <td key={column.id} aria-colindex={columnIndex + 1} className={taskColumnTdClass(column, task, now)}>
          {cellBodies[column.id]}
        </td>
      ))}
    </tr>
  )
}
