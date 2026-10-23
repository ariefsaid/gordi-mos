import { supabase } from '@/lib/supabase'
import { containsPattern } from './like-pattern'
import { WRITE_UP_MAX_BYTES, WriteUpConflictError, WriteUpTooLargeError } from './objective-writeup'
import type {
  CreateMeetingInput, CreateMeetingTaskInput, MeetingDetail, MeetingFieldsPatch, MeetingLinkRow,
  MeetingListRow, MeetingListScope, MeetingMinutesRead, MeetingRow, MeetingSeriesLink, MeetingTaskRow,
} from './meetings.types'

// Data layer for mos.meetings and mos.meeting_attendees (#1840).
// Reads go through supabase.schema('mos'); RLS is the authority: a Private Meeting the caller cannot
// open is simply absent from every read here (no title, no row, no count). Never sends org_id.
// Minutes saves mirror objective-writeup: conditional on the read updated_at, never sending it.

const mos = () => supabase.schema('mos')

/** The minutes document limit, shared with the Objective write-up and the DB check. */
export const MINUTES_MAX_BYTES = WRITE_UP_MAX_BYTES

const MEETING_COLUMNS =
  'id,title,starts_at,owning_team_id,work_line_id,objective_id,is_private,previous_meeting_id,series_id,sequence_number,created_by,archived_at,updated_at'

type MeetingDbRow = {
  id: string
  title: string
  starts_at: string | null
  owning_team_id: string
  work_line_id: string | null
  objective_id: string | null
  is_private: boolean
  previous_meeting_id: string | null
  series_id: string
  sequence_number: number
  created_by: string
  archived_at: string | null
  updated_at: string
}

function toMeeting(r: MeetingDbRow): MeetingRow {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    owningTeamId: r.owning_team_id,
    workLineId: r.work_line_id,
    objectiveId: r.objective_id,
    isPrivate: r.is_private,
    previousMeetingId: r.previous_meeting_id,
    seriesId: r.series_id,
    sequenceNumber: r.sequence_number,
    createdBy: r.created_by,
    archivedAt: r.archived_at,
    updatedAt: r.updated_at,
  }
}

function toSeriesLink(r: { id: string; title: string; sequence_number: number; starts_at: string | null }): MeetingSeriesLink {
  return { id: r.id, title: r.title, sequenceNumber: r.sequence_number, startsAt: r.starts_at }
}

async function liveAttendees(meetingIds: string[]): Promise<Map<string, string[]>> {
  const byMeeting = new Map<string, string[]>()
  if (meetingIds.length === 0) return byMeeting
  const { data, error } = await mos()
    .from('meeting_attendees')
    .select('meeting_id,person_id')
    .in('meeting_id', meetingIds)
    .is('removed_at', null)
  if (error) throw new Error(`liveAttendees failed — ${error.message}`)
  for (const r of (data ?? []) as Array<{ meeting_id: string; person_id: string }>) {
    byMeeting.set(r.meeting_id, [...(byMeeting.get(r.meeting_id) ?? []), r.person_id])
  }
  return byMeeting
}

async function openTaskCounts(meetingIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (meetingIds.length === 0) return counts
  const { data, error } = await mos()
    .from('tasks')
    .select('meeting_id')
    .in('meeting_id', meetingIds)
    .neq('status', 'Done')
    .is('archived_at', null)
  if (error) throw new Error(`openTaskCounts failed — ${error.message}`)
  for (const r of (data ?? []) as Array<{ meeting_id: string }>) {
    counts.set(r.meeting_id, (counts.get(r.meeting_id) ?? 0) + 1)
  }
  return counts
}

export interface ListMeetingsOptions {
  scope: MeetingListScope
  /** The viewer; required for the My meetings scope. */
  personId?: string
  /** The viewer's live Team ids; Meetings owned by these count as "mine". */
  teamIds?: string[]
  search?: string
  limit?: number
}

/**
 * Meetings newest first (undated ones, "Set date and time", on top). My meetings = I attend or my
 * Team owns it; All = everything the caller can read. Each row carries its live attendee ids and
 * the number of Tasks created in it that are not Done.
 */
export async function listMeetings(options: ListMeetingsOptions): Promise<MeetingListRow[]> {
  let query = mos()
    .from('meetings')
    .select(MEETING_COLUMNS)
    .is('archived_at', null)
    .order('starts_at', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)
  const term = options.search?.trim()
  if (term) query = query.ilike('title', containsPattern(term))

  if (options.scope === 'mine') {
    if (!options.personId) return []
    const { data: attended, error: attendedError } = await mos()
      .from('meeting_attendees')
      .select('meeting_id')
      .eq('person_id', options.personId)
      .is('removed_at', null)
    if (attendedError) throw new Error(`listMeetings failed — ${attendedError.message}`)
    const attendedIds = ((attended ?? []) as Array<{ meeting_id: string }>).map((r) => r.meeting_id)
    const clauses: string[] = []
    if (attendedIds.length > 0) clauses.push(`id.in.(${attendedIds.join(',')})`)
    if (options.teamIds && options.teamIds.length > 0) clauses.push(`owning_team_id.in.(${options.teamIds.join(',')})`)
    if (clauses.length === 0) return []
    query = query.or(clauses.join(','))
  }

  const { data, error } = await query
  if (error) throw new Error(`listMeetings failed — ${error.message}`)
  const meetings = ((data ?? []) as unknown as MeetingDbRow[]).map(toMeeting)
  const ids = meetings.map((m) => m.id)
  const [attendees, open] = await Promise.all([liveAttendees(ids), openTaskCounts(ids)])
  return meetings.map((m) => ({ ...m, attendeeIds: attendees.get(m.id) ?? [], openTaskCount: open.get(m.id) ?? 0 }))
}

