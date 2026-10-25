import { useEffect, useState } from 'react'
import { getMeeting } from '@/lib/db/meetings'
import type { TaskMeetingOrigin } from './task-record-document'

/**
 * Where a Task was created ("Created in meeting"): the Meeting's title and link, whether the Task was made in a
 * private Meeting (the Task's own flag, not the Meeting's setting today) and whether the viewer is an attendee.
 * A Meeting the viewer cannot read shows as "Private meeting" on a private Task (the locked state) and not at all
 * on a public one. A host that already knows the origin passes it and nothing is read.
 */
export function useTaskMeetingOrigin(
  meetingId: string | null | undefined, viewerId: string, task: { isPrivate: boolean; createdInPrivateMeeting: boolean },
  given?: TaskMeetingOrigin | null,
): TaskMeetingOrigin | null | undefined {
  const { isPrivate: taskIsPrivate, createdInPrivateMeeting } = task
  const [origin, setOrigin] = useState<TaskMeetingOrigin | null>(null)
  useEffect(() => {
    if (!meetingId || given !== undefined) { setOrigin(null); return }
    let live = true
    const href = `/work/meetings/${meetingId}`
    getMeeting(meetingId).then(
      (meeting) => {
        if (live) setOrigin(meeting
          ? { href, title: meeting.title, isPrivate: createdInPrivateMeeting, viewerIn: meeting.attendeeIds.includes(viewerId) }
          : taskIsPrivate ? { href, title: '', isPrivate: createdInPrivateMeeting, viewerIn: false } : null)
      },
      () => { if (live) setOrigin(null) },
    )
    return () => { live = false }
  }, [given, meetingId, taskIsPrivate, createdInPrivateMeeting, viewerId])
  return given !== undefined ? given : origin
}
