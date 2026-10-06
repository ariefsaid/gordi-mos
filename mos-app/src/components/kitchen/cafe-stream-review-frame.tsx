import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { streamKey } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { ALL_STREAMS, CafeStreamBar } from './cafe-stream-bar'
import '@/pages/cafe-count-page.css'

/** A cross-stream Café review page: opens on All streams, claims no location, filters its queue by stream. */
export function CafeStreamReviewFrame({
  title,
  children,
}: {
  title: string
  children: (scope: { streamFilter: string; streamCatalog: readonly ProductionStream[]; viewerId: string | null }) => ReactNode
}) {
  const t = useT()
  const auth = useAuth()
  const { options, resolve, adopt } = useCafeStream()
  const [streamFilter, setStreamFilter] = useState(ALL_STREAMS)
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
      <div className="cafe-count">
        {children({
          streamFilter,
          streamCatalog: options,
          viewerId: auth.status === 'authenticated' ? auth.viewer.person.id : null,
        })}
      </div>
    </PageFamilyFrame>
  )
}
