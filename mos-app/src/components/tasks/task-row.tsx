// TaskRow — one shared E7-measure record row (PR-2). Extracted verbatim from
// TasksWorkspace.renderRow, then given a trailing RowMenu ⋯ (AC-T02). The name
// cell is a real <a href="/work/tasks/:id"> Chip-link (AC-T03); status is a
// soft StatusPill that never wraps (AC-T05); the row fill is bg-secondary on
// hover and the existing neutral row-selected on the open drawer row (AC-T04).
//
// The `row-selected` class stays semantically "the open drawer row" (isSelected),
// unchanged from pre-PR-2.
import type { Ref } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import '@/components/collection-grammar.css'
import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { TaskCollectionVisibleField } from '@/lib/record-collection/collection-view-spec'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { useInlineCommit } from '@/components/ui/use-inline-commit'
import { StatusPill } from './status-pill'
import { statusTone } from './status-tone'
import { Select } from '@/components/ui/select'
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
  visibleFields?: readonly TaskCollectionVisibleField[]
  workLineName?: string
  objectiveName?: string
  isNew?: boolean
  onDiscardNewTask?: () => void
  createError?: boolean
  onRetryCreate?: () => void
}

function InlineCommitFeedback({ error, retry, liveMessage }: { error: boolean; retry: () => void; liveMessage: string }) {
  const t = useT()
  return <>
    {error && <span role="alert" className="task-row-save-error">
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
  visibleFields = TASK_DECISION_FIELDS, workLineName = '', objectiveName = '',
  isNew = false, onDiscardNewTask, createError = false, onRetryCreate,
}: TaskRowProps) {
  const t = useT()
  const { locale } = useI18n()
  const titleEditKeyhintId = useId()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  // C1: only genuinely-overdue (non-Done, non-archived) rows get the red class.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
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
  const optionalCell = (field: TaskCollectionVisibleField) => {
    if (!visibleFields.includes(field)) return null
    const values: Partial<Record<TaskCollectionVisibleField, string>> = {
      businessUnit: businessUnitName,
      workline: workLineName,
      objective: objectiveName,
      source: sourceName,
      activity: task.last_activity_at ? formatDate(task.last_activity_at.slice(0, 10), locale) : '',
    }
    const value = values[field] ?? ''
    return <td key={field} className={`td-cell td-${field}`} data-field={field}>{value || <span className="td-empty">—</span>}</td>
  }
  const recordTo = { pathname: `/work/tasks/${task.id}`, search: recordSearch }
  const panelState = { taskSurface: 'panel' as const }

  // ── Inline title edit (E7 collection promise) ────────────────────────────────
  // `draft` is the SINGLE display source for the title: while a commit is pending it holds the
  // optimistic new value; on a rejected commit useInlineCommit rolls it back to task.title and
  // announces the revert. Rendering `draft` (not task.title) is what makes the optimistic edit
  // survive the async round-trip without the row needing its own copy of the collection cache.
  const canEdit = Boolean(onEditTitle)
  const [editing, setEditing] = useState(isNew)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const newCommitStarted = useRef(false)
  // I2 (#379): the row's opener link is the row's focus home — focused on row-click so the
  // shared panel's close returns focus to the invoking element.
  const titleLinkRef = useRef<HTMLAnchorElement | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (openTimer.current) clearTimeout(openTimer.current) }, [])
  const inline = useInlineCommit<string>({
    value: task.title,
    onCommit: (next) => (onEditTitle ? onEditTitle(task.id, next) : undefined),
    rollbackMessage: t('tasks.feedback.rollback'),
  })
  const { draft, setDraft, pending, error: saveError, retry, commit, cancel, liveMessage } = inline
  const displayTitle = draft

  const [statusEditing, setStatusEditing] = useState(false)
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
    rollbackMessage: t('tasks.feedback.rollback'),
  })

  useEffect(() => {
    if (createError) newCommitStarted.current = false
  }, [createError])

  useEffect(() => {
    if (editing) {
      const el = inputRef.current
      el?.focus()
      if (!isNew) el?.select()
    }
  }, [editing, isNew])

  const beginEdit = () => { if (canEdit && !editing) setEditing(true) }
  // Enter/blur COMMIT the trimmed draft; an empty or unchanged draft is a no-op restore (never a
  // blank title). Escape DISCARDS. Exiting edit mode is owned here (useInlineCommit is mode-less).
  const finishEdit = () => {
    const next = draft.trim()
    if (isNew) {
      if (newCommitStarted.current) return
      if (!next) { onDiscardNewTask?.(); return }
      newCommitStarted.current = true
      commit(next)
      setEditing(false)
      return
    }
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
      if (isNew) onDiscardNewTask?.()
      else cancel()
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
  // Mouse activation follows the e7 grammar: selecting a title edits it in place. The canonical
  // href remains available for open-in-new-tab and non-editable rows retain opener behavior.
  const onTitleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (canEdit) beginEdit()
    else onOpen(task.id)
  }
  const onTitleDoubleClick = (e: React.MouseEvent) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    beginEdit()
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
      onClick={() => {
        // I2 (issue #379): a click anywhere on the row makes the ROW the invoking control, but a
        // click on a non-focusable cell leaves DOM focus on <body> — the shared panel then captured
        // body as its opener and Escape returned focus to the page, not the row. Focus the row's
        // opener link first so close returns focus to the invoking element.
        titleLinkRef.current?.focus()
        onOpen(task.id)
      }}
    >
      <td className="td-main">
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
              className="task-title-input collection-grammar-title"
              value={draft}
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
          <Link
            to={recordTo}
            state={panelState}
            ref={titleLinkRef}
            className="task-row-link name-chip collection-grammar-title-cell"
            title={task.title}
            tabIndex={0}
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
        )}
        {/* OD-REDESIGN-22 (D-C1): a failed rename surfaces a VISIBLE error + Retry — not a sr-only
            rollback the sighted user never sees. Retry re-sends the preserved attempt. The sr-only
            live region still announces the revert for AT. */}
        {createError && (
          <span role="alert" className="task-row-save-error">
            {t('tasks.create.linkFailed')}
            <button type="button" className="task-row-retry" onClick={(e) => { e.stopPropagation(); onRetryCreate?.() }}>
              {t('record.field.retry')}
            </button>
          </span>
        )}
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
      </td>
      <td className="td-cell td-status td-nowrap">
        {onEditStatus ? (statusEditing ? (
          <span className={`inline-status-editor inline-status-editor--${statusTone(statusInline.draft)}`}>
            <Select autoFocus aria-label="Edit task status" value={statusInline.draft} disabled={statusInline.pending} aria-busy={statusInline.pending || undefined}
              onChange={(event) => {
                const next = event.target.value as TaskListRow['status']
                statusCommitPending.current = true
                statusInline.commit(next)
                if (next === task.status) setStatusEditing(false)
              }}
              onKeyDown={(event) => { statusInline.onKeyDown(event); if (event.key === 'Escape') setStatusEditing(false) }}>
              {(['Open', 'In Progress', 'Blocked', 'Done'] as const).map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
            <InlineCommitFeedback {...statusInline} />
          </span>
        ) : <button type="button" className="inline-cell-trigger" onClick={(event) => { event.stopPropagation(); setStatusEditing(true) }}><StatusPill status={statusInline.draft} /></button>) : <StatusPill status={task.status} />}
      </td>
      <td className="td-cell td-owner">
        {onEditPic ? (picEditing ? (
          <span className="inline-editor-control" onClick={(event) => event.stopPropagation()}>
            <Select autoFocus aria-label="Edit task PIC" value={picInline.draft} disabled={picInline.pending} aria-busy={picInline.pending || undefined}
              onChange={(event) => { picInline.commit(event.target.value) }} onKeyDown={(event) => { picInline.onKeyDown(event); if (event.key === 'Escape') setPicEditing(false) }}>
              {personOptions.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </Select>
            <InlineCommitFeedback {...picInline} />
          </span>
        ) : <button type="button" className="inline-cell-trigger" onClick={(event) => { event.stopPropagation(); setPicEditing(true) }}><PicCell fullName={ownerName} provenance={provenanceRoleName} /></button>) : <PicCell fullName={ownerName} provenance={provenanceRoleName} />}
      </td>
      <td className="td-cell td-supervisor">{supervisorName || <span className="td-empty">—</span>}</td>
      <td className={`td-cell td-nowrap tabular-nums ${dueClass}`}>
        {onEditDue ? (dueEditing ? (
          <span className="inline-editor-control" onClick={(event) => event.stopPropagation()}>
            <input autoFocus type="date" aria-label="Due date" value={dueInline.draft} disabled={dueInline.pending} aria-busy={dueInline.pending || undefined}
              onChange={(event) => dueInline.setDraft(event.target.value)} onKeyDown={(event) => { dueInline.onKeyDown(event); if (event.key === 'Escape') setDueEditing(false) }} onBlur={() => { dueInline.onBlur(); setDueEditing(false) }} />
            <InlineCommitFeedback {...dueInline} />
          </span>
        ) : <button type="button" className="inline-cell-trigger" aria-label="Edit task due date" onClick={(event) => { event.stopPropagation(); setDueEditing(true) }}>{dueInline.draft ? dueText : '—'}</button>) : dueText}
      </td>
      {visibleFields.filter((field) => !['title', 'pic', 'supervisor', 'status', 'due'].includes(field)).map(optionalCell)}
      <td className="td-cell td-menu">
        <RowMenu taskId={task.id} recordSearch={recordSearch} />
      </td>
    </tr>
  )
}
