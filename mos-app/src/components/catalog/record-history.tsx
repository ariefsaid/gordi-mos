import { useEffect, useId, useRef, useState } from 'react'
import { useT, type Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { formatWibDateTime } from '@/lib/format/date'
import { formatAge } from '@/components/tasks/task-formatters'
import {
  HISTORY_PAGE,
  HISTORY_REFERENCE_FIELDS,
  loadRecordHistory,
  type RecordHistory as RecordHistoryData,
  type RecordHistoryEntry,
} from '@/lib/db/record-history'
import './record-history.css'

const VALUE_CAP = 300

const FIELD_LABELS: Record<string, MessageKey> = {
  name: 'catalog.history.field.name',
  type: 'catalog.history.field.type',
  write_up: 'catalog.history.field.write_up',
  definition_version: 'catalog.history.field.definition_version',
  business_unit_id: 'catalog.record.businessUnit',
  accountable_person_id: 'catalog.record.accountable',
  responsible_person_id: 'catalog.record.responsible',
  objective_id: 'catalog.record.objective',
  period_year: 'catalog.record.period',
}

function fieldLabel(field: string, t: Translate): string {
  const key = FIELD_LABELS[field]
  // A column no one has labelled yet still shows, as its own name.
  return key ? t(key) : field.replace(/_/g, ' ')
}

function valueText(field: string, value: string | null, names: RecordHistoryData['names'], t: Translate): string {
  if (value === null) return t('catalog.notSet')
  const text = field in HISTORY_REFERENCE_FIELDS ? (names.get(value) ?? t('catalog.history.unavailable')) : value
  return text.length > VALUE_CAP ? `${text.slice(0, VALUE_CAP)}…` : text
}

function Change({ entry, names, t }: { entry: RecordHistoryEntry; names: RecordHistoryData['names']; t: Translate }) {
  if (entry.action === 'insert') return <span className="catalog-record-history__field">{t('catalog.history.created')}</span>
  if (entry.action === 'delete' || entry.field === null) return <span className="catalog-record-history__field">{t('catalog.history.deleted')}</span>
  const label = fieldLabel(entry.field, t)
  // Document columns record that they changed, never what to (DA-2): both values are NULL, which an
  // ordinary diff can never produce — so no per-column registry is needed here.
  if (entry.oldValue === null && entry.newValue === null) {
    return <span className="catalog-record-history__field">{t('catalog.history.documentChanged', { field: label })}</span>
  }
  if (entry.field === 'archived_at') {
    return <span className="catalog-record-history__field">{t(entry.newValue ? 'tasks.event.archived' : 'tasks.event.unarchived')}</span>
  }
  return (
    <>
      <span className="catalog-record-history__field">{label}</span>{' '}
      <span className="catalog-record-history__value">{valueText(entry.field, entry.oldValue, names, t)}</span>
      {' → '}
      <span className="catalog-record-history__value">{valueText(entry.field, entry.newValue, names, t)}</span>
    </>
  )
}

export type RecordHistoryProps = {
  table: 'objectives' | 'work_lines'
  recordId: string
  headingLevel?: 1 | 2
  now?: Date
}

export function RecordHistory({ table, recordId, headingLevel = 2, now }: RecordHistoryProps) {
  const t = useT()
  const { locale } = useI18n()
  const headingId = useId()
  const [nonce, setNonce] = useState(0)
  const [data, setData] = useState<RecordHistoryData | null>(null)
  const [failed, setFailed] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const inFlight = useRef(false)
  const Heading = headingLevel === 1 ? 'h2' : 'h3'

  useEffect(() => {
    let live = true
    setFailed(false)
    setMoreFailed(false)
    loadRecordHistory(table, recordId).then(
      (next) => { if (live) { setData(next); setHasMore(next.entries.length >= HISTORY_PAGE) } },
      () => { if (live) setFailed(true) },
    )
    return () => { live = false }
  }, [table, recordId, nonce])

  function showOlder() {
    const last = data?.entries.at(-1)
    if (!data || !last || inFlight.current) return
    inFlight.current = true
    setLoadingMore(true)
    setMoreFailed(false)
    loadRecordHistory(table, recordId, { occurredAt: last.occurredAt, id: last.id }).then(
      (page) => {
        setData((cur) => cur && { entries: [...cur.entries, ...page.entries], names: new Map([...cur.names, ...page.names]) })
        setHasMore(page.entries.length >= HISTORY_PAGE)
      },
      () => setMoreFailed(true),
    ).finally(() => { inFlight.current = false; setLoadingMore(false) })
  }

  const clock = now ?? new Date()
  return (
    <section className="catalog-record-history" aria-labelledby={headingId}>
      <Heading id={headingId} className="record-viewer__section-title">{t('catalog.history.title')}</Heading>
      {failed ? (
        <ErrorState message={t('catalog.history.error')} onRetry={() => setNonce((n) => n + 1)} />
      ) : data === null ? (
        <LoadingShell count={3} label={t('catalog.history.loading')} />
      ) : data.entries.length === 0 ? (
        <p className="catalog-record-history__empty">{t('catalog.history.empty')}</p>
      ) : (
        <>
          <ol className="catalog-record-history__list">
            {data.entries.map((entry) => (
              <li key={entry.id} className="catalog-record-history__item">
                <div className="catalog-record-history__meta">
                  <span className="catalog-record-history__who">{entry.actorName ?? t('tasks.people.someone')}</span>
                  <time className="catalog-record-history__when tabular-nums" dateTime={entry.occurredAt} title={formatWibDateTime(entry.occurredAt, locale)}>
                    {formatAge(entry.occurredAt, clock, locale)}
                  </time>
                  {entry.channel !== 'app' ? (
                    <span className="catalog-record-history__channel">
                      {t(entry.channel === 'api' ? 'catalog.history.viaApi' : 'catalog.history.viaAgent')}
                    </span>
                  ) : null}
                </div>
                <p className="catalog-record-history__change"><Change entry={entry} names={data.names} t={t} /></p>
              </li>
            ))}
          </ol>
          {moreFailed ? <ErrorState message={t('catalog.history.error')} onRetry={showOlder} /> : null}
          {hasMore && !moreFailed ? (
            <Button variant="outline" className="catalog-record-history__more" onClick={showOlder} disabled={loadingMore}>
              {t('catalog.history.showMore')}
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
