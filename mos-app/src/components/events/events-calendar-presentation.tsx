import type { EventRow } from '@/lib/db/events.types'
import { wibMonthRange } from '@/lib/week'
import './events-calendar-presentation.css'

export interface EventCalendarProps { month: string; events: readonly EventRow[]; businessUnits?: ReadonlyMap<string, string>; people?: ReadonlyMap<string, string> }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const offset = 7 * 60 * 60 * 1000
const parts = (iso: string) => new Date(Date.parse(iso) + offset)
const dateKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
const displayDate = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const displayTime = (iso: string) => parts(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

function eventDays(event: EventRow): string[] {
  const start = parts(event.starts_at); const end = new Date(parts(event.ends_at).getTime() - 1)
  const result: string[] = []
  for (let value = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); value <= Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()); value += 86400000) result.push(dateKey(new Date(value)))
  return result
}
function EventItem({ event, businessUnits, people }: { event: EventRow } & Pick<EventCalendarProps, 'businessUnits' | 'people'>) {
  const relation = [event.business_unit_id && businessUnits?.get(event.business_unit_id), event.coordinator_person_id && people?.get(event.coordinator_person_id)].filter(Boolean).join(' · ')
  return <article className="event-item"><strong>{event.title}</strong><span><time dateTime={event.starts_at}>{displayTime(event.starts_at)}</time>–<time dateTime={event.ends_at}>{displayTime(event.ends_at)}</time></span><span>{event.is_outbound ? 'Outbound' : `At ${event.venue}`}</span>{relation && <span>{relation}</span>}</article>
}
export function EventsCalendarPresentation({ month, events, businessUnits, people }: EventCalendarProps) {
  const range = wibMonthRange(month)
  if (!range) return null
  const first = parts(range.startISO); const firstDay = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - firstDay))
  const eventByDay = new Map<string, EventRow[]>()
  for (const event of events) for (const day of eventDays(event)) { const rows = eventByDay.get(day) ?? []; rows.push(event); eventByDay.set(day, rows) }
  for (const rows of eventByDay.values()) rows.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.title.localeCompare(b.title))
  const gridDays = Array.from({ length: 42 }, (_, index) => new Date(days.getTime() + index * 86400000))
  const agendaDays = gridDays.filter((day) => day.getUTCMonth() === first.getUTCMonth() && eventByDay.has(dateKey(day)))
  return <><section className="events-calendar" aria-label="Events calendar"><div className="events-calendar__weekdays">{DAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="events-calendar__grid">{gridDays.map((day) => { const key = dateKey(day); return <div key={key} className={day.getUTCMonth() === first.getUTCMonth() ? 'events-calendar__day' : 'events-calendar__day events-calendar__day--outside'}><time dateTime={key}>{day.getUTCDate()}</time>{(eventByDay.get(key) ?? []).map((event) => <EventItem key={event.id} event={event} businessUnits={businessUnits} people={people} />)}</div> })}</div></section><section className="events-agenda" aria-label="Events agenda">{agendaDays.map((day) => { const key = dateKey(day); return <div className="events-agenda__group" key={key}><h2><time dateTime={key}>{displayDate(day)}</time></h2>{eventByDay.get(key)?.map((event) => <EventItem key={event.id} event={event} businessUnits={businessUnits} people={people} />)}</div> })}</section></>
}