/** One Meeting with attendees and its Previous / Next. Null when the row is not visible to the caller. */
export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  const { data, error } = await mos().from('meetings').select(MEETING_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`getMeeting failed — ${error.message}`)
  if (!data) return null
  const meeting = toMeeting(data as unknown as MeetingDbRow)
  const linkColumns = 'id,title,sequence_number,starts_at'
  const [attendees, prev, next] = await Promise.all([
    liveAttendees([id]),
    meeting.previousMeetingId
      ? mos().from('meetings').select(linkColumns).eq('id', meeting.previousMeetingId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    mos().from('meetings').select(linkColumns).eq('previous_meeting_id', id).maybeSingle(),
  ])
  if (prev.error) throw new Error(`getMeeting previous failed — ${prev.error.message}`)
  if (next.error) throw new Error(`getMeeting next failed — ${next.error.message}`)
  return {
    ...meeting,
    attendeeIds: attendees.get(id) ?? [],
    previous: prev.data ? toSeriesLink(prev.data as never) : null,
    next: next.data ? toSeriesLink(next.data as never) : null,
  }
}

/** Create a Meeting (the creator is always an attendee). Returns its id. */
export async function createMeeting(input: CreateMeetingInput): Promise<string> {
  const { data, error } = await mos().rpc('create_meeting', {
    p_title: input.title,
    p_owning_team_id: input.owningTeamId,
    p_starts_at: input.startsAt ?? null,
    p_is_private: input.isPrivate ?? false,
    p_work_line_id: input.workLineId ?? null,
    p_objective_id: input.objectiveId ?? null,
    p_attendee_ids: input.attendeeIds ?? [],
  })
  if (error) throw new Error(`createMeeting failed — ${error.message}`)
  return data as string
}

const FIELD_COLUMNS: Record<keyof MeetingFieldsPatch, string> = {
  title: 'title',
  startsAt: 'starts_at',
  owningTeamId: 'owning_team_id',
  workLineId: 'work_line_id',
  objectiveId: 'objective_id',
  isPrivate: 'is_private',
}

/** Update the Meeting's own fields (not the minutes). Zero visible rows means the caller cannot edit it. */
export async function updateMeetingFields(id: string, patch: MeetingFieldsPatch): Promise<void> {
  const row: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as Array<keyof MeetingFieldsPatch>) {
    if (patch[key] !== undefined) row[FIELD_COLUMNS[key]] = patch[key]
  }
  if (Object.keys(row).length === 0) return
  const { data, error } = await mos().from('meetings').update(row).eq('id', id).select('id')
  if (error) throw new Error(`updateMeetingFields failed — ${error.message}`)
  if (((data ?? []) as unknown[]).length === 0) throw new Error('updateMeetingFields failed — meeting not editable')
}

function minutesByteLength(blocks: unknown[]): number {
  return new TextEncoder().encode(JSON.stringify(blocks)).length
}

/** Read the minutes and the `updated_at` they were read at. Null when the Meeting is not visible. */
export async function readMinutes(meetingId: string): Promise<MeetingMinutesRead | null> {
  const { data, error } = await mos().from('meetings').select('minutes,updated_at').eq('id', meetingId).maybeSingle()
  if (error) throw new Error(`readMinutes failed — ${error.message}`)
  if (!data) return null
  const row = data as { minutes: unknown; updated_at: string }
  return { minutes: Array.isArray(row.minutes) ? row.minutes : null, updatedAt: row.updated_at }
}

/**
 * Conditional save: replaces the minutes only when `updated_at` still equals `expectedUpdatedAt`.
 * Returns the new `updated_at`. Zero matched rows throws WriteUpConflictError (changed elsewhere,
 * or not editable by the caller); over the byte limit throws WriteUpTooLargeError before any request.
 */
export async function saveMinutes(meetingId: string, blocks: unknown[], expectedUpdatedAt: string): Promise<string> {
  if (minutesByteLength(blocks) > MINUTES_MAX_BYTES) throw new WriteUpTooLargeError()
  const { data, error } = await mos()
    .from('meetings')
    .update({ minutes: blocks })
    .eq('id', meetingId)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
  if (error) throw new Error(`saveMinutes failed — ${error.message}`)
  const rows = (data ?? []) as Array<{ updated_at: string }>
  if (rows.length === 0) throw new WriteUpConflictError()
  return rows[0].updated_at
}

