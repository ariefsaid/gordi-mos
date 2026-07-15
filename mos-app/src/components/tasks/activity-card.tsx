import type { TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { formatAge, initials } from './task-formatters'
import { useT } from '@/i18n/use-t'
import type { Translate } from '@/i18n/use-t'

// ── Activity event label helper ──────────────────────────────────────────────
function eventLabel(ev: TaskEventRow, t: Translate): string {
  switch (ev.event_type) {
    case 'created':        return t('tasks.event.created')
    case 'status_changed': return `${t('tasks.event.statusChanged')}${ev.from_value && ev.to_value ? ` · ${ev.from_value} → ${ev.to_value}` : ''}`
    case 'field_edited':   return t('tasks.event.fieldEdited')
    case 'raci_edited':    return t('tasks.event.peopleUpdated')
    case 'archived':       return t('tasks.event.archived')
    case 'unarchived':     return t('tasks.event.unarchived')
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
  const t = useT()
  function personName(id: string) {
    return people.find(p => p.id === id)?.full_name ?? t('tasks.people.someone')
  }

  return (
    <section className="card" aria-label={t('tasks.activityTitle')} role="region">
      <h2 className="card-h2">{t('tasks.activityTitle')}</h2>
      {events.length === 0 && <p className="empty-substate">{t('tasks.activityEmpty')}</p>}
      <div className="thread">
        {events.map(ev => (
          <div key={ev.id} className="event-entry" data-testid="event-entry">
            <span className="event-av" aria-hidden="true">{initials(personName(ev.actor_person_id))}</span>
            <div className="event-body">
              <span className="event-who">{personName(ev.actor_person_id)}</span>
              <span className="event-when tabular-nums">{formatAge(ev.created_at, now)}</span>
              <div className="event-label">{eventLabel(ev, t)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
