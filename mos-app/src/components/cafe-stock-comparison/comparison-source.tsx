// The source strip: EOD freshness, source coverage and Count coverage for the authorized scope.
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import type { Locale } from '@/i18n/messages'
import type { CoverageCounts } from '@/lib/cafe-stock-comparison'
import type { SourceState } from '@/lib/db/cafe-stock-comparison'
import { formatDayMonthYear } from '@/lib/format/date'
import { wibInstant } from './comparison-labels'

export interface ComparisonSourceProps {
  locale: Locale
  source: SourceState | null
  coverage: CoverageCounts
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

export function ComparisonSource({ locale, source, coverage, countsComplete, countsOldest, readingOlder, onReadOlder, onRefresh, refreshDisabled, refreshReason, canOpenCount, loading }: ComparisonSourceProps) {
  const t = useT()
  const notConnected = t('cafe.cmp.source.notConnected')
  const esbAsOf = source?.connection === 'connected' && source.as_of ? wibInstant(source.as_of, locale) : notConnected
  const lastSync = source?.connection === 'connected' && source.synced_at ? wibInstant(source.synced_at, locale) : '–'
  const esbCoverage = source?.connection !== 'connected' ? notConnected
    : source.complete ? t('cafe.cmp.source.complete') : t('cafe.cmp.source.incomplete')
  return (
    <section className="scmp-source" aria-label={t('cafe.cmp.source.label')}>
      <dl className="scmp-source__list">
        <div><dt>{t('cafe.cmp.source.esbAsOf')}</dt><dd>{esbAsOf}</dd></div>
        <div><dt>{t('cafe.cmp.source.lastSync')}</dt><dd>{lastSync}</dd></div>
        <div><dt>{t('cafe.cmp.source.coverage')}</dt><dd>{esbCoverage}</dd></div>
        <div>
          <dt>{t('cafe.cmp.source.counts')}</dt>
          <dd>{loading ? '…' : t('cafe.cmp.source.counted', { counted: coverage.counted, total: coverage.total })}</dd>
        </div>
      </dl>
      <div className="scmp-source__actions">
        {!loading && coverage.counted === 0 && canOpenCount && <Link className="btn btn-outline btn-touch" to="/cafe/count">{t('cafe.cmp.source.openCount')}</Link>}
        <Button variant="ghost" onClick={onRefresh} disabled={refreshDisabled} aria-describedby={refreshReason ? 'scmp-refresh-reason' : undefined}>{t('records.refresh')}</Button>
        {refreshReason && <span id="scmp-refresh-reason" className="scmp-source__reason">{refreshReason}</span>}
      </div>
      {!loading && !countsComplete && countsOldest && (
        <p className="scmp-source__older">
          <span>{t('cafe.cmp.source.readBack', { date: formatDayMonthYear(countsOldest, locale) })}</span>
          <Button variant="outline" onClick={onReadOlder} disabled={readingOlder || refreshDisabled}>{readingOlder ? t('cafe.cmp.source.readingOlder') : t('cafe.cmp.source.readOlder')}</Button>
        </p>
      )}
    </section>
  )
}
