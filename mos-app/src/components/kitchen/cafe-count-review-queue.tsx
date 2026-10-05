import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { areCafeCountDecimalsEqual, calculateCafeCountVariance } from '@/lib/cafe-count-variance'
import { confirmCafeCountLine, listCafeCountLines, type CafeCountLine } from '@/lib/db/cafe-count'
import { wibToday } from '@/lib/db/cafe-opening'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { useIsOffline } from '@/shell/use-is-offline'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import './cafe-count-review-queue.css'

export function CafeCountReviewQueue({
  streamFilter,
  streamCatalog,
  canReviewAll,
  reviewableStreamKeys,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  canReviewAll: boolean
  reviewableStreamKeys: ReadonlySet<string>
}) {
  const t = useT()
  const countDate = useMemo(() => wibToday(), [])
  const [rows, setRows] = useState<CafeCountLine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const online = !useIsOffline()
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    void listCafeCountLines(countDate).then(nextRows => {
      if (!active) return
      setRows(nextRows)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [countDate, retry])

  const visibleRows = useMemo(() => rows.filter(line => {
    const key = streamKey(line.branch_id, line.activity)
    if (streamFilter !== ALL_STREAMS && key !== streamFilter) return false
    return canReviewAll || reviewableStreamKeys.has(key)
  }), [canReviewAll, reviewableStreamKeys, rows, streamFilter])

  async function confirm(line: CafeCountLine) {
    if (busyId || !online || line.status !== 'Submitted') return
    setBusyId(line.id)
    setActionError(false)
    try {
      const result = await confirmCafeCountLine(line.id, line.row_version)
      setRows(current => current.map(row => row.id === line.id ? {
        ...row,
        status: result.status,
        posting_status: result.posting_status,
        row_version: result.row_version,
        variance: result.variance,
      } : row))
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="cafe-count-review" aria-labelledby="cafe-count-review-title">
      <header className="cafe-count-review__header">
        <div>
          <h2 id="cafe-count-review-title">{t('cafe.count.review.title')}</h2>
          <p>{t('cafe.count.review.help')}</p>
        </div>
        <span className="cafe-count-review__date tabular">{countDate}</span>
      </header>

      {actionError && (
        <div className="cafe-count-review__error" role="alert">
          <span>{t('cafe.count.review.actionFailed')}</span>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {!online && <p className="cafe-count-review__offline" role="alert">{t('cafe.count.offline')}</p>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.count.review.title') })}
          onRetry={() => setRetry(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          variant="awaiting"
          title={t('cafe.count.review.empty.title')}
          copy={streamFilter === ALL_STREAMS
            ? t('cafe.count.review.empty.all')
            : t('cafe.count.review.empty.stream', {
              stream: streamLabel(t, streamCatalog.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null),
            })}
        >
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('cafe.count.review.refresh')}
          </button>
        </EmptyState>
      ) : (
        <ul className="cafe-count-review__list">
          {visibleRows.map(line => {
            const calculatedVariance = line.expected_status === 'ready' && line.expected_balance !== null
              ? calculateCafeCountVariance(line.counted_quantity, null, line.expected_balance)
              : null
            const varianceMatches = calculatedVariance !== null && line.variance !== null
              && areCafeCountDecimalsEqual(calculatedVariance, line.variance)
            const zeroVariance = varianceMatches && calculatedVariance === '0'
            const stream = streamCatalog.find(s => s.branch.id === line.branch_id && s.activity === line.activity) ?? null
            const submittedAt = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
            }).format(new Date(line.submitted_at))
            const expectedAt = line.expected_recorded_at
              ? new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
              }).format(new Date(line.expected_recorded_at))
              : null
            return (
              <li className="cafe-count-review__row" key={line.id}>
                <div className="cafe-count-review__identity">
                  <div className="cafe-count-review__name">{line.item_name}</div>
                  <div className="cafe-count-review__meta">
                    <span>{line.item_kind}</span>
                    {line.item_category && <span>{t('cafe.count.review.categoryTag', { category: line.item_category })}</span>}
                    {stream && <span>{t('cafe.count.review.streamTag', { stream: streamLabel(t, stream) })}</span>}
                    <span>{t('cafe.count.review.submittedAt', { time: submittedAt })}</span>
                  </div>
                </div>
                <dl className="cafe-count-review__facts">
                  <div>
                    <dt>{t('cafe.count.review.count')}</dt>
                    <dd>{formatCafeCountDecimal(line.counted_quantity, document.documentElement.lang || 'en')} <span>{line.unit_name}</span></dd>
                  </div>
                  <div>
                    <dt>{t('cafe.count.review.expected')}</dt>
                    <dd>{line.expected_status === 'ready' && line.expected_balance !== null && expectedAt
                      ? <>{formatCafeCountDecimal(line.expected_balance, document.documentElement.lang || 'en')} <span>{line.unit_name} · {t('cafe.count.review.asOf', { time: expectedAt })}</span></>
                      : t('cafe.count.review.expectedWaiting')}</dd>
                  </div>
                  <div>
                    <dt>{t('cafe.count.review.variance')}</dt>
                    <dd>{varianceMatches && calculatedVariance !== null
                      ? <>{formatCafeCountDecimal(calculatedVariance, document.documentElement.lang || 'en')} <span>{line.unit_name}</span></>
                      : t('cafe.count.review.varianceWaiting')}</dd>
                  </div>
                </dl>
                <div className="cafe-count-review__decision">
                  {line.status === 'Confirmed' ? (
                    <span className="cafe-count-review__state" role="status">
                      {t('cafe.count.review.confirmedNotNeeded')}
                    </span>
                  ) : line.expected_status !== 'ready' ? (
                    <span className="cafe-count-review__state" role="status">{t('cafe.count.review.expectedWaiting')}</span>
                  ) : !varianceMatches ? (
                    <span className="cafe-count-review__state" role="status">{t('cafe.count.review.varianceWaiting')}</span>
                  ) : zeroVariance ? (
                    <button
                      type="button"
                      className="btn btn-primary cafe-count-review__confirm"
                      disabled={!online || busyId !== null}
                      onClick={() => void confirm(line)}
                    >
                      {busyId === line.id ? t('common.working') : t('cafe.count.review.confirm')}
                    </button>
                  ) : (
                    <span className="cafe-count-review__state" role="status">{t('cafe.count.review.nonZero')}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function formatCafeCountDecimal(value: string, locale: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) return value
  const [, sign, whole, rawFraction = ''] = match
  const fraction = rawFraction.replace(/0+$/, '')
  const wholeValue = BigInt(`${sign}${whole}`)
  const formattedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(wholeValue)
  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.'
  return fraction ? `${formattedWhole}${decimalSeparator}${fraction}` : formattedWhole
}
