import './inbox.css'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  INBOX_FILTERS,
  isHandled,
  type InboxFilter,
  type TriageNotificationRow,
} from './read-handled-semantics'

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
 * (docs/plans/2026-07-23-interaction-consistency.md). The Handled filter is omitted (not a dead
 * tab) until `handledFilterAvailable` — see read-handled-semantics.ts for the owner-gated
 * provisional semantics.
 */

export type InboxTriageState = 'loading' | 'ready' | 'empty' | 'error'

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
  onFilterChange(filter: InboxFilter): void
  /** Open a notification: the caller marks it read (only) and pushes its canonical record. */
  onOpen(row: TriageNotificationRow): void
  /** Explicit "Mark handled" — private notification triage; absent = not offered. */
  onMarkHandled?(row: TriageNotificationRow): void
  onRetry(): void
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
  onFilterChange,
  onOpen,
  onMarkHandled,
  onRetry,
  pendingIds,
}: InboxTriageProps) {
  const t = useT()
  const pending = new Set(pendingIds ?? [])
  const filters = INBOX_FILTERS.filter((f) => f !== 'handled' || handledFilterAvailable)

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
            {t(FILTER_KEY[f])}
          </button>
        ))}
      </div>

      {state === 'loading' ? (
        <LoadingShell count={4} label={t('inbox.title')} />
      ) : state === 'error' ? (
        <ErrorState
          message={t('inbox.errorTitle')}
          onRetry={onRetry}
          retryLabel={t('inbox.retry')}
        />
      ) : state === 'empty' ? (
        // F13 (OD-91 #26): when the unread view is empty but read notifications are hidden by the
        // filter, name what's hidden and offer a one-tap escape to All — never a false all-clear.
        filter !== 'all' && hiddenCount > 0 ? (
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
          <ul className="inbox-list" aria-label={t('inbox.title')}>
            {rows.map((n) => {
              const unread = n.read_at == null
              const isPending = pending.has(n.id)
              const canHandle = onMarkHandled != null && !isHandled(n)
              return (
                <li key={n.id} className={`inbox-row${unread ? ' inbox-row--unread' : ''}`}>
                  <button
                    type="button"
                    className="inbox-row__button"
                    onClick={() => onOpen(n)}
                    disabled={isPending}
                    aria-busy={isPending || undefined}
                    aria-label={`${n.title}${unread ? ' (unread)' : ''}`}
                  >
                    <span
                      className={`inbox-row__dot inbox-row__dot--${n.severity}`}
                      aria-label={t(SEVERITY_KEY[n.severity])}
                    />
                    <span className="inbox-row__content">
                      <span className="inbox-row__title">{n.title}</span>
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
