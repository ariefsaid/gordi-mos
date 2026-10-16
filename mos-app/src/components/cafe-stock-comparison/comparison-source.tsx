// The source strip above the table: what each side of the comparison is and how complete it is.
// ESB side: as-of, last successful sync, coverage (all "Not connected" until the read model exists, or the sample's made-up values).
// Count side: how many listed items have a Count, and how far back the Counts were read. Refresh reloads the reads; it is not a sync trigger.
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import { formatDayMonthYear } from '@/lib/format/date'
import type { Locale } from '@/i18n/messages'
import type { CoverageCounts } from '@/lib/cafe-stock-comparison'
import type { SampleSource } from '@/lib/cafe-stock-comparison-sample'
import { wibInstant } from './comparison-labels'

export interface ComparisonSourceProps {
  locale: Locale
  coverage: CoverageCounts
  sample: SampleSource | null
  /** The Counts read reached the first Count ever recorded. */
  countsComplete: boolean
  /** The oldest Count date read (null before any). */
  countsOldest: string | null
  readingOlder: boolean
  onReadOlder: () => void
  onRefresh: () => void
  refreshDisabled: boolean
  /** Why refresh is disabled (offline); shown beside it. */
  refreshReason: string | null
  canOpenCount: boolean
  loading: boolean
}

export function ComparisonSource({ locale, coverage, sample, countsComplete, countsOldest, readingOlder, onReadOlder, onRefresh, refreshDisabled, refreshReason, canOpenCount, loading }: ComparisonSourceProps) {
  const t = useT()
  const notConnected = t('cafe.cmp.source.notConnected')
  return (
    <section className="scmp-source" aria-label={t('cafe.cmp.source.label')}>
      <dl className="scmp-source__list">
        <div><dt>{t('cafe.cmp.source.esbAsOf')}</dt><dd>{sample ? wibInstant(sample.asOf, locale) : notConnected}</dd></div>
        <div><dt>{t('cafe.cmp.source.lastSync')}</dt><dd>{sample ? wibInstant(sample.syncedAt, locale) : '–'}</dd></div>
        <div><dt>{t('cafe.cmp.source.coverage')}</dt><dd>{sample ? t('cafe.cmp.source.sampleCoverage', { partial: sample.partialItems, unmapped: sample.unmappedItems }) : notConnected}</dd></div>
        <div>
          <dt>{t('cafe.cmp.source.counts')}</dt>
          <dd>
            {loading ? '…' : t('cafe.cmp.source.counted', { counted: coverage.counted, total: coverage.total })}
          </dd>
        </div>
      </dl>
      <div className="scmp-source__actions">
        {!loading && coverage.counted === 0 && canOpenCount && <Link className="btn btn-outline btn-touch" to="/cafe/count">{t('cafe.cmp.source.openCount')}</Link>}
        <Button variant="ghost" onClick={onRefresh} disabled={refreshDisabled} aria-describedby={refreshReason ? 'scmp-refresh-reason' : undefined}>{t('records.refresh')}</Button>
        {refreshReason && <span id="scmp-refresh-reason" className="scmp-source__reason">{refreshReason}</span>}
      </div>
      {!sample && !loading && !countsComplete && countsOldest && (
        <p className="scmp-source__older">
          <span>{t('cafe.cmp.source.readBack', { date: formatDayMonthYear(countsOldest, locale) })}</span>
          <Button variant="outline" onClick={onReadOlder} disabled={readingOlder || refreshDisabled}>{readingOlder ? t('cafe.cmp.source.readingOlder') : t('cafe.cmp.source.readOlder')}</Button>
        </p>
      )}
    </section>
  )
}
