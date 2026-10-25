// The inline task row of a Meeting's minutes and the "Tasks from this meeting" table block, as React components
// (their editor specs and slash items are in meeting-minutes-blocks).
import { useEffect, useState } from 'react'
import { DateField } from '@/components/ui/date-field'
import { Picker } from '@/components/ui/picker'
import { PrivateLock } from '@/components/tasks/task-private-lock'
import { useT } from '@/i18n/use-t'
import { MeetingTaskNeedsSupervisorError } from '@/lib/db/meetings'
import { useMeetingMinutes } from './meeting-minutes-context'
import { SOLO_SUPERVISOR, supervisorFor } from './meeting-supervisor-choice'
import { MeetingSupervisorPicker } from './meeting-supervisor-picker'
import { TaskDueCell, TaskPicCell, TaskStatusCell } from './meeting-task-cells'
import { MeetingTaskTable } from './meeting-task-table'

/**
 * A draft row: type the title, pick the PIC, and the real Task is created and the row keeps only its id.
 * A Supervisor chosen first (or "None, just me", which also makes the viewer the PIC) goes with it; a PIC
 * without a single manager asks for one and creates the Task once it is chosen.
 */
export function DraftTaskRow({ onCreated, onDiscard }: { onCreated: (taskId: string) => void; onDiscard: () => void }) {
  const t = useT()
  const minutes = useMeetingMinutes()
  const [title, setTitle] = useState('')
  const [picId, setPicId] = useState('')
  const [due, setDue] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [phase, setPhase] = useState<'draft' | 'creating' | 'failed' | 'needsSupervisor'>('draft')
  const create = async (pic: string, choice: string) => {
    if (!title.trim() || !pic) return
    setPhase('creating')
    try {
      const taskId = await minutes.createTask({
        title: title.trim(), picId: pic, dueDate: due || null, supervisorId: supervisorFor(choice, pic, minutes.viewerId),
      })
      onCreated(taskId)
    } catch (error) {
      setPhase(error instanceof MeetingTaskNeedsSupervisorError ? 'needsSupervisor' : 'failed')
    }
  }
  const choosePic = (pic: string) => {
    const choice = supervisor === SOLO_SUPERVISOR && pic !== minutes.viewerId ? '' : supervisor
    setPicId(pic)
    setSupervisor(choice)
    void create(pic, choice)
  }
  const chooseSupervisor = (choice: string) => {
    setSupervisor(choice)
    const pic = choice === SOLO_SUPERVISOR && minutes.viewerId ? minutes.viewerId : picId
    if (pic !== picId) setPicId(pic)
    if (choice === SOLO_SUPERVISOR || phase === 'needsSupervisor' || phase === 'failed') void create(pic, choice)
  }
  const busy = phase === 'creating'
  return (
    <div className="meeting-task-row meeting-task-row--draft" role="group" aria-label={t('meetings.taskRow.label')}>
      <input
        className="meeting-task-row__title"
        aria-label={t('meetings.taskRow.titleLabel')}
        placeholder={t('meetings.taskRow.titlePlaceholder')}
        value={title}
        maxLength={200}
        autoFocus
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); void create(picId, supervisor) } }}
      />
      <span className="meeting-task-row__cells">
        <Picker
          hideLabel
          label={t('meetings.taskRow.choosePic')}
          placeholder={t('meetings.taskRow.choosePic')}
          filterLabel={t('ui.picker.filter', { label: t('tasks.pic') })}
          value={picId}
          disabled={busy || minutes.frozen}
          options={minutes.picChoices.map((person) => ({ value: person.id, label: person.full_name }))}
          onChange={choosePic}
        />
        <MeetingSupervisorPicker picId={picId} value={supervisor} onChange={chooseSupervisor} disabled={busy || minutes.frozen} error={phase === 'needsSupervisor'} />
        <DateField compact aria-label={t('meetings.taskRow.setDue')} placeholder={t('meetings.taskRow.setDue')} value={due} readOnly={busy} onChange={setDue} />
        {busy ? <span className="meeting-task-row__creating" role="status">{t('meetings.taskRow.creating')}</span> : null}
      </span>
      {phase === 'needsSupervisor' ? <span role="alert" className="meeting-task-row__error">{t('meetings.taskRow.needsSupervisor')}</span> : null}
      {phase === 'failed' ? (
        <span role="alert" className="meeting-task-row__error">
          {t('meetings.taskRow.createError')}
          <button type="button" className="meeting-cell-trigger" onClick={() => { void create(picId, supervisor) }}>{t('blockDoc.retry')}</button>
        </span>
      ) : null}
      {busy ? null : <button type="button" className="meeting-task-row__discard" aria-label={t('meetings.taskRow.discard')} onClick={onDiscard}>×</button>}
    </div>
  )
}

export function TaskRowBlock({ taskId, onCreated, onDiscard }: { taskId: string; onCreated: (taskId: string) => void; onDiscard: () => void }) {
  const t = useT()
  const minutes = useMeetingMinutes()
  if (!taskId) return <DraftTaskRow onCreated={onCreated} onDiscard={onDiscard} />
  const task = minutes.tasks.find((row) => row.id === taskId)
  // A Task the viewer cannot read is not in the list: neutral text, no title.
  if (!task) return <div className="meeting-task-row meeting-task-row--restricted">{t('blockDoc.restricted')}</div>
  return (
    <div className="meeting-task-row" role="group" aria-label={t('meetings.taskRow.label')}>
      <span className="meeting-task-row__title">
        <button type="button" className="meeting-tasks__open" onClick={() => minutes.openTask(task.id)}>{task.title}</button>
        {task.isPrivate ? <PrivateLock /> : null}
      </span>
      <span className="meeting-task-row__cells">
        <TaskPicCell task={task} />
        <TaskDueCell task={task} />
        <TaskStatusCell task={task} />
      </span>
    </div>
  )
}

/** Every Task id written inline in the live document, kept current as the document changes. */
function useInlineTaskIds(editor: { document: unknown[]; onChange: (callback: () => void) => () => void }): ReadonlySet<string> {
  const read = () => {
    const ids = new Set<string>()
    const walk = (blocks: unknown[]) => {
      for (const block of blocks as Array<{ type?: string; props?: { taskId?: string }; children?: unknown[] }>) {
        if (block.type === 'taskRow' && block.props?.taskId) ids.add(block.props.taskId)
        if (block.children) walk(block.children)
      }
    }
    walk(editor.document)
    return ids
  }
  const [ids, setIds] = useState(read)
  useEffect(() => editor.onChange(() => setIds(read())), []) // eslint-disable-line react-hooks/exhaustive-deps -- read closes over the one editor
  return ids
}

export function TasksFromMeeting({ editor }: { editor: Parameters<typeof useInlineTaskIds>[0] }) {
  const t = useT()
  const minutes = useMeetingMinutes()
  const inline = useInlineTaskIds(editor)
  return <MeetingTaskTable title={t('meetings.tasks.title')} sub={t('meetings.tasks.sub')} rows={minutes.tasks.filter((task) => !inline.has(task.id))} addable empty={minutes.tasks.length > 0 ? t('meetings.tasks.allWritten') : undefined} />
}
