import { useCallback } from 'react'
import { useT } from '@/i18n/use-t'
import {
  listCafePurchaseRequests,
  reviewCafePurchaseRequest,
  type CafePurchaseRequest,
} from '@/lib/db/cafe-purchase-requests'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { CafeDecisionQueue, type CafeDecisionCopy } from './cafe-decision-queue'
import { CafeRequestState } from './cafe-request-state'

const COPY: CafeDecisionCopy = {
  help: 'cafe.request.review.help',
  actionFailed: 'cafe.request.review.actionFailed',
  offline: 'cafe.request.offline',
  queueTitle: 'cafe.request.review.queueTitle',
  emptyTitle: 'cafe.request.review.empty.title',
  emptyCopy: 'cafe.request.review.empty.copy',
  linesAria: 'cafe.request.sent.linesAria',
  rejectNote: 'cafe.request.review.rejectNote',
  confirmReject: 'cafe.request.review.confirmReject',
  ownRecord: 'cafe.request.review.ownRequest',
  withdraw: 'cafe.request.review.withdraw',
  withdrawNote: 'cafe.request.review.withdrawNote',
  confirmWithdraw: 'cafe.request.review.confirmWithdraw',
}

/** Earliest needed-by first, then oldest sent: the request due soonest is decided first. */
function byNeededBy(a: CafePurchaseRequest, b: CafePurchaseRequest): number {
  return a.required_by.localeCompare(b.required_by) || a.requested_at.localeCompare(b.requested_at)
}

/** Submitted purchase requests the server lets this viewer review (RLS scopes the read; the RPC decides). */
export function CafeRequestReviewQueue(props: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  viewerId: string | null
}) {
  const t = useT()
  const load = useCallback(() => listCafePurchaseRequests(['Submitted']).then(rows => [...rows].sort(byNeededBy)), [])
  return (
    <CafeDecisionQueue<CafePurchaseRequest>
      {...props}
      copy={COPY}
      load={load}
      decide={(request, decision, note) => reviewCafePurchaseRequest(request.id, decision, request.row_version, note)}
      ownerOf={request => request.requested_by}
      title={(_, person) => t('cafe.request.review.requestedBy', { person })}
      meta={request => [
        <span key="needed">{t('cafe.request.review.neededBy', { date: formatWeekdayDayMonth(request.required_by) })}</span>,
      ]}
      detail={request => request.note
        ? <p className="cafe-decision-queue__detail">{t('cafe.request.review.note', { note: request.note })}</p>
        : null}
      lines={request => request.lines.map(line => ({ id: line.id, name: line.item_name, quantity: line.quantity, unit: line.unit_name }))}
      state={request => request.status === 'Rejected'
        ? <span className="cafe-receipt-state">{t('cafe.request.review.rejected')}</span>
        : <CafeRequestState request={request} />}
    />
  )
}
