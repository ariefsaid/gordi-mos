// Compose a Task's shared record anatomy; the adapter owns fields, rights and actions.
import { useRef, type ReactNode } from 'react'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { copyCanonicalLink } from '@/lib/copy-canonical-link'
import { useT } from '@/i18n/use-t'
import { RecordField } from '@/components/records/record-field'
import type { RecordFieldSpec, RecordValue, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { RecordPageHeader, type RecordFact, type RecordFactTone } from '@/components/record/record-page-header'
import { RecordAbout, RecordDisclosure, RecordPageLayout, RecordSection } from '@/components/record/record-page-layout'
import type { RecordMenuItem } from '@/components/record/record-menu'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { dueStatus } from '@/lib/due-status'
import { overdueDays } from './task-formatters'
import type { PersonOption } from '@/lib/db/directory'
import type { ChecklistItemRow, TaskEventRow, TaskRow, TaskStatus } from '@/lib/db/tasks.types'
import { ActivityCard } from './activity-card'
import { ChecklistCard } from './checklist-card'
import { CommentThread, type TaskComment } from './CommentThread'
import { TaskDescriptionDocument } from './task-description-document'
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
  const aboutHeadingRef = useRef<HTMLHeadingElement>(null)
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

  // Decision state, due date and task ownership stay visible in the header at every width.
  const facts: RecordFact[] = []
  if (editable) facts.push({ type: 'field', key: 'status', field: statusSpec })
  else facts.push({ type: 'state', key: 'status', label: statusSpec.displayValue, tone: archived ? 'neutral' : STATUS_TONE[task.status] })

  const open = !archived && task.status !== 'Done'
  const dueKind = open ? dueStatus(task.due_date, now) : 'none'
  if (task.due_date !== null) {
    facts.push({
      type: 'field', key: 'dueDate', tone: dueKind === 'overdue' || dueKind === 'soon' ? dueKind : undefined,
      field: dueKind === 'overdue' && task.due_date ? { ...due, displayValue: `${due.displayValue} · ${t(overdueDays(task.due_date, now) === 1 ? 'tasks.due.overdueDays.one' : 'tasks.due.overdueDays', { days: overdueDays(task.due_date, now) })}` } : due,
    })
  } else if (editable) {
    facts.push({ type: 'field', key: 'dueDate', field: { ...due, displayValue: t('tasks.due.set') } })
  } else {
    facts.push({ type: 'field', key: 'dueDate', field: due })
  }
  facts.push({ type: 'field', key: 'pic', field: pic })
  facts.push({ type: 'field', key: 'supervisor', field: supervisor })

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

  // ── Sections ────────────────────────────────────────────────────────────────────────────────
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
  const aboutFields = [link('projectProcess'), link('objective'), spec('team'), spec('businessUnit')]
    .filter((fieldSpec): fieldSpec is RecordFieldSpec => fieldSpec !== undefined && fieldSpec !== null)
  const detailsFields = ['createdBy', 'generatedFrom', 'completedAt']
    .map((key) => spec(key))
    .filter((fieldSpec): fieldSpec is RecordFieldSpec => fieldSpec !== undefined && fieldSpec !== null)
  const aboutItems = aboutFields.map((fieldSpec) => ({
    key: fieldSpec.key, label: fieldSpec.label,
    value: <span className="rp-about__field">{field(fieldSpec)}</span>,
  }))
  const detailsItems = detailsFields.map((fieldSpec) => ({
    key: fieldSpec.key, label: fieldSpec.label,
    value: <span className="rp-about__field">{field(fieldSpec)}</span>,
  }))
  const aboutTitle = t('workbench.task.about')
  const companion = (
    <>
      <RecordSection id="task-about" title={aboutTitle} headingTabIndex={-1} headingRef={aboutHeadingRef}>
        <RecordAbout items={aboutItems} />
      </RecordSection>
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
    </>
  )

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
          facts={facts}
          factsAction={(
            <button type="button" className="rp-link-btn" onClick={() => aboutHeadingRef.current?.focus()}>
              {aboutTitle}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </button>
          )}
          primary={primary}
          menu={menu}
          menuLabel={t('record.moreActions')}
          menuMinItems={menu.every((item) => item.id === 'copy') ? 2 : 1}
          factsLabel={t('record.page.facts')}
          note={note}
          onCommitField={onCommitField}
          onDirtyChange={onDirtyChange}
          fieldCommitsFrozen={fieldCommitsFrozen}
        />
      )}
      notice={<>{editable ? <OfflineNotice /> : null}{notice}</>}
      companion={companion}
      discussion={showComments ? (
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
      ) : undefined}
    >
      {showDescription ? (
        <RecordSection id="description" title={t('tasks.description.title')}>
          <div className="task-description">
            <TaskDescriptionDocument taskId={task.id} canEdit={editable && !archived && !offline} onDirtyChange={onDirtyChange} />
          </div>
        </RecordSection>
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
    </RecordPageLayout>
    <Toast toast={toast} onDismiss={clearToast} />
    </>
  )
}
