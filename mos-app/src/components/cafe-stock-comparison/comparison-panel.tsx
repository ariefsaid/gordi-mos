// The item panel of Stock comparison: both dated figures, the formula and the flags first, then the item's Count
// history (the existing Records Count read, newest first, with Submitted / Confirmed / Rejected), then MOS movements
// (a link to Records, operational context) and ESB movements (Not connected until their separate feed exists).
// Read-only. The shared record panel host owns the chrome, focus and the Escape / scrim behaviour.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { ListPaging } from '@/components/ui/list-paging'
import { Notice } from '@/components/ui/notice'
import { Pill, type PillTone } from '@/components/ui/pill'
import { useI18n } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { useT, type Translate } from '@/i18n/use-t'
import { formatDec, parseDecimal } from '@/lib/cafe-records/decimal'
import { rangeError } from '@/lib/cafe-records/period'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { listCafeRecordCounts, type RecordCursor } from '@/lib/db/cafe-records'
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'
import { formatDayMonthYear } from '@/lib/format/date'
import { formatPercent, formatSigned, type ComparisonRow } from '@/lib/cafe-stock-comparison'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { FlagPills, KindTag } from './comparison-cells'
import { missingReason, wibInstant } from './comparison-labels'
import './comparison-panel.css'

interface PanelStream { branchId: string; activity: ProductionActivity }

const STATUS_TONE: Record<HistoryLine['status'], PillTone> = { Confirmed: 'success', Submitted: 'primary', Rejected: 'destructive' }

function statusLabel(t: Translate, status: HistoryLine['status']): string {
  return status === 'Confirmed' ? t('cafe.cmp.status.Confirmed') : status === 'Submitted' ? t('cafe.cmp.status.Submitted') : t('cafe.cmp.status.Rejected')
}

type HistoryLine = { id: string; countDate: string; submittedAt: string; status: 'Submitted' | 'Confirmed' | 'Rejected'; quantity: bigint; unitName: string | null }
interface History { lines: HistoryLine[]; status: 'loading' | 'ready' | 'error'; hasMore: boolean; loadingMore: boolean; moreError: boolean }

/** The item's Counts between two dates, newest first, read through the existing Records Count read with keyset continuation. */
function useCountHistory(options: { row: ComparisonRow; stream: PanelStream | null; from: string; to: string }) {
  const { row, stream, from, to } = options
  const [history, setHistory] = useState<History>({ lines: [], status: 'loading', hasMore: false, loadingMore: false, moreError: false })
  const [attempt, setAttempt] = useState(0)
  const cursor = useRef<RecordCursor | null>(null)
  const generation = useRef(0)

  const toLines = useCallback((rows: Awaited<ReturnType<typeof listCafeRecordCounts>>['rows']): HistoryLine[] => rows
    .filter((count) => (count.item_unit_id ?? '') === row.unitId)
    .flatMap((count) => {
      const quantity = parseDecimal(count.recounted_quantity ?? count.counted_quantity)
      return quantity === null ? [] : [{ id: count.id, countDate: count.count_date, submittedAt: count.submitted_at, status: count.status, quantity, unitName: count.unit_name }]
    }), [row.unitId])

  useEffect(() => {
    const mine = ++generation.current
    cursor.current = null
    if (!stream) { setHistory({ lines: [], status: 'ready', hasMore: false, loadingMore: false, moreError: false }); return }
    setHistory({ lines: [], status: 'loading', hasMore: false, loadingMore: false, moreError: false })
    void listCafeRecordCounts({ from, to, stream, itemId: row.itemId, after: null }).then((page) => {
      if (mine !== generation.current) return
      cursor.current = page.next
      setHistory({ lines: toLines(page.rows), status: 'ready', hasMore: page.rows.length > 0, loadingMore: false, moreError: false })
    }).catch(() => {
      if (mine === generation.current) setHistory({ lines: [], status: 'error', hasMore: false, loadingMore: false, moreError: false })
    })
  }, [row, stream, from, to, attempt, toLines])

  const loadMore = useCallback(() => {
    if (!stream || !cursor.current) return
    const mine = generation.current
    setHistory((current) => ({ ...current, loadingMore: true, moreError: false }))
    void listCafeRecordCounts({ from, to, stream, itemId: row.itemId, after: cursor.current }).then((page) => {
      if (mine !== generation.current) return
      cursor.current = page.next
      setHistory((current) => ({ lines: [...current.lines, ...toLines(page.rows)], status: 'ready', hasMore: page.rows.length > 0, loadingMore: false, moreError: false }))
    }).catch(() => {
      if (mine === generation.current) setHistory((current) => ({ ...current, loadingMore: false, moreError: true }))
    })
  }, [stream, from, to, row.itemId, toLines])

  return { history, loadMore, retry: () => setAttempt((value) => value + 1) }
}

