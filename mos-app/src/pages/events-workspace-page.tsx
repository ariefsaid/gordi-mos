import { useMemo } from 'react'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { eventsCollectionDescriptor, type EventCollectionQuery } from '@/components/events/events-collection-adapter'
import './events-workspace-page.css'

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}
function shiftMonth(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

export function EventsWorkspacePage() {
  useDocumentTitle('Events · Work')
  const controller = useRecordCollection({ descriptor: eventsCollectionDescriptor, urlMode: 'synced', viewerId: null, accessRoles: [] })
  const query = controller.state.query
  const controls = useMemo(() => (
    <div className="events-month-controls" aria-label="Calendar month">
      <button type="button" aria-label="Previous month" onClick={() => controller.setQuery({ ...query, month: shiftMonth(query.month, -1) })}>Previous</button>
      <output aria-live="polite">{monthLabel(query.month)}</output>
      <button type="button" aria-label="Next month" onClick={() => controller.setQuery({ ...query, month: shiftMonth(query.month, 1) })}>Next</button>
    </div>
  ), [controller, query])
  const count = controller.state.projection?.visibleRecords.length ?? null
  return <PageFamilyFrame family="workspace" title="Events" jobSentence="See commitments of people and space." count={count}>
    <RecordCollectionSurface
      controller={controller}
      controls={controls}
      resultHeader={{ collectionLabel: 'Events', viewLabel: 'Calendar', count }}
      empty={{ title: 'Nothing scheduled this month', copy: 'Choose another month to see scheduled events.' }}
      filteredEmpty={{ title: 'Nothing scheduled this month', clear: () => controller.setQuery({ ...query } as EventCollectionQuery) }}
      error={{ message: 'Events could not be loaded. Try again.', retry: () => controller.retry() }}
      loadingLabel="Loading events"
    />
  </PageFamilyFrame>
}
