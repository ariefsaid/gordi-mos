import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { ALL_STREAMS, CafeStreamBar } from '@/components/kitchen/cafe-stream-bar'
import { CafeReceiptReviewQueue } from '@/components/kitchen/cafe-receipt-review-queue'
import { useT } from '@/i18n/use-t'
import { streamKey } from '@/lib/kitchen-action-label'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import '@/components/kitchen/cafe-capture-layout.css'

/** Receipt review is cross-stream like Café review: it opens on All streams and claims no location. */
export function CafeReceiptReviewPage() {
  const t = useT()
  const auth = useAuth()
  const { options, resolve, adopt } = useCafeStream()
  const [streamFilter, setStreamFilter] = useState(ALL_STREAMS)
  const title = t('cafe.receipts.review.title')
  useSetBreadcrumbTitle(title)
  useDocumentTitle(t('common.docTitle', { page: `${title} · ${t('nav.cafe')}` }))

  useEffect(() => {
    let active = true
    void resolve().then(catalog => { if (active) adopt(catalog) }).catch(() => undefined)
    return () => { active = false }
  }, [adopt, resolve])

  const selected = options.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null
  return (
    <PageFamilyFrame
      family="workspace"
      title={title}
      headClassName="cafe-count__head"
      statusRow={
        <CafeStreamBar
          options={options}
          stream={selected}
          allStreams={streamFilter === ALL_STREAMS}
          onChange={next => setStreamFilter(streamKey(next.branch.id, next.activity))}
          onAllStreams={() => setStreamFilter(ALL_STREAMS)}
        />
      }
    >
      <div className="cafe-capture-review-page">
        <CafeReceiptReviewQueue
          streamFilter={streamFilter}
          streamCatalog={options}
          viewerId={auth.status === 'authenticated' ? auth.viewer.person.id : null}
        />
      </div>
    </PageFamilyFrame>
  )
}
