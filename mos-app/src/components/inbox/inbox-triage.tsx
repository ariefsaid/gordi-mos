import './inbox.css'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Pill } from '@/components/ui/pill'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  isHandled,
  type InboxFilter,
  type TriageNotificationRow,
} from './read-handled-semantics'
import { nudgeAgeDays } from './nudge-semantics'
// #583: the compact "2h"/"3d" age grammar Activity already renders (task-formatters.ts) — reused
// here rather than inventing a second created-time format for the same row shape.
import { formatAge } from '@/components/tasks/task-formatters'
import { formatWibWeekdayTime } from '@/lib/format/date'
import { Link } from 'react-router-dom'
import { StatusBadge, STATUS_MAP } from '@/components/ui/status-badge'
import { deriveInboxRowPresentation, type InboxEntityType } from './inbox-row-presentation'
import { inboxRedesignText } from '@/i18n/inbox-redesign'
import type { MessageKey } from '@/i18n/messages'
import { InboxQueueIndex } from './inbox-queue-index'

/**
 * InboxTriage — the ONE chrome-free Inbox triage content surface (Issue 7). The same component
 * renders as page content (`/inbox`) and as the bell's quick-triage root inside the shared Issue 4
 * overlay host; `mode` only tags the surface for the host, it never changes row meaning.
 *
 * Chrome-free by contract (docs/plans/2026-07-20-v3-inbox-deputy.md §"Target and content
 * contracts"): NO fixed positioning, body scroll lock, focus trap, dialog role, scrim, or close
 * button — the host owns all of those. This surface owns only the filter chrome, the
 * loading/empty/error/ready states, and honest per-row open/mark-handled affordances.
 *
 * This component is presentational (controlled `filter` + `onFilterChange`) and holds no local
 * filter store — but the filter state it is handed is NOT on the Issue 6 RecordCollection seam:
 * InboxTriageConnected keeps it in plain `useState`, so it does not URL-sync or survive refresh.
 * Migrating Inbox onto the engine's synced query is D-E1 / fix work-order item 7
 * (docs/plans/2026-07-23-interaction-consistency.md). The Handled filter is LIVE (OD-WAY-88):
 * `handled_at` is the viewer-personal triage stamp that hides rows from the owner's own active queue.
 * It renders only when `handledFilterAvailable` (owner-gated) — see read-handled-semantics.ts.
 */

export type InboxTriageState = 'loading' | 'ready' | 'empty' | 'error' | 'unauthorized'

export type InboxTriageProps = {
  /** `page` for `/inbox`, `quick` for the bell's ephemeral host root. Tags the surface only. */
  mode: 'page' | 'quick'
  state: InboxTriageState
  rows: readonly TriageNotificationRow[]
  filter: InboxFilter
  /**
   * F13 (OD-REDESIGN-91 #26): how many loaded notifications the ACTIVE filter is hiding. When
   * more pages exist, both counts and empty copy explicitly refer only to loaded notifications.
   */
  hiddenCount?: number
  /** Whether Handled is a real, ratified persisted view; false omits it entirely. */
  handledFilterAvailable: boolean
  /**
   * AC-003 (#549): live per-tab counts over loaded notifications, independent of the active filter.
   * `hasMore` marks them as partial; absent = plain labels (callers/tests that don't model counts).
   */
  counts?: { all: number; unread: number; handled: number }
  /** Counts and empty states are limited to the loaded page while this is true. */
  hasMore?: boolean
  onFilterChange(filter: InboxFilter): void
  /** Open a notification: the caller marks it read (only) and pushes its canonical record. */
  onOpen(row: TriageNotificationRow): void
  /** Explicit "Mark handled" — private notification triage; absent = not offered. */
  onMarkHandled?(row: TriageNotificationRow): void
  /**
   * H7 fix (design audit, 2026-07-27): mark a row read WITHOUT opening its record — the keyboard
   * shortcut ('R', see handleListKeyDown) and the fastest triage path for a row that doesn't need
   * opening. Absent = the shortcut is not offered (matches the onMarkHandled optionality pattern).
   */
  onQuickMarkRead?(row: TriageNotificationRow): void
  onRetry(): void
  /**
   * H9 fix (design audit, 2026-07-27): the `unauthorized` state's ONE action — sign out and let
   * ProtectedRoute route to /login. Never a re-fire of the same failing call (see `state`).
   */
  onSignInAgain?(): void
  /** Rows with an in-flight action; every affordance on that row is busy+disabled. */
  pendingActions?: Readonly<Record<string, InboxPendingAction>>
  unavailable?: { notificationId: string; messageKey: MessageKey } | null
}

export type InboxPendingAction = 'open' | 'read' | 'handled'

