import { CafeRequestReviewQueue } from '@/components/kitchen/cafe-request-review-queue'
import { CafeStreamReviewFrame } from '@/components/kitchen/cafe-stream-review-frame'
import './cafe-request-review-page.css'

export function CafeRequestReviewPage() {
  return (
    <CafeStreamReviewFrame page="requestReview">
      {scope => <CafeRequestReviewQueue {...scope} />}
    </CafeStreamReviewFrame>
  )
}
