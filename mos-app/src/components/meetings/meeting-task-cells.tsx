// The PIC, Due and Status of one Task as the minutes show them: plain text for someone who cannot edit the
// Task, otherwise a button that opens the same picker / date field the Tasks table uses and saves at once.
import { useState, type ReactNode } from 'react'
import { DateField } from '@/components/ui/date-field'
import { Picker } from '@/components/ui/picker'
import { useInlineCommit } from '@/components/ui/use-inline-commit'
import { InlineCommitFeedback } from '@/components/tasks/task-row'
import { StatusPill } from '@/components/tasks/status-pill'
import { formatDate } from '@/components/tasks/task-formatters'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { dueStatus } from '@/lib/due-status'
import type { MeetingTaskRow } from '@/lib/db/meetings.types'
import type { TaskStatus } from '@/lib/db/tasks.types'
import { useMeetingMinutes } from './meeting-minutes-context'

const STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Blocked', 'Done']

/** One cell's edit state: closed until the trigger is pressed; a saved value closes it, a failed one keeps it with Retry. */
function useCellEdit<T>(value: T, write: (next: T) => Promise<void>, rollback: string) {
  const [editing, setEditing] = useState(false)
  const inline = useInlineCommit<T>({ value, onCommit: async (next) => { await write(next); setEditing(false) }, rollbackMessage: rollback })
  return { editing, setEditing, inline }
}

function Trigger({ label, onOpen, children }: { label: string; onOpen: () => void; children: ReactNode }) {
  return <button type="button" className="meeting-cell-trigger" aria-label={label} onClick={onOpen}>{children}</button>
}

const closesEditor = (reason?: string) => reason === 'escape' || reason === 'outside' || reason === 'tab'

export function TaskPicCell({ task }: { task: MeetingTaskRow }) {
  const t = useT()
  const minutes = useMeetingMinutes()
  const name = minutes.people.find((person) => person.id === task.responsibleId)?.full_name ?? '—'
  const { editing, setEditing, inline } = useCellEdit(task.responsibleId, (next) => minutes.setPic(task, next), t('tasks.feedback.rollback'))
  if (!minutes.canEditTask(task) || minutes.frozen) return <span className="meeting-cell">{name}</span>
  if (!editing) return <Trigger label={`${t('tasks.pic')}: ${name}, ${t('tasks.inlineEdit.pic')}`} onOpen={() => setEditing(true)}>{name}</Trigger>
  const choices = minutes.picChoices.some((person) => person.id === task.responsibleId)
    ? minutes.picChoices
    : [{ id: task.responsibleId, full_name: name }, ...minutes.picChoices]
  return (
    <span className="meeting-cell-editor">
      <Picker
        autoFocus defaultOpen hideLabel
        label={t('tasks.inlineEdit.pic')}
        filterLabel={t('ui.picker.filter', { label: t('tasks.pic') })}
        value={inline.draft}
        disabled={inline.pending}
        busy={inline.pending}
        options={choices.map((person) => ({ value: person.id, label: person.full_name }))}
        onChange={(value) => inline.commit(value)}
        onOpenChange={(_, reason) => { if (closesEditor(reason)) setEditing(false) }}
      />
      <InlineCommitFeedback {...inline} />
    </span>
  )
}

export function TaskDueCell({ task }: { task: MeetingTaskRow }) {
  const t = useT()
  const { locale } = useI18n()
  const minutes = useMeetingMinutes()
  const [invalid, setInvalid] = useState(false)
  const { editing, setEditing, inline } = useCellEdit(task.dueDate ?? '', (next) => minutes.setDue(task, next || null), t('tasks.feedback.dueKept'))
  const overdue = task.status !== 'Done' && dueStatus(task.dueDate, new Date()) === 'overdue'
  const text = task.dueDate ? formatDate(task.dueDate, locale) : '—'
  if (!minutes.canEditTask(task) || minutes.frozen) return <span className="meeting-cell" data-overdue={overdue || undefined}>{text}</span>
  if (!editing) {
    return <Trigger label={`${text}, ${t('tasks.inlineEdit.due')}`} onOpen={() => setEditing(true)}><span data-overdue={overdue || undefined}>{text}</span></Trigger>
  }
  const finish = () => { if (invalid || inline.draft === (task.dueDate ?? '')) { inline.cancel(); setEditing(false) } else inline.commit() }
  return (
    <span className="meeting-cell-editor">
      <DateField
        compact autoFocus
        aria-label={t('tasks.inlineEdit.dueInput')}
        value={inline.draft}
        readOnly={inline.pending}
        error={inline.error}
        onChange={inline.setDraft}
        onValidityChange={setInvalid}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); finish() }
          else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); inline.cancel(); setEditing(false) }
        }}
        onBlur={() => { if (!inline.pending && !inline.error) finish() }}
      />
      <InlineCommitFeedback {...inline} />
    </span>
  )
}

export function TaskStatusCell({ task }: { task: MeetingTaskRow }) {
  const t = useT()
  const minutes = useMeetingMinutes()
  const status = task.status as TaskStatus
  const { editing, setEditing, inline } = useCellEdit(status, (next) => minutes.setStatus(task, next), t('tasks.feedback.rollback'))
  if (!minutes.canEditTask(task) || minutes.frozen) return <StatusPill status={status} openTreatment="neutral" />
  if (!editing) {
    return <Trigger label={`${status}, ${t('tasks.inlineEdit.status')}`} onOpen={() => setEditing(true)}><StatusPill status={status} openTreatment="neutral" /></Trigger>
  }
  return (
    <span className="meeting-cell-editor">
      <Picker
        autoFocus defaultOpen hideLabel
        label={t('tasks.inlineEdit.status')}
        filterLabel={t('ui.picker.filter', { label: t('tasks.filter.status') })}
        value={inline.draft}
        disabled={inline.pending}
        busy={inline.pending}
        options={STATUSES.map((value) => ({ value, label: value }))}
        onChange={(value) => inline.commit(value as TaskStatus)}
        onOpenChange={(_, reason) => { if (closesEditor(reason)) setEditing(false) }}
      />
      <InlineCommitFeedback {...inline} />
    </span>
  )
}
