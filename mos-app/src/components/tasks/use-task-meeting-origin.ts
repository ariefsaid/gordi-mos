import { useEffect, useState } from 'react'
import { getMeeting } from '@/lib/db/meetings'
import type { TaskMeetingOrigin } from './task-record-document'

/**
 * Where a Task was created ("Created in meeting"): the Meeting's title and link, whether it is Private and
 * whether the viewer is an attendee. A Meeting the viewer cannot read is a Private one they are not in.
 * A host that already knows the origin passes it and nothing is read.
 */
export function useTaskMeetingOrigin(
  meetingId: string | null | undefined, viewerId: string, given?: TaskMeetingOrigin | null,
): TaskMeetingOrigin | null | undefined {
  const [origin, setOrigin] = useState<TaskMeetingOrigin | null>(null)
  useEffect(() => {
    if (!meetingId || given !== undefined) { setOrigin(null); return }
    let live = true
    const href = `/work/meetings/${meetingId}`
    getMeeting(meetingId).then(
      (meeting) => {
        if (live) setOrigin(meeting
          ? { href, title: meeting.title, isPrivate: meeting.isPrivate, viewerIn: meeting.attendeeIds.includes(viewerId) }
          : { href, title: '', isPrivate: true, viewerIn: false })
      },
      () => { if (live) setOrigin(null) },
    )
    return () => { live = false }
  }, [given, meetingId, viewerId])
  return given !== undefined ? given : origin
}
