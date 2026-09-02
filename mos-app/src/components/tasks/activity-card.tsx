import type { TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { formatAge, initials } from './task-formatters'
import { useT } from '@/i18n/use-t'
import type { Translate } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'

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
  const { locale } = useI18n()
  function personName(id: string) {
    return people.find(p => p.id === id)?.full_name ?? t('tasks.people.someone')
  }

  return (
    // Content-first anatomy (OD-REDESIGN-90): the Activity region landmark is now the labeled
    // content slot that wraps this card (`<section data-content-slot="activity" aria-label>`), so
    // this card is a plain container — NOT a second nested region (region-in-region) or a card
    // inside the record document (LAW-7). The heading stays sr-only (the slot already names it).
    <div className="card">
      <h2 className="sr-only">{t('tasks.activityTitle')}</h2>
      {events.length === 0 && <p className="empty-substate">{t('tasks.activityEmpty')}</p>}
      <div className="thread">
        {events.map(ev => (
          <div key={ev.id} className="event-entry" data-testid="event-entry">
            <span className="event-av" aria-hidden="true">{initials(personName(ev.actor_person_id))}</span>
            <div className="event-body">
              <span className="event-who">{personName(ev.actor_person_id)}</span>
              <span className="event-when tabular-nums">{formatAge(ev.created_at, now, locale)}</span>
              <div className="event-label">{eventLabel(ev, t)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
