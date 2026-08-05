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
  const count = loading || error ? null : notifications.length

  const onOpen = (row: NotificationRow) => {
    void markRead(row.id)
    const route = notificationRoute(row)
    if (route) navigate(route)
  }

  return (
    <PageFrame variant="data">
      {/* No title glyph: the shared PageHead dropped its `icon` slot in the v4 chrome (#188).
          Inconsistent per-surface title icons were the "several apps" tell — the breadcrumb and
          the context row already name the surface. Consistent = none. */}
      <PageHead
        variant="content"
        title={t('inbox.title')}
        count={count}
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
