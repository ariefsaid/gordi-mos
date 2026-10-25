// MeetingMinutesSlot — the one element on the Meeting page that holds the minutes: the "Still open from last
// time" table above the block document, whose `/task` rows and `/tasks` table work on this Meeting's Tasks.
// The page renders it straight after the properties block and owns nothing inside it.
//
// Props
//   meetingId  string    the Meeting whose minutes these are
//   canEdit    boolean   true when the viewer may edit the Meeting (attendee, owning Team member or admin);
//                        false is the read-only reader: no Save, no Add, no inline edit
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { BlockDocumentEditor, type BlockDocumentCopy } from '@/components/block-document/block-document-editor'
import { sharedBlockDocumentCopy } from '@/components/block-document/block-document-copy'
import { useOpenDocumentRecord } from '@/components/block-document/use-open-document-record'
import { canEdit as canEditTask, picOptions } from '@/components/tasks/task-permissions'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { sanitizeBlockDocument } from '@/lib/db/block-document'
import { getDownlinePersonIds, getPeople, type PersonOption } from '@/lib/db/directory'
import { createMeetingTask, listMeetingTasks, listStillOpen, readMinutes, saveMinutes } from '@/lib/db/meetings'
import type { MeetingTaskRow } from '@/lib/db/meetings.types'
import { updateTaskFields, updateTaskStatus } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { hasOrgWideAuthority } from '@/lib/role-scope'
import { useIsOffline } from '@/shell/use-is-offline'
import { meetingMinutesExtension } from './meeting-minutes-blocks'
import { MeetingMinutesProvider, type MeetingMinutes } from './meeting-minutes-context'
import { MeetingTaskTable } from './meeting-task-table'
import './meeting-minutes.css'

type MeetingMinutesSlotProps = {
  meetingId: string
  canEdit: boolean
}

type Loaded = { tasks: MeetingTaskRow[]; stillOpen: MeetingTaskRow[]; people: PersonOption[]; downlineIds: string[] }
type Load = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & Loaded)

// The stored minutes keep only the allowed blocks, the way a reload would show them.
const SANITIZE = { mentions: true, recordLinks: true, blocks: Object.fromEntries(Object.entries(meetingMinutesExtension.blocks).map(([type, block]) => [type, block.sanitize])) }

export function MeetingMinutesSlot({ meetingId, canEdit }: MeetingMinutesSlotProps) {
  const t = useT()
  const auth = useAuth()
  const offline = useIsOffline()
  const openRecord = useOpenDocumentRecord('work')
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const orgWide = auth.status === 'authenticated' && hasOrgWideAuthority(auth.viewer.accessRoles)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    Promise.all([listMeetingTasks(meetingId), listStillOpen(meetingId), getPeople(), getDownlinePersonIds(viewerId ?? '')]).then(
      ([tasks, stillOpen, people, downlineIds]) => { if (live) setLoad({ status: 'ready', tasks, stillOpen, people, downlineIds }) },
      () => { if (live) setLoad({ status: 'error' }) },
    )
    return () => { live = false }
  }, [meetingId, viewerId, nonce])

  // After a write: the Tasks as they are now, without the loading state.
  const refresh = useCallback(async () => {
    const [tasks, stillOpen] = await Promise.all([listMeetingTasks(meetingId), listStillOpen(meetingId)])
    setLoad((current) => (current.status === 'ready' ? { ...current, tasks, stillOpen } : current))
  }, [meetingId])

  const ready = load.status === 'ready' ? load : null
  const minutes = useMemo<MeetingMinutes | null>(() => {
    if (!ready) return null
    const actor = () => {
      if (!viewerId) throw new Error('minutes need a signed-in viewer')
      return viewerId
    }
    const edit = (task: MeetingTaskRow, patch: Parameters<typeof updateTaskFields>[1], from: string | null) =>
      updateTaskFields(task.id, patch, actor(), from).then(refresh)
    return {
      meetingId,
      viewerId,
      canAdd: canEdit && !offline,
      tasks: ready.tasks,
      people: ready.people,
      picChoices: picOptions(viewerId ?? '', ready.people, ready.downlineIds, orgWide),
      frozen: offline,
      canEditTask: (task) => Boolean(viewerId) && canEditTask(
        { responsible_person_id: task.responsibleId, accountable_person_id: task.supervisorId } as TaskListRow, viewerId ?? '', ready.downlineIds),
      openTask: (taskId) => openRecord({ kind: 'task', id: taskId }),
      createTask: async ({ title, picId, dueDate, supervisorId }) => {
        const id = await createMeetingTask({ meetingId, title, picId, dueDate, supervisorId })
        await refresh()
        return id
      },
      setStatus: (task, status) => updateTaskStatus(task.id, task.status as TaskListRow['status'], status, actor()).then(refresh),
      setDue: (task, dueDate) => edit(task, { due_date: dueDate }, task.dueDate),
      setPic: (task, personId) => edit(task, { responsible_person_id: personId }, task.responsibleId),
    }
  }, [canEdit, meetingId, offline, openRecord, orgWide, ready, refresh, viewerId])

  const store = useMemo(() => ({
    read: async () => {
      const row = await readMinutes(meetingId)
      return row ? { blocks: row.minutes, updatedAt: row.updatedAt } : null
    },
    save: (blocks: unknown[], expectedUpdatedAt: string) => saveMinutes(meetingId, sanitizeBlockDocument(blocks, SANITIZE), expectedUpdatedAt),
  }), [meetingId])

  const copy: BlockDocumentCopy = {
    label: t('meetings.minutes.title'),
    loading: t('meetings.minutes.loading'),
    loadError: t('meetings.minutes.loadError'),
    unreadable: t('meetings.minutes.unreadable'),
    empty: t('meetings.minutes.empty'),
    placeholder: t('meetings.minutes.placeholder'),
    placeholderEmpty: t('meetings.minutes.placeholderEmpty'),
    // The Meeting page already says it is view-only.
    readOnly: '',
    ...sharedBlockDocumentCopy(t),
  }

  return (
    <section className="meeting-minutes" data-record-section="minutes" data-meeting-id={meetingId} data-can-edit={canEdit} aria-label={t('meetings.minutes.title')}>
      {load.status === 'loading' ? <LoadingShell label={t('meetings.minutes.loading')} /> : null}
      {load.status === 'error' ? <ErrorState message={t('meetings.minutes.loadError')} onRetry={() => setNonce((n) => n + 1)} /> : null}
      {minutes && ready ? (
        <MeetingMinutesProvider value={minutes}>
          {ready.stillOpen.length > 0 ? <MeetingTaskTable title={t('meetings.stillOpen.title')} sub={t('meetings.stillOpen.sub')} rows={ready.stillOpen} /> : null}
          <BlockDocumentEditor
            documentKey={meetingId}
            store={store}
            canEdit={canEdit && !offline}
            mentions
            recordLinks
            checklistNote
            bare
            extension={meetingMinutesExtension}
            viewerId={viewerId}
            onOpenRecord={openRecord}
            copy={copy}
          />
        </MeetingMinutesProvider>
      ) : null}
    </section>
  )
}