// Inbox severity speaks the same attention words as Signals (Urgent · Needs attention · FYI) through
// the one shared status map; there is no second vocabulary.
const SEVERITY_STATUS = { info: 'fyi', warning: 'needsAttention', critical: 'urgent' } as const
const ATTENTION_STATUS = { 'Urgent': 'urgent', 'Needs attention': 'needsAttention', 'FYI': 'fyi' } as const

const ENTITY_KEY: Record<Exclude<InboxEntityType, 'unknown'>, 'inbox.target.type.signal' | 'inbox.target.type.task' | 'inbox.target.type.followUp'> = {
  signal: 'inbox.target.type.signal',
  task: 'inbox.target.type.task',
  follow_up: 'inbox.target.type.followUp',
}

export function InboxTriage({
  mode,
  state,
  rows,
  filter,
  hiddenCount = 0,
  handledFilterAvailable,
  counts,
  hasMore = false,
  onFilterChange,
  onOpen,
  onMarkHandled,
  onQuickMarkRead,
  onRetry,
  onSignInAgain,
  pendingActions,
  unavailable,
}: InboxTriageProps) {
  const t = useT()
  const { locale } = useI18n()
  const pending = new Map(Object.entries(pendingActions ?? {}))
  const readSettled = state === 'ready' || state === 'empty'
  // One render-time boundary for every row (AC-141-3): a single shared `now` means every row's
  // day-bucket is judged against the SAME local midnight, so the queue can't disagree with itself.
  const now = new Date()
  // H7 fix (design audit, 2026-07-27): ↑/↓ moves focus between rows (Tab already reaches every
  // row one at a time — this is the fast path); 'R' marks the FOCUSED row read without opening it.
  // Scoped to keydowns that bubble from an actual row button, so it never hijacks the filter
  // buttons or any other control outside the list. Discoverable via the visible hint below the
  // filters (H10 — an invisible shortcut scores nothing).
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.inbox-row__button')
    if (!button) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.inbox-row__button'))
    const index = buttons.indexOf(button)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      buttons[Math.min(index + 1, buttons.length - 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[Math.max(index - 1, 0)]?.focus()
    } else if (onQuickMarkRead && (event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      const id = button.closest<HTMLLIElement>('.inbox-row')?.dataset.notificationId
      const row = rows.find((r) => r.id === id)
      if (row && !pending.has(row.id)) onQuickMarkRead(row)
    }
  }

  return (
    <div className="inbox-triage" data-mode={mode}>
      <div className="inbox-toolbar">
        {/* While the read is out or failed, no count and no "0 shown": a made-up zero reads as an empty inbox (SD5). */}
        <InboxQueueIndex filter={filter} counts={readSettled ? counts : undefined} hasMore={hasMore} handledAvailable={handledFilterAvailable} onChange={onFilterChange} />
        {readSettled ? (
          <p className="inbox-triage__scope">
            {inboxRedesignText(locale, 'loadedScope', { count: rows.length, more: hasMore ? inboxRedesignText(locale, 'moreAvailable') : '' })}
            <span aria-hidden="true"> · </span>{inboxRedesignText(locale, 'sortOrder')}
          </p>
        ) : null}
      </div>
      <section className="inbox-triage__queue" aria-label={t('inbox.title')}>
      {state === 'loading' ? (
        <LoadingShell count={4} label={t('inbox.title')} />
      ) : state === 'unauthorized' ? (
        // H9 fix (design audit, 2026-07-27): the session is gone, not just a failed fetch — name
        // that reason and offer the ONE action that can actually succeed (sign in again), never
        // the old "Try again" that re-fired the identical, permanently-failing call.
        <ErrorState
          message={t('inbox.sessionExpired')}
          onRetry={onSignInAgain}
          retryLabel={t('inbox.signInAgain')}
        />
      ) : state === 'error' ? (
        <ErrorState
          message={t('inbox.errorTitle')}
          onRetry={onRetry}
          retryLabel={t('inbox.retry')}
        />
      ) : state === 'empty' ? (
        filter === 'unread' && (hiddenCount > 0 || hasMore) ? (
          <EmptyState
            variant="blank"
            title={t(hasMore ? 'inbox.emptyUnread.loadedTitle' : 'inbox.emptyUnread.title')}
            copy={t(hasMore ? 'inbox.emptyUnread.loadedHidden' : 'inbox.emptyUnread.hidden', { count: hiddenCount })}
          >
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="btn btn-outline inbox-triage__show-all"
                onClick={() => onFilterChange('all')}
              >
                {t('inbox.emptyUnread.showAll')}
              </button>
            ) : null}
          </EmptyState>
        ) : hasMore ? (
          <EmptyState
            variant="quiet"
            title={t(filter === 'handled' ? 'inbox.emptyPartial.handledTitle' : 'inbox.emptyPartial.allTitle')}
            copy={t('inbox.emptyPartial.copy')}
          />
        ) : (
          <EmptyState
            variant="quiet"
            title={t('inbox.empty')}
            copy={t('inbox.emptyCopy')}
          >
            {mode === 'page' ? (
              <Link to="/work/tasks?view=my-work" className="btn btn-outline">
                {inboxRedesignText(locale, 'viewTasks')}
              </Link>
            ) : null}
          </EmptyState>
        )
      ) : (
        <>
          {onQuickMarkRead ? <p className="inbox-triage__kbd-hint">{inboxRedesignText(locale, 'keyboardHelp')}</p> : null}
          <ul className="inbox-list" aria-label={t('inbox.title')} onKeyDown={handleListKeyDown}>
            {rows.map((n) => {
              const unread = n.read_at == null
              const isPending = pending.has(n.id)
              const canHandle = onMarkHandled != null && !isHandled(n)
              const ageDays = nudgeAgeDays(n, now) // OD-WAY-86: >= 2 on nudged rows, else null
              const presentation = deriveInboxRowPresentation(n)
              const actorTitle = presentation.isSignalRetraction
                ? t('inbox.signalRetraction.title', {
                  name: presentation.actorName ?? t('inbox.signalRetraction.someone'),
                })
                : presentation.actorName && presentation.entityType !== 'unknown'
                ? presentation.source === 'signal_mention' || presentation.source === 'task_mention'
                  ? t('inbox.actorMentioned', { name: presentation.actorName })
                  : t('inbox.actorActivity', {
                    name: presentation.actorName,
                    entity: t(ENTITY_KEY[presentation.entityType]),
                  })
                : presentation.fallbackTitle
              const entityLabel = presentation.entityType !== 'unknown'
                ? t(ENTITY_KEY[presentation.entityType])
                : null
              const sourceLine = presentation.isSignalRetraction
                ? t('inbox.signalRetraction.reason', {
                  reason: presentation.reason ?? presentation.sourceLine ?? t('inbox.signalRetraction.reasonUnavailable'),
                })
                : presentation.sourceLine
              return (
                <li key={n.id} className={`inbox-row${unread ? ' inbox-row--unread' : ''}`} data-notification-id={n.id}>
                  <button
                    type="button"
                    className="inbox-row__button"
                    onClick={() => onOpen(n)}
                    disabled={isPending}
                    aria-busy={isPending || undefined}
                  >
                    <span
                      className={`inbox-row__dot inbox-row__dot--${n.severity}`}
                      aria-label={t(STATUS_MAP[SEVERITY_STATUS[n.severity]].label)}
                    />
                    <span className="inbox-row__content">
                      {/* The accessible name is the visible text plus a spoken prefix, so voice control can say what it sees (WCAG 2.5.3). */}
                      <span className="sr-only">{inboxRedesignText(locale, 'openRecord')}{unread ? `, ${t('inbox.filter.unread')}` : ''}: </span>
                      <span className="inbox-row__titleline">
                        {entityLabel ? <span className="inbox-row__type">{entityLabel}</span> : null}
                        {presentation.attention ? <StatusBadge status={ATTENTION_STATUS[presentation.attention]} /> : n.severity !== 'info' ? <StatusBadge status={SEVERITY_STATUS[n.severity]} /> : null}
                        {ageDays != null ? <Pill tone="neutral" dot={false} className="inbox-row__age">{t('inbox.age.days', { count: ageDays })}</Pill> : null}
                        <span className="inbox-row__time">{formatWibWeekdayTime(n.created_at, locale)} · {formatAge(n.created_at, now, locale)}</span>
                      </span>
                      {sourceLine ? <span className="inbox-row__body">{sourceLine}</span> : null}
                      <span className="inbox-row__attribution">{actorTitle}</span>
                    </span>
                  </button>
                  {unavailable?.notificationId === n.id ? <p className="inbox-row__unavailable" role="status" aria-live="polite">{t(unavailable.messageKey)}</p> : null}
                  <div className="inbox-row__actions">
                    {unread && onQuickMarkRead ? <button type="button" className="btn btn-outline inbox-row__read" onClick={() => onQuickMarkRead(n)} disabled={isPending} aria-busy={isPending || undefined}>{inboxRedesignText(locale, 'markRead')}</button> : null}
                  {canHandle ? (
                    <button
                      type="button"
                      className="btn btn-outline inbox-row__handle"
                      onClick={() => onMarkHandled?.(n)}
                      disabled={isPending}
                      aria-busy={isPending || undefined}
                    >
                      {t('inbox.markHandled')}
                    </button>
                  ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          <div role="status" aria-live="polite" className="inbox-triage__status">
            {pending.size > 0
              ? [...pending.values()].some((action) => action === 'open')
                ? t('inbox.opening')
                : t('inbox.updating')
              : ''}
          </div>
        </>
      )}
      </section>
    </div>
  )
}
