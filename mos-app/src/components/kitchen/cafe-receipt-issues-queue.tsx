import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { ViewTabs } from '@/components/ui/view-tabs'
import { formatAge } from '@/components/tasks/task-formatters'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { listActiveBranches } from '@/lib/db/branches'
import { getPeople } from '@/lib/db/directory'
import {
  BLOCKING_ISSUE_KINDS,
  canManageCafeReceiptIssues,
  closeCafeReceiptIssue,
  linkCafeReceiptIssue,
  listCafeReceiptIssueOpenPos,
  listCafeReceiptIssues,
  requestCafeReceiptIssuePoRefresh,
  type CafeReceiptIssue,
  type CafeReceiptIssueKind,
  type CafeReceiptIssueOpenPos,
} from '@/lib/db/cafe-receipt-issues'
import { formatWeekdayDayMonth, formatWibShortDateTime } from '@/lib/format/date'
import { useIsOffline } from '@/shell/use-is-offline'
import { CafeReceiptLineRow } from './cafe-receipt-difference'
import { CafeReceiptLineEvidence } from './cafe-receipt-line-condition'
import './cafe-count-review-queue.css'
import './cafe-receipt-issues.css'

type Tab = 'blocking' | 'information' | 'resolved'

const KIND = {
  no_po: { label: 'cafe.receipts.issues.kind.no_po', why: 'cafe.receipts.issues.why.no_po' },
  over: { label: 'cafe.receipts.issues.kind.over', why: 'cafe.receipts.issues.why.over' },
  wrong_unit: { label: 'cafe.receipts.issues.kind.wrong_unit', why: 'cafe.receipts.issues.why.wrong_unit' },
  short: { label: 'cafe.receipts.issues.kind.short', why: 'cafe.receipts.issues.why.short' },
  damaged_wrong: { label: 'cafe.receipts.issues.kind.damaged_wrong', why: 'cafe.receipts.issues.why.damaged_wrong' },
} as const satisfies Record<CafeReceiptIssueKind, { label: MessageKey; why: MessageKey }>

/** The database refusal tokens a person can act on, each with its plain explanation (FR-1036). */
const REFUSAL: ReadonlyArray<[string, MessageKey]> = [
  ['CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL', 'cafe.receipts.issues.refused.afterArrival'],
  ['CAFE_RECEIPT_ISSUE_PO_NO_OUTSTANDING', 'cafe.receipts.issues.refused.noOutstanding'],
  ['CAFE_RECEIPT_ISSUE_PO_DATA_NOT_CURRENT', 'cafe.receipts.issues.refused.notCurrent'],
  ['CAFE_RECEIPT_ISSUE_PO_INELIGIBLE', 'cafe.receipts.issues.refused.ineligible'],
  ['CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY', 'cafe.receipts.issues.refused.procurementOnly'],
]

function tabOf(issue: CafeReceiptIssue): Tab {
  if (issue.status !== 'open') return 'resolved'
  return BLOCKING_ISSUE_KINDS.has(issue.kind) ? 'blocking' : 'information'
}

type Resolving = { issueId: string; mode: 'link' | 'close' }

/**
 * Receipt issues (FR-1034..1040). RLS decides the rows: procurement reads the organisation's, a
 * receiver their own. Link and close render only for a procurement holder, and the database
 * decides again on every action.
 */
