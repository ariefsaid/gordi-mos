import { CafeReceiptIssuesQueue } from '@/components/kitchen/cafe-receipt-issues-queue'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import '@/components/kitchen/cafe-capture-layout.css'

/** Procurement's org-wide Receipt issues list; receivers get only their own issues, read-only, through RLS. */
export function CafeReceiptIssuesPage() {
  return (
    <CafePageFrame page="receiptIssues" streamBar={{ options: [], stream: null, allStreams: true }}>
      <div className="cafe-capture-review-page">
        <CafeReceiptIssuesQueue />
      </div>
    </CafePageFrame>
  )
}
