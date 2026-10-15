import { useI18n } from '@/i18n/I18nProvider'
import { inboxRedesignText } from '@/i18n/inbox-redesign'
import { useT } from '@/i18n/use-t'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { INBOX_FILTERS, type InboxFilter } from './read-handled-semantics'

const FILTER_KEY: Record<InboxFilter, 'inbox.filter.all' | 'inbox.filter.unread' | 'inbox.filter.handled'> = {
  all: 'inbox.filter.all', unread: 'inbox.filter.unread', handled: 'inbox.filter.handled',
}

/** The Inbox read-state filter: the shared SegmentedControl (a filter of one list, not tabs). */
export function InboxQueueIndex({ filter, counts, hasMore, handledAvailable, onChange }: {
  filter: InboxFilter
  counts?: { all: number; unread: number; handled: number }
  hasMore: boolean
  handledAvailable: boolean
  onChange(filter: InboxFilter): void
}) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <nav className="inbox-queue-index" aria-label={inboxRedesignText(locale, 'queueViews')}>
      <SegmentedControl
        label={t('inbox.filter.label')}
        options={INBOX_FILTERS.filter((view) => view !== 'handled' || handledAvailable).map((view) => ({
          value: view,
          label: t(FILTER_KEY[view]),
          count: counts ? `${counts[view]}${hasMore ? '+' : ''}` : undefined,
        }))}
        value={filter}
        onChange={onChange}
      />
    </nav>
  )
}
