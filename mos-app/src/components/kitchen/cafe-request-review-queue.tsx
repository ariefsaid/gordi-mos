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
}

/** Submitted purchase requests the server lets this viewer review (RLS scopes the read; the RPC decides). */
export function CafeRequestReviewQueue(props: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  viewerId: string | null
}) {
  const t = useT()
  const load = useCallback(() => listCafePurchaseRequests(['Submitted']), [])
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
        request.note ? <span key="note">{t('cafe.request.review.note', { note: request.note })}</span> : null,
      ]}
      lines={request => request.lines.map(line => ({ id: line.id, name: line.item_name, quantity: line.quantity, unit: line.unit_name }))}
      state={request => <CafeRequestState request={request} />}
    />
  )
}
