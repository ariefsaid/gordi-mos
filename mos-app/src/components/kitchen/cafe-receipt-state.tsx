import { useT } from '@/i18n/use-t'
import type { CafeReceipt } from '@/lib/db/cafe-receipts'
import './cafe-receipt.css'

/** A receipt's state as text, never colour alone; an Approved receipt says it is not posted. */
export function CafeReceiptState({ receipt }: { receipt: Pick<CafeReceipt, 'status' | 'posting_status'> }) {
  const t = useT()
  const text = receipt.status === 'Counted' ? t('cafe.receipts.state.counted')
    : receipt.status === 'Submitted' ? t('cafe.receipts.state.submitted')
    : receipt.status === 'Rejected' ? t('cafe.receipts.state.rejected')
    : receipt.posting_status === 'held' ? t('cafe.receipts.state.approvedHeld')
    : t('cafe.receipts.state.approvedNotPosted')
  return <span className="cafe-receipt-state" data-status={receipt.status}>{text}</span>
}
