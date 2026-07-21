import { useNavigate } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
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

  // Shell state seam (V3 Workspace family): the notifications load maps to the shared
  // PageFamilyState; the triage body keeps its own loading/empty/error grammar.
  const frameState = loading
    ? 'loading'
    : error
      ? 'error'
      : notifications.length === 0
        ? 'empty'
        : 'default'

  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence
    // (no surface-title glyph — the ✉ was the "several apps" tell).
    <PageFamilyFrame
      family="workspace"
      title={t('inbox.title')}
      jobSentence={t('job.inbox')}
      count={count}
      state={frameState}
    >
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
    </PageFamilyFrame>
  )
}
