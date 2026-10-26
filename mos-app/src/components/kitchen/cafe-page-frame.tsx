import { useContext, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRightIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import type { PageFamilyState } from '@/shell/page-families'
import { useDocumentTitle } from '@/shell/use-document-title'
import { CafeReviewEmbedContext } from './cafe-review-embed'
import { CafeStreamBar } from './cafe-stream-bar'
import type { CafeStreamBarProps } from './cafe-stream-bar'
import './cafe-page-frame.css'

type CafePageId =
  | 'today'
  | 'production'
  | 'transfer'
  | 'waste'
  | 'count'
  | 'stockComparison'
  | 'receive'
  | 'receiptReview'
  | 'receiptIssues'
  | 'request'
  | 'requestReview'
  | 'plan'
  | 'stock'
  | 'items'
  | 'recipes'
  | 'transferRoutes'
  | 'locations'
  | 'moveStock'
  | 'review'
  | 'pushes'
  | 'records'

const PAGE_TITLE_KEYS: Record<CafePageId, MessageKey> = {
  today: 'cafe.pageTitle.today',
  production: 'cafe.pageTitle.production',
  transfer: 'cafe.pageTitle.transfer',
  waste: 'cafe.pageTitle.waste',
  count: 'cafe.pageTitle.count',
  stockComparison: 'cafe.pageTitle.stockComparison',
  receive: 'cafe.pageTitle.receive',
  receiptReview: 'cafe.pageTitle.receiptReview',
  receiptIssues: 'cafe.pageTitle.receiptIssues',
  request: 'cafe.pageTitle.request',
  requestReview: 'cafe.pageTitle.requestReview',
  plan: 'cafe.pageTitle.plan',
  stock: 'cafe.pageTitle.stock',
  items: 'cafe.pageTitle.items',
  recipes: 'cafe.pageTitle.recipes',
  transferRoutes: 'cafe.pageTitle.transferRoutes',
  locations: 'cafe.pageTitle.locations',
  moveStock: 'cafe.pageTitle.moveStock',
  review: 'cafe.pageTitle.review',
  pushes: 'cafe.pageTitle.pushes',
  records: 'cafe.pageTitle.records',
}

export interface CafePageFrameProps {
  page: CafePageId
  /** ISO day for date-scoped pages. PageHead owns its short, localized presentation. */
  date?: string
  /** Optional non-date meta, e.g. an item count or push summary. */
  meta?: ReactNode
  /** One sentence under the title saying what the page shows (and what it is not); wraps at a readable measure. */
  description?: string
  /** Readable stream/date context directly beneath the Café page title. */
  contextLine?: string
  /** The only stream line this page may render; dates belong in `date`, never in its context. */
  streamBar?: CafeStreamBarProps
  /** Where "View records" goes: the Records page already scoped to this job, stream and day. Shown beside the scope line where space allows. */
  recordsHref?: string
  /** Preview only: "View stock comparison", beside "View records". Callers pass it only for viewers the comparison admits, with the preview on; absent = the page is unchanged. */
  comparisonHref?: string
  state?: PageFamilyState
  /** The page's one primary action when it is not a capture form: top-right of the title row on desktop. */
  primaryAction?: ReactNode
  /** Why `primaryAction` is disabled; sits beside it on desktop and in the bottom bar on a phone. */
  primaryActionReason?: ReactNode
  children: ReactNode
}

/** The Café route's single title/date/stream composition, shared by every state and route. */
export function CafePageFrame({ page, date, meta, description, contextLine, streamBar, recordsHref, comparisonHref, state, primaryAction, primaryActionReason, children }: CafePageFrameProps) {
  const t = useT()
  // Change location has two doors; its way back is the page the viewer came from (Locations unless they came from Available to transfer).
  const cameFromStock = (useLocation().state as { changeLocationFrom?: string } | null)?.changeLocationFrom === 'stock'
  // Inside Review a queue is not a page: the host frame owns the title, document title and way back,
  // and the queue keeps only its own scope line and content.
  const embedded = useContext(CafeReviewEmbedContext)
  const title = t(PAGE_TITLE_KEYS[page])
  useDocumentTitle(embedded ? null : t('common.docTitle', { page: `${title} · ${t('nav.cafe')}` }))
  useSetBreadcrumbTitle(embedded ? null : title)

  const dateMeta = date
    ? <time className="cafe-page-date tabular" dateTime={date}>{formatWeekdayDayMonth(date)}</time>
    : undefined
  const showStreamBar = streamBar && (streamBar.allStreams || streamBar.stream !== null || !streamBar.onChange)
  const recordsLink = recordsHref ? <Link className="cafe-page-records-link" to={recordsHref}>{t('records.viewRecords')}<ArrowRightIcon /></Link> : null
  const comparisonLink = comparisonHref ? <Link className="cafe-page-records-link" to={comparisonHref}>{t('cafe.cmp.view')}<ArrowRightIcon /></Link> : null
  const contextRow = !showStreamBar && !recordsHref && !comparisonHref && !description ? undefined : (
    <div className="cafe-page-context">
      {description && <p className="cafe-page-description">{description}</p>}
      <div className="cafe-page-scope">
        {showStreamBar && streamBar && <CafeStreamBar {...streamBar} />}
        {comparisonLink ? <div className="cafe-page-links">{recordsLink}{comparisonLink}</div> : recordsLink}
      </div>
    </div>
  )
  if (embedded) {
    return (
      <div className="cafe-review-queue" data-queue-state={state}>
        {contextRow}
        {children}
      </div>
    )
  }

  // NV2: every Café page but Today returns to its parent in the one back-link slot; receipt issues,
  // receipt review and request review are their own pages and return to Receive / Request.
  const back = page === 'today' ? undefined : page === 'receiptIssues' || page === 'receiptReview'
    ? { to: '/cafe/receive', label: t('record.backToCollection', { collection: t('cafe.pageTitle.receive') }) }
    : page === 'requestReview'
      ? { to: '/cafe/request', label: t('record.backToCollection', { collection: t('cafe.pageTitle.request') }) }
      : page === 'moveStock'
        ? cameFromStock
          ? { to: '/cafe/stock', label: t('record.backToCollection', { collection: t('cafe.pageTitle.stock') }) }
          : { to: '/cafe/locations', label: t('record.backToCollection', { collection: t('cafe.pageTitle.locations') }) }
        : { to: '/cafe', label: t('cafe.backToCafe') }

  return (
    <PageFamilyFrame
      family="workspace"
      title={title}
      action={primaryAction}
      actionReason={primaryActionReason}
      back={back}
      statusRow={contextRow}
      meta={meta ?? dateMeta}
      subtitle={contextLine}
      state={state}
      headClassName="cafe-page-head"
    >
      {children}
    </PageFamilyFrame>
  )
}
