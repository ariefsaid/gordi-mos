// Pure helpers shared by the Meetings list, record page and linked-record sections.
import { dateLocaleTag } from '@/lib/format/date'
import type { Locale } from '@/i18n/messages'
import type { MeetingRow } from '@/lib/db/meetings.types'

const WIB_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** "Thu 22 Oct · 09:00" (WIB, the Asia/Jakarta wall clock); `withYear` adds the year for the record page. */
export function formatMeetingWhen(iso: string, locale: Locale, withYear = false): string {
  const date = new Date(iso)
  const tag = dateLocaleTag(locale)
  const day = new Intl.DateTimeFormat(tag, {
    timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' as const } : {}),
  }).format(date)
  const time = new Intl.DateTimeFormat(tag, { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
  return `${day} · ${time}`
}

/** The `datetime-local` input value ("YYYY-MM-DDTHH:mm") for an instant, on the WIB wall clock. */
export function toWibInput(iso: string): string {
  const parts = WIB_PARTS.formatToParts(new Date(iso))
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`
}

/** The instant (ISO) for a `datetime-local` value read as WIB; null when the text is not a date and time. */
export function fromWibInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+07:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Who may edit a Meeting; mirrors mos.can_edit_meeting (the database is the authority):
 * a live attendee, a live member of the owning Team, or an admin. Reading is already settled by RLS.
 */
export function canEditMeeting(input: {
  meeting: Pick<MeetingRow, 'owningTeamId'> & { attendeeIds: readonly string[] }
  viewerId: string | null
  viewerTeamIds: readonly string[]
  isAdmin: boolean
}): boolean {
  const { meeting, viewerId, viewerTeamIds, isAdmin } = input
  if (isAdmin) return true
  if (viewerId && meeting.attendeeIds.includes(viewerId)) return true
  return viewerTeamIds.includes(meeting.owningTeamId)
}

/** Who may switch a Meeting's Private setting; mirrors the database rule: a live attendee or an admin. */
export function canChangeMeetingPrivacy(input: { attendeeIds: readonly string[]; viewerId: string | null; isAdmin: boolean }): boolean {
  return input.isAdmin || (input.viewerId !== null && input.attendeeIds.includes(input.viewerId))
}

/** Two-letter mark for a person's name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase()
}
