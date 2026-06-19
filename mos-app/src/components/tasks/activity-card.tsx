import type { TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { formatAge, initials } from './task-formatters'

// ── Activity event label helper ──────────────────────────────────────────────
function eventLabel(ev: TaskEventRow): string {
  switch (ev.event_type) {
    case 'created':        return 'Created'
    case 'status_changed': return `Status changed${ev.from_value && ev.to_value ? ` · ${ev.from_value} → ${ev.to_value}` : ''}`
    case 'field_edited':   return 'Field edited'
    case 'raci_edited':    return 'RACI updated'
    case 'archived':       return 'Archived'
    case 'unarchived':     return 'Unarchived'
    default:               return ev.event_type
  }
}

// ── Activity card ────────────────────────────────────────────────────────────
export type ActivityCardProps = {
  events: TaskEventRow[]
  people: PersonOption[]
  now: Date
}

export function ActivityCard({ events, people, now }: ActivityCardProps) {
  function personName(id: string) {
    return people.find(p => p.id === id)?.full_name ?? 'Someone'
  }

  return (
    <section className="card" aria-label="Activity & updates" role="region">
      <h2 className="card-h2">Activity &amp; updates</h2>
      {events.length === 0 && <p className="empty-substate">No activity yet.</p>}
      <div className="thread">
        {events.map(ev => (
          <div key={ev.id} className="event-entry" data-testid="event-entry">
            <span className="event-av" aria-hidden="true">{initials(personName(ev.actor_person_id))}</span>
            <div className="event-body">
              <span className="event-who">{personName(ev.actor_person_id)}</span>
              <span className="event-when tabular-nums">{formatAge(ev.created_at, now)}</span>
              <div className="event-label">{eventLabel(ev)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
