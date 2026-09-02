import './inbox.css'
import { useT } from '@/i18n/use-t'
import { Pill } from '@/components/ui/pill'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  INBOX_FILTERS,
  isHandled,
  type InboxFilter,
  type TriageNotificationRow,
} from './read-handled-semantics'
import { nudgeAgeDays } from './nudge-semantics'
// #583: the compact "2h"/"3d" age grammar Activity already renders (task-formatters.ts) — reused
// here rather than inventing a second created-time format for the same row shape.
import { formatAge } from '@/components/tasks/task-formatters'

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
   * F13 (OD-REDESIGN-91 #26): how many notifications the ACTIVE filter is hiding. When the
   * unread view is empty but this is > 0, the empty state is filter-aware ("No unread · N read
   * hidden — show all") instead of the false all-clear affirmation. 0 (or the All view) keeps the
   * earned ✓ all-clear.
   */
  hiddenCount?: number
  /** Whether Handled is a real, ratified persisted view; false omits it entirely. */
  handledFilterAvailable: boolean
  /**
   * AC-003 (#549): live per-tab counts over the WHOLE queue, independent of the active filter.
   * Absent = plain labels (callers/tests that don't model counts).
   */
  counts?: { all: number; unread: number; handled: number }
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
  /** Rows with an in-flight open/action; their open button is busy+disabled. */
  pendingIds?: readonly string[]
}

const SEVERITY_KEY = {
  info: 'inbox.severity.info',
  warning: 'inbox.severity.warning',
  critical: 'inbox.severity.critical',
} as const

const FILTER_KEY: Record<InboxFilter, 'inbox.filter.all' | 'inbox.filter.unread' | 'inbox.filter.handled'> = {
  all: 'inbox.filter.all',
  unread: 'inbox.filter.unread',
  handled: 'inbox.filter.handled',
}

export function InboxTriage({
  mode,
  state,
  rows,
  filter,
  hiddenCount = 0,
  handledFilterAvailable,
  counts,
  onFilterChange,
  onOpen,
  onMarkHandled,
  onQuickMarkRead,
  onRetry,
  onSignInAgain,
  pendingIds,
}: InboxTriageProps) {
  const t = useT()
  const pending = new Set(pendingIds ?? [])
  // One render-time boundary for every row (AC-141-3): a single shared `now` means every row's
  // day-bucket is judged against the SAME local midnight, so the queue can't disagree with itself.
  const now = new Date()
  const filters = INBOX_FILTERS.filter((f) => f !== 'handled' || handledFilterAvailable)

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
      if (row) onQuickMarkRead(row)
    }
  }

  return (
    <div className="inbox-triage" data-mode={mode}>
      <div className="inbox-triage__filters" role="group" aria-label={t('inbox.filter.label')}>
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            className="inbox-triage__filter"
            aria-pressed={filter === f}
            onClick={() => onFilterChange(f)}
          >
            {counts
              ? t('inbox.filter.withCount', { label: t(FILTER_KEY[f]), count: counts[f] })
              : t(FILTER_KEY[f])}
          </button>
        ))}
      </div>

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
        // The filter-aware empty copy is unread-specific ('N read hidden'); an empty
        // Handled view is honestly quiet.
        filter === 'unread' && hiddenCount > 0 ? (
          <EmptyState
            variant="blank"
            title={t('inbox.emptyUnread.title')}
            copy={t('inbox.emptyUnread.hidden', { count: hiddenCount })}
          >
            <button
              type="button"
              className="inbox-triage__show-all"
              onClick={() => onFilterChange('all')}
            >
              {t('inbox.emptyUnread.showAll')}
            </button>
          </EmptyState>
        ) : (
          <EmptyState variant="quiet" title={t('inbox.empty')} copy={t('inbox.emptyCopy')} />
        )
      ) : (
        <>
          {onQuickMarkRead ? (
            <p className="inbox-triage__kbd-hint" aria-hidden="true">
              {t('inbox.kbdHint')}
            </p>
          ) : null}
          <ul className="inbox-list" aria-label={t('inbox.title')} onKeyDown={handleListKeyDown}>
            {rows.map((n) => {
              const unread = n.read_at == null
              const isPending = pending.has(n.id)
              const canHandle = onMarkHandled != null && !isHandled(n)
              const ageDays = nudgeAgeDays(n, now) // OD-WAY-86: >= 2 on nudged rows, else null
              return (
                <li key={n.id} className={`inbox-row${unread ? ' inbox-row--unread' : ''}`} data-notification-id={n.id}>
                  <button
                    type="button"
                    className="inbox-row__button"
                    onClick={() => onOpen(n)}
                    disabled={isPending}
                    aria-busy={isPending || undefined}
                    aria-label={`${n.title}${unread ? ' (unread)' : ''}${ageDays != null ? ` (${t('inbox.age.days', { count: ageDays })})` : ''}`}
                  >
                    <span
                      className={`inbox-row__dot inbox-row__dot--${n.severity}`}
                      aria-label={t(SEVERITY_KEY[n.severity])}
                    />
                    <span className="inbox-row__content">
                      <span className="inbox-row__titleline">
                        <span className="inbox-row__title">{n.title}</span>
                        {ageDays != null ? (
                          <Pill tone="neutral" dot={false} className="inbox-row__age">
                            {t('inbox.age.days', { count: ageDays })}
                          </Pill>
                        ) : null}
                        <span className="inbox-row__time">{formatAge(n.created_at, now)}</span>
                      </span>
                      {n.body ? <span className="inbox-row__body">{n.body}</span> : null}
                    </span>
                  </button>
                  {canHandle ? (
                    <button
                      type="button"
                      className="inbox-row__handle"
                      onClick={() => onMarkHandled?.(n)}
                    >
                      {t('inbox.markHandled')}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div role="status" aria-live="polite" className="inbox-triage__status">
            {pending.size > 0 ? t('inbox.opening') : ''}
          </div>
        </>
      )}
    </div>
  )
}
