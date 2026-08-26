import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import {
  listSubmittedKitchenLogs,
  fetchPlanMap,
  listStreamPairs,
  streamCatalogFrom,
  approveKitchenLog,
  approveKitchenLogsBulk,
  rejectKitchenLog,
  KitchenRpcError,
} from '@/lib/db/kitchen-logs'
// The ONE person-scoped default-stream resolver (#234 consolidation). This page still
// imported the twin that lived in kitchen-logs.ts until #272 deleted it — a merge race
// between two siblings, repaired here so the branch typechecks. Same fact, shape-validated,
// and it resolves against an already-loaded branch catalog, so it runs after that read
// rather than inside the parallel batch.
import { fetchDefaultStream } from '@/lib/db/default-stream'
// #238 (FR-031): the per-stream completeness confirmation. It lives HERE — see the block that
// renders it, beside the stream filter — because this page is already the stream lead's surface
// and already resolves the three things the confirmation needs: which stream is in view, whether
// this viewer leads it, and the names to render a confirmer with.
import { listStreamCompleteness, confirmStreamComplete } from '@/lib/db/stream-completeness'
import type { StreamCompleteness } from '@/lib/db/stream-completeness'
import { listActiveBranches } from '@/lib/db/branches'
import type { BranchOption, PlanMap, ProductionStream, ReviewLogRow } from '@/lib/db/kitchen-logs.types'
import { movementKey, streamKey } from '@/lib/kitchen-action-label'
import { getPeople } from '@/lib/db/directory'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Avatar } from '@/components/ui/avatar'
import { Tag } from '@/components/ui/tag'
import { DataTable } from '@/components/dashboard/data-table'
import type { DataTableColumn, DataTableGroup } from '@/components/dashboard/data-table'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
// #440: the ONE Café stream statement/picker, and the module-wide selection it writes to.
import { CafeStreamBar, ALL_STREAMS } from '@/components/kitchen/cafe-stream-bar'
import { rememberStream, rememberedStreamKey } from '@/lib/cafe-stream'
import { useReviewSummary } from '@/lib/kitchen-review-kpis'
import './kitchen-review-page.css'

function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

function isTransfer(a: string): boolean {
  return a !== 'Production'
}

/**
 * plan qty for (date, item, movement) within the row's OWN (branch, activity) stream — 0
 * when no plan row (off-plan) or when that stream's plan was never fetched (no submitted
 * logs for it). #247 / #197 fix: the prior version compared every row's plan baseline
 * against ONE hardcoded stream — correct only by accident while exactly one stream is
 * captured, and silently wrong the moment a second stream exists. The queue can span more
 * than one stream; the plan a row is compared against must be the plan of ITS OWN stream.
 */
function planQtyFor(streamPlans: Map<string, PlanMap>, log: ReviewLogRow): number {
  const planMap = streamPlans.get(streamKey(log.branch_id, log.activity))
  return planMap?.[log.wip_item_id]?.[
    movementKey({ action: log.action, destinationBranchId: log.destination_branch_id })
  ] ?? 0
}

/**
 * FR-040 variance — the ONE definition of "off-plan" (logged qty ≠ this stream's plan qty,
 * including no-plan rows where planQty is 0). Both the per-row note gate (AC-040) and the
 * bulk scope (#398) read it from here: while bulk filtered on its own criteria and never on
 * variance, the loudest control on the surface cleared off-plan rows with a null note — the
 * exact gate the per-row path refuses to skip. A second definition is how the two drift.
 */
function isOffPlan(log: ReviewLogRow, planQty: number): boolean {
  return log.qty_porsi !== planQty
}

/** Format an ISO timestamp to HH:MM (WIB, fixed +7 offset — NFR-007). */
function formatTime(iso: string): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Format an ISO timestamp to YYYY-MM-DD (WIB, same fixed offset as formatTime). */
function formatDate(iso: string): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Group header actions — the production-first gate message + the per-group
// "Approve all on-plan (N)" bulk button. Lifted out of the retired .kr-group-head so the
// shared DataTable can mount them as a group's `headerActions` (right of the
// desktop group-header row / under the phone heading). Behaviour-identical to the
// retired controls: FR-042 gate, FR-043 bulk (offline / in-flight disables).
// ─────────────────────────────────────────────────────────────────────────────
interface GroupActionsProps {
  /** production-first gate (FR-042): show the "Blocked until Production approved" message. */
  transferGated: boolean
  /** N eligible ON-PLAN Submitted rows in the section (0 hides the bulk button — #398). */
  eligibleCount: number
  /** this section's bulk run is in flight → "Approving…". */
  bulkBusy: boolean
  /** disabled while offline, a per-row decision is in flight, or any bulk run is live. */
  disabled: boolean
  actionLabel: string
  onBulkApprove: () => void
}

