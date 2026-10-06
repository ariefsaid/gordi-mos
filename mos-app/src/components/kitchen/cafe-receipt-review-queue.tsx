import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { getPeople } from '@/lib/db/directory'
import {
  listCafeReceiptDifferences,
  listCafeReceipts,
  readCafeReceiptPosting,
  reviewCafeReceipt,
  summarizeCafeReceiptDifferences,
  type CafeReceipt,
  type CafeReceiptDifferenceSummary,
} from '@/lib/db/cafe-receipts'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { formatWeekdayDayMonth, formatWibShortDateTime } from '@/lib/format/date'
import { useIsOffline } from '@/shell/use-is-offline'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeReceiptState } from './cafe-receipt-state'
import { CafeReceiptLineRow } from './cafe-receipt-difference'
import { CafeReceiptRelease } from './cafe-receipt-release'
import { formatAge } from '@/components/tasks/task-formatters'
import { useI18n } from '@/i18n/I18nProvider'
import './cafe-count-review-queue.css'

/** Submitted receipts the server lets this viewer review (RLS scopes the read; the RPC decides). */
export function CafeReceiptReviewQueue({
  streamFilter,
  streamCatalog,
  viewerId,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  viewerId: string | null
}) {
  const t = useT()
  const { locale } = useI18n()
  const [rows, setRows] = useState<CafeReceipt[]>([])
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [differences, setDifferences] = useState<ReadonlyMap<string, CafeReceiptDifferenceSummary> | 'failed'>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [retry, setRetry] = useState(0)
  const [decided, setDecided] = useState(0)
  const [postingUnknown, setPostingUnknown] = useState<ReadonlySet<string>>(new Set())
  const online = !useIsOffline()

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    // Counted receipts that are not sent yet are listed too, with their age, so an unsent lock is
    // visible; only Submitted ones can be decided.
    void Promise.all([listCafeReceipts(['Submitted', 'Counted']), getPeople()]).then(([nextRows, people]) => {
      if (!active) return
      setRows(nextRows)
      setNames(new Map(people.map(person => [person.id, person.full_name])))
      setLoading(false)
      // FR-1012/1032: labels and the cache as-of time; a failed read says so rather than guessing why.
      void listCafeReceiptDifferences(nextRows.map(row => row.id))
        .then(found => new Map(nextRows.map(row =>
          [row.id, summarizeCafeReceiptDifferences(found.filter(line => line.receipt_id === row.id))])))
        .catch((): 'failed' => 'failed')
        .then(next => { if (active) setDifferences(next) })
    }).catch(() => {
      if (!active) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [retry])

  const visibleRows = useMemo(() => rows.filter(receipt =>
    streamFilter === ALL_STREAMS || streamKey(receipt.branch_id, receipt.activity) === streamFilter,
  ), [rows, streamFilter])

  async function decide(receipt: CafeReceipt, decision: 'approve' | 'reject') {
    if (busyId || !online) return
    setBusyId(receipt.id)
    setActionError(false)
    try {
      const result = await reviewCafeReceipt(receipt.id, decision, receipt.row_version, decision === 'reject' ? note : '')
      setRows(current => current.map(row => row.id === receipt.id
        ? { ...row, status: result.status, row_version: result.row_version, review_note: decision === 'reject' ? note.trim() : null }
        : row))
      setRejecting(null)
      setNote('')
      // FR-1042: approval matches and may enqueue at once, so the state is read back, not assumed.
      if (result.status === 'Approved') {
        const posting = await readCafeReceiptPosting(receipt.id).catch(() => undefined)
        if (posting === undefined) setPostingUnknown(current => new Set(current).add(receipt.id))
        else setRows(current => current.map(row => row.id === receipt.id ? { ...row, posting } : row))
        setDecided(value => value + 1)
      }
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="cafe-count-review" aria-labelledby="cafe-receipt-review-title">
      <header className="cafe-count-review__header">
        <p id="cafe-receipt-review-title">{t('cafe.receipts.review.help')}</p>
      </header>
      {actionError && (
        <div className="cafe-count-review__error" role="alert">
          <span>{t('cafe.receipts.review.actionFailed')}</span>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {!online && <p className="cafe-count-review__offline" role="alert">{t('cafe.receive.offline')}</p>}
      <CafeReceiptRelease online={online} refreshKey={decided} />
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.receipts.review.queueTitle') })}
          onRetry={() => setRetry(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : visibleRows.length === 0 ? (
        <EmptyState variant="awaiting" title={t('cafe.receipts.review.empty.title')} copy={t('cafe.receipts.review.empty.copy')}>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('cafe.count.review.refresh')}
          </button>
        </EmptyState>
      ) : (
        <ul className="cafe-count-review__list">
          {visibleRows.map(receipt => {
            const stream = streamCatalog.find(s => s.branch.id === receipt.branch_id && s.activity === receipt.activity) ?? null
            const ownReceipt = receipt.received_by === viewerId
            const noteId = `cafe-receipt-note-${receipt.id}`
            const difference = differences === 'failed' ? undefined : differences.get(receipt.id)
            return (
              <li className="cafe-count-review__row cafe-receipt-review__row" key={receipt.id}>
                <div className="cafe-count-review__identity">
                  <div className="cafe-count-review__name">
                    {t('cafe.receipts.review.receivedBy', { person: names.get(receipt.received_by) ?? t('cafe.receipts.review.unknownPerson') })}
                  </div>
                  <div className="cafe-count-review__meta">
                    <span>{t('cafe.receipts.review.arrival', { date: formatWeekdayDayMonth(receipt.arrival_date) })}</span>
                    {stream && <span>{t('cafe.count.review.streamTag', { stream: streamLabel(t, stream) })}</span>}
                    {receipt.delivery_note_number && <span>{t('cafe.receipts.review.deliveryNote', { number: receipt.delivery_note_number })}</span>}
                    {receipt.posting_status === 'held' && receipt.status !== 'Approved' && <span>{t('cafe.receipts.review.locationMissing')}</span>}
                    {differences === 'failed' && <span>{t('cafe.receipts.review.differenceFailed')}</span>}
                    {difference && !difference.known && <span>{t('cafe.receipts.review.differenceUnknown')}</span>}
                    {difference && (
                      <span>{!difference.asOf ? t('cafe.receipts.review.poNeverRead')
                        : t(difference.known ? 'cafe.receipts.review.poAsOf' : 'cafe.receipts.review.poTooOld',
                          { time: formatWibShortDateTime(difference.asOf) })}</span>
                    )}
                  </div>
                </div>
                <ul className="cafe-receipt-lines" aria-label={t('cafe.receipts.review.linesAria')}>
                  {receipt.lines.map(line => (
                    <CafeReceiptLineRow
                      key={line.id}
                      name={line.item_name}
                      quantity={line.received_quantity}
                      unit={line.unit_name}
                      withDifference
                      outcome={difference?.known ? difference.byUnit.get(line.item_unit_id) : undefined}
                    />
                  ))}
                </ul>
                <div className="cafe-count-review__decision cafe-receipt-review__decision">
                  {receipt.status === 'Counted' ? (
                    <span className="cafe-count-review__state">
                      {t('cafe.receipts.review.countedNotSent', { age: formatAge(receipt.received_at, new Date(), locale) })}
                    </span>
                  ) : receipt.status !== 'Submitted' ? (
                    <span className="cafe-count-review__state" role="status"><CafeReceiptState receipt={receipt} postingUnknown={postingUnknown.has(receipt.id)} /></span>
                  ) : rejecting === receipt.id ? (
                    <div className="cafe-receipt-review__reject">
                      <label htmlFor={noteId}>{t('cafe.receipts.review.rejectNote')}</label>
                      <textarea id={noteId} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
                      <div className="cafe-receipt-review__actions">
                        <button type="button" className="btn btn-outline" onClick={() => { setRejecting(null); setNote('') }}>
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!online || busyId !== null || note.trim() === ''}
                          onClick={() => void decide(receipt, 'reject')}
                        >
                          {busyId === receipt.id ? t('common.working') : t('cafe.receipts.review.confirmReject')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cafe-receipt-review__actions">
                      {ownReceipt && <span className="cafe-count-review__state">{t('cafe.receipts.review.ownReceipt')}</span>}
                      <button type="button" className="btn btn-outline" disabled={!online || busyId !== null} onClick={() => setRejecting(receipt.id)}>
                        {t('cafe.receipts.review.reject')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!online || busyId !== null || ownReceipt}
                        onClick={() => void decide(receipt, 'approve')}
                      >
                        {busyId === receipt.id ? t('common.working') : t('cafe.receipts.review.approve')}
                      </button>
                    </div>
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
