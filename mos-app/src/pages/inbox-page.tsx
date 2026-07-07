import { useNavigate } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useT } from '@/i18n/use-t'
import { useNotifications } from '@/hooks/useNotifications'
import { InboxList } from '@/components/inbox/InboxList'
import { notificationRoute, type NotificationRow } from '@/lib/db/notifications'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'

/**
 * InboxPage — the Inbox destination (ADR-0019 D2/D9). A to-triage list of the viewer's
 * notifications; opening a row marks it read and routes to the owning entity (the Inbox never holds
 * the content, it routes to it). Gated by SHOW_INBOX at the route layer.
 */
export function InboxPage() {
  const t = useT()
  const navigate = useNavigate()
  const { notifications, markRead, loading, error, refresh } = useNotifications()

  const onOpen = (row: NotificationRow) => {
    void markRead(row.id)
    const route = notificationRoute(row)
    if (route) navigate(route)
  }

  return (
    <PageFrame>
      <PageHead title={t('inbox.title')} subtitle={t('inbox.subtitle')} />
      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true">
          <SkeletonRows count={4} />
        </div>
      ) : error ? (
        <ErrorState
          message="Couldn't load inbox. Try again."
          onRetry={() => { void refresh() }}
        />
      ) : notifications.length === 0 ? (
        <EmptyState title={t('inbox.empty')} />
      ) : (
        <InboxList notifications={notifications} onOpen={onOpen} />
      )}
    </PageFrame>
  )
}