function GroupActions({
  transferGated,
  eligibleCount,
  bulkBusy,
  disabled,
  actionLabel,
  onBulkApprove,
}: GroupActionsProps): ReactNode {
  const t = useT()
  return (
    <>
      {transferGated && (
        <span className="kr-group-gate">
          <span aria-hidden="true" className="kr-info-glyph">ⓘ</span>
          {' '}Blocked until Production approved
        </span>
      )}
      {eligibleCount > 0 && (
        <button
          type="button"
          className="btn btn-primary kr-bulk-btn"
          aria-label={`${t('kitchen.review.bulkApprove', { count: eligibleCount })} — ${actionLabel}`}
          disabled={disabled}
          onClick={onBulkApprove}
        >
          {bulkBusy ? t('kitchen.review.bulkApproving') : t('kitchen.review.bulkApprove', { count: eligibleCount })}
        </button>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row Actions column — inline approve/reject + the variance-note gate
// (AC-040 approve note required on variance; AC-041 reject note always required;
// AC-042 production-first gate disables Approve, Reject stays live). Lifted out of
// the retired kitchen-review-row so the DataTable Actions column render can mount
// it as a stable element (its pending/note state survives re-render). Proves
// (unit, via the page suite): FR-040/041, AC-040/041/042. Token-only (DESIGN.md).
// reviewed_by/at are NEVER sent client-side.
// ─────────────────────────────────────────────────────────────────────────────
type Pending = 'none' | 'approve' | 'reject'

interface KitchenReviewDecisionProps {
  log: ReviewLogRow
  /** plan qty for this (date, item, action) — 0 when no plan row (off-plan). */
  planQty: number
  /** production-first gate (FR-042): Approve disabled; Reject stays live. */
  approveDisabled: boolean
  /** tooltip explaining why Approve is disabled (AC-042). */
  approveDisabledReason: string
  /** while a decision is in flight for this row — both actions disabled (confirmed-only). */
  submitting: boolean
  /** approve note is null when on-plan (no note needed), or the entered note on variance. */
  onApprove: (logId: string, reviewNote: string | null) => void
  onReject: (logId: string, reviewNote: string) => void
}

function KitchenReviewDecision({
  log,
  planQty,
  approveDisabled,
  approveDisabledReason,
  submitting,
  onApprove,
  onReject,
}: KitchenReviewDecisionProps): ReactNode {
  const t = useT()
  const [pending, setPending] = useState<Pending>('none')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(false)

  // FR-040 variance — shared with the bulk scope (see isOffPlan).
  const offPlan = isOffPlan(log, planQty)

  function startApprove() {
    if (!offPlan) {
      // on-plan → approve immediately, no forced note (FR-041)
      onApprove(log.id, null)
      return
    }
    // off-plan (AC-040) → reveal the required approve-note gate
    setPending('approve')
    setNote('')
    setNoteError(false)
  }

  function startReject() {
    // reject ALWAYS requires a note (AC-041)
    setPending('reject')
    setNote('')
    setNoteError(false)
  }

  function cancel() {
    setPending('none')
    setNote('')
    setNoteError(false)
  }

  function confirm() {
    if (pending === 'approve') {
      if (!note.trim()) { setNoteError(true); return } // AC-040: variance approve needs a note
      onApprove(log.id, note.trim())
    } else if (pending === 'reject') {
      if (!note.trim()) { setNoteError(true); return } // AC-041: reject needs a note
      onReject(log.id, note.trim())
    }
  }

  const noteLabel =
    pending === 'reject'
      ? t('kitchen.review.noteAriaReject', { dish: log.wip_item_name })
      : t('kitchen.review.noteAriaApprove', { dish: log.wip_item_name })
  const notePlaceholder =
    pending === 'reject'
      ? t('kitchen.review.notePlaceholder.reject')
      : t('kitchen.review.notePlaceholder.approve')
  // ONE expression for the commit label, and no aria-label beside it (#411). An aria-label on
  // a button that has visible text REPLACES that text in the accessible name, so the copy of
  // this ternary that used to sit in `aria-label` pinned the idle label for the whole RPC —
  // a screen-reader user never heard "Working…"/"Memproses…" while the decision was in flight.
  // With the label rendered once as content, the busy state reaches both readings for free.
  const confirmLabel = t(
    pending === 'reject' ? 'kitchen.review.confirm.reject' : 'kitchen.review.confirm.approve',
    { dish: log.wip_item_name },
  )

  return (
    <div className="krow-actions">
      {pending === 'none' ? (
        <>
          <button
            type="button"
            className="btn btn-outline krow-btn"
            aria-label={t('kitchen.review.approveAria', { dish: log.wip_item_name })}
            disabled={approveDisabled || submitting}
            title={approveDisabled ? approveDisabledReason : undefined}
            onClick={startApprove}
          >
            {submitting ? t('common.working') : t('kitchen.review.approve')}
          </button>
          {/* #249 rank: Approve fires irreversibly on one click (on-plan rows commit
              straight to the RPC — no confirm, no undo), while Reject only opens a
              required-note gate. Two controls at the same weight beside each other make
              the irreversible one a mis-click, so Reject drops to the quietest rank the
              system has — `.btn-ghost` (DESIGN.md § Buttons: "a ghost is the quietest
              rank in the hierarchy"). The solid primary stays with the bulk "Approve all". */}
          <button
            type="button"
            className="btn btn-ghost krow-btn"
            aria-label={t('kitchen.review.rejectAria', { dish: log.wip_item_name })}
            disabled={submitting}
            onClick={startReject}
          >
            {t('kitchen.review.reject')}
          </button>
        </>
      ) : (
        <div className="krow-decide">
          <label className="krow-note-label" htmlFor={`krow-note-${log.id}`}>
            {pending === 'reject' ? t('kitchen.review.note.reject') : t('kitchen.review.note.approve')}
          </label>
          <textarea
            id={`krow-note-${log.id}`}
            aria-label={noteLabel}
            className={`krow-note-input${noteError ? ' krow-note-input-error' : ''}`}
            rows={2}
            value={note}
            placeholder={notePlaceholder}
            disabled={submitting}
            onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setNoteError(false) }}
          />
          {noteError && (
            <span role="alert" className="krow-note-cue">{t('kitchen.review.note.required')}</span>
          )}
          <div className="krow-decide-actions">
            {/* `krow-confirm`: the commit is the one control in the system whose label carries
                an unbounded interpolated name, so it — and only it — is allowed to set that
                label over two lines rather than push Cancel out of the card on a phone. The
                rules, and why truncation is not an option here, live beside the CSS. */}
            <button
              type="button"
              className={`btn krow-btn krow-confirm ${pending === 'reject' ? 'btn-destructive' : 'btn-primary'}`}
              disabled={submitting}
              onClick={confirm}
            >
              {submitting ? t('common.working') : confirmLabel}
            </button>
            <button
              type="button"
              className="btn btn-ghost krow-btn"
              disabled={submitting}
              onClick={cancel}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

export function KitchenReviewPage() {
  const t = useT()
  // issue 455: the tab names the module the rail and breadcrumb name; leaf-first per
  // the catalog's own docTitle convention (tasks-layout, signals-archive).
  useDocumentTitle(t('common.docTitle', { page: `${t('nav.cafe.review')} · ${t('nav.cafe')}` }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.review')}`
  const auth = useAuth()

  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  // #236 (FR-040/041): stream supervisors join the review surface. The page-level split is
  // DISPLAY ONLY — the write contract (who may decide which stream's rows) is the server's
  // guard/policy (NFR-002); everything here merely mirrors it so refusals are rare, not possible.
  const isLeadOrAdmin = accessRoles.includes('ops_lead') || accessRoles.includes('admin')
  const isSupervisor = accessRoles.includes('supervisor')
  const allowed = isLeadOrAdmin || isSupervisor

  const [logDate] = useState(wibToday)
  const [logs, setLogs] = useState<ReviewLogRow[]>([])
  // Keyed by streamKey(branch_id, activity) — one PlanMap per DISTINCT stream present in
  // the queue (#247/#197), not one flat map for the whole queue.
  const [streamPlans, setStreamPlans] = useState<Map<string, PlanMap>>(new Map())
  const [peopleMap, setPeopleMap] = useState<Map<string, string>>(new Map())
  // The enumerable stream catalog (FR-005) drives the filter's options; the viewer's own
  // stream — their live primary Team's (branch, activity), same resolution the capture
  // surface uses (FR-001) — drives the filter's DEFAULT (FR-041) and, for a supervisor,
  // which rows carry decision controls.
  const [streamCatalog, setStreamCatalog] = useState<ProductionStream[]>([])
  const [ownStreamKey, setOwnStreamKey] = useState<string | null>(null)
  const [streamFilter, setStreamFilter] = useState<string>(ALL_STREAMS)
  // #238 (FR-031): every stream's completeness state, keyed by streamKey. Read org-wide by
  // policy, so one fetch serves the filter wherever it moves.
  const [completeness, setCompleteness] = useState<Map<string, StreamCompleteness>>(new Map())
  const [confirmingStream, setConfirmingStream] = useState<string | null>(null)
  // The default is applied ONCE, after the first load resolves the viewer's own stream — a
  // ref, not state, so re-fetches never fight the viewer's own filter choice.
  const filterInitialized = useRef(false)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  const [submittingId, setSubmittingId] = useState<string | null>(null)
  // Bulk-approve is scoped to one GROUP — the group's key is the derived label
  // (`action_type`, a plain string, DD-WAY-13), not a fixed three-literal enum.
  const [bulkAction, setBulkAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const fetchQueue = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const [rows, branchRows, people, pairs, confirmations] = await Promise.all([
        listSubmittedKitchenLogs(logDate),
        listActiveBranches(),
        getPeople(),
        listStreamPairs(),
        listStreamCompleteness(),
      ])
      const ownStream = await fetchDefaultStream(branchRows)
      // Fetch the plan baseline for every DISTINCT (branch, activity) stream present in
      // the queue (#247/#197) — not the single hardcoded stream the prior version read.
      const branchById = new Map(branchRows.map((b: BranchOption) => [b.id, b]))
      const distinctStreams = new Map<string, ProductionStream>()
      for (const row of rows) {
        const key = streamKey(row.branch_id, row.activity)
        if (distinctStreams.has(key)) continue
        const branch = branchById.get(row.branch_id)
        if (branch) distinctStreams.set(key, { branch, activity: row.activity })
      }
      const planEntries = await Promise.all(
        Array.from(distinctStreams.entries()).map(
          async ([key, stream]) => [key, await fetchPlanMap(logDate, stream)] as const,
        ),
      )
      const ownKey = ownStream ? streamKey(ownStream.branch.id, ownStream.activity) : null
      const catalog = streamCatalogFrom(pairs, branchRows)
      setLogs(rows)
      setStreamPlans(new Map(planEntries))
      setPeopleMap(new Map(people.map(p => [p.id, p.full_name])))
      setStreamCatalog(catalog)
      setOwnStreamKey(ownKey)
      setCompleteness(new Map(confirmations.map(c => [streamKey(c.branch_id, c.activity), c])))
      // FR-041 filter defaults, applied once: a stream supervisor opens on THEIR stream;
      // ops_lead/admin open cross-stream. A supervisor with no stream (no live primary
      // stream Team) opens cross-stream too — sight is org-wide, decisions are not.
      // #440: a stream CHOSEN elsewhere in Café this session outranks both — it is an
      // explicit act, where the role defaults are only a guess about what you meant.
      const chosenKey = rememberedStreamKey()
      const chosen = chosenKey && catalog.some(s => streamKey(s.branch.id, s.activity) === chosenKey)
        ? chosenKey
        : null
      if (!filterInitialized.current) {
        filterInitialized.current = true
        if (chosen) setStreamFilter(chosen)
        else if (!isLeadOrAdmin && isSupervisor && ownKey) setStreamFilter(ownKey)
      }
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate, isLeadOrAdmin, isSupervisor])

  useEffect(() => {
    if (auth.status !== 'authenticated' || !allowed) return
    fetchQueue()
  }, [auth.status, allowed, fetchQueue, retryKey])

  // #236 (FR-043): the production-first gate is PER STREAM — the set of streams whose
  // production is still Submitted, computed over the WHOLE queue (a row's lock depends on
  // its own stream's state, never on what the filter happens to show). The server owns
  // the rule (P0004); this mirror only decides which Approve buttons are worth offering.
  const pendingProductionStreams = useMemo(() => {
    const set = new Set<string>()
    for (const l of logs) {
      if (l.action === 'produce') set.add(streamKey(l.branch_id, l.activity))
    }
    return set
  }, [logs])

  const rowGated = useCallback(
    (log: ReviewLogRow) =>
      log.action === 'transfer' && pendingProductionStreams.has(streamKey(log.branch_id, log.activity)),
    [pendingProductionStreams],
  )

  // #236 (FR-040): which rows THIS viewer may decide. ops_lead/admin decide everything;
  // a supervisor decides their own stream's rows. Mirror of the server predicate — the
  // guard/policy refuses regardless of what renders here (NFR-002).
  const canDecide = useCallback(
    (log: ReviewLogRow) =>
      isLeadOrAdmin ||
      (isSupervisor && ownStreamKey !== null && streamKey(log.branch_id, log.activity) === ownStreamKey),
    [isLeadOrAdmin, isSupervisor, ownStreamKey],
  )

  // ── #238 (FR-031): the stream in view, and whether this viewer may speak for it ────────────
  // A completeness confirmation is a claim about ONE stream's list, so it is offered for one
  // stream at a time — the one the filter names. On "all streams" there is no single list to
  // vouch for and the block does not render at all.
  const selectedStream = useMemo(
    () =>
      streamFilter === ALL_STREAMS
        ? null
        : streamCatalog.find(s => streamKey(s.branch.id, s.activity) === streamFilter) ?? null,
    [streamFilter, streamCatalog],
  )
  // The same authority that decides the stream's rows confirms its list (FR-031 via FR-040/041):
  // its supervisor, or ops_lead/admin. A mirror of ops.can_review_stream — the policy is what
  // makes it true; this only decides whether offering the control is honest.
  const canConfirmSelected =
    selectedStream !== null &&
    (isLeadOrAdmin || (isSupervisor && streamFilter === ownStreamKey))

  // FR-040/041: the displayed queue — one stream, or every stream. Display scoping only;
  // the rows a viewer may DECIDE are canDecide's (and ultimately the server's) business.
  const visibleLogs = useMemo(
    () =>
      streamFilter === ALL_STREAMS
        ? logs
        : logs.filter(l => streamKey(l.branch_id, l.activity) === streamFilter),
    [logs, streamFilter],
  )

  // KPIs summarise the queue AS FILTERED — the numbers must describe the rows on screen.
  const summary = useReviewSummary(visibleLogs, streamPlans)

  // #247/#196 fix: the prior grouping walked a hardcoded 3-literal ACTION_ORDER
  // (['Production', 'Transfer to Radiant', 'Transfer to Bungur']) — a log whose derived
  // label named any OTHER destination branch matched none of the three and simply never
  // appeared in any group, invisible to review though still Submitted. Groups are now the
  // DISTINCT labels actually present, Production first (FR-042's gate), the rest in the
  // order they first appear in the queue.
  const groupOrder = useMemo(() => {
    const seen: string[] = []
    for (const log of visibleLogs) {
      if (!seen.includes(log.action_type)) seen.push(log.action_type)
    }
    seen.sort((a, b) => (a === 'Production' ? -1 : b === 'Production' ? 1 : 0))
    return seen
  }, [visibleLogs])

  const removeRow = useCallback((id: string) => {
    setLogs(prev => prev.filter(l => l.id !== id))
  }, [])

  async function handleApprove(logId: string, reviewNote: string | null) {
    if (!isOnline) return
    setSubmittingId(logId)
    setActionError('')
    try {
      const { batch_id } = await approveKitchenLog(logId, reviewNote)
      removeRow(logId)
      setNotice(t('kitchen.review.notice.approved', { batchId: batch_id }))
    } catch (err) {
      handleDecisionError(err)
    } finally {
      setSubmittingId(null)
    }
  }

  async function handleReject(logId: string, reviewNote: string) {
    if (!isOnline) return
    setSubmittingId(logId)
    setActionError('')
    try {
      await rejectKitchenLog(logId, reviewNote)
      removeRow(logId)
      setNotice(t('kitchen.review.notice.rejected'))
    } catch (err) {
      handleDecisionError(err)
    } finally {
      setSubmittingId(null)
    }
  }

  // #238 (FR-031). Records the confirmation and NOTHING else — no queue refetch, no gate to
  // re-evaluate, because the record gates nothing (DD-WAY-29 owns what appears on a form).
  async function handleConfirmComplete() {
    if (!selectedStream || !isOnline) return
    const key = streamKey(selectedStream.branch.id, selectedStream.activity)
    setConfirmingStream(key)
    setActionError('')
    try {
      const row = await confirmStreamComplete(selectedStream.branch.id, selectedStream.activity)
      setCompleteness(prev => new Map(prev).set(key, row))
      setNotice(t('kitchen.review.completeness.saved'))
    } catch {
      setActionError(t('kitchen.review.completeness.failed'))
    } finally {
      setConfirmingStream(null)
    }
  }

  // #398 (owner ruling, 2026-08-20): bulk scopes to ON-PLAN rows only. Off-plan rows fall to
  // the per-row path and keep their required approve note (AC-040 / FR-041) — the gate bulk
  // used to skip by handing every row a null note. The label says so: "Approve all on-plan (N)".
  const bulkEligible = useCallback(
    (action: string): ReviewLogRow[] =>
      visibleLogs.filter(
        l =>
          l.action_type === action &&
          canDecide(l) &&
          !rowGated(l) &&
          !isOffPlan(l, planQtyFor(streamPlans, l)),
      ),
    [visibleLogs, canDecide, rowGated, streamPlans],
  )

  async function handleBulkApprove(action: string) {
    if (!isOnline) return
    const eligible = bulkEligible(action)
    if (eligible.length === 0) return
    setBulkAction(action)
    setActionError('')
    setNotice('')
    let approved = 0
    let failed = 0
    const batches: string[] = []
    const stale: string[] = []
    // Noop is a real approval with no ERP document. Keep it on the proven per-row seam;
    // only non-noop rows may enter the grouping RPC.
    const noop = eligible.filter(log => log.action === 'transfer' && log.destination_branch_id === log.branch_id)
    const documentRows = eligible.filter(log => !noop.includes(log))
    for (const log of noop) {
      try {
        const result = await approveKitchenLog(log.id, null)
        approved++
        if (result.batch_id) batches.push(result.batch_id)
        removeRow(log.id)
      } catch (err) {
        if (err instanceof KitchenRpcError && err.code === 'P0003') { stale.push(log.id); removeRow(log.id) }
        else failed++
      }
    }
    // The RPC deliberately mints one document only for a uniform stream/date. The UI keeps
    // the single visible action while partitioning rows into the server's document grain.
    const sessions = new Map<string, ReviewLogRow[]>()
    for (const log of documentRows) {
      const key = `${log.branch_id}|${log.activity}|${log.log_date}|${log.destination_branch_id ?? ''}`
      const session = sessions.get(key) ?? []
      session.push(log)
      sessions.set(key, session)
    }
    for (const session of sessions.values()) {
      try {
        const result = await approveKitchenLogsBulk(session.map(log => log.id), null)
        approved += session.length
        for (const batchId of result.batch_ids ?? []) batches.push(batchId)
        session.forEach(log => removeRow(log.id))
      } catch (err) {
        if (err instanceof KitchenRpcError && err.code === 'P0003') {
          // A stale member must not discard the rest of a live session. Retry each row;
          // the RPC then approves eligible rows and identifies only the stale ones.
          for (const log of session) {
            try {
              const result = await approveKitchenLog(log.id, null)
              approved++
              if (result.batch_id) batches.push(result.batch_id)
              removeRow(log.id)
            } catch (rowErr) {
              if (rowErr instanceof KitchenRpcError && rowErr.code === 'P0003') { stale.push(log.id); removeRow(log.id) }
              else failed++
            }
          }
        } else failed += session.length
      }
    }
    setBulkAction(null)
    if (failed > 0 || stale.length > 0) {
      setNotice(t('kitchen.review.notice.bulkTruth', { approved, failed, stale: stale.length }))
    } else if (approved > 0) {
      setNotice(
        approved === 1
          ? t('kitchen.review.notice.approved', { batchId: batches[0] ?? '—' })
          : t('kitchen.review.notice.bulkApproved', { approved, batchId: batches.join(', ') }),
      )
    }
    if (stale.length > 0) setRetryKey(k => k + 1)
  }

  function handleDecisionError(err: unknown) {
    if (err instanceof KitchenRpcError && err.code === 'P0003') {
      setNotice(t('kitchen.review.notice.staleRefresh'))
      setRetryKey(k => k + 1)
      return
    }
    // FR-043 (P0004): the server's per-stream ordering gate — surfaced as guidance, since the
    // stream's Submitted production may have landed after this queue was fetched.
    if (err instanceof KitchenRpcError && err.code === 'P0004') {
      setActionError(t('kitchen.review.productionPendingErr'))
      return
    }
    if (err instanceof KitchenRpcError && err.code === '42501') {
      setActionError(t('kitchen.review.error.forbidden'))
      return
    }
    setActionError(err instanceof Error ? err.message : t('kitchen.review.error.generic'))
  }

  // ── ONE DataTable: one group per action_type (Production, Transfer to …),
  //    now the DISTINCT labels present (groupOrder above) rather than a fixed
  //    3-literal list. Each group's headerActions carries its bulk "Approve all on-plan (N)"
  //    button + the gate message (disabled/hidden exactly as the retired bespoke
  //    header — transfer gate blocks it until Production approved; offline disables
  //    it). ─────────────────────────────────────────────────────────────────────
  const bulkDisabled = !isOnline || submittingId !== null || bulkAction !== null
  const tableGroups: DataTableGroup<ReviewLogRow>[] = groupOrder
    .map(action => {
      const rows = visibleLogs.filter(l => l.action_type === action)
      // #236: the gate message shows when any DISPLAYED row of the group is stream-locked
      // (FR-043 is per stream, so one stream's backlog no longer gates every group).
      const transferGated = isTransfer(action) && rows.some(rowGated)
      const eligibleCount = bulkEligible(action).length
      const showActions = transferGated || eligibleCount > 0
      return {
        key: action,
        label: action,
        rows,
        headerActions: showActions
          ? (
              <GroupActions
                transferGated={transferGated}
                eligibleCount={eligibleCount}
                bulkBusy={bulkAction === action}
                disabled={bulkDisabled}
                actionLabel={action}
                onBulkApprove={() => handleBulkApprove(action)}
              />
            )
          : null,
      }
    })
    .filter(g => g.rows.length > 0)

  // ── Per-row columns mirror the retired review row: item + variance Tag, plan vs
  //    logged, submitter, time, submit note, and an Actions column whose render
  //    returns the inline approve/reject + review-note gate (KitchenReviewDecision). ─
  const columns: DataTableColumn<ReviewLogRow>[] = [
    {
      key: 'item',
      header: t('kitchen.review.col.item'),
      cardLabel: '',
      render: (log) => {
        const offPlan = log.qty_porsi !== planQtyFor(streamPlans, log)
        return (
          <>
            <span className="krow-name">{log.wip_item_name}</span>
            <span className="krow-variance">
              <Tag color={offPlan ? 'amber' : 'green'}>
                <span className="krow-dot" aria-hidden="true" />
                {offPlan ? t('kitchen.review.tag.offPlan') : t('kitchen.review.tag.onPlan')}
              </Tag>
            </span>
          </>
        )
      },
    },
    {
      key: 'planVsLogged',
      header: t('kitchen.review.col.planVsLogged'),
      render: (log) => (
        <span className="krow-qty">
          <span className="krow-meta">{t('kitchen.review.qty.plan')}</span>
          <strong>{planQtyFor(streamPlans, log)}</strong>
          <span className="krow-meta">· {t('kitchen.review.qty.logged')}</span>
          <strong>{log.qty_porsi}</strong>
        </span>
      ),
    },
    {
      key: 'submitter',
      header: t('kitchen.review.col.submitter'),
      render: (log) => {
        const name = peopleMap.get(log.submitted_by ?? '') ?? '—'
        return (
          <span className="krow-by">
            <Avatar size="sm" placeholder={name} />
            <span className="krow-byname">{name}</span>
          </span>
        )
      },
    },
    {
      key: 'time',
      header: t('kitchen.review.col.time'),
      render: (log) => <span className="krow-time">{formatTime(log.created_at)}</span>,
    },
    {
      key: 'note',
      header: t('kitchen.review.col.note'),
      render: (log) => log.notes
        ? <span className="krow-submitnote">“{log.notes}”</span>
        : <span className="krow-nonote">—</span>,
    },
    {
      key: 'decision',
      header: t('kitchen.review.col.decision'),
      render: (log) => {
        // #236 (FR-040): a row outside the supervisor's own stream carries no decision
        // controls — its stream's reviewer (or the ops lead) decides it. Display honesty
        // only: the server refuses regardless (NFR-002).
        if (!canDecide(log)) {
          return <span className="krow-othersstream">{t('kitchen.review.opsLeadOnly')}</span>
        }
        const gated = rowGated(log)
        return (
          <KitchenReviewDecision
            log={log}
            planQty={planQtyFor(streamPlans, log)}
            approveDisabled={gated || !isOnline}
            approveDisabledReason={gated ? t('kitchen.review.gate.productionFirst') : ''}
            submitting={submittingId === log.id}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )
      },
    },
  ]

  // #422: the phone card — the generic <dl> fallback stacked all six columns as labelled
  // rows before the decision controls were reachable. Head line: identity + variance;
  // ONE muted meta line: plan/logged, submitter, time; the submit note only when present;
  // then the SAME KitchenReviewDecision the desktop table mounts.
  const renderReviewCard = (log: ReviewLogRow) => {
    const planQty = planQtyFor(streamPlans, log)
    const offPlan = log.qty_porsi !== planQty
    const name = peopleMap.get(log.submitted_by ?? '') ?? '—'
    const gated = rowGated(log)
    return (
      <div className="krow-card">
        <div className="krow-card-head">
          <span className="krow-name">{log.wip_item_name}</span>
          <Tag color={offPlan ? 'amber' : 'green'}>
            <span className="krow-dot" aria-hidden="true" />
            {offPlan ? t('kitchen.review.tag.offPlan') : t('kitchen.review.tag.onPlan')}
          </Tag>
        </div>
        <div className="krow-card-meta">
          <span className="krow-qty">
            <span className="krow-meta">{t('kitchen.review.qty.plan')}</span> <strong>{planQty}</strong>
            <span className="krow-meta"> · {t('kitchen.review.qty.logged')}</span> <strong>{log.qty_porsi}</strong>
          </span>
          <span className="krow-byname">{name}</span>
          <span className="krow-time">{formatTime(log.created_at)}</span>
        </div>
        {log.notes && <div className="krow-card-note">“{log.notes}”</div>}
        {canDecide(log)
          ? (
              <KitchenReviewDecision
                log={log}
                planQty={planQty}
                approveDisabled={gated || !isOnline}
                approveDisabledReason={gated ? t('kitchen.review.gate.productionFirst') : ''}
                submitting={submittingId === log.id}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            )
          : <span className="krow-othersstream">{t('kitchen.review.opsLeadOnly')}</span>}
      </div>
    )
  }

  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="loading">
        <LoadingShell count={3} />
      </PageFamilyFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kr-block kr-forbidden">
          <p className="kr-forbidden-msg">{t('kitchen.review.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  if (!allowed) {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kr-block kr-forbidden" role="region" aria-label={t('kitchen.review.restrictedAria')}>
          <p className="kr-forbidden-title">{t('kitchen.review.leadsOnly')}</p>
          <p className="kr-forbidden-msg">{t('kitchen.review.leadsOnlyMsg')}</p>
          <Link to="/cafe/log" className="btn btn-outline">{t('kitchen.review.backToLog')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  const submittedCount = visibleLogs.length

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      /* #236 (FR-041) + #440: the queue's stream — a supervisor opens on their own, ops_lead/
         admin cross-stream, and a stream chosen elsewhere in Café outranks both; either can move
         it. It reads in the head now, like every other Café surface, instead of as a filter chip
         buried above the queue: WHOSE books these rows are is the first thing a reviewer needs.
         "All streams" stays a first-class choice here — reviewing across streams is this
         surface's job (OD-WAY-48), and it is the one Café surface that has one. Display scoping
         only (NFR-002: the decision contract is the server's). */
      statusRow={
        <CafeStreamBar
          options={streamCatalog}
          stream={selectedStream}
          allStreams={streamFilter === ALL_STREAMS}
          onChange={next => {
            setStreamFilter(streamKey(next.branch.id, next.activity))
            rememberStream(next) // the whole Café module follows this choice (#440)
          }}
          onAllStreams={() => setStreamFilter(ALL_STREAMS)}
        />
      }
      meta={<span className="kr-date tabular">{logDate}</span>}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : submittedCount === 0 ? 'empty' : 'default'}
    >
      {load.kind === 'ready' && streamCatalog.length > 0 && (
        <div className="kr-filter kr-block">
          {/* #238 (FR-031): the stream lead's completeness confirmation, on the surface that is
              already theirs. It states what IS true — confirmed, by whom, when — and never what
              is blocked, because it blocks nothing: DD-WAY-29's coordinate gate alone decides
              what reaches a capture form (NFR-004). An unconfirmed stream reads as a gap with a
              name on it, which is the whole point (OD-WAY-47). Shown for one stream at a time;
              the button appears only for the people the policy would actually accept. */}
          {selectedStream && (() => {
            const key = streamKey(selectedStream.branch.id, selectedStream.activity)
            const confirmed = completeness.get(key) ?? null
            const busy = confirmingStream === key
            return (
              <div className="kr-complete" role="group" aria-label={t('kitchen.review.completeness.aria')}>
                <span className={`kr-complete-state${confirmed ? ' kr-complete-yes' : ''}`}>
                  {confirmed
                    ? t('kitchen.review.completeness.confirmed', {
                        who: peopleMap.get(confirmed.confirmed_by) ?? '—',
                        when: formatDate(confirmed.confirmed_at),
                      })
                    : t('kitchen.review.completeness.unconfirmed')}
                </span>
                {canConfirmSelected && (
                  <button
                    type="button"
                    className="btn btn-outline kr-complete-btn"
                    disabled={busy || !isOnline}
                    onClick={handleConfirmComplete}
                  >
                    {busy
                      ? t('kitchen.review.completeness.saving')
                      : confirmed
                        ? t('kitchen.review.completeness.reconfirm')
                        : t('kitchen.review.completeness.confirm')}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* #422 / DD-WAY-40: Review is an ACT surface, so its figures render as the DESIGN.md
          Metric summary rule — one inline line, no card, no width branch — never a tile row.
          The delta ("note required to approve") renders only when off-plan rows exist, i.e.
          only when it carries a state the reviewer must act on. */}
      {load.kind === 'ready' && submittedCount > 0 && (
        <MetricSummaryRule
          ariaLabel={t(summary.ariaLabel)}
          metrics={summary.metrics.map(m => ({
            key: m.key,
            label: t(m.label),
            value: m.value,
            delta: m.delta ? { text: t(m.delta.key), tone: m.delta.tone } : undefined,
          }))}
        />
      )}

      {!isOnline && (
        <div role="alert" className="kr-banner kr-banner-offline kr-block">
          {t('kitchen.review.offline')}
        </div>
      )}

      {notice && (
        <div role="status" aria-live="polite" className="kr-banner kr-banner-notice kr-block">
          {notice}
        </div>
      )}

      {actionError && (
        <div role="alert" className="kr-banner kr-banner-error kr-block">
          {actionError}
        </div>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.queue') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && submittedCount === 0 && (
        <EmptyState
          variant="awaiting"
          title={t('kitchen.review.empty.title')}
          copy={t('kitchen.review.empty.copy', { date: logDate })}
          note={t('kitchen.review.empty.note')}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRetryKey(k => k + 1)}
          >
            {t('kitchen.review.refresh')}
          </button>
        </EmptyState>
      )}

      {load.kind === 'ready' && submittedCount > 0 && (
        <DataTable
          columns={columns}
          rows={[]}
          groups={tableGroups}
          isDesktop={isDesktop}
          renderCard={renderReviewCard}
          caption={t('kitchen.review.caption')}
        />
      )}
    </PageFamilyFrame>
  )
}
