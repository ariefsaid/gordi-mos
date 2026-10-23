// MeetingMinutesSlot — the one element on the Meeting page that holds the minutes: the block editor, the
// "Still open from last time" table and the "Tasks from this meeting" table. The page renders it straight
// after the properties block and owns nothing inside it; the minutes work replaces this body.
//
// Props
//   meetingId  string   the Meeting whose minutes these are
//   canEdit    boolean  true when the viewer may edit the Meeting (attendee, owning Team member or admin);
//                       false is the read-only reader: no Save, no Add
import { useT } from '@/i18n/use-t'

export type MeetingMinutesSlotProps = {
  meetingId: string
  canEdit: boolean
}

export function MeetingMinutesSlot({ meetingId, canEdit }: MeetingMinutesSlotProps) {
  const t = useT()
  return (
    <section
      className="meeting-minutes"
      data-record-section="minutes"
      data-meeting-id={meetingId}
      data-can-edit={canEdit}
      aria-label={t('meetings.minutes.title')}
    >
      <p className="meeting-minutes__placeholder">{t('meetings.minutes.soon')}</p>
    </section>
  )
}
