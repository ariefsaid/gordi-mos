import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { getPeople } from '@/lib/db/directory'
import {
  listCafePurchaseRequests,
  reviewCafePurchaseRequest,
  type CafePurchaseRequest,
} from '@/lib/db/cafe-purchase-requests'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useIsOffline } from '@/shell/use-is-offline'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeRequestState } from './cafe-request-state'
import './cafe-count-review-queue.css'
import './cafe-receipt.css'

/** Submitted requests the server lets this viewer review (RLS scopes the read; the RPC decides). */
export function CafeRequestReviewQueue({
  streamFilter,
  streamCatalog,
  viewerId,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  viewerId: string | null
}) {
  const t = useT()
  const [rows, setRows] = useState<CafePurchaseRequest[]>([])
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
    setActionError(false)
    void Promise.all([listCafePurchaseRequests(['Submitted']), getPeople()]).then(([nextRows, people]) => {
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

  const visibleRows = useMemo(() => rows.filter(request =>
    streamFilter === ALL_STREAMS || streamKey(request.branch_id, request.activity) === streamFilter,
  ), [rows, streamFilter])

  async function decide(request: CafePurchaseRequest, decision: 'approve' | 'reject') {
    if (busyId || !online) return
    setBusyId(request.id)
    setActionError(false)
    try {
      const result = await reviewCafePurchaseRequest(request.id, decision, request.row_version, decision === 'reject' ? note : '')
      setRows(current => current.map(row => row.id === request.id
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
    <section className="cafe-count-review" aria-labelledby="cafe-request-review-title">
      <header className="cafe-count-review__header">
        <p id="cafe-request-review-title">{t('cafe.request.review.help')}</p>
      </header>
      {actionError && (
        <div className="cafe-count-review__error" role="alert">
          <span>{t('cafe.request.review.actionFailed')}</span>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {!online && <p className="cafe-count-review__offline" role="alert">{t('cafe.request.offline')}</p>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.request.review.queueTitle') })}
          onRetry={() => setRetry(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : visibleRows.length === 0 ? (
        <EmptyState variant="awaiting" title={t('cafe.request.review.empty.title')} copy={t('cafe.request.review.empty.copy')}>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('cafe.count.review.refresh')}
          </button>
        </EmptyState>
      ) : (
        <ul className="cafe-count-review__list">
          {visibleRows.map(request => {
            const stream = streamCatalog.find(s => s.branch.id === request.branch_id && s.activity === request.activity) ?? null
            const ownRequest = request.requested_by === viewerId
            const noteId = `cafe-request-note-${request.id}`
            return (
              <li className="cafe-count-review__row cafe-receipt-review__row" key={request.id}>
                <div className="cafe-count-review__identity">
                  <div className="cafe-count-review__name">
                    {t('cafe.request.review.requestedBy', { person: names.get(request.requested_by) ?? t('cafe.receipts.review.unknownPerson') })}
                  </div>
                  <div className="cafe-count-review__meta">
                    <span>{t('cafe.request.review.neededBy', { date: formatWeekdayDayMonth(request.required_by) })}</span>
                    {stream && <span>{t('cafe.count.review.streamTag', { stream: streamLabel(t, stream) })}</span>}
                    {request.note && <span>{t('cafe.request.review.note', { note: request.note })}</span>}
                  </div>
                </div>
                <ul className="cafe-receipt-lines" aria-label={t('cafe.request.sent.linesAria')}>
                  {request.lines.map(line => (
                    <li key={line.id}>
                      <span>{line.item_name}</span>
                      <span className="tabular">{t('cafe.receipts.quantityUnit', { quantity: line.quantity, unit: line.unit_name })}</span>
                    </li>
                  ))}
                </ul>
                <div className="cafe-count-review__decision cafe-receipt-review__decision">
                  {request.status !== 'Submitted' ? (
                    <span className="cafe-count-review__state" role="status"><CafeRequestState request={request} /></span>
                  ) : rejecting === request.id ? (
                    <div className="cafe-receipt-review__reject">
                      <label htmlFor={noteId}>{t('cafe.request.review.rejectNote')}</label>
                      <textarea id={noteId} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
                      <div className="cafe-receipt-review__actions">
                        <button type="button" className="btn btn-outline" onClick={() => { setRejecting(null); setNote('') }}>
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!online || busyId !== null || note.trim() === ''}
                          onClick={() => void decide(request, 'reject')}
                        >
                          {busyId === request.id ? t('common.working') : t('cafe.request.review.confirmReject')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cafe-receipt-review__actions">
                      {ownRequest && <span className="cafe-count-review__state">{t('cafe.request.review.ownRequest')}</span>}
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={!online || busyId !== null}
                        onClick={() => { setRejecting(request.id); setNote('') }}
                      >
                        {t('cafe.receipts.review.reject')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!online || busyId !== null || ownRequest}
                        onClick={() => void decide(request, 'approve')}
                      >
                        {busyId === request.id ? t('common.working') : t('cafe.receipts.review.approve')}
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