export function CafeReceiptIssuesQueue() {
  const t = useT()
  const { locale } = useI18n()
  const online = !useIsOffline()
  const [issues, setIssues] = useState<CafeReceiptIssue[]>([])
  const [canManage, setCanManage] = useState(false)
  const [names, setNames] = useState<{ people: ReadonlyMap<string, string>; branches: ReadonlyMap<string, string> }>(
    { people: new Map(), branches: new Map() })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState<Tab>('blocking')
  const [resolving, setResolving] = useState<Resolving | null>(null)
  const [pos, setPos] = useState<CafeReceiptIssueOpenPos | 'loading' | 'failed'>('loading')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<MessageKey | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
    // Names are context, not the job: a failed read leaves the rows and says "a teammate".
    void Promise.all([getPeople(), listActiveBranches()]).then(([people, branches]) => {
      if (active) setNames({ people: new Map(people.map(p => [p.id, p.full_name])), branches: new Map(branches.map(b => [b.id, b.name])) })
    }).catch(() => undefined)
    return () => { active = false }
  }, [reload])

  const byTab = useMemo(() => {
    const groups: Record<Tab, CafeReceiptIssue[]> = { blocking: [], information: [], resolved: [] }
    for (const issue of issues) groups[tabOf(issue)].push(issue)
    // Open issues oldest first, so the longest-waiting delivery is on top; resolved newest first.
    groups.blocking.reverse()
    groups.information.reverse()
    groups.resolved.sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))
    return groups
  }, [issues])
  const visible = byTab[tab]

  function startResolving(issue: CafeReceiptIssue, mode: Resolving['mode']) {
    setResolving({ issueId: issue.id, mode })
    setRefusal(null)
    setNote('')
    if (mode === 'link') void loadPos(issue.id)
  }

  async function loadPos(issueId: string) {
    setPos('loading')
    try {
      setPos(await listCafeReceiptIssueOpenPos(issueId))
    } catch {
      setPos('failed')
    }
  }

  async function act(issue: CafeReceiptIssue, run: () => Promise<string>) {
    if (busy || !online) return
    setBusy(true)
    setRefusal(null)
    try {
      setNotice(await run())
      setResolving(null)
      setReload(value => value + 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setRefusal(REFUSAL.find(([token]) => message.includes(token))?.[1] ?? 'cafe.receipts.issues.actionFailed')
      if (resolving?.mode === 'link') void loadPos(issue.id)
    } finally {
      setBusy(false)
    }
  }

  const link = (issue: CafeReceiptIssue, poNumber: string) => act(issue, async () => {
    const result = await linkCafeReceiptIssue(issue.id, poNumber)
    const unit = issue.line.unit_name
    return result.status === 'open'
      ? t('cafe.receipts.issues.linkedPart', { po: poNumber, quantity: result.matched_quantity, rest: result.remaining_quantity, unit })
      : t(result.posting === 'queued' ? 'cafe.receipts.issues.linkedQueued' : 'cafe.receipts.issues.linkedHeld', { po: poNumber })
  })

  const close = (issue: CafeReceiptIssue) => act(issue, async () => {
    await closeCafeReceiptIssue(issue.id, note)
    return t('cafe.receipts.issues.closedNotice', { item: issue.line.item_name })
  })

  const person = (id: string | null) => (id && names.people.get(id)) || t('cafe.receipts.review.unknownPerson')
  const tabs = [
    { id: 'blocking', label: t('cafe.receipts.issues.tab.blocking'), count: byTab.blocking.length },
    { id: 'information', label: t('cafe.receipts.issues.tab.information'), count: byTab.information.length },
    { id: 'resolved', label: t('cafe.receipts.issues.tab.resolved'), count: byTab.resolved.length },
  ]

  return (
    <section className="cafe-count-review cafe-receipt-issues" aria-labelledby="cafe-receipt-issues-help">
      <header className="cafe-count-review__header">
        <p id="cafe-receipt-issues-help">{t(canManage ? 'cafe.receipts.issues.help' : 'cafe.receipts.issues.helpReadOnly')}</p>
      </header>
      <ViewTabs tabs={tabs} active={tab} onChange={id => setTab(id as Tab)} ariaLabel={t('cafe.receipts.issues.title')} />
      <p className="cafe-receipt-issues__notice" role="status">{notice}</p>
      {!online && <p className="cafe-count-review__offline" role="alert">{t('cafe.receipts.issues.offline')}</p>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.receipts.issues.title') })}
          onRetry={() => setReload(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : visible.length === 0 ? (
        tab === 'blocking' ? (
          <EmptyState variant="awaiting" title={t('cafe.receipts.issues.empty.title')} copy={t('cafe.receipts.issues.empty.copy')}>
            <button type="button" className="btn btn-outline" onClick={() => setReload(value => value + 1)}>
              {t('cafe.count.review.refresh')}
            </button>
          </EmptyState>
        ) : (
          <EmptyState variant="quiet" title={t(tab === 'information' ? 'cafe.receipts.issues.emptyInformation' : 'cafe.receipts.issues.emptyResolved')} />
        )
      ) : (
        <ul className="cafe-count-review__list">
          {visible.map(issue => {
            const { receipt, line } = issue
            const open = resolving?.issueId === issue.id ? resolving.mode : null
            const noteId = `cafe-issue-note-${issue.id}`
            return (
              <li className="cafe-count-review__row cafe-receipt-review__row" key={issue.id}>
                <div className="cafe-count-review__identity">
                  <div className="cafe-count-review__name">{t(KIND[issue.kind].label)}</div>
                  <div className="cafe-count-review__meta">
                    <span>{names.branches.get(receipt.branch_id) ?? t('cafe.receipts.issues.unknownBranch')}</span>
                    <span>{t('cafe.receipts.review.arrival', { date: formatWeekdayDayMonth(receipt.arrival_date) })}</span>
                    <span>{t('cafe.receipts.review.receivedBy', { person: person(receipt.received_by) })}</span>
                    <span>{t('cafe.receipts.issues.age', { age: formatAge(issue.created_at, new Date(), locale) })}</span>
                  </div>
                </div>
                <ul className="cafe-receipt-lines" aria-label={t('cafe.receipts.review.linesAria')}>
                  <CafeReceiptLineRow name={line.item_name} quantity={issue.quantity} unit={line.unit_name} withDifference={false}>
                    <p className="cafe-receipt-issue__why">
                      {t(KIND[issue.kind].why, { received: line.received_quantity, unit: line.unit_name })}
                    </p>
                    {issue.po_created_after_delivery && <p className="cafe-receipt-issue__why">{t('cafe.receipts.issues.latePo')}</p>}
                    <CafeReceiptLineEvidence line={line} />
                    {receipt.photosUnavailable && <p className="cafe-receipt-issue__why">{t('cafe.receipts.photosUnavailable')}</p>}
                  </CafeReceiptLineRow>
                </ul>
                <div className="cafe-count-review__decision cafe-receipt-review__decision">
                  {issue.status !== 'open' ? (
                    <div className="cafe-count-review__state" role="status">
                      <span className="cafe-receipt-state">
                        {issue.status === 'linked'
                          ? t('cafe.receipts.issues.state.linked', { po: issue.linked_po_number ?? '' })
                          : t('cafe.receipts.issues.state.closed')}
                      </span>
                      <span className="cafe-receipt-issue__resolved">
                        {t('cafe.receipts.issues.resolvedBy', { person: person(issue.resolved_by), date: formatWibShortDateTime(issue.resolved_at ?? '') })}
                      </span>
                      {issue.closed_note && <span className="cafe-receipt-issue__note">{issue.closed_note}</span>}
                    </div>
                  ) : !canManage ? (
                    <span className="cafe-count-review__state">
                      {t(BLOCKING_ISSUE_KINDS.has(issue.kind) ? 'cafe.receipts.issues.state.waiting' : 'cafe.receipts.issues.state.noted')}
                    </span>
                  ) : open === 'close' ? (
                    <div className="cafe-receipt-review__reject">
                      <label htmlFor={noteId}>{t('cafe.receipts.issues.closeNote')}</label>
                      <textarea id={noteId} value={note} maxLength={500} autoFocus onChange={event => setNote(event.target.value)} />
                      {refusal && <p className="cafe-count__field-error" role="alert">{t(refusal)}</p>}
                      <div className="cafe-receipt-review__actions">
                        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setResolving(null)}>{t('common.cancel')}</button>
                        <button type="button" className="btn btn-primary" disabled={!online || busy || note.trim() === ''} onClick={() => void close(issue)}>
                          {busy ? t('common.working') : t('cafe.receipts.issues.confirmClose')}
                        </button>
                      </div>
                    </div>
                  ) : open === 'link' ? (
                    <CafeReceiptIssuePoPicker
                      pos={pos}
                      busy={busy}
                      online={online}
                      refusal={refusal}
                      onLink={poNumber => void link(issue, poNumber)}
                      onRefresh={() => void requestCafeReceiptIssuePoRefresh(issue.id).then(() => loadPos(issue.id), () => setPos('failed'))}
                      onCancel={() => setResolving(null)}
                    />
                  ) : (
                    <div className="cafe-receipt-review__actions">
                      <button type="button" className="btn btn-outline" disabled={!online || busy} onClick={() => startResolving(issue, 'close')}>
                        {t('cafe.receipts.issues.close')}
                      </button>
                      {BLOCKING_ISSUE_KINDS.has(issue.kind) && (
                        <button type="button" className="btn btn-primary" disabled={!online || busy} onClick={() => startResolving(issue, 'link')}>
                          {t('cafe.receipts.issues.link')}
                        </button>
                      )}
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

/** The eligible open POs for one issue, from the worker's cache; ESB is never read from here. */
function CafeReceiptIssuePoPicker({ pos, busy, online, refusal, onLink, onRefresh, onCancel }: {
  pos: CafeReceiptIssueOpenPos | 'loading' | 'failed'
  busy: boolean
  online: boolean
  refusal: MessageKey | null
  onLink: (poNumber: string) => void
  onRefresh: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <div className="cafe-receipt-issue__picker">
      <p className="cafe-receipt-issue__why" role="status">
        {pos === 'loading' ? t('common.loading')
          : pos === 'failed' ? t('cafe.receipts.issues.posFailed')
          : !pos.cache_as_of ? t('cafe.receipts.review.poNeverRead')
          : t(pos.is_current ? 'cafe.receipts.review.poAsOf' : 'cafe.receipts.review.poTooOld', { time: formatWibShortDateTime(pos.cache_as_of) })}
        {pos !== 'loading' && pos !== 'failed' && pos.refresh_requested_at && ` · ${t('cafe.receipts.issues.refreshRequested')}`}
      </p>
      {pos !== 'loading' && pos !== 'failed' && pos.is_current && (
        pos.options.length === 0 ? <p className="cafe-receipt-issue__why">{t('cafe.receipts.issues.noPos')}</p> : (
          <ul className="cafe-receipt-issue__pos">
            {pos.options.map(po => (
              <li key={po.po_number}>
                <span className="cafe-receipt-issue__po">
                  <strong>{po.po_number}</strong>
                  <span>{[po.supplier_name, t('cafe.receipts.issues.poDated', { date: formatWeekdayDayMonth(po.po_date) })].filter(Boolean).join(' · ')}</span>
                  {po.created_after_delivery && <span>{t('cafe.receipts.issues.latePo')}</span>}
                  {!po.date_eligible && <span>{t('cafe.receipts.issues.refused.afterArrival')}</span>}
                </span>
                {po.date_eligible && (
                  <button type="button" className="btn btn-outline" disabled={!online || busy} onClick={() => onLink(po.po_number)}
                    aria-label={t('cafe.receipts.issues.linkTo', { po: po.po_number })}>
                    {busy ? t('common.working') : t('cafe.receipts.issues.linkShort')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      {refusal && <p className="cafe-count__field-error" role="alert">{t(refusal)}</p>}
      <div className="cafe-receipt-review__actions">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-outline" disabled={!online || busy || pos === 'loading'} onClick={onRefresh}>
          {t('cafe.receipts.issues.refreshPos')}
        </button>
      </div>
    </div>
  )
}