function RangeForm({ from, to, today, onApply }: { from: string; to: string; today: string; onApply: (from: string, to: string) => void }) {
  const t = useT()
  const [draft, setDraft] = useState({ from, to })
  const [invalid, setInvalid] = useState({ from: false, to: false })
  const [reveal, setReveal] = useState(false)
  useEffect(() => { setDraft({ from, to }) }, [from, to])
  const error = invalid.from || invalid.to ? 'invalid' : rangeError(draft.from, draft.to, today)
  const errorText = error === 'future' ? t('records.range.future') : error === 'order' ? t('records.range.order') : error === 'invalid' ? t('records.range.invalid') : null
  return (
    <form className="scmp-range" noValidate onSubmit={(event) => { event.preventDefault(); if (error) { setReveal(true); return } setReveal(false); onApply(draft.from, draft.to) }}>
      <DateField label={t('records.range.from')} value={draft.from} max={today} fullWidth onChange={(value) => { if (value) setDraft((current) => ({ ...current, from: value })) }}
        onValidityChange={(bad) => setInvalid((current) => current.from === bad ? current : { ...current, from: bad })} />
      <DateField label={t('records.range.to')} value={draft.to} max={today} fullWidth onChange={(value) => { if (value) setDraft((current) => ({ ...current, to: value })) }}
        onValidityChange={(bad) => setInvalid((current) => current.to === bad ? current : { ...current, to: bad })} />
      <Button type="submit" variant="outline" className="scmp-range__apply">{t('cafe.cmp.history.apply')}</Button>
      {reveal && errorText && <p className="scmp-range__error" role="alert">{errorText}</p>}
    </form>
  )
}

function Figure({ label, children, meta }: { label: string; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="scmp-figure">
      <dt>{label}</dt>
      <dd><span className="scmp-figure__value">{children}</span>{meta ? <span className="scmp-meta">{meta}</span> : null}</dd>
    </div>
  )
}

export interface ComparisonPanelProps {
  /** null = the link names an item this stream does not list. */
  row: ComparisonRow | null
  streamText: string
  stream: PanelStream | null
  today: string
  from: string
  to: string
  onRange: (from: string, to: string) => void
  onClose: () => void
  /** Count / Records links, only where the viewer is admitted. */
  canOpenCount: boolean
  countsUnavailable: boolean
}

export function ComparisonPanel({ row, streamText, stream, today, from, to, onRange, onClose, canOpenCount, countsUnavailable }: ComparisonPanelProps) {
  const t = useT()
  const { locale } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  const title = t('cafe.pageTitle.stockComparison')
  if (!row) {
    return (
      <RecordPanelHost label={t('cafe.cmp.panel.label')} title={title} closeLabel={t('record.close')} rootClassName="drawer-split--sticky scmp-panel" focusKey="missing" initialFocusRef={heading} onClose={onClose}>
        <div className="scmp-panel__body">
          <button type="button" className="scmp-panel__back" onClick={onClose}>{t('record.backToCollection', { collection: title })}</button>
          <h2 className="scmp-panel__title" ref={heading} tabIndex={-1}>{t('cafe.cmp.panel.notFound')}</h2>
          <p className="scmp-panel__note">{t('cafe.cmp.panel.notFoundBody')}</p>
        </div>
      </RecordPanelHost>
    )
  }
  return <ItemPanel row={row} streamText={streamText} stream={stream} today={today} from={from} to={to} onRange={onRange} onClose={onClose} canOpenCount={canOpenCount} countsUnavailable={countsUnavailable} locale={locale} />
}

