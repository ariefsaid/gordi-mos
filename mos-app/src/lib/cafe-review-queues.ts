// The queues behind Café's one Review page, one tab each. Pure data: the Review page, the nav badge, ⌘K and the old
// Receipt review / Request review links all read this list, so a queue exists in one place.
import type { MessageKey } from '@/i18n/messages'
import type { WaitingKey } from './use-cafe-waiting'

export type ReviewQueueId = 'logs' | 'counts' | 'receipts' | 'requests' | 'failed-sends'

export interface ReviewQueue {
  id: ReviewQueueId
  labelKey: MessageKey
  /** Access roles that may open the queue; the same gate its route had. */
  anyOf: readonly string[]
  /** The waiting counts that make up the queue's own number. */
  waiting: readonly WaitingKey[]
}

const REVIEWERS = ['ops_lead', 'admin', 'supervisor'] as const

const REVIEW_QUEUES: readonly ReviewQueue[] = [
  { id: 'logs', labelKey: 'kitchen.review.workspace.logs', anyOf: REVIEWERS, waiting: ['logs'] },
  { id: 'counts', labelKey: 'kitchen.review.workspace.counts', anyOf: REVIEWERS, waiting: ['counts'] },
  { id: 'receipts', labelKey: 'cafe.review.queue.receipts', anyOf: REVIEWERS, waiting: ['receipts'] },
  { id: 'requests', labelKey: 'cafe.review.queue.requests', anyOf: REVIEWERS, waiting: ['requests'] },
  // Supervisors never see failed ESB sends: Sent to ESB is an ops lead's / admin's page.
  { id: 'failed-sends', labelKey: 'cafe.review.queue.failed', anyOf: ['ops_lead', 'admin'], waiting: ['failed'] },
]

/** The tab shown when nothing is waiting anywhere. */
const DEFAULT_REVIEW_QUEUE: ReviewQueueId = 'logs'

export function reviewQueuesFor(accessRoles: readonly string[]): ReviewQueue[] {
  return REVIEW_QUEUES.filter((queue) => queue.anyOf.some((role) => accessRoles.includes(role)))
}

export function reviewQueuePath(id: ReviewQueueId): string {
  return `/cafe/review?queue=${id}`
}

export function isReviewQueueId(value: string | null | undefined): value is ReviewQueueId {
  return REVIEW_QUEUES.some((queue) => queue.id === value)
}

/**
 * The tab an address asks for. Old links keep working: `?queue=logs-counts` was Logs, or Counts with `&view=counts`, and a bare
 * `?view=counts` (the old Logs & Counts queue was the default) was Counts. `legacy` says the address should be rewritten to the
 * one-key form (`?queue=<tab>`, no `view`). null `id` = the address names no tab (the page then picks the default).
 */
export function reviewQueueFromParams(queue: string | null, view: string | null): { id: ReviewQueueId | null; legacy: boolean } {
  if (queue === 'logs-counts') return { id: view === 'counts' ? 'counts' : 'logs', legacy: true }
  if (queue === null && (view === 'counts' || view === 'logs')) return { id: view, legacy: true }
  return { id: isReviewQueueId(queue) ? queue : null, legacy: false }
}

/** The tab to open when the address names none (or none the viewer may open): the first with something waiting, else Logs. */
export function defaultReviewQueue(queues: readonly ReviewQueue[], waitingCount: (queue: ReviewQueue) => number | null): ReviewQueueId {
  return queues.find((queue) => (waitingCount(queue) ?? 0) > 0)?.id ?? queues[0]?.id ?? DEFAULT_REVIEW_QUEUE
}
