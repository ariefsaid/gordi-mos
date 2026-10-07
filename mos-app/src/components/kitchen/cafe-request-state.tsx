import { useT } from '@/i18n/use-t'
import type { CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import './cafe-receipt.css'

/** A request's state as text, never colour alone; an Approved request says it is not posted. */
export function CafeRequestState({ request }: { request: Pick<CafePurchaseRequest, 'status'> }) {
  const t = useT()
  const text = request.status === 'Submitted' ? t('cafe.request.state.submitted')
    : request.status === 'Rejected' ? t('cafe.request.state.rejected')
    : t('cafe.request.state.approvedNotPosted')
  return <span className="cafe-receipt-state" data-status={request.status}>{text}</span>
}
