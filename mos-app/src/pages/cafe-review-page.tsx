import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeReviewEmbedContext } from '@/components/kitchen/cafe-review-embed'
import { CafeReceiptIssuesLink } from '@/components/kitchen/cafe-receipt-issues-link'
import { ViewTabs } from '@/components/ui/view-tabs'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { lazyPage } from '@/lib/lazy-page'
import { defaultReviewQueue, isReviewQueueId, reviewQueueFromParams, reviewQueuesFor, type ReviewQueueId } from '@/lib/cafe-review-queues'
import { queueFigure, queueWaiting, useCafeWaiting } from '@/lib/use-cafe-waiting'
import { LoadingShell } from '@/components/ui/state-kit'
import './cafe-review-page.css'

// Each queue keeps its own page code and loads only when it is the one on screen.
const LogsCountsQueue = lazyPage(() => import('./kitchen-review-page').then((m) => ({ default: m.KitchenReviewPage })))
const ReceiptsQueue = lazyPage(() => import('./cafe-receipt-review-page').then((m) => ({ default: m.CafeReceiptReviewPage })))
const RequestsQueue = lazyPage(() => import('./cafe-request-review-page').then((m) => ({ default: m.CafeRequestReviewPage })))
const FailedSendsQueue = lazyPage(() => import('@/components/kitchen/cafe-failed-sends-queue').then((m) => ({ default: m.CafeFailedSendsQueue })))

const TAB_PREFIX = 'cafe-review-tab'
const PANEL_ID = 'cafe-review-panel'

/**
 * Café Review — ONE page for everything that waits on a decision. One row of tabs under the title — Logs, Counts,
 * Receipts, Requests, Failed ESB sends — each with how many wait (shared count read; "—" when unknown). Each queue is
 * the page that used to live at its own address and keeps its filters, bulk and row actions, notes and histories, and
 * shows only the scope controls it uses. The tab lives in the URL (`?queue=`), so a link, a refresh and Back all return
 * to it; with no tab in the address the page opens the first tab with something waiting (Logs when nothing is). Old
 * `?queue=logs-counts` / `&view=counts` links and the old Receipt review and Request review paths land on their tab.
 */
export function CafeReviewPage() {
  const t = useT()
  const auth = useAuth()
  const waiting = useCafeWaiting()
  const [params, setParams] = useSearchParams()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const queues = reviewQueuesFor(roles)
  const { id: requested, legacy } = reviewQueueFromParams(params.get('queue'), params.get('view'))
  const fromUrl: ReviewQueueId | null = queues.find((queue) => queue.id === requested)?.id ?? null

  // Old addresses are rewritten once to the one-key form, keeping the rest (date, open log).
  useEffect(() => {
    if (!legacy || !requested) return
    setParams((prev) => { const next = new URLSearchParams(prev); next.set('queue', requested); next.delete('view'); return next }, { replace: true })
  }, [legacy, requested, setParams])

  // No tab in the address: open the first tab with something waiting, decided once when every count has arrived,
  // so a figure that changes later never moves the viewer to another tab.
  const [opened, setOpened] = useState<ReviewQueueId | null>(null)
  const settled = queues.every((queue) => queue.waiting.every((key) => !waiting.keys.includes(key) || waiting.queues[key].status !== 'loading'))
  const pick = defaultReviewQueue(queues, (queue) => queueWaiting(queue, waiting))
  useEffect(() => { if (!fromUrl && opened === null && settled && queues.length > 0) setOpened(pick) }, [fromUrl, opened, settled, pick, queues.length])
  const active: ReviewQueueId | null = fromUrl ?? opened

  // Counts are read once by the shell; coming to Review (or to another tab) refreshes them without blanking the figures on screen.
  const { reload } = waiting
  useEffect(() => { reload() }, [reload, active])

  const choose = (next: string) => {
    if (!isReviewQueueId(next) || next === active) return
    const both = (id: string | null) => id === 'logs' || id === 'counts'
    // A queue's own view state (open record, filters) belongs to that queue; the Logs date stays across Logs and Counts.
    setParams((prev) => {
      const out = new URLSearchParams({ queue: next })
      const date = prev.get('date')
      if (both(active) && both(next) && date) out.set('date', date)
      return out
    })
  }

  return (
    <CafePageFrame page="review">
      <div className="cafe-review">
        {queues.length > 0 && (
          <ViewTabs
            ariaLabel={t('cafe.review.queue.label')}
            tabs={queues.map((queue) => ({ id: queue.id, label: t(queue.labelKey), count: queueFigure(queue, waiting) }))}
            active={active ?? ''}
            onChange={choose}
            panelId={PANEL_ID}
            idPrefix={TAB_PREFIX}
          />
        )}
        <div role="tabpanel" id={PANEL_ID} aria-labelledby={active ? `${TAB_PREFIX}-${active}` : undefined} className="cafe-review__panel">
          <CafeReviewEmbedContext.Provider value>
            <Suspense fallback={<LoadingShell />}>
              {active === null && <LoadingShell />}
              {(active === 'logs' || active === 'counts') && <LogsCountsQueue view={active} />}
              {active === 'receipts' && (
                <>
                  <div className="cafe-review__issues">
                    <CafeReceiptIssuesLink canReview receiverId={null} />
                    <span>{t('cafe.review.issues.hint')}</span>
                  </div>
                  <ReceiptsQueue />
                </>
              )}
              {active === 'requests' && <RequestsQueue />}
              {active === 'failed-sends' && <FailedSendsQueue />}
            </Suspense>
          </CafeReviewEmbedContext.Provider>
        </div>
      </div>
    </CafePageFrame>
  )
}
