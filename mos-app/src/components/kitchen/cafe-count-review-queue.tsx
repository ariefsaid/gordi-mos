import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { useEffect, useMemo, useState } from 'react'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { areCafeCountDecimalsEqual, calculateCafeCountVariance } from '@/lib/cafe-count-variance'
import { confirmCafeCountLine, listCafeCountLines, type CafeCountLine } from '@/lib/db/cafe-count'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { useIsOffline } from '@/shell/use-is-offline'
import { useIsDesktop } from '@/shell/use-is-desktop'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeCloseReviewWorkspace } from '@/components/cafe/redesign/cafe-close-review-workspace'
import { Panel } from '@/components/cafe/redesign/worksheet'
import { Notice } from '@/components/ui/notice'
import './cafe-count-review-queue.css'

export function CafeCountReviewQueue({
  streamFilter,
  streamCatalog,
  canReviewAll,
  reviewableStreamKeys,
  refreshKey = 0,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  canReviewAll: boolean
  reviewableStreamKeys: ReadonlySet<string>
  refreshKey?: number
}) {
  const t = useT()
  const [rows, setRows] = useState<CafeCountLine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const online = !useIsOffline()
  const isDesktop = useIsDesktop()
  const [retry, setRetry] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    void listCafeCountLines().then(nextRows => {
      if (!active) return
      setRows(nextRows)
      setSelectedId(current => nextRows.some(row => row.id === current) ? current : nextRows[0]?.id ?? null)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, retry])

  const visibleRows = useMemo(() => rows.filter(line => {
    const key = streamKey(line.branch_id, line.activity)
    if (streamFilter !== ALL_STREAMS && key !== streamFilter) return false
    return canReviewAll || reviewableStreamKeys.has(key)
  }), [canReviewAll, reviewableStreamKeys, rows, streamFilter])
  const empty = !loading && !loadError && visibleRows.length === 0
  const selected = visibleRows.find(line => line.id === selectedId) ?? null
  useEffect(() => {
    if (selectedId && visibleRows.some(line => line.id === selectedId)) return
    setSelectedId(isDesktop ? visibleRows[0]?.id ?? null : null)
  }, [isDesktop, selectedId, visibleRows])

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
    <section
      className={`cafe-count-review${empty ? ' cafe-count-review--empty' : ''}`}
      aria-labelledby={empty ? undefined : 'cafe-count-review-title'}
      aria-label={empty ? t('cafe.count.review.title') : undefined}
    >
      {/* Empty: the shared empty state carries the heading, so the section keeps no second one (named by aria-label). */}
      {!empty && (
        <header className="cafe-count-review__header">
          <div>
            <h2 id="cafe-count-review-title">{t('cafe.count.review.title')}</h2>
            <p>{t('cafe.count.review.help')}</p>
          </div>
        </header>
      )}

      {actionError && (
        <Notice tone="urgent" action={<button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button>}>{t('cafe.count.review.actionFailed')}</Notice>
      )}
      {!online && <Notice tone="attention" role="alert">{t('cafe.count.offline')}</Notice>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.count.review.title') })}
          onRetry={() => setRetry(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : visibleRows.length === 0 ? (
        <CafeQueueEmpty title={t('cafe.count.review.title')}>
          {streamFilter === ALL_STREAMS
            ? t('cafe.count.review.empty.all')
            : t('cafe.count.review.empty.stream', {
              stream: streamLabel(t, streamCatalog.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null),
            })}
        </CafeQueueEmpty>
      ) : (
        <CafeCloseReviewWorkspace
          label={t('cafe.count.review.title')}
          selected={selected !== null}
          onBack={() => setSelectedId(null)}
          backLabel={t('cafe.count.review.back')}
          master={<ul className="cafe-count-review__list">{visibleRows.map(line => (
            <li key={line.id}>
              <button type="button" className="cafe-count-review__master-row" aria-pressed={line.id === selectedId} onClick={() => setSelectedId(line.id)}>
                <strong>{line.item_name}</strong><span>{formatWeekdayDayMonth(line.count_date)} · {t(countStateKey(line))}</span>
                <small>{formatCafeCountDecimal(line.counted_quantity, document.documentElement.lang || 'en')} {line.unit_name} · {streamLabel(t, streamCatalog.find(s => s.branch.id === line.branch_id && s.activity === line.activity) ?? null)}</small>
              </button>
            </li>
          ))}</ul>}
          detail={selected ? <CountReviewDetail line={selected} streamCatalog={streamCatalog} online={online} busy={busyId !== null} onConfirm={() => void confirm(selected)} busyId={busyId} /> : <p>{t('cafe.count.review.choose')}</p>}
        />
      )}
    </section>
  )
}

function CountReviewDetail({ line, streamCatalog, online, busy, onConfirm, busyId }: {
  line: CafeCountLine
  streamCatalog: readonly ProductionStream[]
  online: boolean
  busy: boolean
  onConfirm: () => void
  busyId: string | null
}) {
  const t = useT()
  const calculatedVariance = line.expected_status === 'ready' && line.expected_balance !== null
    ? calculateCafeCountVariance(line.counted_quantity, line.recounted_quantity, line.expected_balance) : null
  const varianceMatches = calculatedVariance !== null && line.variance !== null
    && areCafeCountDecimalsEqual(calculatedVariance, line.variance)
  const missing = countMissing(line)
  const stream = streamCatalog.find(s => s.branch.id === line.branch_id && s.activity === line.activity) ?? null
  const submittedAt = new Intl.DateTimeFormat(document.documentElement.lang || 'en', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(line.submitted_at))
  const expectedAt = line.expected_recorded_at
    ? new Intl.DateTimeFormat(document.documentElement.lang || 'en', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(line.expected_recorded_at)) : null
  const fact = (label: string, value: React.ReactNode) => <div><dt>{label}</dt><dd>{value}</dd></div>
  return <article className="cafe-count-review__detail">
    <h3>{line.item_name}</h3>
    <p className="cafe-count-review__meta">{formatWeekdayDayMonth(line.count_date)} · {line.item_kind}{line.item_category ? ` · ${line.item_category}` : ''} · {stream ? streamLabel(t, stream) : ''} · {t('cafe.count.review.submittedAt', { time: submittedAt })}</p>
    {!online && <Notice tone="attention" role="alert">{t('cafe.count.offline')}</Notice>}
    <Panel title={t('cafe.count.review.comparison')} open>
      <dl className="cafe-count-review__facts">
        {fact(t('cafe.count.review.firstCount'), <>{formatCafeCountDecimal(line.counted_quantity, document.documentElement.lang || 'en')} <span>{line.unit_name}</span></>)}
        {fact(t('cafe.count.review.recount'), line.recounted_quantity === null ? t('cafe.count.review.none') : <>{formatCafeCountDecimal(line.recounted_quantity, document.documentElement.lang || 'en')} <span>{line.unit_name}</span></>)}
        {fact(t('cafe.count.review.finalCount'), <>{formatCafeCountDecimal(line.recounted_quantity ?? line.counted_quantity, document.documentElement.lang || 'en')} <span>{line.unit_name}</span></>)}
        {fact(t('cafe.count.review.expected'), line.expected_status === 'ready' && line.expected_balance !== null && expectedAt ? <>{formatCafeCountDecimal(line.expected_balance, document.documentElement.lang || 'en')} <span>{line.unit_name} · {t('cafe.count.review.asOf', { time: expectedAt })}</span></> : t('cafe.count.review.expectedWaiting'))}
        {fact(t('cafe.count.review.variance'), varianceMatches && calculatedVariance !== null ? <>{formatCafeCountDecimal(calculatedVariance, document.documentElement.lang || 'en')} <span>{line.unit_name}</span></> : t('cafe.count.review.varianceWaiting'))}
        {fact(t('cafe.count.review.reason'), line.reason ?? t('cafe.count.review.none'))}
      </dl>
    </Panel>
    <div className="cafe-count-review__decision">
      {line.status === 'Confirmed' ? <span role="status">{t(countStateKey(line))}</span>
        : line.expected_status !== 'ready' ? <span role="status">{t('cafe.count.review.expectedWaiting')}</span>
        : !varianceMatches ? <span role="status">{t('cafe.count.review.varianceWaiting')}</span>
        : missing ? <span role="status">{t(missing === 'recount' ? 'cafe.count.review.missingRecount' : 'cafe.count.review.missingReason')}</span>
        : <button type="button" className="btn btn-primary" disabled={!online || busy} onClick={onConfirm}>{busyId === line.id ? t('common.working') : t('cafe.count.review.confirm')}</button>}
    </div>
  </article>
}

/** What a ready line still needs from the floor before it can be confirmed: none below any tolerance. */
function countMissing(line: CafeCountLine): 'recount' | 'reason' | null {
  if (line.expected_status !== 'ready' || line.expected_balance === null) return null
  if (!areCafeCountDecimalsEqual(line.counted_quantity, line.expected_balance) && line.recounted_quantity === null) return 'recount'
  if (line.variance !== null && !areCafeCountDecimalsEqual(line.variance, '0') && line.reason === null) return 'reason'
  return null
}

function countStateKey(line: CafeCountLine) {
  if (line.status === 'Confirmed') return line.posting_status === 'held' ? 'cafe.count.review.confirmedHeld' as const : 'cafe.count.review.confirmedNotNeeded' as const
  const missing = countMissing(line)
  return missing === 'recount' ? 'cafe.count.review.missingRecount' as const
    : missing === 'reason' ? 'cafe.count.review.missingReason' as const
    : 'cafe.count.review.submitted' as const
}

function formatCafeCountDecimal(value: string, locale: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) return value
  const [, sign, whole, rawFraction = ''] = match
  const fraction = rawFraction.replace(/0+$/, '')
  const wholeValue = BigInt(`${sign}${whole}`)
  const integerFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const formattedWhole = integerFormatter.format(wholeValue)
  const negativeZeroSign = sign === '-' && wholeValue === 0n
    ? integerFormatter.formatToParts(-1n).find(part => part.type === 'minusSign')?.value ?? '-'
    : ''
  const formattedInteger = `${negativeZeroSign}${formattedWhole}`
  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.'
  return fraction ? `${formattedInteger}${decimalSeparator}${fraction}` : formattedInteger
}
