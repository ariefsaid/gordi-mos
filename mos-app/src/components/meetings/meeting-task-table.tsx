// A table of Meeting Tasks: Task · PIC · Due · Status. The title opens the Task in the panel; PIC, Due and
// Status are edited in place by whoever may edit that Task. "Still open from last time" and "Tasks from this
// meeting" are both this table; only the second adds Tasks ("+ Add task" creates one in this Meeting).
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { PrivateLock } from '@/components/tasks/task-private-lock'
import { useT } from '@/i18n/use-t'
import type { MeetingTaskRow } from '@/lib/db/meetings.types'
import { useMeetingMinutes } from './meeting-minutes-context'
import { TaskDueCell, TaskPicCell, TaskStatusCell } from './meeting-task-cells'

type MeetingTaskTableProps = {
  title: string
  sub: string
  rows: readonly MeetingTaskRow[]
  /** Shows the "+ Add task" row (only for a viewer who can edit the Meeting). */
  addable?: boolean
}

function AddTaskRow() {
  const t = useT()
  const minutes = useMeetingMinutes()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setFailed(false)
    try {
      await minutes.createTask({ title: title.trim() })
      setTitle('')
      setOpen(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  if (!open) {
    return <Button variant="ghost" className="meeting-tasks__add" onClick={() => setOpen(true)}>+ {t('meetings.tasks.add')}</Button>
  }
  return (
    <form className="meeting-tasks__form" onSubmit={(event) => { void submit(event) }}>
      <input
        className="meeting-tasks__input"
        aria-label={t('meetings.tasks.addLabel')}
        placeholder={t('meetings.tasks.addPlaceholder')}
        value={title}
        maxLength={200}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }}
      />
      <Button type="submit" variant="primary" disabled={busy || !title.trim()} aria-busy={busy || undefined}>{t('meetings.tasks.addSubmit')}</Button>
      <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('meetings.tasks.addCancel')}</Button>
      {failed ? <p role="alert" className="meeting-tasks__error">{t('meetings.tasks.addError')}</p> : null}
    </form>
  )
}

export function MeetingTaskTable({ title, sub, rows, addable = false }: MeetingTaskTableProps) {
  const t = useT()
  const minutes = useMeetingMinutes()
  const headingId = useId()
  return (
    <section className="meeting-tasks" aria-labelledby={headingId}>
      <p className="meeting-tasks__head"><strong id={headingId}>{title}</strong> <span>{sub}</span></p>
      {rows.length === 0 ? <p className="meeting-tasks__empty">{t('meetings.tasks.empty')}</p> : (
        <table className="meeting-tasks__table">
          <thead>
            <tr>
              <th scope="col">{t('tasks.label.task')}</th>
              <th scope="col">{t('tasks.pic')}</th>
              <th scope="col">{t('tasks.dueLabel')}</th>
              <th scope="col">{t('tasks.filter.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="meeting-tasks__title">
                  <button type="button" className="meeting-tasks__open" onClick={() => minutes.openTask(row.id)}>{row.title}</button>
                  {minutes.isPrivate ? <PrivateLock /> : null}
                </td>
                <td data-label={t('tasks.pic')}><TaskPicCell task={row} /></td>
                <td data-label={t('tasks.dueLabel')}><TaskDueCell task={row} /></td>
                <td data-label={t('tasks.filter.status')}><TaskStatusCell task={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {addable && minutes.canAdd ? <AddTaskRow /> : null}
    </section>
  )
}
