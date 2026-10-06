import { CafeRequestReviewQueue } from '@/components/kitchen/cafe-request-review-queue'
import { CafeStreamReviewFrame } from '@/components/kitchen/cafe-stream-review-frame'
import { useT } from '@/i18n/use-t'

export function CafeRequestReviewPage() {
  const t = useT()
  return (
    <CafeStreamReviewFrame title={t('cafe.request.review.title')}>
      {scope => <CafeRequestReviewQueue {...scope} />}
    </CafeStreamReviewFrame>
  )
}
