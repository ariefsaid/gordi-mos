// Compose a Task's shared record anatomy; the adapter owns fields, rights and actions.
import type { ReactNode } from 'react'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { copyCanonicalLink } from '@/lib/copy-canonical-link'
import { useT } from '@/i18n/use-t'
import { RecordField } from '@/components/records/record-field'
import type { RecordFieldSpec, RecordValue, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { RecordPageHeader, type RecordFactTone } from '@/components/record/record-page-header'
import { RecordAbout, RecordDisclosure, RecordPageLayout, RecordSection } from '@/components/record/record-page-layout'
import { RecordProperties, type RecordPropertyRow } from '@/components/record/record-properties'
import { PillIcon } from '@/components/ui/pill'
import type { RecordMenuItem } from '@/components/record/record-menu'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { dueStatus } from '@/lib/due-status'
import { overdueDays } from './task-formatters'
import type { PersonOption } from '@/lib/db/directory'
import type { ChecklistItemRow, TaskEventRow, TaskRow, TaskStatus } from '@/lib/db/tasks.types'
import { ActivityCard } from './activity-card'
import { ChecklistCard } from './checklist-card'
import { CommentThread, type TaskComment } from './CommentThread'
import './task-record-document.css'
import { useIsOffline } from '@/shell/use-is-offline'
import { OfflineNotice } from '@/components/ui/offline-notice'

type TaskRecordDocumentProps = {
  // Adapter output: fields, edit rights and actions.
  adapter: RecordViewerAdapter
  task: TaskRow
  mode: 'panel' | 'page'
  headingLevel: 1 | 2
  canonicalHref: string
  now: Date
  people: PersonOption[]
  checklist: ChecklistItemRow[]
  checklistError: (() => void | Promise<void>) | null
  onAddChecklist: (label: string) => void | Promise<void>
  onToggleChecklist: (id: string, isDone: boolean) => void
  onReorderChecklist: (id: string, direction: 'up' | 'down') => void
  onDeleteChecklist: (id: string) => void
  events: TaskEventRow[]
  eventsHasMore?: boolean
  eventsLoadingMore?: boolean
  eventsMoreError?: boolean
  onLoadMoreEvents?: () => void
  comments: TaskComment[]
  onPostComment: (body: string) => Promise<void> | void
  commentDraft: string
  onCommentDraftChange: (draft: string) => void
  onCommentDirtyChange: (dirty: boolean) => void
  // Failure cues (lifecycle, archive) that sit under the header.
  notice?: ReactNode
  onCommitField: (key: string, value: RecordValue) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  fieldCommitsFrozen?: boolean
}

const STATUS_TONE: Record<TaskStatus, RecordFactTone> = {
  Open: 'neutral',
  'In Progress': 'primary',
  Blocked: 'warning',
  Done: 'success',
}

export function TaskRecordDocument({
  adapter, task, mode, headingLevel, canonicalHref, now, people,
  checklist, checklistError, onAddChecklist, onToggleChecklist, onReorderChecklist, onDeleteChecklist,
  events, eventsHasMore = false, eventsLoadingMore = false, eventsMoreError = false, onLoadMoreEvents,
  comments, onPostComment, commentDraft, onCommentDraftChange, onCommentDirtyChange,
  notice, onCommitField, onDirtyChange, fieldCommitsFrozen,
}: TaskRecordDocumentProps) {
  const t = useT()
  const offline = useIsOffline()
  const { toast, showToast, clearToast } = useToast()
  const { runtime, openPanel } = useAgentRuntime()
  const editable = !adapter.permission.readOnly
  const archived = task.archived_at !== null
  const specs = adapter.contentSlots.flatMap((slot) => slot.section?.fields ?? [])
  const spec = (key: string): RecordFieldSpec | undefined => specs.find((field) => field.key === key)
  const titleSpec = adapter.headerFields?.find((field) => field.key === 'title')
  const statusSpec = adapter.headerFields?.find((field) => field.key === 'status')
  const pic = spec('pic')
  const supervisor = spec('supervisor')
  const due = spec('dueDate')
  if (!titleSpec || !statusSpec || !pic || !supervisor || !due) return null

  // A link whose name has not resolved yet (href unset) is held back, never shown as "Ad hoc".
  const link = (key: 'projectProcess' | 'objective'): RecordFieldSpec | null => {
    const field = spec(key)
    if (!field) return null
    if (field.value === null) return field
    return field.href ? field : null
  }
  // ── Primary: the one lifecycle action, quiet while the task is not ready to complete ──────────
  const lifecycle = adapter.actions.find((action) => action.id === 'complete' || action.id === 'reopen')
  const primary = lifecycle
    ? { label: lifecycle.label, variant: lifecycle.intent === 'primary' ? 'primary' as const : 'outline' as const, disabled: offline, onClick: () => { void lifecycle.run() } }
    : undefined

  // ── ⋯ menu: Copy link · Ask Deputy · (separator) Archive / Unarchive ──────────────────────────
  const archiveAction = adapter.actions.find((action) => action.id === 'archive' || action.id === 'unarchive')
  const menu: RecordMenuItem[] = [
    ...(canonicalHref && typeof navigator !== 'undefined' && navigator.clipboard ? [{
      id: 'copy', label: t('record.copyLink'),
      onSelect: () => {
        void copyCanonicalLink(canonicalHref).then(
          () => showToast(t('record.copyLinkSucceeded')),
          () => showToast(t('record.copyLinkFailed')),
        )
      },
    }] : []),
    ...(runtime ? [{
      id: 'deputy', label: t('assistant.askAboutRecord'),
      onSelect: () => openPanel(t('assistant.askAbout.task', { title: task.title })),
    }] : []),
    ...(archiveAction ? [{
      id: archiveAction.id, label: archiveAction.label, destructive: archiveAction.id === 'archive', separatorBefore: true, disabled: offline,
      onSelect: () => { void Promise.resolve(archiveAction.run()).catch(() => {}) },
    }] : []),
  ]

  // ── The one read-only line: who can change the task ─────────────────────────────────────────
  const note = editable ? undefined
    : archived ? t('tasks.archivedBanner')
      : supervisor.displayValue === pic.displayValue
        ? t('tasks.readOnly.noteOne', { name: supervisor.displayValue })
        : t('tasks.readOnly.note', { supervisor: supervisor.displayValue, pic: pic.displayValue })

  // ── Properties: label: value rows, each value edited in place by the existing field ──────────
  const description = spec('description')
  const hasDescription = (task.description ?? '').trim() !== ''
  const showDescription = description && (editable || hasDescription)
  const doneCount = checklist.filter((item) => item.is_done).length
  const showChecklist = editable || checklist.length > 0
  const showComments = editable || comments.length > 0
  const field = (fieldSpec: RecordFieldSpec) => (
    <RecordField
      spec={fieldSpec}
      onCommit={(value) => onCommitField(fieldSpec.key, value)}
      onDirtyChange={onDirtyChange}
      commitsFrozen={fieldCommitsFrozen}
    />
  )
  const open = !archived && task.status !== 'Done'
  const dueKind = open ? dueStatus(task.due_date, now) : 'none'
  const dueText = task.due_date !== null && dueKind === 'overdue'
    ? `${due.displayValue} · ${t(overdueDays(task.due_date, now) === 1 ? 'tasks.due.overdueDays.one' : 'tasks.due.overdueDays', { days: overdueDays(task.due_date, now) })}`
    : due.displayValue
  const dueSpec = task.due_date === null && editable ? { ...due, displayValue: t('tasks.due.set') } : { ...due, displayValue: dueText }
  const dueTone = dueKind === 'overdue' || dueKind === 'soon' ? dueKind : undefined
  const statusTone = archived ? 'neutral' : STATUS_TONE[task.status]
  const statusPill = <span className={`pill pill--${statusTone}`}><PillIcon tone={statusTone} />{statusSpec.displayValue}</span>
  const person = (personSpec: RecordFieldSpec) => field({
    ...personSpec,
    lead: personSpec.value !== null && personSpec.displayValue !== '' ? <PersonMark name={personSpec.displayValue} /> : undefined,
  })
  const projectProcess = link('projectProcess')
  const objective = link('objective')
  const propertyRows: RecordPropertyRow[] = [
    { key: 'status', label: statusSpec.label, children: editable ? field(statusSpec) : <span className="rp-props__plain">{statusPill}</span> },
    { key: 'pic', label: pic.label, children: person(pic) },
    { key: 'supervisor', label: supervisor.label, children: person(supervisor) },
    { key: 'dueDate', label: due.label, tone: dueTone, children: field(dueSpec) },
    ...(projectProcess ? [{ key: 'projectProcess', label: projectProcess.label, children: field(projectProcess) }] : []),
    ...(objective ? [{ key: 'objective', label: objective.label, children: field(objective) }] : []),
  ]
  const summary = (
    <>
      {statusPill}
      <span>{pic.displayValue}</span>
      {task.due_date !== null ? <span className={dueTone ? `rp-props__tone--${dueTone}` : undefined}>{dueText}</span> : null}
    </>
  )
  // ── Details (reference) and History: quiet disclosures at the bottom ──────────────────────────
  const detailsItems = ['team', 'businessUnit', 'createdBy', 'generatedFrom', 'completedAt']
    .map((key) => spec(key))
    .filter((fieldSpec): fieldSpec is RecordFieldSpec => fieldSpec !== undefined)
    .map((fieldSpec) => ({ key: fieldSpec.key, label: fieldSpec.label, value: <span className="rp-about__field">{field(fieldSpec)}</span> }))

  return (
    <>
    <RecordPageLayout
      label={task.title}
      kind="task"
      mode={mode}
      headingLevel={headingLevel}
      header={(
        <RecordPageHeader
          title={titleSpec}
          headingLevel={headingLevel}
          facts={[]}
          primary={primary}
          menu={menu}
          menuLabel={t('record.moreActions')}
          menuMinItems={menu.every((item) => item.id === 'copy') ? 2 : 1}
          factsLabel={t('record.page.facts')}
          onCommitField={onCommitField}
          onDirtyChange={onDirtyChange}
          fieldCommitsFrozen={fieldCommitsFrozen}
        />
      )}
      notice={<>{editable ? <OfflineNotice /> : null}{notice}</>}
    >
      <RecordProperties rows={propertyRows} summary={summary} />
      {note ? <p className="rp-readonly task-readonly" role="note">{note}</p> : null}
      {showDescription ? (
        // The document slot: one element, no panel heading, so the block editor can replace its contents.
        <section className="task-description-section" data-record-section="description" aria-label={t('tasks.description.title')}>
          <div className="task-description">
            {field(hasDescription ? description : { ...description, displayValue: t('tasks.description.add') })}
          </div>
        </section>
      ) : null}
      {showChecklist ? (
        <RecordSection
          id="checklist"
          title={t('tasks.checklistTitle')}
          count={checklist.length > 0 ? t('tasks.checklist.done', { done: doneCount, total: checklist.length }) : undefined}
        >
          <ChecklistCard
            items={checklist}
            canEdit={editable && !offline}
            onAdd={onAddChecklist}
            onToggle={onToggleChecklist}
            onReorder={onReorderChecklist}
            onDelete={onDeleteChecklist}
            saveError={checklistError ? { message: t('record.field.saveError'), onRetry: checklistError } : null}
          />
        </RecordSection>
      ) : null}
      {showComments ? (
        <RecordSection id="comments" title={t('tasks.commentsTitle')} count={comments.length > 0 ? comments.length : undefined}>
          <CommentThread
            variant="record"
            comments={comments}
            people={people}
            canPost={editable && !offline}
            onPost={onPostComment}
            draftValue={commentDraft}
            onDraftChange={onCommentDraftChange}
            emptyLabel={null}
            onDirtyChange={onCommentDirtyChange}
          />
        </RecordSection>
      ) : null}
      <div className="task-reference">
        {detailsItems.length > 0 ? (
          <RecordDisclosure title={t('workbench.record.details')}>
            <RecordAbout items={detailsItems} />
          </RecordDisclosure>
        ) : null}
        {events.length > 0 ? (
          <RecordDisclosure
            title={t('tasks.history.title')}
            count={eventsHasMore ? `${events.length}+` : events.length}
          >
            <ActivityCard events={events} people={people} now={now} hasMore={eventsHasMore}
              loadingMore={eventsLoadingMore} moreError={eventsMoreError} onLoadMore={onLoadMoreEvents} />
          </RecordDisclosure>
        ) : null}
      </div>
    </RecordPageLayout>
    <Toast toast={toast} onDismiss={clearToast} />
    </>
  )
}

/** The initials mark drawn before a person's name in a property value. */
function PersonMark({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase()
  return <span className="rp-avatar" data-initials={initials} aria-hidden="true" />
}
