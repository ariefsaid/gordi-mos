// Compose a Task's shared record anatomy; the adapter owns fields, rights and actions.
import type { ReactNode } from 'react'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { useT } from '@/i18n/use-t'
import { RecordField } from '@/components/records/record-field'
import type { RecordFieldSpec, RecordValue, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { RecordPageHeader, type RecordFact, type RecordFactTone } from '@/components/record/record-page-header'
import { RecordAbout, RecordPageLayout, RecordSection } from '@/components/record/record-page-layout'
import type { RecordMenuItem } from '@/components/record/record-menu'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { dueStatus } from '@/lib/due-status'
import type { PersonOption } from '@/lib/db/directory'
import type { ChecklistItemRow, TaskEventRow, TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import { ActivityCard } from './activity-card'
import { ChecklistCard } from './checklist-card'
import { CommentThread, type TaskComment } from './CommentThread'
import './task-record-document.css'

type TaskRecordDocumentProps = {
  // Adapter output: fields, edit rights and actions.
  adapter: RecordViewerAdapter
  task: TaskListRow
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
  Open: 'warning',
  'In Progress': 'primary',
  Blocked: 'destructive',
  Done: 'success',
}

export function TaskRecordDocument({
  adapter, task, mode, headingLevel, canonicalHref, now, people,
  checklist, checklistError, onAddChecklist, onToggleChecklist, onReorderChecklist, onDeleteChecklist,
  events, comments, onPostComment, commentDraft, onCommentDraftChange, onCommentDirtyChange,
  notice, onCommitField, onDirtyChange, fieldCommitsFrozen,
}: TaskRecordDocumentProps) {
  const t = useT()
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

  // ── Header facts: status · PIC · Supervisor · Due · Project/Process · Objective ──────────────
  const facts: RecordFact[] = []
  if (archived) facts.push({ type: 'state', key: 'status', label: t('tasks.archivedLabel'), tone: 'warning' })
  else if (editable) facts.push({ type: 'field', key: 'status', field: statusSpec })
  else facts.push({ type: 'state', key: 'status', label: statusSpec.displayValue, tone: STATUS_TONE[task.status] })
  facts.push({ type: 'person', key: 'pic', role: 'neutral', field: pic })
  facts.push({
    type: 'person', key: 'supervisor', role: 'neutral', hint: supervisor.subline,
    field: { ...supervisor, subline: undefined },
  })

  const open = !archived && task.status !== 'Done'
  const dueKind = open ? dueStatus(task.due_date, now) : 'none'
  if (task.due_date !== null) {
    facts.push({
      type: 'field', key: 'dueDate', tone: dueKind === 'overdue' || dueKind === 'soon' ? dueKind : undefined,
      field: dueKind === 'overdue' ? { ...due, displayValue: t('tasks.due.overdueOn', { date: due.displayValue }) } : due,
    })
  } else if (editable) {
    facts.push({ type: 'field', key: 'dueDate', field: { ...due, displayValue: t('tasks.due.set') } })
  }

  // A link whose name has not resolved yet (href unset) is held back, never shown as "Ad hoc".
  const link = (key: 'projectProcess' | 'objective'): RecordFieldSpec | null => {
    const field = spec(key)
    if (!field) return null
    if (field.value === null) return field
    return field.href ? field : null
  }
  const context = [link('projectProcess'), link('objective')]
    .filter((field): field is RecordFieldSpec => field !== null)
  if (context.length > 0) facts.push({ type: 'group', key: 'context', fields: context })

  // ── Primary: the one lifecycle action, quiet while the task is not ready to complete ──────────
  const lifecycle = adapter.actions.find((action) => action.id === 'complete' || action.id === 'reopen')
  const primary = lifecycle
    ? { label: lifecycle.label, variant: lifecycle.intent === 'primary' ? 'primary' as const : 'outline' as const, onClick: () => { void lifecycle.run() } }
    : undefined

  // ── ⋯ menu: Copy link · Ask Deputy · (separator) Archive / Unarchive ──────────────────────────
  const archiveAction = adapter.actions.find((action) => action.id === 'archive' || action.id === 'unarchive')
  const menu: RecordMenuItem[] = [
    ...(canonicalHref && typeof navigator !== 'undefined' && navigator.clipboard ? [{
      id: 'copy', label: t('record.copyLink'),
      onSelect: () => {
        void navigator.clipboard.writeText(new URL(canonicalHref, window.location.origin).href)
          .catch(() => showToast(t('record.copyLinkFailed')))
      },
    }] : []),
    ...(runtime ? [{
      id: 'deputy', label: t('assistant.askAboutRecord'),
      onSelect: () => openPanel(t('assistant.askAbout.task', { title: task.title })),
    }] : []),
    ...(archiveAction ? [{
      id: archiveAction.id, label: archiveAction.label, destructive: archiveAction.id === 'archive', separatorBefore: true,
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
  const aboutItems = ['team', 'businessUnit', 'createdBy', 'generatedFrom', 'completedAt']
    .map((key) => spec(key))
    .filter((fieldSpec): fieldSpec is RecordFieldSpec => fieldSpec !== undefined)
    .map((fieldSpec) => ({
      key: fieldSpec.key, label: fieldSpec.label,
      value: <span className="rp-about__field">{field(fieldSpec)}</span>,
    }))

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
      notice={notice}
      about={{ title: t('record.page.about'), node: <RecordAbout items={aboutItems} /> }}
      history={events.length > 0 ? {
        title: t('tasks.history.title'),
        count: events.length,
        node: <ActivityCard events={events} people={people} now={now} />,
      } : undefined}
    >
      {showDescription ? (
        <RecordSection id="description" title={t('tasks.description.title')}>
          <div className="task-description">
            {field(hasDescription ? description : { ...description, displayValue: t('tasks.description.add') })}
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
            canEdit={editable}
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
            canPost={editable}
            onPost={onPostComment}
            draftValue={commentDraft}
            onDraftChange={onCommentDraftChange}
            emptyLabel={null}
            onDirtyChange={onCommentDirtyChange}
          />
        </RecordSection>
      ) : null}
    </RecordPageLayout>
    <Toast toast={toast} onDismiss={clearToast} />
    </>
  )
}
