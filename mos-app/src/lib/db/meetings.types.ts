// Meetings data-layer types (#1840). Row shapes are camelCase; the DB columns are snake_case.

export type MeetingListScope = 'mine' | 'all'

export interface MeetingRow {
  id: string
  title: string
  /** null = "Set date and time" (a next meeting whose date is not chosen yet). */
  startsAt: string | null
  owningTeamId: string
  workLineId: string | null
  objectiveId: string | null
  isPrivate: boolean
  previousMeetingId: string | null
  seriesId: string
  sequenceNumber: number
  createdBy: string
  archivedAt: string | null
  updatedAt: string
}

export interface MeetingListRow extends MeetingRow {
  attendeeIds: string[]
  openTaskCount: number
}

/** A Meeting beside the Meeting open on the page: Previous / Next in the series. */
export interface MeetingSeriesLink {
  id: string
  title: string
  sequenceNumber: number
  startsAt: string | null
}

export interface MeetingDetail extends MeetingRow {
  attendeeIds: string[]
  previous: MeetingSeriesLink | null
  next: MeetingSeriesLink | null
}

/** Compact row for the Meetings section on a Project/Process or Objective. */
export interface MeetingLinkRow {
  id: string
  title: string
  startsAt: string | null
  isPrivate: boolean
}

export interface MeetingTaskRow {
  id: string
  title: string
  responsibleId: string
  supervisorId: string
  dueDate: string | null
  status: string
  meetingId: string
  /** The Task's own Private setting. */
  isPrivate: boolean
  /** The Task was made in a Meeting that was private at that moment. */
  createdInPrivateMeeting: boolean
}

export interface CreateMeetingInput {
  title: string
  owningTeamId: string
  startsAt?: string | null
  isPrivate?: boolean
  workLineId?: string | null
  objectiveId?: string | null
  /** The creator is always an attendee; list only the others. */
  attendeeIds?: string[]
}

export interface MeetingFieldsPatch {
  title?: string
  startsAt?: string | null
  owningTeamId?: string
  workLineId?: string | null
  objectiveId?: string | null
  isPrivate?: boolean
  /** Archive (an ISO instant) or unarchive (null) a Meeting. */
  archivedAt?: string | null
}

export interface CreateMeetingTaskInput {
  meetingId: string
  title: string
  /** Defaults to the caller. */
  picId?: string | null
  dueDate?: string | null
  /** Defaults to the PIC's primary Team, else the Meeting's owning Team. */
  teamId?: string | null
  /** A chosen Supervisor; by default the PIC's one direct manager, else the PIC when the PIC is the caller. */
  supervisorId?: string | null
}

export interface MeetingMinutesRead {
  minutes: unknown[] | null
  updatedAt: string
}
