import { useEffect, useId, useMemo, useState } from 'react'
import { CafeReviewQueueStatus } from '@/components/kitchen/cafe-review-queue-status'
import { CafeCountPostingPanel } from '@/components/kitchen/cafe-count-posting-panel'
import { useCafeReviewQueueState } from '@/components/kitchen/use-cafe-review-queue-state'
import { useT } from '@/i18n/use-t'
import { areCafeCountDecimalsEqual, calculateCafeCountVariance } from '@/lib/cafe-count-variance'
import {
  confirmCafeCountLine,
  confirmCafeCountLines,
  listCafeCountLines,
  listCafeCountNotCounted,
  rejectCafeCountLine,
  type CafeCountableItem,
  type CafeCountLine,
} from '@/lib/db/cafe-count'
import { getPeople } from '@/lib/db/directory'
import { wibToday } from '@/lib/db/cafe-opening'
import { Checkbox } from '@/components/ui/checkbox'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import { useIsOffline } from '@/shell/use-is-offline'
import { useIsDesktop } from '@/shell/use-is-desktop'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeCloseReviewWorkspace } from '@/components/cafe/redesign/cafe-close-review-workspace'
import { Panel } from '@/components/cafe/redesign/worksheet'
import { Notice } from '@/components/ui/notice'
import './cafe-capture-layout.css'
import './cafe-count-review-queue.css'
import './cafe-decision-queue.css'