function ItemPanel({ row, streamText, stream, today, from, to, onRange, onClose, canOpenCount, countsUnavailable, locale }: ComparisonPanelProps & { row: ComparisonRow; locale: Locale }) {
  const t = useT()
  const heading = useRef<HTMLHeadingElement>(null)
  const { history, loadMore, retry } = useCountHistory({ row, stream, from, to })
  const unit = row.unitName ?? t('cafe.cmp.noUnit')
  const title = t('cafe.pageTitle.stockComparison')
  const e = row.expected
  const c = row.count
  const mismatch = row.missing === 'unit_mismatch' && e !== null
  // Records filters by the item (its id is the Records item key); the range is the one chosen for the history.
  const recordsLink = stream
    ? `${recordsHref({ question: 'everything', reading: 'entries', from, to, stream, today })}&item=${encodeURIComponent(row.itemId)}`
    : null

  return (
    <RecordPanelHost
      label={t('cafe.cmp.panel.label')}
      title={title}
      closeLabel={t('record.close')}
      rootClassName="drawer-split--sticky scmp-panel"
      focusKey={`item:${row.key}`}
      initialFocusRef={heading}
      onClose={onClose}
    >
      <div className="scmp-panel__body">
        <button type="button" className="scmp-panel__back" onClick={onClose}>{t('record.backToCollection', { collection: title })}</button>
        <h2 className="scmp-panel__title" ref={heading} tabIndex={-1}>{row.itemName}</h2>
        <p className="scmp-panel__scope"><KindTag kind={row.kind} /> {t('cafe.cmp.panel.scope', { stream: streamText, unit })}{row.category ? ` · ${row.category}` : ''}</p>
        <p className="scmp-panel__flags">
          <FlagPills t={t} row={row} hide={countsUnavailable ? ['not_counted'] : []} />
        </p>

        <dl className="scmp-figures">
          <Figure label={t('cafe.cmp.panel.expected')}
            meta={e ? <>{t(e.basis === 'intraday' ? 'cafe.cmp.panel.basis.intraday' : 'cafe.cmp.panel.basis.end_of_day', { date: formatDayMonthYear(e.businessDate, locale) })}<br />{t('cafe.cmp.asOf', { time: wibInstant(e.asOf, locale) })}</> : undefined}>
            {e ? `${formatDec(e.quantity)} ${e.unitName}` : <>{t('cafe.cmp.panel.expectedNone')}<span className="scmp-meta"> {missingReason(t, row.missing === 'not_counted' ? null : row.missing)}</span></>}
          </Figure>
          <Figure label={t('cafe.cmp.panel.lastCount')}
            meta={c ? <>{t('cafe.cmp.panel.countedOn', { date: formatDayMonthYear(c.countDate, locale) })} · {c.status === 'Submitted' ? t('cafe.cmp.status.pending') : t('cafe.cmp.status.Confirmed')}<br />{t('cafe.cmp.panel.dateOnly')}</> : undefined}>
            {c ? `${formatDec(c.quantity)} ${c.unitName ?? unit}` : countsUnavailable ? t('cafe.cmp.countsError') : t('cafe.cmp.panel.countNone')}
          </Figure>
          <Figure label={t('cafe.cmp.panel.difference')} meta={row.percent !== null ? formatPercent(row.percent) : row.zeroExpected ? `– · ${t('cafe.cmp.flag.zero_expected')}` : undefined}>
            {row.difference !== null ? `${formatSigned(row.difference)} ${unit}` : t('cafe.cmp.panel.unavailable', { reason: missingReason(t, row.missing) || t('cafe.cmp.flag.not_counted') })}
          </Figure>
        </dl>

        {mismatch && c && e && (
          <Notice tone="attention">{t('cafe.cmp.panel.unitMismatch', { countUnit: c.unitName ?? unit, esbUnit: e.unitName })}</Notice>
        )}
        <p className="scmp-panel__note">
          {row.difference !== null && c && e ? <>{t('cafe.cmp.panel.worked', { count: formatDec(c.quantity), expected: formatDec(e.quantity), difference: formatSigned(row.difference), unit })}<br /></> : null}
          {t('cafe.cmp.panel.formula')}
        </p>
        <p className="scmp-panel__note">{t('cafe.cmp.panel.interpret')}</p>

        <section className="scmp-panel__section" aria-labelledby="scmp-history-title">
          <h3 id="scmp-history-title" className="scmp-panel__section-title">{t('cafe.cmp.history.title')}</h3>
          <p className="scmp-panel__note">{t('cafe.cmp.history.hint')}</p>
          <details className="scmp-range-details">
            <summary>{t('cafe.cmp.history.range', { from: formatDayMonthYear(from, locale), to: formatDayMonthYear(to, locale) })}</summary>
            <RangeForm from={from} to={to} today={today} onApply={onRange} />
          </details>
          {history.status === 'loading' && <p className="scmp-panel__note" role="status">{t('common.loading')}</p>}
          {history.status === 'error' && <Notice tone="urgent" action={<Button variant="outline" onClick={retry}>{t('common.retry')}</Button>}>{t('cafe.cmp.history.error')}</Notice>}
          {history.status === 'ready' && history.lines.length === 0 && <p className="scmp-panel__note">{t('cafe.cmp.history.empty')}</p>}
          {history.lines.length > 0 && (
            <ul className="scmp-history">
              {history.lines.map((line) => (
                <li key={line.id} className="scmp-history__row">
                  <span className="scmp-history__date">{formatDayMonthYear(line.countDate, locale)}</span>
                  <Pill tone={STATUS_TONE[line.status]}>{statusLabel(t, line.status)}</Pill>
                  <span className="scmp-qty scmp-history__qty">{formatDec(line.quantity)} {line.unitName ?? unit}</span>
                </li>
              ))}
            </ul>
          )}
          <ListPaging count={history.lines.length} hasMore={history.hasMore && history.status === 'ready'} loading={history.loadingMore} error={history.moreError} moreLabel={t('cafe.cmp.history.more')} onLoadMore={loadMore} />
        </section>

        <section className="scmp-panel__section" aria-labelledby="scmp-mos-title">
          <h3 id="scmp-mos-title" className="scmp-panel__section-title">{t('cafe.cmp.movements.mos.title')}</h3>
          <p className="scmp-panel__note">{t('cafe.cmp.movements.mos.body')}</p>
          {recordsLink && <Link className="scmp-panel__link" to={recordsLink}>{t('cafe.cmp.movements.mos.link')}</Link>}
          {canOpenCount && <Link className="scmp-panel__link" to="/cafe/count">{t('cafe.cmp.source.openCount')}</Link>}
        </section>

        <section className="scmp-panel__section" aria-labelledby="scmp-esb-title">
          <h3 id="scmp-esb-title" className="scmp-panel__section-title">{t('cafe.cmp.movements.esb.title')}</h3>
          <p className="scmp-panel__note">{t('cafe.cmp.movements.esb.body')}</p>
        </section>
      </div>
    </RecordPanelHost>
  )
}
