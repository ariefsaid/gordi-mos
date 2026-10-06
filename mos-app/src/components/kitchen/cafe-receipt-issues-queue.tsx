import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
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
  type CafeReceiptIssueList,
  type CafeReceiptIssueOpenPos,
} from '@/lib/db/cafe-receipt-issues'
import type { CafeReceipt, CafeReceiptLine } from '@/lib/db/cafe-receipts'
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
  ['CAFE_RECEIPT_ISSUE_NOT_LINKABLE', 'cafe.receipts.issues.alreadyResolved'],
  ['CAFE_RECEIPT_ISSUE_NOT_OPEN', 'cafe.receipts.issues.alreadyResolved'],
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
  const [list, setList] = useState<CafeReceiptIssueList>({ issues: [], held: [], resolvedTotal: 0 })
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
  const [notice, setNotice] = useState<{ text: string; seq: number } | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [returnFocus, setReturnFocus] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    let active = true
    // A reload after an action keeps the rows in place; only the first read shows the skeleton.
    if (!loaded.current) setLoading(true)
    setLoadError(false)
    void Promise.all([listCafeReceiptIssues(), canManageCafeReceiptIssues()]).then(([next, allowed]) => {
      if (!active) return
      setList(next)
      setCanManage(allowed)
      setLoading(false)
      loaded.current = true
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

  // The acted-on row may leave the tab; once the outcome has rendered, the keyboard lands on it.
  useEffect(() => { if (notice) noticeRef.current?.focus() }, [notice])

  const byTab = useMemo(() => {
    const groups: Record<Tab, CafeReceiptIssue[]> = { blocking: [], information: [], resolved: [] }
    // Open issues arrive oldest first, so the longest-waiting delivery is on top; resolved newest first.
    for (const issue of list.issues) groups[tabOf(issue)].push(issue)
    return groups
  }, [list])

  function startResolving(issue: CafeReceiptIssue, mode: Resolving['mode']) {
    setResolving({ issueId: issue.id, mode })
    setRefusal(null)
    setNote('')
    if (mode === 'link') void loadPos(issue.id)
  }

  function stopResolving() {
    if (resolving) setReturnFocus(`${resolving.issueId}:${resolving.mode}`)
    setResolving(null)
  }
  // The button that opened the panel renders again in its place; focus returns to it after that commit.
  useEffect(() => {
    if (!returnFocus) return
    listRef.current?.querySelector<HTMLElement>(`[data-opens="${returnFocus}"]`)?.focus()
    setReturnFocus(null)
  }, [returnFocus])

  async function loadPos(issueId: string) {
    setPos('loading')
    try {
      setPos(await listCafeReceiptIssueOpenPos(issueId))
    } catch {
      setPos('failed')
    }
  }

  function done(text: string) {
    setNotice(current => ({ text, seq: (current?.seq ?? 0) + 1 }))
    setResolving(null)
    setReload(value => value + 1)
  }

  async function act(issue: CafeReceiptIssue, run: () => Promise<string>) {
    if (busy || !online) return
    setBusy(true)
    setRefusal(null)
    try {
      done(await run())
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const reason = REFUSAL.find(([token]) => message.includes(token))?.[1] ?? 'cafe.receipts.issues.actionFailed'
      if (reason === 'cafe.receipts.issues.alreadyResolved') done(t(reason))
      else {
        setRefusal(reason)
        if (resolving?.mode === 'link') void loadPos(issue.id)
      }
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
  const meta = (receipt: CafeReceipt, createdAt: string) => ({
    branch: names.branches.get(receipt.branch_id) ?? t('cafe.receipts.issues.unknownBranch'),
    arrival: t('cafe.receipts.review.arrival', { date: formatWeekdayDayMonth(receipt.arrival_date) }),
    receivedBy: t('cafe.receipts.review.receivedBy', { person: person(receipt.received_by) }),
    age: t('cafe.receipts.issues.age', { age: formatAge(createdAt, new Date(), locale) }),
  })
  const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); stopResolving() } }
  // Counts and the role-specific help are facts about a completed read, so neither shows before one.
  const known = !loading && !loadError
  const needingPo = byTab.blocking.length + list.held.length
  const tabs = [
    { id: 'blocking', label: t('cafe.receipts.issues.tab.blocking'), count: known ? needingPo : undefined },
    { id: 'information', label: t('cafe.receipts.issues.tab.information'), count: known ? byTab.information.length : undefined },
    { id: 'resolved', label: t('cafe.receipts.issues.tab.resolved'), count: known ? list.resolvedTotal : undefined },
  ]
  const empty = tab === 'blocking' ? needingPo === 0 : byTab[tab].length === 0

  return (
    <section className="cafe-count-review cafe-receipt-issues" aria-label={t('cafe.receipts.issues.title')}>
      {known && (
        <header className="cafe-count-review__header">
          <p>{t(canManage ? 'cafe.receipts.issues.help' : 'cafe.receipts.issues.helpReadOnly')}</p>
        </header>
      )}
      <ViewTabs tabs={tabs} active={tab} onChange={id => setTab(id as Tab)} ariaLabel={t('cafe.receipts.issues.title')} />
      <p ref={noticeRef} tabIndex={-1} className="cafe-receipt-issues__notice" role="status">{notice?.text}</p>
      {!online && <p className="cafe-count-review__offline" role="alert">{t('cafe.receipts.issues.offline')}</p>}
      {loadError ? (
        <ErrorState
          message={t('common.loadFailed', { what: t('cafe.receipts.issues.title') })}
          onRetry={() => setReload(value => value + 1)}
          retryLabel={t('common.retry')}
        />
      ) : loading ? (
        <LoadingShell count={2} />
      ) : empty ? (
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
        <>
          {tab === 'resolved' && list.resolvedTotal > byTab.resolved.length && (
            <p className="cafe-receipt-issue__why">
              {t('cafe.receipts.issues.resolvedShown', { shown: byTab.resolved.length, total: list.resolvedTotal })}
            </p>
          )}
          <ul ref={listRef} className="cafe-count-review__list">
            {byTab[tab].map(issue => {
              const { receipt, line } = issue
              const open = resolving?.issueId === issue.id ? resolving.mode : null
              const noteId = `cafe-issue-note-${issue.id}`
              return (
                <CafeReceiptIssueRow
                  key={issue.id}
                  title={t(KIND[issue.kind].label)}
                  meta={meta(receipt, issue.created_at)}
                  line={line}
                  quantity={issue.quantity}
                  photosUnavailable={receipt.photosUnavailable}
                  why={issue.status === 'linked' ? t('cafe.receipts.issues.done.linked', { po: issue.linked_po_number ?? '' })
                    : issue.status === 'closed' ? t('cafe.receipts.issues.done.closed')
                    : t(KIND[issue.kind].why, { received: line.received_quantity, unit: line.unit_name })}
                  resolving={open !== null}
                >
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
                    <div className="cafe-receipt-review__reject" onKeyDown={onEscape}>
                      <label htmlFor={noteId}>{t('cafe.receipts.issues.closeNote')}</label>
                      <textarea id={noteId} value={note} maxLength={500} autoFocus onChange={event => setNote(event.target.value)} />
                      {refusal && <p className="cafe-count__field-error" role="alert">{t(refusal)}</p>}
                      <div className="cafe-receipt-review__actions">
                        <button type="button" className="btn btn-outline" disabled={busy} onClick={stopResolving}>{t('common.cancel')}</button>
                        <button type="button" className="btn btn-primary" disabled={!online || busy || note.trim() === ''} onClick={() => void close(issue)}>
                          {busy ? t('common.working') : t('cafe.receipts.issues.confirmClose')}
                        </button>
                      </div>
                    </div>
                  ) : open === 'link' ? (
                    <CafeReceiptIssuePoPicker
                      label={t('cafe.receipts.issues.pickerFor', { item: line.item_name })}
                      pos={pos}
                      unit={line.unit_name}
                      busy={busy}
                      online={online}
                      refusal={refusal}
                      onKeyDown={onEscape}
                      onLink={poNumber => void link(issue, poNumber)}
                      onRefresh={() => void requestCafeReceiptIssuePoRefresh(issue.id).then(() => loadPos(issue.id), () => setPos('failed'))}
                      onCancel={stopResolving}
                    />
                  ) : (
                    <div className="cafe-receipt-review__actions">
                      <button type="button" className="btn btn-outline" disabled={!online || busy} data-opens={`${issue.id}:close`} onClick={() => startResolving(issue, 'close')}>
                        {t('cafe.receipts.issues.close')}
                      </button>
                      {BLOCKING_ISSUE_KINDS.has(issue.kind) && (
                        <button type="button" className="btn btn-primary" disabled={!online || busy} data-opens={`${issue.id}:link`} onClick={() => startResolving(issue, 'link')}>
                          {t('cafe.receipts.issues.link')}
                        </button>
                      )}
                    </div>
                  )}
                </CafeReceiptIssueRow>
              )
            })}
            {tab === 'blocking' && list.held.map(portion => (
              <CafeReceiptIssueRow
                key={portion.id}
                title={t('cafe.receipts.issues.held.title')}
                meta={meta(portion.receipt, portion.created_at)}
                line={portion.line}
                quantity={portion.quantity}
                photosUnavailable={portion.receipt.photosUnavailable}
                why={portion.linked && portion.po_number
                  ? t('cafe.receipts.issues.held.linked', { po: portion.po_number })
                  : t('cafe.receipts.issues.held.unlinked')}
                resolving={false}
              >
                <span className="cafe-count-review__state">{t('cafe.receipts.issues.held.state')}</span>
              </CafeReceiptIssueRow>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** One row of the list: what it is, where and when it arrived, its line with evidence, and the decision cell. */
function CafeReceiptIssueRow({ title, meta, line, quantity, photosUnavailable, why, resolving, children }: {
  title: string
  meta: { branch: string; arrival: string; receivedBy: string; age: string }
  line: CafeReceiptLine
  quantity: string
  photosUnavailable?: boolean
  why: string
  resolving: boolean
  children: ReactNode
}) {
  const t = useT()
  return (
    <li className={`cafe-count-review__row cafe-receipt-review__row${resolving ? ' cafe-receipt-issue--resolving' : ''}`}>
      <div className="cafe-count-review__identity">
        <div className="cafe-count-review__name">{title}</div>
        <div className="cafe-count-review__meta"><span>{meta.branch}</span><span>{meta.arrival}</span></div>
        <div className="cafe-count-review__meta"><span>{meta.receivedBy}</span><span>{meta.age}</span></div>
      </div>
      <ul className="cafe-receipt-lines" aria-label={t('cafe.receipts.review.linesAria')}>
        <CafeReceiptLineRow name={line.item_name} quantity={quantity} unit={line.unit_name} withDifference={false}>
          <p className="cafe-receipt-issue__why">{why}</p>
          <CafeReceiptLineEvidence line={line} />
          {photosUnavailable && <p className="cafe-receipt-issue__why">{t('cafe.receipts.photosUnavailable')}</p>}
        </CafeReceiptLineRow>
      </ul>
      <div className="cafe-count-review__decision cafe-receipt-review__decision">{children}</div>
    </li>
  )
}

/** The eligible open POs for one issue, from the worker's cache; ESB is never read from here. */
function CafeReceiptIssuePoPicker({ label, pos, unit, busy, online, refusal, onKeyDown, onLink, onRefresh, onCancel }: {
  label: string
  pos: CafeReceiptIssueOpenPos | 'loading' | 'failed'
  unit: string
  busy: boolean
  online: boolean
  refusal: MessageKey | null
  onLink: (poNumber: string) => void
  onRefresh: () => void
  onKeyDown: (event: KeyboardEvent) => void
  onCancel: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  // Opening the picker moves the keyboard into it; Escape (onKeyDown) closes it.
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div ref={ref} className="cafe-receipt-issue__picker" role="group" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}>
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
                  <span>{Number(po.available) > 0 ? t('cafe.receipts.issues.poLeft', { quantity: po.available, unit }) : t('cafe.receipts.issues.refused.noOutstanding')}</span>
                  {po.created_after_delivery && <span>{t('cafe.receipts.issues.latePo')}</span>}
                  {!po.date_eligible && <span>{t('cafe.receipts.issues.refused.afterArrival')}</span>}
                </span>
                {po.date_eligible && Number(po.available) > 0 && (
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
