// Words and number text for Café Records: label tables and small formatters, no components.
import type { StatusKey } from '@/components/ui/status-badge'
import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import { formatDec, type Dec } from '@/lib/cafe-records/decimal'
import type { Movement, RecordEntry, StatusBasis, UnitBasis } from '@/lib/cafe-records/model'
import type { Question } from '@/lib/cafe-records/url-state'
import { formatWeekdayDayMonth } from '@/lib/format/date'

export const MOVEMENT_LABEL: Record<Movement, MessageKey> = {
  sent: 'records.movement.sent',
  made: 'records.movement.made',
  transferred: 'records.movement.transferred',
  wasted: 'records.movement.wasted',
  received: 'records.movement.received',
  requested: 'records.movement.requested',
  counted: 'records.movement.counted',
}

export const QUESTION_LABEL: Record<Question, MessageKey> = {
  sent: 'records.question.sent',
  made: 'records.question.made',
  transferred: 'records.question.transferred',
  wasted: 'records.question.wasted',
  received: 'records.question.received',
  requested: 'records.question.requested',
  counted: 'records.question.counted',
  everything: 'records.question.everything',
}

/** Source vocabulary for "No {source} records" and "Could not load {source}". */
export const SOURCE_LABEL = {
  logs: 'records.source.logs',
  counts: 'records.source.counts',
  receipts: 'records.source.receipts',
  requests: 'records.source.requests',
} as const satisfies Record<string, MessageKey>

export const QUESTION_SOURCE: Record<Exclude<Question, 'everything'>, keyof typeof SOURCE_LABEL> = {
  sent: 'logs', made: 'logs', transferred: 'logs', wasted: 'logs', received: 'receipts', requested: 'requests', counted: 'counts',
}

/** The status word for a source: Count's pending state is "Pending confirmation", the rest "Pending approval". */
export function statusLabel(t: Translate, movement: Movement, status: StatusBasis): string {
  switch (status) {
    case 'pending': return t(movement === 'counted' ? 'records.status.pendingCount' : 'records.status.pending')
    case 'approved': return t('records.status.approved')
    case 'rejected': return t('records.status.rejected')
    case 'confirmed': return t('records.status.confirmed')
    case 'locked': return t('records.status.locked')
  }
}

export const STATUS_KEY: Record<StatusBasis, StatusKey> = {
  pending: 'needsAttention', approved: 'done', rejected: 'urgent', confirmed: 'done', locked: 'inProgress',
}

/** Stored posting evidence, shown beside the status — never inferred from approval or from absence. */
export function postingBadge(t: Translate, entry: RecordEntry): { status: StatusKey; label: string } | null {
  const raw = entry.raw
  if (raw.source === 'receipt' && raw.receipt.status === 'Approved' && raw.receipt.posting) {
    switch (raw.receipt.posting.state) {
      case 'posted': return { status: 'posted', label: t('records.posting.sent') }
      case 'queued': return { status: 'inFlight', label: t('records.posting.queued') }
      case 'held': return { status: 'blocked', label: t('records.posting.held') }
      case 'failed': return { status: 'deadLetter', label: t('records.posting.failed') }
      default: return null
    }
  }
  if (raw.source === 'count') {
    switch (raw.count.posting_status) {
      case 'posted': return { status: 'posted', label: t('records.posting.sent') }
      case 'held': return { status: 'blocked', label: t('records.posting.held') }
      case 'failed': return { status: 'deadLetter', label: t('records.posting.failed') }
      default: return null
    }
  }
  if (raw.source === 'log' && raw.log.action === 'outlet_send') return { status: 'done', label: t('records.posting.noPosting') }
  if (raw.source === 'log' && raw.log.posted_to_esb) return { status: 'posted', label: t('records.posting.sent') }
  return null
}

export function unitText(t: Translate, unit: UnitBasis): string {
  return unit.name?.trim() || t('records.unit.unavailable')
}

/** The number with the source's own digits, id-ID grouping in both locales. */
export function quantityText(qty: Dec | null): string {
  return qty === null ? '—' : formatDec(qty)
}

export function dateText(date: string): string {
  return formatWeekdayDayMonth(date)
}