export function CafeCountReviewQueue({
  streamFilter,
  streamCatalog,
  canReviewAll,
  reviewableStreamKeys,
  viewerId = null,
  refreshKey = 0,
  canManagePosting = false,
  canReleasePosting = false,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  canReviewAll: boolean
  reviewableStreamKeys: ReadonlySet<string>
  /** The reviewer; a line they counted or recounted is never theirs to confirm. */
  viewerId?: string | null
  refreshKey?: number
  canManagePosting?: boolean
  canReleasePosting?: boolean
}) {
  const t = useT()
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
  } = useCafeReviewQueueState<CafeCountLine>()
  const online = !useIsOffline()
  const isDesktop = useIsDesktop()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [bulkRefused, setBulkRefused] = useState(0)
  const [postingRefreshKey, setPostingRefreshKey] = useState(0)
  const [notCounted, setNotCounted] = useState<CafeCountableItem[] | null>(null)
  const today = useMemo(() => wibToday(), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    void Promise.all([listCafeCountLines(), getPeople().catch(() => [])]).then(([nextRows, people]) => {
      if (!active) return
      setRows(nextRows)
      setNames(new Map(people.map(person => [person.id, person.full_name])))
      setChosen(new Set())
      setSelectedId(current => nextRows.some(row => row.id === current) ? current : nextRows[0]?.id ?? null)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, retry, setLoadError, setLoading, setRows])

  // Lines that differ (or still owe the floor something) come first; the rest keep oldest-first order.
  const visibleRows = useMemo(() => rows.filter(line => {
    const key = streamKey(line.branch_id, line.activity)
    if (streamFilter !== ALL_STREAMS && key !== streamFilter) return false
    return canReviewAll || reviewableStreamKeys.has(key)
  }).map((line, index) => ({ line, index }))
    .sort((a, b) => Number(!differs(a.line)) - Number(!differs(b.line)) || a.index - b.index)
    .map(({ line }) => line), [canReviewAll, reviewableStreamKeys, rows, streamFilter])
  const filteredStream = streamFilter === ALL_STREAMS ? null
    : streamCatalog.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null
  useEffect(() => {
    let active = true
    setNotCounted(null)
    if (!filteredStream) return () => { active = false }
    void listCafeCountNotCounted(filteredStream, today).then(items => { if (active) setNotCounted(items) }).catch(() => undefined)
    return () => { active = false }
  }, [filteredStream, today, refreshKey, retry])
  const own = (line: CafeCountLine) => viewerId !== null && (line.submitted_by === viewerId || line.recounted_by === viewerId)
  const confirmable = (line: CafeCountLine) => line.status === 'Submitted' && readyToConfirm(line) && !own(line)
  const zeroGroups = (() => {
    const groups = new Map<string, { label: string; lines: CafeCountLine[] }>()
    for (const line of visibleRows) {
      if (!confirmable(line) || differs(line)) continue
      const key = `${streamKey(line.branch_id, line.activity)}|${line.count_date}`
      const stream = streamCatalog.find(s => s.branch.id === line.branch_id && s.activity === line.activity) ?? null
      const group = groups.get(key) ?? { label: `${streamLabel(t, stream)} · ${formatWeekdayDayMonth(line.count_date)}`, lines: [] }
      group.lines.push(line)
      groups.set(key, group)
    }
    return [...groups.values()]
  })()
  const chosenLines = visibleRows.filter(line => chosen.has(line.id) && confirmable(line))
  const empty = !loading && !loadError && visibleRows.length === 0
  const selected = visibleRows.find(line => line.id === selectedId) ?? null
  useEffect(() => {
    if (selectedId && visibleRows.some(line => line.id === selectedId)) return
    setSelectedId(isDesktop ? visibleRows[0]?.id ?? null : null)
  }, [isDesktop, selectedId, visibleRows])

  async function confirmMany(lines: readonly CafeCountLine[]) {
    if (busyId || !online || lines.length === 0) return
    setBusyId('bulk')
    setActionError(false)
    setBulkRefused(0)
    try {
      const outcomes = await confirmCafeCountLines(lines)
      const confirmed = new Map(outcomes.flatMap(outcome => outcome.outcome === 'confirmed' ? [[outcome.line_id, outcome] as const] : []))
      setRows(current => current.map(row => {
        const outcome = confirmed.get(row.id)
        return outcome ? { ...row, status: 'Confirmed', posting_status: outcome.posting_status, row_version: outcome.row_version } : row
      }))
      if (confirmed.size > 0) setPostingRefreshKey(value => value + 1)
      setBulkRefused(outcomes.length - confirmed.size)
      setChosen(new Set())
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  async function reject(line: CafeCountLine, note: string) {
    if (busyId || !online || line.status !== 'Submitted') return
    setBusyId(line.id)
    setActionError(false)
    try {
      const result = await rejectCafeCountLine(line.id, line.row_version, note)
      setRows(current => current.map(row => row.id === line.id ? { ...row, status: 'Rejected', review_note: note.trim(), row_version: result.row_version } : row))
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

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
      setPostingRefreshKey(value => value + 1)
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      className={`cafe-review-card cafe-count-review${empty ? ' cafe-count-review--empty' : ''}`}
      aria-labelledby={empty ? undefined : 'cafe-count-review-title'}
      aria-label={empty ? t('cafe.count.review.title') : undefined}
    >
      <CafeCountPostingPanel streamFilter={streamFilter} streamCatalog={streamCatalog}
        canManagePosting={canManagePosting} canReleasePosting={canReleasePosting} refreshKey={refreshKey + postingRefreshKey} />
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
      {bulkRefused > 0 && <Notice tone="attention" role="alert" action={<button type="button" className="btn btn-outline" onClick={() => setRetry(value => value + 1)}>{t('cafe.count.review.refresh')}</button>}>{t('cafe.count.review.bulkRefused', { count: bulkRefused })}</Notice>}
      {notCounted && <Panel title={t('cafe.count.review.notCounted', { count: notCounted.length })} className="cafe-count-review__not-counted">
        {notCounted.length === 0 ? <p>{t('cafe.count.review.notCountedNone')}</p>
          : <ul>{notCounted.map(item => <li key={item.id}>{item.name} <span>{item.unitName}</span></li>)}</ul>}
      </Panel>}
      {(zeroGroups.length > 0 || chosenLines.length > 0) && !loading && (
        <div className="cafe-count-review__bulk" role="group" aria-label={t('cafe.count.review.bulkAria')}>
          {zeroGroups.map(group => <button key={group.label} type="button" className="btn btn-outline btn-touch" disabled={!online || busyId !== null}
            onClick={() => void confirmMany(group.lines)}>{t('cafe.count.review.confirmZero', { count: group.lines.length, group: group.label })}</button>)}
          {chosenLines.length > 0 && <button type="button" className="btn btn-primary btn-touch" disabled={!online || busyId !== null}
            onClick={() => void confirmMany(chosenLines)}>{busyId === 'bulk' ? t('common.working') : t('cafe.count.review.confirmSelected', { count: chosenLines.length })}</button>}
        </div>
      )}
      <CafeReviewQueueStatus
        queueTitle={t('cafe.count.review.title')}
        loading={loading}
        loadError={loadError}
        onRetry={() => setRetry(value => value + 1)}
        emptyContent={visibleRows.length === 0
          ? streamFilter === ALL_STREAMS
            ? t('cafe.count.review.empty.all')
            : t('cafe.count.review.empty.stream', {
              stream: streamLabel(t, streamCatalog.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null),
            })
          : null}
      />
      {!loadError && !loading && visibleRows.length > 0 && (
        <CafeCloseReviewWorkspace
          label={t('cafe.count.review.title')}
          selected={selected !== null}
          onBack={() => setSelectedId(null)}
          backLabel={t('cafe.count.review.back')}
          master={<ul className="cafe-count-review__list">{visibleRows.map(line => (
            <li key={line.id} className={confirmable(line) ? 'cafe-count-review__choosable' : undefined}>
              {confirmable(line) && <span className="cafe-count-review__choose"><Checkbox
                checked={chosen.has(line.id)}
                aria-label={t('cafe.count.review.select', { item: line.item_name })}
                onChange={next => setChosen(current => {
                  const updated = new Set(current)
                  if (next) updated.add(line.id); else updated.delete(line.id)
                  return updated
                })}
              /></span>}
              <button type="button" className="cafe-count-review__master-row" aria-pressed={line.id === selectedId} onClick={() => setSelectedId(line.id)}>
                <strong>{line.item_name}</strong><span>{formatWeekdayDayMonth(line.count_date)} · {t(countStateKey(line))}</span>
                <small>{formatCafeCountDecimal(line.recounted_quantity ?? line.counted_quantity, document.documentElement.lang || 'en')} {line.unit_name} · {streamLabel(t, streamCatalog.find(s => s.branch.id === line.branch_id && s.activity === line.activity) ?? null)}</small>
              </button>
            </li>
          ))}</ul>}
          detail={selected ? <CountReviewDetail key={selected.id} line={selected} streamCatalog={streamCatalog} online={online} busy={busyId !== null}
            own={own(selected)} names={names} onConfirm={() => void confirm(selected)} onReject={note => void reject(selected, note)} busyId={busyId} /> : <p>{t('cafe.count.review.choose')}</p>}
        />
      )}
    </section>
  )
}

function CountReviewDetail({ line, streamCatalog, online, busy, own, names, onConfirm, onReject, busyId }: {
  line: CafeCountLine
  streamCatalog: readonly ProductionStream[]
  online: boolean
  busy: boolean
  own: boolean
  names: ReadonlyMap<string, string>
  onConfirm: () => void
  onReject: (note: string) => void
  busyId: string | null
}) {
  const t = useT()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const noteId = useId()
  const person = (id: string | null) => id === null ? t('cafe.count.review.none') : names.get(id) ?? t('cafe.receipts.review.unknownPerson')
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
        {fact(t('cafe.count.review.variance'), varianceMatches && calculatedVariance !== null ? <><span className={calculatedVariance.startsWith('-') ? 'cafe-count-review__negative' : undefined}>{formatCafeCountDecimal(calculatedVariance, document.documentElement.lang || 'en')}</span> <span>{line.unit_name}</span></> : t('cafe.count.review.varianceWaiting'))}
        {fact(t('cafe.count.review.reason'), line.reason ?? t('cafe.count.review.none'))}
        {fact(t('cafe.count.review.countedBy'), person(line.submitted_by))}
        {fact(t('cafe.count.review.recountedBy'), person(line.recounted_by))}
        {line.review_note && fact(t('cafe.count.review.rejectNoteFact'), line.review_note)}
      </dl>
    </Panel>
    {line.status === 'Submitted' && rejecting && <div className="cafe-decision-workbench__note">
      <label htmlFor={noteId}>{t('cafe.count.review.rejectNote')}</label>
      <textarea id={noteId} value={note} maxLength={500} autoFocus onChange={event => setNote(event.target.value)} />
      <p>{t('cafe.request.review.noteRequired')}</p>
      <div className="cafe-decision-workbench__actions">
        <button type="button" className="btn btn-outline btn-touch" onClick={() => { setRejecting(false); setNote('') }}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-destructive btn-touch" disabled={!online || busy || note.trim() === ''} onClick={() => onReject(note)}>{busyId === line.id ? t('common.working') : t('cafe.count.review.confirmReject')}</button>
      </div>
    </div>}
    <div className="cafe-count-review__decision">
      {line.status !== 'Submitted' ? <span role="status">{t(countStateKey(line))}</span>
        : own ? <span role="status">{t('cafe.count.review.own')}</span> : <>
        {!rejecting && <button type="button" className="btn btn-outline" disabled={!online || busy} onClick={() => setRejecting(true)}>{t('cafe.count.review.reject')}</button>}
        {line.expected_status !== 'ready' ? <span role="status">{t('cafe.count.review.expectedWaiting')}</span>
          : !varianceMatches ? <span role="status">{t('cafe.count.review.varianceWaiting')}</span>
          : missing ? <span role="status">{t(missing === 'recount' ? 'cafe.count.review.missingRecount' : 'cafe.count.review.missingReason')}</span>
          : !rejecting && <button type="button" className="btn btn-primary" disabled={!online || busy} onClick={onConfirm}>{busyId === line.id ? t('common.working') : t('cafe.count.review.confirm')}</button>}
      </>}
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

/** The line differs from Expected, or is not yet comparable; these lead the queue. */
function differs(line: CafeCountLine): boolean {
  return line.variance === null || !areCafeCountDecimalsEqual(line.variance, '0')
    || (line.expected_balance !== null && !areCafeCountDecimalsEqual(line.counted_quantity, line.expected_balance))
}

function readyToConfirm(line: CafeCountLine): boolean {
  return line.expected_status === 'ready' && line.variance !== null && countMissing(line) === null
}

function countStateKey(line: CafeCountLine) {
  if (line.status === 'Rejected') return 'cafe.count.review.rejected' as const
  if (line.status === 'Confirmed') {
    if (line.posting_status === 'not_needed') return 'cafe.count.review.confirmedNotNeeded' as const
    if (line.posting_status === 'held' || line.posting_status === 'not_posted') return 'cafe.count.review.confirmedHeld' as const
    if (line.posting_status === 'queued') return 'cafe.count.posting.status.queued' as const
    if (line.posting_status === 'awaiting_authorization') return 'cafe.count.posting.status.awaiting_authorization' as const
    if (line.posting_status === 'posted') return 'cafe.count.posting.status.posted' as const
    return 'cafe.count.posting.status.failed' as const
  }
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
