import { useMemo } from 'react'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { eventsCollectionDescriptor, type EventCollectionQuery } from '@/components/events/events-collection-adapter'
import './events-workspace-page.css'

function monthLabel(key: string, locale: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}
function shiftMonth(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

export function EventsWorkspacePage() {
  const t = useT()
  const { locale } = useI18n()
  useDocumentTitle(t('common.docTitle', { page: t('events.title') }))
  const controller = useRecordCollection({ descriptor: eventsCollectionDescriptor, urlMode: 'synced', viewerId: null, accessRoles: [] })
  const query = controller.state.query
  const controls = useMemo(() => (
    <div className="events-month-controls" aria-label={t('events.monthControls')}>
      <button type="button" aria-label={t('events.previousMonth')} onClick={() => controller.setQuery({ ...query, month: shiftMonth(query.month, -1) })}>{t('events.previousMonth')}</button>
      <output aria-live="polite">{monthLabel(query.month, locale)}</output>
      <button type="button" aria-label={t('events.nextMonth')} onClick={() => controller.setQuery({ ...query, month: shiftMonth(query.month, 1) })}>{t('events.nextMonth')}</button>
    </div>
  ), [controller, locale, query, t])
  const count = controller.state.projection?.visibleRecords.length ?? null
  return <PageFamilyFrame family="workspace" title={t('events.title')} jobSentence={t('events.job')} count={count}>
    <RecordCollectionSurface
      controller={controller}
      controls={controls}
      resultHeader={{ collectionLabel: t('events.title'), viewLabel: t('events.calendar'), count }}
      empty={{ title: t('events.empty.title'), copy: t('events.empty.copy') }}
      filteredEmpty={{ title: t('events.empty.title'), clear: () => controller.setQuery({ ...query } as EventCollectionQuery) }}
      error={{ message: t('events.error'), retry: () => controller.retry() }}
      loadingLabel={t('events.loading')}
    />
  </PageFamilyFrame>
}
