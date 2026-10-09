import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import type { PageFamilyState } from '@/shell/page-families'
import { useDocumentTitle } from '@/shell/use-document-title'
import { CafeStreamBar } from './cafe-stream-bar'
import type { CafeStreamBarProps } from './cafe-stream-bar'
import './cafe-page-frame.css'

export type CafePageId =
  | 'production'
  | 'transfer'
  | 'waste'
  | 'count'
  | 'receive'
  | 'receiptReview'
  | 'receiptIssues'
  | 'request'
  | 'requestReview'
  | 'plan'
  | 'stock'
  | 'items'
  | 'review'
  | 'pushes'

const PAGE_TITLE_KEYS: Record<CafePageId, MessageKey> = {
  production: 'cafe.pageTitle.production',
  transfer: 'cafe.pageTitle.transfer',
  waste: 'cafe.pageTitle.waste',
  count: 'cafe.pageTitle.count',
  receive: 'cafe.pageTitle.receive',
  receiptReview: 'cafe.pageTitle.receiptReview',
  receiptIssues: 'cafe.pageTitle.receiptIssues',
  request: 'cafe.pageTitle.request',
  requestReview: 'cafe.pageTitle.requestReview',
  plan: 'cafe.pageTitle.plan',
  stock: 'cafe.pageTitle.stock',
  items: 'cafe.pageTitle.items',
  review: 'cafe.pageTitle.review',
  pushes: 'cafe.pageTitle.pushes',
}

export interface CafePageFrameProps {
  page: CafePageId
  /** ISO day for date-scoped pages. PageHead owns its short, localized presentation. */
  date?: string
  /** Optional non-date meta, e.g. an item count or push summary. */
  meta?: ReactNode
  /** The only stream line this page may render; dates belong in `date`, never in its context. */
  streamBar: CafeStreamBarProps
  state?: PageFamilyState
  children: ReactNode
}

/** The Café route's single title/date/stream composition, shared by every state and route. */
export function CafePageFrame({ page, date, meta, streamBar, state, children }: CafePageFrameProps) {
  const t = useT()
  const title = t(PAGE_TITLE_KEYS[page])
  useDocumentTitle(t('common.docTitle', { page: `${title} · ${t('nav.cafe')}` }))
  useSetBreadcrumbTitle(title)

  const dateMeta = date
    ? <time className="cafe-page-date tabular" dateTime={date}>{formatWeekdayDayMonth(date)}</time>
    : undefined
  const showStreamBar = streamBar.allStreams || streamBar.stream !== null || !streamBar.onChange

  return (
    <PageFamilyFrame
      family="workspace"
      title={title}
      statusRow={showStreamBar ? <CafeStreamBar {...streamBar} /> : undefined}
      meta={meta ?? dateMeta}
      state={state}
      headClassName="cafe-page-head"
    >
      {children}
    </PageFamilyFrame>
  )
}
