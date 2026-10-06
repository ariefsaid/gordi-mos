import { useT } from '@/i18n/use-t'
import type { CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { formatWeekdayDayMonth, formatWibShortDateTime } from '@/lib/format/date'
import { CafeRequestState } from './cafe-request-state'

const NAMED_ITEMS = 2

/**
 * The requester's own recent requests, folded under one summary line at the top of Request so it is
 * reachable without scrolling the item list. Each row names its first items, when it was sent and
 * its state; a rejected request carries the reviewer's reason.
 */
export function CafeRequestHistory({
  requests,
  failed,
  onRetry,
}: {
  requests: readonly CafePurchaseRequest[]
  failed: boolean
  onRetry: () => void
}) {
  const t = useT()
  if (failed) {
    return (
      <p className="cafe-request__history-error" role="status">
        <span>{t('cafe.request.recent.loadFailed')}</span>
        <button type="button" className="btn btn-outline" onClick={onRetry}>{t('common.retry')}</button>
      </p>
    )
  }
  if (requests.length === 0) return null
  return (
    <details className="cafe-request__history">
      <summary>{t('cafe.request.recent.summary', { count: requests.length })}</summary>
      <ul aria-label={t('cafe.request.recent.title')}>
        {requests.map(request => {
          const names = request.lines.slice(0, NAMED_ITEMS).map(line => line.item_name).join(', ')
          const more = request.lines.length - NAMED_ITEMS
          return (
            <li key={request.id}>
              <div className="cafe-request__history-items">
                {names}
                {more > 0 && <span className="cafe-request__history-more"> {t('cafe.request.recent.more', { count: more })}</span>}
              </div>
              <div className="cafe-request__history-meta">
                <span className="tabular">{t('cafe.request.recent.neededBy', { date: formatWeekdayDayMonth(request.required_by) })}</span>
                <span className="tabular">{t('cafe.request.recent.sentAt', { date: formatWibShortDateTime(request.requested_at) })}</span>
              </div>
              <CafeRequestState request={request} />
              {request.status === 'Rejected' && request.review_note && (
                <p className="cafe-request__history-reason">{t('cafe.request.recent.reason', { note: request.review_note })}</p>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
