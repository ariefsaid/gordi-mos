import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { ALL_STREAMS } from '@/components/kitchen/cafe-stream-bar'
import { CafeReceiptReviewQueue } from '@/components/kitchen/cafe-receipt-review-queue'
import { streamKey } from '@/lib/kitchen-action-label'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import './cafe-count-page.css'

/** Receipt review is cross-stream like Café review: it opens on All streams and claims no location. */
export function CafeReceiptReviewPage() {
  const auth = useAuth()
  const { options, resolve, adopt } = useCafeStream()
  const [streamFilter, setStreamFilter] = useState(ALL_STREAMS)

  useEffect(() => {
    let active = true
    void resolve().then(catalog => { if (active) adopt(catalog) }).catch(() => undefined)
    return () => { active = false }
  }, [adopt, resolve])

  const selected = options.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null
  return (
    <CafePageFrame
      page="receiptReview"
      streamBar={{
        options,
        stream: selected,
        allStreams: streamFilter === ALL_STREAMS,
        onChange: next => setStreamFilter(streamKey(next.branch.id, next.activity)),
        onAllStreams: () => setStreamFilter(ALL_STREAMS),
      }}
    >
      <div className="cafe-count">
        <CafeReceiptReviewQueue
          streamFilter={streamFilter}
          streamCatalog={options}
          viewerId={auth.status === 'authenticated' ? auth.viewer.person.id : null}
        />
      </div>
    </CafePageFrame>
  )
}
