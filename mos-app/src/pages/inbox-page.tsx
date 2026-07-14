import { useNavigate } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { InboxIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import { useNotifications } from '@/hooks/useNotifications'
import { InboxList } from '@/components/inbox/InboxList'
import { notificationRoute, type NotificationRow } from '@/lib/db/notifications'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'

/**
 * InboxPage — the Inbox destination (ADR-0019 D2/D9). A to-triage list of the viewer's
 * notifications; opening a row marks it read and routes to the owning entity (the Inbox never holds
 * the content, it routes to it). Inbox is always live (Step 2, D-1).
 */
export function InboxPage() {
  const t = useT()
  const navigate = useNavigate()
  const { notifications, markRead, loading, error, refresh } = useNotifications()
  const count = loading || error ? null : notifications.length

  const onOpen = (row: NotificationRow) => {
    void markRead(row.id)
    const route = notificationRoute(row)
    if (route) navigate(route)
  }

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title={t('inbox.title')}
        count={count}
        icon={<InboxIcon />}
      />
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
        <EmptyState
          variant="quiet"
          title={t('inbox.empty')}
          copy={t('inbox.emptyCopy')}
        />
      ) : (
        <InboxList notifications={notifications} onOpen={onOpen} />
      )}
    </PageFrame>
  )
}
