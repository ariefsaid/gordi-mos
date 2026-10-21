import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCafeReviewQueueState } from '@/components/kitchen/use-cafe-review-queue-state'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { getPeople } from '@/lib/db/directory'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import type { ProductionActivity, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import { Notice } from '@/components/ui/notice'
import './cafe-count-review-queue.css'
import './cafe-receipt.css'
import './cafe-decision-queue.css'

export type CafeDecisionRecord = { id: string; branch_id: string; activity: ProductionActivity; status: string; row_version: number }
export type CafeDecisionCopy = {
  help: MessageKey; actionFailed: MessageKey; offline: MessageKey; queueTitle: MessageKey; emptyTitle: MessageKey; emptyCopy: MessageKey
  linesAria: MessageKey; rejectNote: MessageKey; confirmReject: MessageKey; ownRecord: MessageKey; withdraw: MessageKey
  withdrawNote: MessageKey; confirmWithdraw: MessageKey
}

/** A compact request master paired with the selected request's full decision workbench. */
export function CafeDecisionQueue<Row extends CafeDecisionRecord>({
  streamFilter, streamCatalog, viewerId, copy, load, decide, ownerOf, title, meta, detail, lines, state, groupLabel,
}: {
  streamFilter: string; streamCatalog: readonly ProductionStream[]; viewerId: string | null; copy: CafeDecisionCopy
  load: () => Promise<Row[]>; decide: (row: Row, decision: 'approve' | 'reject', note: string) => Promise<Pick<Row, 'status' | 'row_version'> & Partial<Row>>
  ownerOf: (row: Row) => string; title: (row: Row, person: string) => string; meta: (row: Row) => ReactNode[]
  detail?: (row: Row) => ReactNode; lines: (row: Row) => ReadonlyArray<{ id: string; name: string; quantity: string; unit: string }>
  state: (row: Row) => ReactNode; groupLabel?: (row: Row) => string
}) {
  const t = useT()
  const desktop = useIsDesktop()
  const {
    rows,
    setRows,
    loading,
    setLoading,
    loadError,
    setLoadError,
    actionError,
    setActionError,
    busyId,
    setBusyId,
    retry,
    setRetry,
  } = useCafeReviewQueueState<Row>()
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const online = !useIsOffline()
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const workbenchTitleRef = useRef<HTMLHeadingElement>(null)
  const masterButtons = useRef(new Map<string, HTMLButtonElement>())
  const openedByUser = useRef(false)

  useEffect(() => { if (rejecting) noteRef.current?.focus() }, [rejecting])
  useEffect(() => {
    let active = true
    setLoading(true); setLoadError(false); setActionError(false)
    void Promise.all([load(), getPeople()]).then(([nextRows, people]) => {
      if (!active) return
      setRows(nextRows)
      setNames(new Map(people.map(person => [person.id, person.full_name])))
      setSelectedId(current => !desktop ? null : current && nextRows.some(row => row.id === current) ? current : nextRows[0]?.id ?? null)
      setLoading(false)
    }).catch(() => { if (active) { setLoadError(true); setLoading(false) } })
    return () => { active = false }
  }, [desktop, load, retry, setActionError, setLoadError, setLoading, setRows])

  const visibleRows = useMemo(() => rows.filter(row => streamFilter === ALL_STREAMS || streamKey(row.branch_id, row.activity) === streamFilter), [rows, streamFilter])
  const selected = visibleRows.find(row => row.id === selectedId) ?? null
  useEffect(() => {
    if (!desktop && selectedId && openedByUser.current) {
      workbenchTitleRef.current?.focus()
      openedByUser.current = false
    }
  }, [desktop, selectedId])
  const groups = useMemo(() => {
    if (!groupLabel) return [{ label: '', rows: visibleRows }]
    const map = new Map<string, Row[]>()
    for (const row of visibleRows) { const label = groupLabel(row); map.set(label, [...(map.get(label) ?? []), row]) }
    return [...map].map(([label, grouped]) => ({ label, rows: grouped }))
  }, [groupLabel, visibleRows])

  async function handleDecision(row: Row, decision: 'approve' | 'reject') {
    if (busyId || !online) return
    setBusyId(row.id); setActionError(false)
    try {
      const result = await decide(row, decision, decision === 'reject' ? note : '')
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...result } : item))
      setRejecting(null); setNote('')
    } catch { setActionError(true) } finally { setBusyId(null) }
  }

  const recordTitle = (row: Row) => title(row, names.get(ownerOf(row)) ?? t('cafe.receipts.review.unknownPerson'))
  const streamFor = (row: Row) => streamCatalog.find(s => s.branch.id === row.branch_id && s.activity === row.activity) ?? null
  const open = (row: Row) => { if (rejecting && rejecting !== row.id) return; openedByUser.current = true; setSelectedId(row.id) }
  const backToMaster = () => {
    const id = selectedId
    setSelectedId(null)
    if (id) requestAnimationFrame(() => masterButtons.current.get(id)?.focus())
  }

  return (
    <section className={`cafe-count-review cafe-decision-workspace${!loading && !loadError && visibleRows.length === 0 ? ' is-empty' : ''}`} aria-label={t(copy.queueTitle)}>
      {visibleRows.length > 0 && <header className="cafe-count-review__header"><p id="cafe-decision-queue-help">{t(copy.help)}</p></header>}
      {actionError && <Notice tone="urgent" action={<button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button>}>{t(copy.actionFailed)}</Notice>}
      {!online && <Notice tone="attention" role="alert">{t(copy.offline)}</Notice>}
      {loadError ? <ErrorState message={t('common.loadFailed', { what: t(copy.queueTitle) })} onRetry={() => setRetry(value => value + 1)} retryLabel={t('common.retry')} />
        : loading ? <LoadingShell count={2} />
        : visibleRows.length === 0 ? <CafeQueueEmpty title={t(copy.emptyTitle)} action={<button type="button" className="btn btn-outline btn-touch" onClick={() => setRetry(value => value + 1)}>{t('cafe.count.review.refresh')}</button>}>{t(copy.emptyCopy)}</CafeQueueEmpty>
        : <div className="cafe-decision-workspace__layout">
          <nav className={`cafe-decision-master${selected ? ' has-selection' : ''}`} aria-label={t('cafe.request.review.masterAria')}>
            {groups.map(group => <section className="cafe-decision-master__group" key={group.label || 'all'}>
              {group.label && <h2>{group.label}</h2>}
              <ul>{group.rows.map(row => {
                const owner = ownerOf(row), own = owner === viewerId, stream = streamFor(row), chosen = selectedId === row.id
                return <li key={row.id}>
                  <button ref={element => { if (element) masterButtons.current.set(row.id, element); else masterButtons.current.delete(row.id) }} type="button" className={`cafe-decision-master__item${chosen ? ' is-selected' : ''}`} aria-current={chosen ? 'true' : undefined} onClick={() => open(row)}>
                    <span className="cafe-decision-master__title">{recordTitle(row)}</span>
                    <span className="cafe-decision-master__facts">{meta(row)}<span>{t('cafe.request.review.lineCount', { count: lines(row).length })}</span>{stream && <span>{t('cafe.count.review.streamTag', { stream: streamLabel(t, stream) })}</span>}</span>
                    {own && <span className="cafe-decision-master__own">{t(copy.ownRecord)}</span>}
                    {row.status !== 'Submitted' && <span className="cafe-decision-master__state">{state(row)}</span>}
                  </button>
                </li>
              })}</ul>
            </section>)}
          </nav>
          {selected && (() => {
            const owner = ownerOf(selected), own = owner === viewerId, selectedLines = lines(selected), isRejecting = rejecting === selected.id
            const noteId = `cafe-decision-note-${selected.id}`
            return <article className="cafe-decision-workbench" aria-labelledby="cafe-request-workbench-title">
              <button type="button" className="cafe-decision-workbench__back btn btn-outline" onClick={backToMaster}>{t('cafe.request.review.backToRequests')}</button>
              <h2 id="cafe-request-workbench-title" ref={workbenchTitleRef} tabIndex={-1}>{recordTitle(selected)}</h2>
              <div className="cafe-decision-workbench__meta">{meta(selected)}{streamFor(selected) && <span>{t('cafe.count.review.streamTag', { stream: streamLabel(t, streamFor(selected)!) })}</span>}</div>
              {detail?.(selected)}
              <section className="cafe-decision-workbench__items" aria-label={t(copy.linesAria)}>
                <h3>{t('cafe.request.review.items')}</h3>
                <div className="cafe-decision-workbench__columns" aria-hidden="true"><span>{t('cafe.request.review.itemColumn')}</span><span>{t('cafe.request.review.quantityColumn')}</span></div>
                <ul className="cafe-receipt-lines">{selectedLines.map(line => <li key={line.id}><span>{line.name}</span><span className="tabular">{t('cafe.receipts.quantityUnit', { quantity: line.quantity, unit: line.unit })}</span></li>)}</ul>
              </section>
              {selected.status !== 'Submitted' ? <p className="cafe-decision-workbench__result" role="status">{state(selected)}</p> : <>
                {own && <p className="cafe-decision-workbench__own">{t(copy.ownRecord)} · {t('cafe.request.review.withdrawRule')}</p>}
                {isRejecting && <div className="cafe-decision-workbench__note">
                  <label htmlFor={noteId}>{t(own ? copy.withdrawNote : copy.rejectNote)}</label>
                  <textarea ref={noteRef} id={noteId} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
                  <p>{t('cafe.request.review.noteRequired')}</p>
                  <div className="cafe-decision-workbench__actions"><button type="button" className="btn btn-outline" onClick={() => { setRejecting(null); setNote('') }}>{t('common.cancel')}</button><button type="button" className="btn btn-destructive" disabled={!online || busyId !== null || note.trim() === ''} onClick={() => void handleDecision(selected, 'reject')}>{busyId === selected.id ? t('common.working') : t(own ? copy.confirmWithdraw : copy.confirmReject)}</button></div>
                </div>}
                <div className="cafe-decision-workbench__bar">
                  <div>{own && <span className="cafe-decision-workbench__own">{t(copy.ownRecord)}</span>}</div>
                  {!isRejecting && <div className="cafe-decision-workbench__actions"><button type="button" className="btn btn-outline" disabled={!online || busyId !== null} onClick={() => { setRejecting(selected.id); setNote('') }}>{own ? t(copy.withdraw) : t('cafe.receipts.review.reject')}</button><button type="button" className="btn btn-primary" disabled={!online || busyId !== null || own} onClick={() => void handleDecision(selected, 'approve')}>{busyId === selected.id ? t('common.working') : t('cafe.receipts.review.approve')}</button></div>}
                </div>
              </>}
            </article>
          })()}
        </div>}
    </section>
  )
}
