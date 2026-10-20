import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { ALL_STREAMS } from '@/components/kitchen/cafe-stream-bar'
import { CafeReceiptReviewQueue } from '@/components/kitchen/cafe-receipt-review-queue'
import { streamKey } from '@/lib/kitchen-action-label'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { ErrorState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import '@/components/kitchen/cafe-capture-layout.css'

/** Receipt review is cross-stream like Café review: it opens on All streams and claims no location. */
export function CafeReceiptReviewPage() {
  const auth = useAuth()
  const t = useT()
  const { options, resolve, adopt } = useCafeStream()
  const [streamFilter, setStreamFilter] = useState(ALL_STREAMS)
  const [retryKey, setRetryKey] = useState(0)
  const [catalogError, setCatalogError] = useState(false)

  useEffect(() => {
    let active = true
    setCatalogError(false)
    void resolve().then(catalog => { if (active) adopt(catalog) }).catch(() => { if (active) setCatalogError(true) })
    return () => { active = false }
  }, [adopt, resolve, retryKey])

  const selected = options.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null
  return (
    <CafePageFrame
      page="receiptReview"
      state={catalogError ? 'error' : undefined}
      streamBar={{
        options,
        stream: selected,
        allStreams: streamFilter === ALL_STREAMS,
        onChange: next => setStreamFilter(streamKey(next.branch.id, next.activity)),
        onAllStreams: () => setStreamFilter(ALL_STREAMS),
      }}
    >
      <div className="cafe-capture-review-page">
        {catalogError ? (
          <ErrorState
            message={t('records.error.catalog')}
            onRetry={() => setRetryKey(key => key + 1)}
            retryLabel={t('common.retry')}
          />
        ) : (
          <CafeReceiptReviewQueue
            streamFilter={streamFilter}
            streamCatalog={options}
            viewerId={auth.status === 'authenticated' ? auth.viewer.person.id : null}
          />
        )}
      </div>
    </CafePageFrame>
  )
}
