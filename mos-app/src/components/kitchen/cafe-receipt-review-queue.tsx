import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { getPeople } from '@/lib/db/directory'
import { listCafeReceipts, reviewCafeReceipt, type CafeReceipt } from '@/lib/db/cafe-receipts'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useIsOffline } from '@/shell/use-is-offline'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeReceiptState } from './cafe-receipt-state'
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
  const [rows, setRows] = useState<CafeReceipt[]>([])
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [retry, setRetry] = useState(0)
  const online = !useIsOffline()

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    void Promise.all([listCafeReceipts(['Submitted']), getPeople()]).then(([nextRows, people]) => {
      if (!active) return
      setRows(nextRows)
      setNames(new Map(people.map(person => [person.id, person.full_name])))
      setLoading(false)
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
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="cafe-count-review" aria-labelledby="cafe-receipt-review-title">
      <header className="cafe-count-review__header">
        <div>
          <h2 id="cafe-receipt-review-title">{t('cafe.receipts.review.queueTitle')}</h2>
          <p>{t('cafe.receipts.review.help')}</p>
        </div>
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
                    {receipt.posting_status === 'held' && <span>{t('cafe.receipts.review.locationMissing')}</span>}
                  </div>
                </div>
                <ul className="cafe-receipt-lines" aria-label={t('cafe.receipts.review.linesAria')}>
                  {receipt.lines.map(line => (
                    <li key={line.id}>
                      <span>{line.item_name}</span>
                      <span className="tabular">{line.received_quantity} {line.unit_name}</span>
                    </li>
                  ))}
                </ul>
                <div className="cafe-count-review__decision cafe-receipt-review__decision">
                  {receipt.status !== 'Submitted' ? (
                    <span className="cafe-count-review__state" role="status"><CafeReceiptState receipt={receipt} /></span>
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
