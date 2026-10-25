// The Supervisor choice for a Task made in the minutes: the Task page's picker and its "None, just me" rule
// (only when the PIC is the viewer; stored as Supervisor = PIC). Left unchosen, the database defaults it.
import { Picker } from '@/components/ui/picker'
import { useT } from '@/i18n/use-t'
import { useMeetingMinutes } from './meeting-minutes-context'
import { SOLO_SUPERVISOR } from './meeting-supervisor-choice'

type Props = {
  /** The PIC the Task will have ('' until chosen; "None, just me" then makes it the viewer). */
  picId: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: boolean
}

export function MeetingSupervisorPicker({ picId, value, onChange, disabled, error }: Props) {
  const t = useT()
  const minutes = useMeetingMinutes()
  // Before a PIC is chosen, "None, just me" also makes the viewer the PIC.
  const soloAllowed = minutes.viewerId !== null && (picId === '' || picId === minutes.viewerId)
  const label = t('tasks.supervisor')
  return (
    <Picker
      hideLabel
      label={label}
      placeholder={t('meetings.taskRow.supervisorDefault')}
      filterLabel={t('ui.picker.filter', { label })}
      value={value === SOLO_SUPERVISOR && !soloAllowed ? '' : value}
      disabled={disabled}
      error={error}
      options={[
        { value: '', label: t('meetings.taskRow.supervisorDefault') },
        ...(soloAllowed ? [{ value: SOLO_SUPERVISOR, label: t('tasks.supervisor.noneJustMe') }] : []),
        ...minutes.people.filter((person) => person.id !== picId).map((person) => ({ value: person.id, label: person.full_name })),
      ]}
      onChange={onChange}
    />
  )
}