/** Add an attendee, or bring back one who was removed. Needs edit rights on the Meeting. */
export async function addAttendee(meetingId: string, personId: string): Promise<void> {
  const { error } = await mos()
    .from('meeting_attendees')
    .upsert({ meeting_id: meetingId, person_id: personId, removed_at: null }, { onConflict: 'meeting_id,person_id' })
  if (error) throw new Error(`addAttendee failed — ${error.message}`)
}

/** Remove an attendee (soft: the row keeps removed_at). Needs edit rights on the Meeting. */
export async function removeAttendee(meetingId: string, personId: string): Promise<void> {
  const { error } = await mos()
    .from('meeting_attendees')
    .update({ removed_at: new Date().toISOString() })
    .eq('meeting_id', meetingId)
    .eq('person_id', personId)
  if (error) throw new Error(`removeAttendee failed — ${error.message}`)
}

/** Start next meeting: returns the new Meeting's id (date unset, minutes empty). */
export async function startNextMeeting(meetingId: string): Promise<string> {
  const { data, error } = await mos().rpc('start_next_meeting', { p_meeting_id: meetingId })
  if (error) throw new Error(`startNextMeeting failed — ${error.message}`)
  return data as string
}

type MeetingTaskDbRow = {
  id: string
  title: string
  responsible_person_id: string
  accountable_person_id: string
  due_date: string | null
  status: string
  meeting_id: string
}

function toMeetingTask(r: MeetingTaskDbRow): MeetingTaskRow {
  return {
    id: r.id,
    title: r.title,
    responsibleId: r.responsible_person_id,
    supervisorId: r.accountable_person_id,
    dueDate: r.due_date,
    status: r.status,
    meetingId: r.meeting_id,
  }
}

/** Create a real Task in a Meeting (a Task in a Private Meeting is private). Returns the Task id. */
export async function createMeetingTask(input: CreateMeetingTaskInput): Promise<string> {
  const { data, error } = await mos().rpc('create_meeting_task', {
    p_meeting_id: input.meetingId,
    p_title: input.title,
    p_pic_id: input.picId ?? null,
    p_due_date: input.dueDate ?? null,
    p_team_id: input.teamId ?? null,
    p_supervisor_id: input.supervisorId ?? null,
  })
  if (error) throw new Error(`createMeetingTask failed — ${error.message}`)
  return data as string
}

/** Still open from last time: the previous Meeting's Tasks that are not Done, as far as the caller can read them. */
export async function listStillOpen(meetingId: string): Promise<MeetingTaskRow[]> {
  const { data, error } = await mos().rpc('meeting_still_open', { p_meeting_id: meetingId })
  if (error) throw new Error(`listStillOpen failed — ${error.message}`)
  return ((data ?? []) as MeetingTaskDbRow[]).map(toMeetingTask)
}

/** Tasks created in this Meeting that the caller can read. */
export async function listMeetingTasks(meetingId: string): Promise<MeetingTaskRow[]> {
  const { data, error } = await mos().rpc('meeting_tasks', { p_meeting_id: meetingId })
  if (error) throw new Error(`listMeetingTasks failed — ${error.message}`)
  return ((data ?? []) as MeetingTaskDbRow[]).map(toMeetingTask)
}

/** The short Meetings section on a Project/Process or an Objective: newest first, readable ones only. */
export async function listMeetingsForRecord(
  record: { workLineId: string } | { objectiveId: string },
  limit = 5,
): Promise<MeetingLinkRow[]> {
  const [column, value] = 'workLineId' in record ? ['work_line_id', record.workLineId] : ['objective_id', record.objectiveId]
  const { data, error } = await mos()
    .from('meetings')
    .select('id,title,starts_at,is_private')
    .eq(column, value)
    .is('archived_at', null)
    .order('starts_at', { ascending: false, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error(`listMeetingsForRecord failed — ${error.message}`)
  return ((data ?? []) as Array<{ id: string; title: string; starts_at: string | null; is_private: boolean }>)
    .map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at, isPrivate: r.is_private }))
}

/**
 * Titles for `[[` record links and "Created in meeting". A Meeting the caller cannot read is absent
 * from the result, which the UI shows as a restricted record with no title.
 */
export async function getMeetingTitlesByIds(ids: string[]): Promise<Array<{ id: string; title: string }>> {
  if (ids.length === 0) return []
  const { data, error } = await mos().from('meetings').select('id,title').in('id', ids)
  if (error) throw new Error(`getMeetingTitlesByIds failed — ${error.message}`)
  return (data ?? []) as Array<{ id: string; title: string }>
}

/** Meeting search for the `[[` menu and the command palette (empty = the newest). RLS decides what the caller can see. */
export async function searchMeetingsByTitle(q: string, limit = 20): Promise<Array<{ id: string; title: string; startsAt: string | null }>> {
  const term = q.trim()
  let query = mos().from('meetings').select('id,title,starts_at').is('archived_at', null)
  if (term) query = query.ilike('title', containsPattern(term))
  const { data, error } = await query
    .order('starts_at', { ascending: false, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error(`searchMeetingsByTitle failed — ${error.message}`)
  return ((data ?? []) as Array<{ id: string; title: string; starts_at: string | null }>)
    .map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at }))
}
