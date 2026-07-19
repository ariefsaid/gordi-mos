import type { NotificationRow } from '@/lib/db/notifications'
import { notificationRoute } from '@/lib/db/notifications'
import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'
import './inbox.css'

export interface InboxListProps {
  notifications: NotificationRow[]
  /** Open a notification: mark it read + navigate to its deep-link (if any). */
  onOpen: (row: NotificationRow) => void
}

const SEVERITY_KEY = {
  info: 'inbox.severity.info',
  warning: 'inbox.severity.warning',
  critical: 'inbox.severity.critical',
} as const

/**
 * InboxList — the to-triage list (ADR-0019 D9). Unread rows carry an accent marker; a row is a
 * button (keyboard/AT reachable) that opens the notification. Deep-link is the row's action, not a
 * nested link, so the whole row is one target. Presentational — state lives in useNotifications.
 */
export function InboxList({ notifications, onOpen }: InboxListProps) {
  const t = useT()

  if (notifications.length === 0) {
    // Cohesion-debt 2026-07-19, item #2: the Inbox all-clear routes through THE kit
    // EmptyState (quiet = the earned ✓ all-clear) — one empty-state grammar, no
    // bespoke `.inbox-empty`.
    return <EmptyState variant="quiet" title={t('inbox.empty')} copy={t('inbox.emptyCopy')} />
  }

  return (
    <ul className="inbox-list" aria-label={t('inbox.title')}>
      {notifications.map((n) => {
        const unread = n.read_at == null
        const hasLink = notificationRoute(n) != null
        return (
          <li key={n.id} className={`inbox-row${unread ? ' inbox-row--unread' : ''}`}>
            <button
              type="button"
              className="inbox-row__button"
              onClick={() => onOpen(n)}
              aria-label={`${n.title}${unread ? ' (unread)' : ''}`}
            >
              <span
                className={`inbox-row__dot inbox-row__dot--${n.severity}`}
                aria-label={t(SEVERITY_KEY[n.severity])}
              />
              <span className="inbox-row__content">
                <span className="inbox-row__title">{n.title}</span>
                {n.body ? <span className="inbox-row__body">{n.body}</span> : null}
              </span>
              {hasLink ? <span className="inbox-row__chevron" aria-hidden="true">›</span> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
