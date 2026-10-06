import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { formatWibDateTime, formatWeekdayDayMonth } from '@/lib/format/date'
import { useT } from '@/i18n/use-t'
import { useIsOffline } from '@/shell/use-is-offline'
import {
  canManageCafeReceiptIssues,
  closeCafeReceiptIssue,
  linkCafeReceiptIssue,
  listCafeReceiptIssues,
  listCafeReceiptIssueOpenPos,
  requestCafeReceiptIssuePoRefresh,
  type CafeReceiptIssue,
  type CafeReceiptIssueOpenPoResult,
} from '@/lib/db/cafe-receipt-issues'
import { WastePhotoStrip } from './waste-photo-strip'
import './cafe-receipt-issues.css'

type Tab = 'open' | 'history'
const BLOCKING_KINDS = new Set(['no_po', 'over', 'wrong_unit'])

export function CafeReceiptIssuesQueue() {
  const t = useT()
  const offline = useIsOffline()
  const [issues, setIssues] = useState<CafeReceiptIssue[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<Tab>('open')
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [poState, setPoState] = useState<CafeReceiptIssueOpenPoResult | null>(null)
  const [poLoading, setPoLoading] = useState(false)
  const [poError, setPoError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [closeNote, setCloseNote] = useState('')
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    void Promise.all([listCafeReceiptIssues(), canManageCafeReceiptIssues()]).then(([rows, allowed]) => {
      if (!active) return
      setIssues(rows)
      setCanManage(allowed)
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [retry])

  const openIssues = useMemo(() => issues.filter(issue => issue.status === 'open'), [issues])
  const historyIssues = useMemo(() => issues.filter(issue => issue.status !== 'open'), [issues])
  const visibleIssues = tab === 'open' ? openIssues : historyIssues
  const blockingCount = openIssues.filter(issue => BLOCKING_KINDS.has(issue.kind)).length

  async function reload() {
    const rows = await listCafeReceiptIssues()
    setIssues(rows)
  }

  async function showLinkOptions(issue: CafeReceiptIssue) {
    setLinkingId(issue.id)
    setPoState(null)
    setPoError(false)
    setPoLoading(true)
    try {
      setPoState(await listCafeReceiptIssueOpenPos(issue.id))
    } catch {
      setPoError(true)
    } finally {
      setPoLoading(false)
    }
  }

  async function refreshPos(issue: CafeReceiptIssue) {
    setPoLoading(true)
    setPoError(false)
    try {
      await requestCafeReceiptIssuePoRefresh(issue.id)
      setPoState(await listCafeReceiptIssueOpenPos(issue.id))
    } catch {
      setPoError(true)
    } finally {
      setPoLoading(false)
    }
  }

  async function link(issue: CafeReceiptIssue, poNumber: string) {
    if (busyId || offline) return
    setBusyId(issue.id)
    setActionError(false)
    try {
      await linkCafeReceiptIssue(issue.id, poNumber)
      setLinkingId(null)
      setPoState(null)
      await reload()
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  async function close(issue: CafeReceiptIssue) {
    if (busyId || offline || closeNote.trim() === '') return
    setBusyId(issue.id)
    setActionError(false)
    try {
      await closeCafeReceiptIssue(issue.id, closeNote.trim())
      setClosingId(null)
      setCloseNote('')
      await reload()
    } catch {
      setActionError(true)
    } finally {
      setBusyId(null)
    }
  }

  function cancelResolve() {
    setLinkingId(null)
    setPoState(null)
    setClosingId(null)
    setCloseNote('')
    setPoError(false)
  }

  return (
    <section className="cafe-receipt-issues" aria-label={t('cafe.receipts.issues.listLabel')}>
      <header className="cafe-receipt-issues__intro">
        <div>
          <p>{t('cafe.receipts.issues.help')}</p>
          <p className="cafe-receipt-issues__count" role="status">{t('cafe.receipts.issues.openCount', { count: blockingCount })}</p>
        </div>
        <div className="cafe-receipt-issues__tabs" role="group" aria-label={t('cafe.receipts.issues.listLabel')}>
          <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
            {t('cafe.receipts.issues.openTab', { count: openIssues.length })}
          </button>
          <button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
            {t('cafe.receipts.issues.historyTab', { count: historyIssues.length })}
          </button>
        </div>
      </header>

      {actionError && <p className="cafe-receipt-issues__action-error" role="alert">{t('cafe.receipts.issues.actionFailed')}</p>}
      {offline && <p className="cafe-receipt-issues__offline" role="alert">{t('cafe.receive.offline')}</p>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.receipts.issues.title') })}
          onRetry={() => setRetry(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={3} />
      ) : visibleIssues.length === 0 ? (
        <EmptyState
          variant={tab === 'open' ? 'awaiting' : 'blank'}
          title={tab === 'open' ? t('cafe.receipts.issues.empty.title') : t('cafe.receipts.issues.historyEmpty.title')}
          copy={tab === 'open' ? t('cafe.receipts.issues.empty.copyCurrent') : t('cafe.receipts.issues.historyEmpty.copy')}
        />
      ) : (
        <ul className="cafe-receipt-issues__list">
          {visibleIssues.map(issue => {
            const poPanelId = `cafe-issue-pos-${issue.id}`
            const noteId = `cafe-issue-note-${issue.id}`
            const isBlocking = BLOCKING_KINDS.has(issue.kind)
            return (
              <li className="cafe-receipt-issue" key={issue.id}>
                <div className="cafe-receipt-issue__topline">
                  <div>
                    <p className="cafe-receipt-issue__branch">{issue.branch_name}</p>
                    <p className="cafe-receipt-issue__meta">
                      <span>{t('cafe.receipts.review.arrival', { date: formatWeekdayDayMonth(issue.arrival_date) })}</span>
                      <span>{t('cafe.receipts.review.receivedBy', { person: issue.receiver_name || t('cafe.receipts.review.unknownPerson') })}</span>
                      <span>{t('cafe.receipts.issues.age', { count: issue.age_days })}</span>
                    </p>
                  </div>
                  <span className={`cafe-receipt-issue__status cafe-receipt-issue__status--${issue.status}`}>
                    {issue.status === 'open'
                      ? t('cafe.receipts.issues.status.open')
                      : issue.status === 'linked'
                        ? t('cafe.receipts.issues.status.linked', { po: issue.linked_po_number ?? '' })
                        : t('cafe.receipts.issues.status.closed')}
                  </span>
                </div>
                <div className="cafe-receipt-issue__facts">
                  <strong>{issue.item_name}</strong>
                  <span className="tabular-nums">{t('cafe.receipts.quantityUnit', { quantity: issue.quantity, unit: issue.unit_name })}</span>
                  <span className="cafe-receipt-issue__kind">{t(`cafe.receipts.issues.kind.${issue.kind}` as never)}</span>
                  {!isBlocking && <span className="cafe-receipt-issue__informational">{t('cafe.receipts.issues.informational')}</span>}
                </div>
                {issue.reason && <p className="cafe-receipt-issue__reason">{issue.reason}</p>}
                {issue.status === 'linked' && (issue.portions.filter(portion => portion.state === 'held').length > 0
                  ? issue.portions.filter(portion => portion.state === 'held').map((portion, index) => (
                    <p className="cafe-receipt-issue__informational" key={`${portion.po_number ?? 'held'}-${index}`}>
                      {t('cafe.receipts.issues.linkedPortion', { quantity: portion.quantity, po: portion.po_number ?? issue.linked_po_number ?? '' })}
                    </p>
                  ))
                  : <p className="cafe-receipt-issue__informational">{t('cafe.receipts.issues.linkedHeld')}</p>)}
                {issue.linked_po_created_at && issue.arrival_date < issue.linked_po_created_at.slice(0, 10) && (
                  <p className="cafe-receipt-issue__late-po">{t('cafe.receipts.issues.latePo')}</p>
                )}
                {issue.closed_note && <p className="cafe-receipt-issue__resolution-note">{issue.closed_note}</p>}
                {issue.resolved_at && <p className="cafe-receipt-issue__resolved">{t('cafe.receipts.issues.resolvedBy', {
                  person: issue.resolved_by_name ?? t('cafe.receipts.review.unknownPerson'),
                  date: formatWibDateTime(issue.resolved_at),
                })}</p>}
                <WastePhotoStrip
                  photos={issue.photos}
                  copy={{
                    reviewLabel: t('cafe.receive.photoReview'),
                    openAlt: (n, total) => t('cafe.receive.photoOpen', { n, total }),
                  }}
                />
                {issue.status === 'open' && !canManage && (
                  <p className="cafe-receipt-issue__readonly">{t('cafe.receipts.issues.readOnly')}</p>
                )}
                {issue.status === 'open' && canManage && (
                  <div className="cafe-receipt-issue__actions">
                    {isBlocking && (
                      <button type="button" className="btn btn-outline" disabled={offline || busyId !== null} onClick={() => void showLinkOptions(issue)}>
                        {t('cafe.receipts.issues.link')}
                      </button>
                    )}
                    <button type="button" className="btn btn-outline" disabled={offline || busyId !== null} onClick={() => { setClosingId(issue.id); setCloseNote('') }}>
                      {t('cafe.receipts.issues.close')}
                    </button>
                  </div>
                )}
                {linkingId === issue.id && (
                  <section id={poPanelId} className="cafe-receipt-issue__resolve" aria-label={t('cafe.receipts.issues.linkPanel')}>
                    <div className="cafe-receipt-issue__resolve-header">
                      <div>
                        <h3>{t('cafe.receipts.issues.choosePo')}</h3>
                        <p>{poState?.cache_as_of ? t('cafe.receipts.issues.cacheAsOf', { date: formatWibDateTime(poState.cache_as_of) }) : t('cafe.receipts.issues.cacheUnknown')}</p>
                      </div>
                      <button type="button" className="btn btn-outline" disabled={poLoading || offline} onClick={() => void refreshPos(issue)}>
                        {poLoading ? t('common.working') : t('cafe.receipts.issues.refreshPos')}
                      </button>
                    </div>
                    {poError && <p role="alert">{t('cafe.receipts.issues.loadPosFailed')}</p>}
                    {poLoading ? <p role="status">{t('common.loading')}</p> : poState && !poState.is_current ? (
                      <p role="status">{t('cafe.receipts.issues.cacheStale')}</p>
                    ) : poState?.options.length ? (
                      <ul className="cafe-receipt-issue__po-list">
                        {poState.options.map(po => (
                          <li key={po.po_number}>
                            <span>
                              <strong>{po.po_number}</strong>
                              <span>{po.supplier_name ?? t('cafe.receipts.issues.unknownSupplier')} · {formatWeekdayDayMonth(po.po_date)}</span>
                              {po.esb_created_at && issue.arrival_date < po.esb_created_at.slice(0, 10) && (
                                <span className="cafe-receipt-issue__late-po">{t('cafe.receipts.issues.latePo')}</span>
                              )}
                            </span>
                            <button type="button" className="btn btn-primary" disabled={!po.date_eligible || offline || busyId !== null} onClick={() => void link(issue, po.po_number)}>
                              {busyId === issue.id ? t('common.working') : po.date_eligible
                                ? t('cafe.receipts.issues.linkPo', { po: po.po_number })
                                : t('cafe.receipts.issues.poDateAfterArrival')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : poState && poState.is_current ? (
                      <p>{t('cafe.receipts.issues.noEligiblePos')}</p>
                    ) : null}
                    {poState?.refresh_requested_at && <p className="cafe-receipt-issue__refresh-note">{t('cafe.receipts.issues.refreshRequested', { date: formatWibDateTime(poState.refresh_requested_at) })}</p>}
                    <button type="button" className="btn btn-outline" disabled={poLoading || busyId !== null} onClick={cancelResolve}>{t('common.cancel')}</button>
                  </section>
                )}
                {closingId === issue.id && (
                  <section className="cafe-receipt-issue__resolve" aria-label={t('cafe.receipts.issues.closePanel')}>
                    <label htmlFor={noteId}>{t('cafe.receipts.issues.closeNote')}</label>
                    <textarea id={noteId} value={closeNote} maxLength={500} onChange={event => setCloseNote(event.target.value)} />
                    <div className="cafe-receipt-issue__actions">
                      <button type="button" className="btn btn-outline" disabled={busyId !== null} onClick={cancelResolve}>{t('common.cancel')}</button>
                      <button type="button" className="btn btn-primary" disabled={offline || busyId !== null || closeNote.trim() === ''} onClick={() => void close(issue)}>
                        {busyId === issue.id ? t('common.working') : t('cafe.receipts.issues.confirmClose')}
                      </button>
                    </div>
                  </section>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
