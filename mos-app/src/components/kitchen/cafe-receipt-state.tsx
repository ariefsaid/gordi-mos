import { useT } from '@/i18n/use-t'
import type { CafeReceipt } from '@/lib/db/cafe-receipts'
import './cafe-receipt.css'

const APPROVED_TEXT = {
  not_posted: 'cafe.receipts.state.approvedNotPosted',
  held: 'cafe.receipts.state.approvedHeld',
  queued: 'cafe.receipts.state.approvedQueued',
  posted: 'cafe.receipts.state.approvedPosted',
  failed: 'cafe.receipts.state.approvedFailed',
} as const

/** A receipt's state as text, never colour alone: an Approved receipt says where its posting stands. */
export function CafeReceiptState({ receipt }: { receipt: Pick<CafeReceipt, 'status' | 'posting_status' | 'posting'> }) {
  const t = useT()
  const posting = receipt.posting
  const parts = receipt.status === 'Counted' ? [t('cafe.receipts.state.counted')]
    : receipt.status === 'Submitted' ? [t('cafe.receipts.state.submitted')]
    : receipt.status === 'Rejected' ? [t('cafe.receipts.state.rejected')]
    : [t(APPROVED_TEXT[posting?.state ?? receipt.posting_status])]
  if (receipt.status === 'Approved' && posting) {
    if (!posting.matched) parts.push(t('cafe.receipts.state.waitingForPoData'))
    if (posting.unmatched > 0) parts.push(t('cafe.receipts.state.unmatched', { count: posting.unmatched, open: posting.openIssues }))
  }
  return <span className="cafe-receipt-state" data-status={receipt.status}>{parts.join(' · ')}</span>
}
