import { useEffect, useMemo, useRef, useState } from 'react'
import { CafeReviewQueueStatus } from '@/components/kitchen/cafe-review-queue-status'
import { useT } from '@/i18n/use-t'
import { getPeople } from '@/lib/db/directory'
import {
  listCafeReceiptDifferences,
  listCafeReceipts,
  listCafeUnsentReceipts,
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
import { CafeReceiptLineEvidence } from './cafe-receipt-line-condition'
import { CafeReceiptRelease } from './cafe-receipt-release'
import { Worksheet, DecisionBar } from '@/components/cafe/redesign/worksheet'
import { formatAge } from '@/components/tasks/task-formatters'
import { useI18n } from '@/i18n/I18nProvider'
import { Notice } from '@/components/ui/notice'
import { Chevron } from '@/shell/icons'
import '@/components/ui/GroupHeader.css'
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
  const [evidence, setEvidence] = useState<{ id: string; receipt?: CafeReceipt } | null>(null)
  const [unsentMore, setUnsentMore] = useState(0)
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
  const [heldCount, setHeldCount] = useState<number | null>(null)
  const [postingUnknown, setPostingUnknown] = useState<ReadonlySet<string>>(new Set())
  const [decidedReceiptId, setDecidedReceiptId] = useState<string | null>(null)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null)
  const [returnRejectFocusId, setReturnRejectFocusId] = useState<string | null>(null)
  const decidedStatusRef = useRef<HTMLSpanElement>(null)
  const rejectTriggers = useRef(new Map<string, HTMLButtonElement>())
  const online = !useIsOffline()
  const unsentStream = streamFilter === ALL_STREAMS ? undefined : streamCatalog.find(stream =>
    streamKey(stream.branch.id, stream.activity) === streamFilter,
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    // Counted receipts that are not sent yet follow the decidable Submitted ones, oldest first with
    // their age, so an unsent lock is visible; only Submitted ones can be decided.
    void Promise.all([
      listCafeReceipts(['Submitted'], { photosFor: [] }), listCafeUnsentReceipts(unsentStream), getPeople(),
    ]).then(([submitted, unsent, people]) => {
      if (!active) return
      const nextRows = [...submitted, ...unsent.receipts]
      setRows(nextRows)
      setUnsentMore(unsent.more)
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
  }, [retry, unsentStream])

  const visibleRows = useMemo(() => rows.filter(receipt =>
    streamFilter === ALL_STREAMS || streamKey(receipt.branch_id, receipt.activity) === streamFilter,
  ), [rows, streamFilter])
  const submittedRows = visibleRows.filter(receipt => receipt.status === 'Submitted')
  const countedRows = visibleRows.filter(receipt => receipt.status === 'Counted')
  const selectedReceipt = visibleRows.find(receipt => receipt.id === selectedReceiptId)
    ?? submittedRows[0] ?? countedRows[0] ?? visibleRows[0]

  const evidenceId = selectedReceipt?.status === 'Submitted' ? selectedReceipt.id : null
  useEffect(() => {
    if (!evidenceId) return
    let active = true
    setEvidence(null)
    // Only the selected receipt signs photos; queue navigation never waits for storage.
    void listCafeReceipts(['Submitted'], { ids: [evidenceId], photosFor: ['Submitted'] })
      .then(receipts => { if (active) setEvidence({ id: evidenceId, receipt: receipts[0] }) })
      .catch(() => { if (active) setEvidence({ id: evidenceId }) })
    return () => { active = false }
  }, [evidenceId, retry])

  async function decide(receipt: CafeReceipt, decision: 'approve' | 'reject') {
    if (busyId || !online) return
    setBusyId(receipt.id)
    setActionError(false)
    try {
      const result = await reviewCafeReceipt(receipt.id, decision, receipt.row_version, decision === 'reject' ? note : '')
      setRows(current => current.map(row => row.id === receipt.id
        ? { ...row, status: result.status, row_version: result.row_version, review_note: decision === 'reject' ? note.trim() : null }
        : row))
      setDecidedReceiptId(receipt.id)
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

  useEffect(() => {
    if (decidedReceiptId) decidedStatusRef.current?.focus()
  }, [decidedReceiptId, rows])
  useEffect(() => {
    if (!returnRejectFocusId || rejecting) return
    rejectTriggers.current.get(returnRejectFocusId)?.focus()
    setReturnRejectFocusId(null)
  }, [rejecting, returnRejectFocusId])

  function closeReject(receiptId: string) {
    setReturnRejectFocusId(receiptId)
    setRejecting(null)
    setNote('')
  }

  return (
    <section className={`cafe-count-review${!loading && !loadError && visibleRows.length === 0 ? ' is-empty' : ''}`} aria-label={t('cafe.receipts.review.queueTitle')}>
      {visibleRows.length > 0 && <header className="cafe-count-review__header">
        <p id="cafe-receipt-review-title">{t('cafe.receipts.review.help')}</p>
      </header>}
      {actionError && (
        <Notice tone="urgent" action={<button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button>}>{t('cafe.receipts.review.actionFailed')}</Notice>
      )}
      {!online && <Notice tone="attention" role="alert">{t('cafe.receive.offline')}</Notice>}
      <details className="cafe-receipt-review__release">
        <summary className="group-header">
          <span className="group-header__title">
            <span className="group-header__toggle group-header__toggle--static">
              <Chevron className="group-header__chevron" />
              <span className="group-header__name">{t('cafe.receipts.review.heldReleaseTitle')}</span>
              {heldCount !== null && <span className="group-header__count tabular-nums">({heldCount})</span>}
            </span>
          </span>
        </summary>
        <p className="cafe-receipt-review__release-summary">{t('cafe.receipts.release.help')}</p>
        <CafeReceiptRelease online={online} refreshKey={decided} onCount={setHeldCount} />
      </details>
      <CafeReviewQueueStatus
        queueTitle={t('cafe.receipts.review.queueTitle')}
        emptyTitle={t('cafe.receipts.review.empty.title')}
        loading={loading}
        loadError={loadError}
        onRetry={() => setRetry(value => value + 1)}
        emptyContent={visibleRows.length === 0 ? t('cafe.receipts.review.empty.copy') : null}
        emptyAction={<button type="button" className="btn btn-outline btn-touch" onClick={() => setRetry(value => value + 1)}>{t('cafe.count.review.refresh')}</button>}
      />
      {!loadError && !loading && visibleRows.length > 0 && (
        <div className="cafe-receipt-review__workspace">
          <nav className="cafe-receipt-review__master" aria-label={t('cafe.receipts.review.queueTitle')}>
            <h2>{t('cafe.receipts.review.queueTitle')}</h2>
            <h3>{t('cafe.receipts.review.submittedSection')}</h3>
            {submittedRows.map(receipt => <button type="button" key={receipt.id}
              aria-current={(selectedReceipt?.id ?? submittedRows[0]?.id) === receipt.id ? 'true' : undefined}
              onClick={() => setSelectedReceiptId(receipt.id)}>
              <strong>{names.get(receipt.received_by) ?? t('cafe.receipts.review.unknownPerson')}</strong>
              <span>{formatWeekdayDayMonth(receipt.arrival_date)} · {receipt.lines.length} {t('cafe.receipts.review.linesShort')}</span>
              {receipt.received_by === viewerId && <span>{t('cafe.receipts.review.ownReceipt')}</span>}
            </button>)}
            <h3>{t('cafe.receipts.review.countedSection')}</h3>
            {countedRows.map(receipt => <button type="button" key={receipt.id}
              aria-current={selectedReceipt?.id === receipt.id ? 'true' : undefined}
              onClick={() => setSelectedReceiptId(receipt.id)}>
              <strong>{names.get(receipt.received_by) ?? t('cafe.receipts.review.unknownPerson')}</strong>
              <span>{t('cafe.receipts.review.countedNotSent', { age: formatAge(receipt.received_at, new Date(), locale) })}</span>
            </button>)}
            {unsentMore > 0 && <p>{t(unsentMore === 1 ? 'cafe.receipts.review.unsentMore.one' : 'cafe.receipts.review.unsentMore.other', { count: unsentMore })}</p>}
          </nav>
          <Worksheet label={t('cafe.receipts.review.workbench')} className="cafe-receipt-review__workbench">
            <h2>{t('cafe.receipts.review.workbench')}</h2>
            <ul className="cafe-count-review__list">
          {selectedReceipt ? [selectedReceipt].map(receipt => {
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
                    {(receipt.photosUnavailable || (evidence?.id === receipt.id
                      && (!evidence.receipt || evidence.receipt.photosUnavailable))) && <span>{t('cafe.receipts.photosUnavailable')}</span>}
                    {evidenceId === receipt.id && evidence?.id !== receipt.id && <span role="status">{t('cafe.receipts.photosLoading')}</span>}
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
                    >
                      <CafeReceiptLineEvidence line={{ ...line, photos: evidence?.id === receipt.id
                        ? evidence.receipt?.lines.find(found => found.id === line.id)?.photos ?? [] : line.photos }} />
                    </CafeReceiptLineRow>
                  ))}
                </ul>
                <DecisionBar className="cafe-count-review__decision cafe-receipt-review__decision">
                  {receipt.status === 'Counted' ? (
                    <span className="cafe-count-review__state">
                      {t('cafe.receipts.review.countedNotSent', { age: formatAge(receipt.received_at, new Date(), locale) })}
                    </span>
                  ) : receipt.status !== 'Submitted' ? (
                    <span
                      ref={receipt.id === decidedReceiptId ? decidedStatusRef : undefined}
                      className="cafe-count-review__state"
                      role="status"
                      tabIndex={receipt.id === decidedReceiptId ? -1 : undefined}
                    ><CafeReceiptState receipt={receipt} postingUnknown={postingUnknown.has(receipt.id)} /></span>
                  ) : rejecting === receipt.id ? (
                    <div className="cafe-receipt-review__reject" onKeyDown={event => {
                      if (event.key === 'Escape' && busyId === null) {
                        event.stopPropagation()
                        closeReject(receipt.id)
                      }
                    }}>
                      {ownReceipt && <span className="cafe-count-review__state">{t('cafe.receipts.review.ownReceipt')}</span>}
                      <label htmlFor={noteId}>{t('cafe.receipts.review.rejectNote')}</label>
                      <textarea id={noteId} autoFocus value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
                      <div className="cafe-receipt-review__actions">
                        <button type="button" className="btn btn-outline" onClick={() => closeReject(receipt.id)}>
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
                      <button
                        ref={node => {
                          if (node) rejectTriggers.current.set(receipt.id, node)
                          else rejectTriggers.current.delete(receipt.id)
                        }}
                        type="button"
                        className="btn btn-outline"
                        disabled={!online || busyId !== null}
                        onClick={() => setRejecting(receipt.id)}
                      >
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
                </DecisionBar>
              </li>
            )
          }) : null}
            </ul>
          </Worksheet>
        </div>
      )}
    </section>
  )
}
