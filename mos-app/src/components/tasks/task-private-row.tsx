// TaskPrivateRow — the value of the Task's "Private" property: a switch, its state in words, one
// help line and, while on, the extra people who can see the Task (removable chips + Add person).
// Every change saves at once through the handlers; a failure shows "Couldn't save" with Retry that
// re-sends the same change. Someone who cannot change privacy sees plain text, no controls.
import { useState } from 'react'
import { Chip } from '@/components/ui/chip'
import { Toggle } from '@/components/ui/toggle'
import { useT } from '@/i18n/use-t'
import type { PersonOption } from '@/lib/db/directory'
import { PersonPicker } from './person-picker'
import { PrivateLock } from './task-private-lock'
import './task-private-row.css'

export type TaskPrivateRowProps = {
  isPrivate: boolean
  /** The extra people on the who-can-see list. */
  viewers: readonly PersonOption[]
  /** Everyone who could be added; people already on the list are filtered out. */
  people: readonly PersonOption[]
  /** Ids that can already read it (creator, PIC, Supervisor): not offered again. */
  alreadyIds?: readonly string[]
  /** The viewer may turn Private on or off and edit the list (the Task edit gate). */
  canChange: boolean
  /** Offline: controls are frozen. */
  frozen?: boolean
  /** The Task was made in a private Meeting: everyone in it can read it, plus the people on the list. */
  meetingPrivate?: boolean
  /** The viewer is in that Meeting; anyone else has the switch and the list locked. */
  viewerInMeeting?: boolean
  /** Creator is the only person involved: "Only you, ..." wording. */
  solo?: boolean
  onSetPrivate: (next: boolean) => Promise<void>
  onAddViewer: (personId: string) => Promise<void>
  onRemoveViewer: (personId: string) => Promise<void>
}

export function TaskPrivateRow({
  isPrivate, viewers, people, alreadyIds = [], canChange, frozen = false, meetingPrivate = false, viewerInMeeting = false,
  solo = false, onSetPrivate, onAddViewer, onRemoveViewer,
}: TaskPrivateRowProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null)
  const [picking, setPicking] = useState(false)

  const run = async (change: () => Promise<void>) => {
    setBusy(true)
    setRetry(null)
    try { await change() } catch { setRetry(() => () => run(change)) } finally { setBusy(false) }
  }

  const meetingLocked = isPrivate && meetingPrivate && !viewerInMeeting
  const stateText = !isPrivate ? t('tasks.private.off')
    : meetingPrivate ? (viewers.length === 0 ? t('tasks.private.onMeeting')
      : t(viewers.length === 1 ? 'tasks.private.onMeetingCount.one' : 'tasks.private.onMeetingCount.other', { count: viewers.length }))
      : viewers.length === 0 ? t('tasks.private.on')
        : t(viewers.length === 1 ? 'tasks.private.onCount.one' : 'tasks.private.onCount.other', { count: viewers.length })
  const help = !isPrivate ? null
    : meetingPrivate ? (meetingLocked ? `${t('tasks.private.meetingHelp')} ${t('tasks.private.meetingLocked')}` : t('tasks.private.meetingHelp'))
      : t(solo ? 'tasks.private.helpSelf' : 'tasks.private.help')
  const editable = canChange && !frozen
  // For a Task made in a private Meeting only that Meeting's people change who else can see it.
  const listEditable = canChange && !meetingLocked
  const pickable = people.filter((person) => !alreadyIds.includes(person.id) && !viewers.some((viewer) => viewer.id === person.id))

  return (
    <div className="tpr">
      <div className="tpr__line">
        {canChange ? (
          <Toggle
            aria-label={t('tasks.private.label')}
            value={isPrivate}
            disabled={!editable || busy || meetingLocked}
            onChange={(next) => { void run(() => onSetPrivate(next)) }}
          />
        ) : null}
        <span className="tpr__state" role="status">{stateText}</span>
        {meetingLocked ? <PrivateLock /> : null}
      </div>
      {help ? <p className="tpr__help">{help}</p> : null}
      {isPrivate ? (
        <div className="tpr__people">
          {viewers.length === 0 ? <p className="tpr__nobody">{t('tasks.private.nobody')}</p> : null}
          {viewers.map((viewer) => (
            <span key={viewer.id} className="tpr__person">
              <Chip label={viewer.full_name} avatarColor={viewer.full_name} />
              {listEditable ? (
                <button
                  type="button"
                  className="tpr__remove"
                  aria-label={t('tasks.private.remove', { name: viewer.full_name })}
                  disabled={!editable || busy}
                  onClick={() => { void run(() => onRemoveViewer(viewer.id)) }}
                >×</button>
              ) : null}
            </span>
          ))}
          {listEditable ? (
            <span className="tpr__add">
              <button type="button" className="tpr__addbtn" disabled={!editable || busy} onClick={() => setPicking(true)}>
                {t('tasks.private.add')}
              </button>
              {picking ? (
                <PersonPicker
                  people={pickable as PersonOption[]}
                  onSelect={(id) => { void run(() => onAddViewer(id)) }}
                  onClose={() => setPicking(false)}
                />
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {retry ? (
        <p role="alert" className="tpr__error">
          {t('record.field.saveError')}
          <button type="button" className="task-row-retry" onClick={() => { void retry() }}>{t('record.field.retry')}</button>
        </p>
      ) : null}
    </div>
  )
}
