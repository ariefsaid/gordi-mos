import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { getPeople } from '@/lib/db/directory'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { useIsOffline } from '@/shell/use-is-offline'
import type { ProductionActivity, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import './cafe-count-review-queue.css'
import './cafe-receipt.css'
import './cafe-decision-queue.css'

/** The record shape a Café approve/reject queue needs; the server decides, this only offers. */
export type CafeDecisionRecord = {
  id: string
  branch_id: string
  activity: ProductionActivity
  status: string
  row_version: number
}

export type CafeDecisionCopy = {
  help: MessageKey
  actionFailed: MessageKey
  offline: MessageKey
  queueTitle: MessageKey
  emptyTitle: MessageKey
  emptyCopy: MessageKey
  linesAria: MessageKey
  rejectNote: MessageKey
  confirmReject: MessageKey
  ownRecord: MessageKey
  /** The owner's own reject is a withdrawal; it gets its own words. */
  withdraw: MessageKey
  withdrawNote: MessageKey
  confirmWithdraw: MessageKey
}

/**
 * A stream-filtered queue of records waiting for a decision: identity and meta, lines, then
 * Approve or a reject that needs a note. The record's owner sees why Approve is disabled; the
 * database refuses a self-approval regardless.
 */
export function CafeDecisionQueue<Row extends CafeDecisionRecord>({
  streamFilter,
  streamCatalog,
  viewerId,
  copy,
  load,
  decide,
  ownerOf,
  title,
  meta,
  detail,
  lines,
  state,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  viewerId: string | null
  copy: CafeDecisionCopy
  load: () => Promise<Row[]>
  decide: (row: Row, decision: 'approve' | 'reject', note: string) => Promise<{ status: Row['status']; row_version: number }>
  ownerOf: (row: Row) => string
  title: (row: Row, person: string) => string
  meta: (row: Row) => ReactNode[]
  /** Free text the decider must read (a note), shown at body size under the identity. */
  detail?: (row: Row) => ReactNode
  lines: (row: Row) => ReadonlyArray<{ id: string; name: string; quantity: string; unit: string }>
  state: (row: Row) => ReactNode
}) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [retry, setRetry] = useState(0)
  const online = !useIsOffline()
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // Opening a reject moves focus into its note, where the next keystroke belongs.
  useEffect(() => {
    if (rejecting) noteRef.current?.focus()
  }, [rejecting])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    setActionError(false)
    void Promise.all([load(), getPeople()]).then(([nextRows, people]) => {
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
  }, [load, retry])

  const visibleRows = useMemo(() => rows.filter(row =>
    streamFilter === ALL_STREAMS || streamKey(row.branch_id, row.activity) === streamFilter,
  ), [rows, streamFilter])

  async function handleDecision(row: Row, decision: 'approve' | 'reject') {
    if (busyId || !online) return
    setBusyId(row.id)
    setActionError(false)
    try {
      const result = await decide(row, decision, decision === 'reject' ? note : '')
      setRows(current => current.map(item => item.id === row.id
        ? { ...item, status: result.status, row_version: result.row_version }
        : item))
      setRejecting(null)
      setNote('')
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="cafe-count-review" aria-labelledby="cafe-decision-queue-help">
      <header className="cafe-count-review__header">
        <p id="cafe-decision-queue-help">{t(copy.help)}</p>
      </header>
      {actionError && (
        <div className="cafe-count-review__error" role="alert">
          <span>{t(copy.actionFailed)}</span>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {!online && <p className="cafe-count-review__offline" role="alert">{t(copy.offline)}</p>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t(copy.queueTitle) })}
          onRetry={() => setRetry(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : visibleRows.length === 0 ? (
        <EmptyState variant="awaiting" title={t(copy.emptyTitle)} copy={t(copy.emptyCopy)}>
          <button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>
            {t('cafe.count.review.refresh')}
          </button>
        </EmptyState>
      ) : (
        <ul className="cafe-count-review__list">
          {visibleRows.map(row => {
            const stream = streamCatalog.find(s => s.branch.id === row.branch_id && s.activity === row.activity) ?? null
            const owner = ownerOf(row)
            const ownRecord = owner === viewerId
            const noteId = `cafe-decision-note-${row.id}`
            return (
              <li className="cafe-count-review__row cafe-receipt-review__row" key={row.id}>
                <div className="cafe-count-review__identity">
                  <div className="cafe-count-review__name">
                    {title(row, names.get(owner) ?? t('cafe.receipts.review.unknownPerson'))}
                  </div>
                  <div className="cafe-count-review__meta cafe-decision-queue__meta">
                    {meta(row)}
                    {stream && <span>{t('cafe.count.review.streamTag', { stream: streamLabel(t, stream) })}</span>}
                  </div>
                  {detail?.(row)}
                </div>
                <ul className="cafe-receipt-lines" aria-label={t(copy.linesAria)}>
                  {lines(row).map(line => (
                    <li key={line.id}>
                      <span>{line.name}</span>
                      <span className="tabular">{t('cafe.receipts.quantityUnit', { quantity: line.quantity, unit: line.unit })}</span>
                    </li>
                  ))}
                </ul>
                <div className="cafe-count-review__decision cafe-receipt-review__decision">
                  {row.status !== 'Submitted' ? (
                    <span className="cafe-count-review__state" role="status">{state(row)}</span>
                  ) : rejecting === row.id ? (
                    <div className="cafe-receipt-review__reject">
                      <label htmlFor={noteId}>{t(ownRecord ? copy.withdrawNote : copy.rejectNote)}</label>
                      <textarea ref={noteRef} id={noteId} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
                      <div className="cafe-receipt-review__actions">
                        <button type="button" className="btn btn-outline" onClick={() => { setRejecting(null); setNote('') }}>
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-destructive"
                          disabled={!online || busyId !== null || note.trim() === ''}
                          onClick={() => void handleDecision(row, 'reject')}
                        >
                          {busyId === row.id ? t('common.working') : t(ownRecord ? copy.confirmWithdraw : copy.confirmReject)}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cafe-receipt-review__actions">
                      {ownRecord && <span className="cafe-count-review__state">{t(copy.ownRecord)}</span>}
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={!online || busyId !== null}
                        onClick={() => { setRejecting(row.id); setNote('') }}
                      >
                        {ownRecord ? t(copy.withdraw) : t('cafe.receipts.review.reject')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!online || busyId !== null || ownRecord}
                        onClick={() => void handleDecision(row, 'approve')}
                      >
                        {busyId === row.id ? t('common.working') : t('cafe.receipts.review.approve')}
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
