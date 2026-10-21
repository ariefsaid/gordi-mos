import { useT } from '@/i18n/use-t'
import type { CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import './cafe-receipt.css'

const APPROVED_TEXT = {
  not_posted: 'cafe.request.state.approvedNotPosted',
  queued: 'cafe.request.state.approvedQueued',
  posted: 'cafe.request.state.approvedPosted',
  failed: 'cafe.request.state.approvedFailed',
} as const

// Approval and posting are separate: missing posting data is unknown, not proof of no posting.
export function CafeRequestState({ request }: { request: Pick<CafePurchaseRequest, 'status' | 'posting'> }) {
  const t = useT()
  const text = request.status === 'Submitted' ? t('cafe.request.state.submitted')
    : request.status === 'Rejected' ? t('cafe.request.state.rejected')
    : request.posting ? t(APPROVED_TEXT[request.posting.state]) : t('cafe.request.state.approvedUnknown')
  const number = request.status === 'Approved' && request.posting?.state === 'posted' ? request.posting.esb_number : null
  return <span className="cafe-receipt-state" data-status={request.status}>{text}{number && ` (${number})`}</span>
}
