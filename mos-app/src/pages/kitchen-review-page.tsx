import { ListPaging } from '@/components/ui/list-paging'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParamState } from '@/lib/use-search-param-state'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { saveErrorMessage } from '@/lib/save-error'
import { listKitchenWastePhotos } from '@/lib/db/kitchen-waste-photos'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import { WastePhotoStrip } from '@/components/kitchen/waste-photo-strip'
import {
  listSubmittedKitchenLogs,
  hasSubmittedKitchenProduction,
  KITCHEN_LOGS_PAGE_SIZE,
  fetchPlanMaps,
  listStreamPairs,
  listAllStreamItemKeys,
  streamItemKey,
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
// #783 (DB half #778): a supervisor reviews every stream she holds a LIVE MEMBERSHIP on, not
// only her primary — the same read useCafeStream already runs for "Your Team" tagging.
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import type { CafeViewerTeam } from '@/lib/db/cafe-opening'
import { isReviewerEligibleTeam } from '@/lib/kitchen-gates'
import type { BranchOption, PlanMap, ProductionStream, ReviewLogRow } from '@/lib/db/kitchen-logs.types'
import { deriveActionLabel, movementKey, streamDateKey, streamKey, streamLabel } from '@/lib/kitchen-action-label'
import type { Translate } from '@/i18n/use-t'
import { getPeople } from '@/lib/db/directory'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { Tag } from '@/components/ui/tag'
import { Avatar } from '@/components/ui/avatar'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { DataTable } from '@/components/dashboard/data-table'
import { DateField } from '@/components/ui/date-field'
import type { DataTableColumn, DataTableGroup } from '@/components/dashboard/data-table'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
// #440: the ONE Café stream statement/picker, and the module-wide selection it writes to.
import { ALL_STREAMS } from '@/components/kitchen/cafe-stream-bar'
import { CafeCountReviewQueue } from '@/components/kitchen/cafe-count-review-queue'
import { CafeCloseReviewWorkspace } from '@/components/cafe/redesign/cafe-close-review-workspace'
import { DecisionBar } from '@/components/cafe/redesign/worksheet'
import { rememberStream, rememberedStreamKey } from '@/lib/cafe-stream'
import { activeCafeLocation } from '@/lib/cafe-opening-location'
import { useReviewSummary } from '@/lib/kitchen-review-kpis'
import { formatWeekdayDayMonth, WIB_OFFSET_MS } from '@/lib/format/date'
import { formatUnitMultiple } from '@/lib/cafe-unit-multiples'
import './kitchen-review-page.css'
import { Notice } from '@/components/ui/notice'

function isTransfer(a: string): boolean {
  return a.startsWith('Transfer to ')
}

/**
 * plan qty for the row's exact (date, branch, activity, item, movement) — 0 when no plan row
 * exists. #247 / #197 fix: the queue can span dates and streams, so plan lookup must match
 * both the row's date and its own stream; there is intentionally no broader fallback.
 */
function planQtyFor(streamPlans: Map<string, PlanMap>, log: ReviewLogRow): number {
  const planMap = streamPlans.get(streamDateKey(log.log_date, log.branch_id, log.activity))
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

function formatLogEntryQuantity(log: ReviewLogRow): string {
  if (log.entry_quantity == null || log.entry_unit_name == null) return String(log.qty_porsi)
  const locale = document.documentElement.lang || 'en'
  const format = (quantity: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(quantity)
  const factor = log.entry_unit_factor ?? 1
  const enteredUnit = factor === 1 ? log.entry_unit_name : formatUnitMultiple(factor, log.entry_unit_name, locale)
  const entered = factor === 1
    ? `${format(log.entry_quantity)} ${enteredUnit}`
    : `${format(log.entry_quantity)} × ${enteredUnit}`
  return factor === 1 ? entered : `${entered} (${format(log.qty_porsi)} ${log.entry_unit_name})`
}

/**
 * #587: the canonical stream label (branch · activity — the same `streamLabel` the
 * picker/#440 statement uses everywhere else in Café) for ONE row. "All streams" groups
 * by action_type only (movementKey), so a group can hold rows from more than one stream
 * with nothing on the row naming which — this is what names it. `streamCatalog` already
 * carries the branch object per (branch_id, activity) pair (FR-005); a row whose pair
 * fell out of the live catalog renders streamLabel's own "—" rather than guessing.
 */
function rowStreamLabel(t: Translate, streamCatalog: ProductionStream[], log: ReviewLogRow): string {
  const stream = streamCatalog.find(s => s.branch.id === log.branch_id && s.activity === log.activity) ?? null
  return streamLabel(t, stream)
}

/** Format an ISO timestamp to HH:MM (WIB, fixed +7 offset — NFR-007). */
function formatTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Format an ISO timestamp to YYYY-MM-DD (WIB, same fixed offset as formatTime). */
function formatDate(iso: string): string {
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
  /** Anchor of this date's Production group when it is on screen: the gate message then links to it. */
  productionAnchor?: string
  /** N eligible ON-PLAN Submitted rows in the section (0 hides the bulk button — #398). */
  eligibleCount: number
  partial: boolean
  /** this section's bulk run is in flight → "Approving…". */
  bulkBusy: boolean
  /** disabled while offline, a per-row decision is in flight, or any bulk run is live. */
  disabled: boolean
  actionLabel: string
  onBulkApprove: () => void
}

function GroupActions({
  transferGated,
  productionAnchor,
  eligibleCount,
  partial,
  bulkBusy,
  disabled,
  actionLabel,
  onBulkApprove,
}: GroupActionsProps): ReactNode {
  const t = useT()
  return (
    <>
      {transferGated && (productionAnchor
        ? (
          <button
            type="button"
            className="kr-group-gate kr-group-gate--link"
            onClick={() => {
              const group = document.getElementById(productionAnchor)
              group?.scrollIntoView?.({ block: 'center' })
              group?.querySelector<HTMLElement>('button')?.focus()
            }}
          >
            {t('kitchen.review.gate.productionFirst')}
          </button>
        )
        : (
          <span className="kr-group-gate">
            {t('kitchen.review.gate.productionFirst')}
          </span>
        ))}
      {eligibleCount > 0 && (
        <button
          type="button"
          className="btn btn-primary kr-bulk-btn"
          aria-label={`${t(partial ? 'kitchen.review.bulkApproveLoaded' : 'kitchen.review.bulkApprove', { count: eligibleCount })} — ${actionLabel}`}
          disabled={disabled}
          onClick={onBulkApprove}
        >
          {bulkBusy ? t('kitchen.review.bulkApproving') : t(partial ? 'kitchen.review.bulkApproveLoaded' : 'kitchen.review.bulkApprove', { count: eligibleCount })}
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
  onApprove: (logId: string, reviewNote: string | null, expectedUpdatedAt: string) => void
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
    // #783 AC-052 (DB half #778): a reviewer note is required only when the row is off-plan
    // AND the submitter left none — the submitter's own note already accounts for the
    // variance, so asking a reviewer to restate it in a second box was a redundant blocking
    // prompt on every off-plan approval, not a real safeguard. Trimmed, matching the DB's own
    // `nullif(btrim(notes),'')` — a whitespace-only note is not an explanation.
    if (!offPlan || log.notes?.trim()) {
      onApprove(log.id, null, log.updated_at)
      return
    }
    // off-plan, no submitter note (AC-040) → reveal the required approve-note gate
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
      onApprove(log.id, note.trim(), log.updated_at)
    } else if (pending === 'reject') {
      if (!note.trim()) { setNoteError(true); return } // AC-041: reject needs a note
      onReject(log.id, note.trim())
    }
  }

  const noteLabel =
    pending === 'reject'
      ? t('kitchen.review.noteAriaReject', { item: log.wip_item_name })
      : t('kitchen.review.noteAriaApprove', { item: log.wip_item_name })
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
    { item: log.wip_item_name },
  )

  return (
    <div className="krow-actions">
      {pending === 'none' ? (
        <>
          <button
            type="button"
            className="btn btn-outline krow-btn"
            aria-label={t('kitchen.review.approveAria', { item: log.wip_item_name })}
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
            aria-label={t('kitchen.review.rejectAria', { item: log.wip_item_name })}
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

/** `view`: which of the two Review tabs this queue shows; Review's own tab strip owns that choice, this page keeps both mounted. */
export function KitchenReviewPage({ view = 'logs' }: { view?: 'logs' | 'counts' }) {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : 'anonymous'

  // Queue data, stream defaults, and pending decisions are all viewer-scoped. Keying the
  // subtree prevents a mounted route from rendering the prior person's queue for one frame.
  return <KitchenReviewPageForViewer key={viewerId} reviewView={view} />
}

function KitchenReviewPageForViewer({ reviewView }: { reviewView: 'logs' | 'counts' }) {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  // #236 (FR-040/041): stream supervisors join the review surface. The page-level split is
  // DISPLAY ONLY — the write contract (who may decide which stream's rows) is the server's
  // guard/policy (NFR-002); everything here merely mirrors it so refusals are rare, not possible.
  const isLeadOrAdmin = accessRoles.includes('ops_lead') || accessRoles.includes('admin')
  const isSupervisor = accessRoles.includes('supervisor')
  const allowed = isLeadOrAdmin || isSupervisor

  // The date and the open log live in the URL (UX-STANDARD NV4): no date = every pending
  // date, oldest first, so an older backlog is never hidden behind today.
  const [dateParam, setDateParam] = useSearchParamState('date', '')
  const logDateFilter = dateParam === 'all' ? '' : dateParam
  const setLogDateFilter = (next: string) => setDateParam(next)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const cursorRef = useRef<Pick<ReviewLogRow, 'log_date' | 'created_at' | 'id'> | null>(null)
  const moreInFlight = useRef(false)
  const [externalProductionStreams, setExternalProductionStreams] = useState<ReadonlySet<string>>(new Set())
  const gateTokens = useRef(new Map<string, number>())
  const [logs, setLogs] = useState<ReviewLogRow[]>([])
  const [wastePhotosByLogId, setWastePhotosByLogId] = useState<Record<string, KitchenWastePhoto[]>>({})
  // Every stream's item list (#222): a queued row whose item left its stream's list is labelled.
  const [offeredKeys, setOfferedKeys] = useState<Set<string>>(new Set())
  // Keyed by log date + stream — each row is compared against the plan for its own day.
  const [streamPlans, setStreamPlans] = useState<Map<string, PlanMap>>(new Map())
  const [peopleMap, setPeopleMap] = useState<Map<string, string>>(new Map())
  const [branchCatalog, setBranchCatalog] = useState<BranchOption[]>([])
  // The enumerable stream catalog (FR-005) drives the filter's options; the viewer's own
  // stream — their live primary Team's (branch, activity), same resolution the capture
  // surface uses (FR-001) — drives the filter's DEFAULT (FR-041) and, for a supervisor,
  // which rows carry decision controls.
  const [streamCatalog, setStreamCatalog] = useState<ProductionStream[]>([])
  // #783 AC-051 (DB half #778): every stream Team this viewer currently holds a live
  // membership on, PLUS her primary (folded in where this is computed, fetchQueue below) —
  // a supervisor of TWO streams decides both, not only her primary.
  const [myStreamKeys, setMyStreamKeys] = useState<ReadonlySet<string>>(new Set())
  const [streamFilter, setStreamFilter] = useState<string>(ALL_STREAMS)
  // #238 (FR-031): every stream's completeness state, keyed by streamKey. Read org-wide by
  // policy, so one fetch serves the filter wherever it moves.
  const [completeness, setCompleteness] = useState<Map<string, StreamCompleteness>>(new Map())
  const [confirmingStream, setConfirmingStream] = useState<string | null>(null)
  // The default is applied ONCE, after the first load resolves the viewer's own stream — a
  // ref, not state, so re-fetches never fight the viewer's own filter choice.
  const filterInitialized = useRef(false)
  const requestGen = useRef(0)
  const skipInitialFilterReload = useRef<string | null>(null)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [logParam, setLogParam] = useSearchParamState('log', '')
  const selectedLogId = logParam || null
  const setSelectedLogId = useCallback((next: string | null) => setLogParam(next ?? ''), [setLogParam])

  const [submittingId, setSubmittingId] = useState<string | null>(null)
  // Bulk-approve is scoped to one GROUP — the group's key is the derived label
  // (`action_type`, a plain string, DD-WAY-13), not a fixed three-literal enum.
  const [bulkAction, setBulkAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  // An approval creates the next actionable Pushes record. Keep this separate from the
  // message text so the handoff link is offered only when the current viewer is admitted to
  // Pushes; supervisors can review their stream but must not receive a dead-end link.
  const [noticeCanViewPushes, setNoticeCanViewPushes] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isDesktop = useIsDesktop()

  // A route can stay mounted while the signed-in viewer changes. Clear the old viewer's queue
  // and filter before the new read lands; the generation also makes a slow old response inert.
  useEffect(() => {
    requestGen.current += 1
    filterInitialized.current = false
    skipInitialFilterReload.current = null
    setStreamFilter(ALL_STREAMS)
    setLogs([])
    setExternalProductionStreams(new Set())
    setWastePhotosByLogId({})
    setStreamPlans(new Map())
    setPeopleMap(new Map())
    setBranchCatalog([])
    setStreamCatalog([])
    setMyStreamKeys(new Set())
    setCompleteness(new Map())
    setLoad({ kind: 'loading' })
  }, [viewerId])

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const readPageContext = useCallback(async (rows: ReviewLogRow[], branches: BranchOption[]) => {
    const branchById = new Map(branches.map(branch => [branch.id, branch]))
    const streams = new Map<string, { logDate: string; stream: ProductionStream }>()
    for (const row of rows) {
      const branch = branchById.get(row.branch_id)
      if (branch) {
        const key = streamDateKey(row.log_date, row.branch_id, row.activity)
        streams.set(key, { logDate: row.log_date, stream: { branch, activity: row.activity } })
      }
    }
    const [plans, photos, gates] = await Promise.all([
      fetchPlanMaps([...streams.values()]),
      listKitchenWastePhotos(rows.filter(row => row.action === 'waste').map(row => row.id)),
      Promise.all([...streams].filter(([key]) => rows.some(row => row.action === 'transfer'
        && streamDateKey(row.log_date, row.branch_id, row.activity) === key))
        .map(async ([key, context]) => [key, await hasSubmittedKitchenProduction(
          context.logDate, context.stream.branch.id, context.stream.activity,
        )] as const)),
    ])
    const photosByLog: Record<string, KitchenWastePhoto[]> = {}
    for (const photo of photos) (photosByLog[photo.logId] ??= []).push(photo)
    return { plans, photosByLog, pending: gates.filter(([, pending]) => pending).map(([key]) => key) }
  }, [])

  const fetchQueue = useCallback(async () => {
    const gen = ++requestGen.current
    setLoad({ kind: 'loading' })
    setHasMore(false)
    setLoadingMore(false)
    setMoreError(false)
    moreInFlight.current = false
    cursorRef.current = null
    try {
      const [branchRows, people, pairs, confirmations, itemKeys, myTeams] = await Promise.all([
        listActiveBranches(),
        getPeople(),
        listStreamPairs(),
        listStreamCompleteness(),
        listAllStreamItemKeys(),
        // Only a supervisor's DECIDE rights depend on this; ops_lead/admin already decide
        // everything, so skip the read for them. Display only: a failure drops the extra
        // streams, never the surface (matches useCafeStream's own handling of this read).
        isSupervisor && viewerId
          ? listCafeViewerTeams(viewerId).catch(() => [])
          : Promise.resolve<CafeViewerTeam[]>([]),
      ])
      const ownStream = await fetchDefaultStream(branchRows)
      const ownKey = ownStream ? streamKey(ownStream.branch.id, ownStream.activity) : null
      const catalog = streamCatalogFrom(pairs, branchRows)
      const activeBranchId = activeCafeLocation(viewerId)?.branchId ?? null
      const chosenKey = activeBranchId ? rememberedStreamKey(viewerId, activeBranchId) : null
      const chosen = chosenKey && catalog.some(stream => streamKey(stream.branch.id, stream.activity) === chosenKey) ? chosenKey : null
      const effectiveFilter = filterInitialized.current ? streamFilter : chosen ?? (!isLeadOrAdmin && isSupervisor && ownKey ? ownKey : ALL_STREAMS)
      const stream = catalog.find(stream => streamKey(stream.branch.id, stream.activity) === effectiveFilter)
      const rows = await listSubmittedKitchenLogs(logDateFilter || undefined, stream ? { stream: { branchId: stream.branch.id, activity: stream.activity } } : {})
      const page = await readPageContext(rows, branchRows)
      if (gen !== requestGen.current) return
      cursorRef.current = rows.length === KITCHEN_LOGS_PAGE_SIZE ? rows.at(-1)! : null
      setHasMore(Boolean(cursorRef.current))
      setExternalProductionStreams(new Set(page.pending))
      // #783 AC-051: every stream Team she holds an OPEN-ENDED membership on, plus her
      // primary — matches ops.is_stream_reviewer exactly (isReviewerEligibleTeam); a
      // finite-end membership is current for display elsewhere but not a decide right here.
      const teamKeys = myTeams
        .filter(isReviewerEligibleTeam)
        .map((team) => streamKey(team.branch_id, team.activity))
      const myKeys = new Set(teamKeys)
      if (ownKey) myKeys.add(ownKey)
      setLogs(rows)
      setWastePhotosByLogId(page.photosByLog)
      setOfferedKeys(itemKeys)
      setStreamPlans(new Map(page.plans))
      setPeopleMap(new Map(people.map(p => [p.id, p.full_name])))
      setBranchCatalog(branchRows)
      setStreamCatalog(catalog)
      setMyStreamKeys(myKeys)
      setCompleteness(new Map(confirmations.map(c => [streamKey(c.branch_id, c.activity), c])))
      if (!filterInitialized.current) {
        filterInitialized.current = true
        if (effectiveFilter !== streamFilter) skipInitialFilterReload.current = effectiveFilter
        setStreamFilter(effectiveFilter)
      }
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [isLeadOrAdmin, isSupervisor, logDateFilter, viewerId, streamFilter, readPageContext])

  useEffect(() => {
    if (auth.status !== 'authenticated' || !allowed) return
    if (skipInitialFilterReload.current === streamFilter) { skipInitialFilterReload.current = null; return }
    fetchQueue()
  }, [auth.status, allowed, fetchQueue, retryKey, streamFilter])

  async function loadMore() {
    if (!cursorRef.current || moreInFlight.current || load.kind !== 'ready') return
    const gen = requestGen.current
    moreInFlight.current = true
    setLoadingMore(true)
    setMoreError(false)
    const stream = streamCatalog.find(stream => streamKey(stream.branch.id, stream.activity) === streamFilter)
    try {
      const rows = await listSubmittedKitchenLogs(logDateFilter || undefined, { before: cursorRef.current,
        ...(stream ? { stream: { branchId: stream.branch.id, activity: stream.activity } } : {}) })
      const page = await readPageContext(rows, branchCatalog)
      if (gen !== requestGen.current) return
      setLogs(previous => [...new Map([...previous, ...rows].map(row => [row.id, row])).values()])
      setStreamPlans(previous => new Map([...previous, ...page.plans]))
      setWastePhotosByLogId(previous => ({ ...previous, ...page.photosByLog }))
      setExternalProductionStreams(previous => new Set([...previous, ...page.pending]))
      cursorRef.current = rows.length === KITCHEN_LOGS_PAGE_SIZE ? rows.at(-1)! : null
      setHasMore(Boolean(cursorRef.current))
    } catch {
      if (gen === requestGen.current) setMoreError(true)
    } finally {
      if (gen === requestGen.current) { moreInFlight.current = false; setLoadingMore(false) }
    }
  }

  // #236 (FR-043): the production-first gate is PER STREAM — the set of streams whose
  // production is still Submitted, computed over the WHOLE queue (a row's lock depends on
  // its own stream's state, never on what the filter happens to show). The server owns
  // the rule (P0004); this mirror only decides which Approve buttons are worth offering.
  const pendingProductionStreams = useMemo(() => {
    const set = new Set(externalProductionStreams)
    for (const l of logs) {
      if (l.action === 'produce') set.add(streamDateKey(l.log_date, l.branch_id, l.activity))
    }
    return set
  }, [logs, externalProductionStreams])

  const rowGated = useCallback(
    (log: ReviewLogRow) =>
      log.action === 'transfer' && pendingProductionStreams.has(streamDateKey(log.log_date, log.branch_id, log.activity)),
    [pendingProductionStreams],
  )

  // #236/#783 (FR-040, AC-051): which rows THIS viewer may decide. ops_lead/admin decide
  // everything; a supervisor decides every stream she holds a live membership on — not only
  // her primary (`myStreamKeys` folds both in; see fetchQueue). Mirror of the server
  // predicate — the guard/policy refuses regardless of what renders here (NFR-002).
  const canDecide = useCallback(
    (log: ReviewLogRow) =>
      isLeadOrAdmin ||
      (isSupervisor && myStreamKeys.has(streamKey(log.branch_id, log.activity))),
    [isLeadOrAdmin, isSupervisor, myStreamKeys],
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
    (isLeadOrAdmin || (isSupervisor && myStreamKeys.has(streamFilter)))

  // FR-040/041: the displayed queue — one stream, or every stream. Display scoping only;
  // the rows a viewer may DECIDE are canDecide's (and ultimately the server's) business.
  const visibleLogs = useMemo(() => {
    const filtered = streamFilter === ALL_STREAMS
      ? logs
      : logs.filter(l => streamKey(l.branch_id, l.activity) === streamFilter)
    return [...filtered].sort((a, b) => a.log_date.localeCompare(b.log_date)
      || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  }, [logs, streamFilter])
  useEffect(() => {
    if (load.kind !== 'ready') return
    if (selectedLogId && visibleLogs.some(log => log.id === selectedLogId)) return
    setSelectedLogId(isDesktop ? visibleLogs[0]?.id ?? null : null)
  }, [isDesktop, load.kind, selectedLogId, setSelectedLogId, visibleLogs])
  const selectedLog = visibleLogs.find(log => log.id === selectedLogId) ?? null

  // KPIs summarise the queue AS FILTERED — the numbers must describe the rows on screen.
  const summary = useReviewSummary(visibleLogs, streamPlans)

  // Group oldest dates first, then preserve the existing Production → Transfer → Waste
  // action order inside each day. This keeps every older date visually ahead of newer work.
  const groupOrder = useMemo(() => {
    const dates = [...new Set(visibleLogs.map(log => log.log_date))]
    return dates.flatMap(logDate => {
      const actions = [...new Set(visibleLogs
        .filter(log => log.log_date === logDate)
        .map(log => log.action_type))]
      actions.sort((a, b) => {
        const rank = (label: string) => label === 'Production' ? 0 : isTransfer(label) ? 1 : 2
        return rank(a) - rank(b)
      })
      return actions.map(action => ({ logDate, action }))
    })
  }, [visibleLogs])

  const removeRow = useCallback((id: string) => {
    setLogs(previous => previous.filter(row => row.id !== id))
    const removed = logs.find(row => row.id === id)
    if (removed?.action !== 'produce') return
    const key = streamDateKey(removed.log_date, removed.branch_id, removed.activity)
    const token = (gateTokens.current.get(key) ?? 0) + 1
    gateTokens.current.set(key, token)
    const gen = requestGen.current
    void hasSubmittedKitchenProduction(removed.log_date, removed.branch_id, removed.activity).then(pending => {
      if (gen !== requestGen.current || token !== gateTokens.current.get(key)) return
      setExternalProductionStreams(previous => {
        const next = new Set(previous)
        if (pending) next.add(key)
        else next.delete(key)
        return next
      })
    }).catch(() => { /* Keep the last known gate until the queue is refreshed. */ })
  }, [logs])

  async function handleApprove(logId: string, reviewNote: string | null, expectedUpdatedAt: string) {
    if (!isOnline) return
    setSubmittingId(logId)
    setActionError('')
    setNoticeCanViewPushes(false)
    try {
      const { batch_id } = await approveKitchenLog(logId, expectedUpdatedAt, reviewNote)
      removeRow(logId)
      setNotice(batch_id === null
        ? t('kitchen.review.notice.wasteHeld')
        : t('kitchen.review.notice.approved', { batchId: batch_id }))
      setNoticeCanViewPushes(isLeadOrAdmin && batch_id !== null)
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
    setNoticeCanViewPushes(false)
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
  async function handleConfirmComplete(target: ProductionStream | null = selectedStream) {
    if (!target || !isOnline) return
    const key = streamKey(target.branch.id, target.activity)
    setConfirmingStream(key)
    setActionError('')
    setNoticeCanViewPushes(false)
    try {
      const row = await confirmStreamComplete(target.branch.id, target.activity)
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
    (action: string, logDate?: string): ReviewLogRow[] =>
      visibleLogs.filter(
        l =>
          l.action_type === action &&
          (!logDate || l.log_date === logDate) &&
          l.action !== 'waste' &&
          canDecide(l) &&
          !rowGated(l) &&
          !isOffPlan(l, planQtyFor(streamPlans, l)),
      ),
    [visibleLogs, canDecide, rowGated, streamPlans],
  )

  async function handleBulkApprove(action: string, logDate?: string) {
    if (!isOnline) return
    const eligible = bulkEligible(action, logDate)
    if (eligible.length === 0) return
    setBulkAction(logDate ? `${logDate}|${action}` : action)
    setActionError('')
    setNotice('')
    setNoticeCanViewPushes(false)
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
        const result = await approveKitchenLog(log.id, log.updated_at, null)
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
        const result = await approveKitchenLogsBulk(session, null)
        approved += session.length
        for (const batchId of result.batch_ids ?? []) batches.push(batchId)
        session.forEach(log => removeRow(log.id))
      } catch (err) {
        if (err instanceof KitchenRpcError && err.code === 'P0003') {
          // A stale member must not discard the rest of a live session. Retry each row;
          // the RPC then approves eligible rows and identifies only the stale ones.
          for (const log of session) {
            try {
              const result = await approveKitchenLog(log.id, log.updated_at, null)
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
      setNoticeCanViewPushes(isLeadOrAdmin && approved > 0)
    } else if (approved > 0) {
      setNotice(
        approved === 1
          ? t('kitchen.review.notice.approved', { batchId: batches[0] ?? '—' })
          : t('kitchen.review.notice.bulkApproved', { approved, batchId: batches.join(', ') }),
      )
      setNoticeCanViewPushes(isLeadOrAdmin)
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
    setActionError(saveErrorMessage(err, t))
  }

  // ── One DataTable group per (log date, action label). Date-first grouping makes the
  // cross-date oldest-first order visible; each bulk button is date-scoped so its RPC never
  // crosses the DB's single-date batch boundary. ─────────────────────────────────────────
  const bulkDisabled = !isOnline || submittingId !== null || bulkAction !== null
  const tableGroups: DataTableGroup<ReviewLogRow>[] = groupOrder
    .map(({ logDate, action }) => {
      const rows = visibleLogs.filter(l => l.log_date === logDate && l.action_type === action)
      const actionLabel = rows[0]
        ? deriveActionLabel(t, { action: rows[0].action, destinationBranchId: rows[0].destination_branch_id }, branchCatalog)
        : action
      const dateLabel = formatWeekdayDayMonth(logDate)
      // The gate is scoped to this date's rows as well as to each stream.
      const transferGated = isTransfer(action) && rows.some(rowGated)
      const eligibleCount = bulkEligible(action, logDate).length
      const groupKey = `${logDate}|${action}`
      const showActions = transferGated || eligibleCount > 0
      const productionAnchor = groupOrder.some(group => group.logDate === logDate && group.action === 'Production')
        ? `kr-group-${logDate}-production` : undefined
      return {
        key: groupKey,
        label: `${dateLabel} · ${actionLabel}`,
        anchorId: action === 'Production' ? productionAnchor : undefined,
        rows,
        headerActions: showActions
          ? (
              <GroupActions
                transferGated={transferGated}
                productionAnchor={productionAnchor}
                eligibleCount={eligibleCount}
                partial={hasMore}
                bulkBusy={bulkAction === groupKey}
                disabled={bulkDisabled}
                actionLabel={`${actionLabel} · ${dateLabel}`}
                onBulkApprove={() => handleBulkApprove(action, logDate)}
              />
            )
          : null,
      }
    })
    .filter(g => g.rows.length > 0)

  const columns: DataTableColumn<ReviewLogRow>[] = [{
    key: 'reviewMaster',
    header: t('kitchen.review.master.heading'),
    cardLabel: '',
    render: log => {
      const plan = planQtyFor(streamPlans, log)
      const offPlan = log.qty_porsi !== plan
      const canApproveInline = canDecide(log) && !rowGated(log) && (!offPlan || Boolean(log.notes?.trim()))
      return <div className="kr-master-entry">
        <button type="button" className="kr-master-row" aria-pressed={log.id === selectedLogId} onClick={() => setSelectedLogId(log.id)}>
          <span className="kr-master-row__identity">{log.wip_item_name}</span>
          <Tag color={offPlan ? 'amber' : 'green'}><span className="krow-dot" aria-hidden="true" />{offPlan ? t('kitchen.review.tag.offPlan') : t('kitchen.review.tag.onPlan')}</Tag>
          <span className="kr-master-row__meta">{formatWeekdayDayMonth(log.log_date)} · {deriveActionLabel(t, { action: log.action, destinationBranchId: log.destination_branch_id }, branchCatalog)}{streamFilter === ALL_STREAMS ? ` · ${rowStreamLabel(t, streamCatalog, log)}` : ''}</span>
          {!offeredKeys.has(streamItemKey(log.branch_id, log.activity, log.wip_item_id)) && <NotOnStreamTag />}
          <span className="kr-master-row__meta">{t('kitchen.review.qty.plan')} {plan} · {t('kitchen.review.qty.logged')} {formatLogEntryQuantity(log)} · {peopleMap.get(log.submitted_by ?? '') ?? '—'}</span>
        </button>
        {canApproveInline && <button type="button" className="btn btn-outline kr-master-approve" disabled={!isOnline || submittingId !== null} onClick={() => void handleApprove(log.id, null, log.updated_at)}>{submittingId === log.id ? t('common.working') : t('kitchen.review.approve')}</button>}
      </div>
    },
  }]
  const renderReviewCard = (log: ReviewLogRow) => columns[0].render?.(log) ?? null

  const reviewWorkbench = selectedLog ? (() => {
    const log = selectedLog
    const planQty = planQtyFor(streamPlans, log)
    const offPlan = log.qty_porsi !== planQty
    const name = peopleMap.get(log.submitted_by ?? '') ?? '—'
    const gated = rowGated(log)
    return <article className="kr-workbench">
      <h2>{log.wip_item_name}</h2>
      <div className="kr-workbench__meta">
        <span>{formatWeekdayDayMonth(log.log_date)} · {deriveActionLabel(t, { action: log.action, destinationBranchId: log.destination_branch_id }, branchCatalog)}</span>
        {streamFilter === ALL_STREAMS && <span>{rowStreamLabel(t, streamCatalog, log)}</span>}
        <span className="kr-workbench__submitter"><Avatar size="sm" placeholder={name} /><span>{name}</span><span>{formatTime(log.created_at)}</span></span>
        {!offeredKeys.has(streamItemKey(log.branch_id, log.activity, log.wip_item_id)) && <NotOnStreamTag />}
        <Tag color={offPlan ? 'amber' : 'green'}><span className="krow-dot" aria-hidden="true" />{offPlan ? t('kitchen.review.tag.offPlan') : t('kitchen.review.tag.onPlan')}</Tag>
      </div>
      <dl className="kr-workbench__comparison">
        <div><dt>{t('kitchen.review.qty.plan')}</dt><dd>{planQty}</dd></div>
        <div><dt>{t('kitchen.review.qty.logged')}</dt><dd>{formatLogEntryQuantity(log)}</dd></div>
      </dl>
      {log.action === 'waste' && <WastePhotoStrip photos={wastePhotosByLogId[log.id]} />}
      <section className="kr-workbench__note"><h3>{t('kitchen.review.col.note')}</h3>{log.notes ? <p>“{log.notes}”</p> : <p>{t('kitchen.review.detail.noNote')}</p>}</section>
      {canDecide(log) ? <DecisionBar><KitchenReviewDecision log={log} planQty={planQty} approveDisabled={gated || !isOnline} approveDisabledReason={gated ? t('kitchen.review.gate.productionFirst') : ''} submitting={submittingId === log.id} onApprove={handleApprove} onReject={handleReject} /></DecisionBar>
        : <p className="krow-othersstream">{t('kitchen.review.opsLeadOnly')}</p>}
    </article>
  })() : <p className="kr-workbench__empty">{t('kitchen.review.master.choose')}</p>

  if (auth.status === 'loading') {
    return (
      <CafePageFrame page="review" streamBar={{ options: [], stream: null, allStreams: true }} state="loading">
        <LoadingShell count={3} />
      </CafePageFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <CafePageFrame page="review" streamBar={{ options: [], stream: null, allStreams: true }} state="permission">
        <div className="kr-block kr-forbidden">
          <p className="kr-forbidden-msg">{t('kitchen.review.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </CafePageFrame>
    )
  }

  if (!allowed) {
    return (
      <CafePageFrame page="review" streamBar={{ options: [], stream: null, allStreams: true }} state="permission">
        <div className="kr-block kr-forbidden" role="region" aria-label={t('kitchen.review.restrictedAria')}>
          <p className="kr-forbidden-title">{t('kitchen.review.leadsOnly')}</p>
          <p className="kr-forbidden-msg">{t('kitchen.review.leadsOnlyMsg')}</p>
          <Link to="/cafe" className="btn btn-outline">{t('kitchen.review.backToLog')}</Link>
        </div>
      </CafePageFrame>
    )
  }

  const submittedCount = visibleLogs.length
  const completenessRow = load.kind === 'ready' && submittedCount > 0 && streamCatalog.length > 0 && selectedStream
    ? (() => {
        const key = streamKey(selectedStream.branch.id, selectedStream.activity)
        const confirmed = completeness.get(key) ?? null
        const busy = confirmingStream === key
        const stateText = confirmed
          ? t('kitchen.review.completeness.confirmed', {
              who: peopleMap.get(confirmed.confirmed_by) ?? '—',
              when: formatDate(confirmed.confirmed_at),
            })
          : t('kitchen.review.completeness.unconfirmed')
        return (
          <div className="kr-complete kr-complete-foot" role="group" aria-label={t('kitchen.review.completeness.aria')}>
            {canConfirmSelected ? (
              <>
                {/* While unconfirmed the visible label states the action the checkbox performs
                    ("Confirm the item list is complete"), not just the bare status ("not
                    confirmed complete yet") — labelled as something to DO rather than read. */}
                <label className="kr-complete-check">
                  <input
                    type="checkbox"
                    checked={Boolean(confirmed)}
                    disabled={Boolean(confirmed) || busy || !isOnline}
                    aria-label={confirmed ? stateText : t('kitchen.review.completeness.confirm')}
                    onChange={() => { void handleConfirmComplete() }}
                  />
                  <span className={`kr-complete-state${confirmed ? ' kr-complete-yes' : ''}`}>
                    {confirmed ? stateText : t('kitchen.review.completeness.confirm')}
                  </span>
                </label>
                {confirmed && (
                  <button
                    type="button"
                    className="btn btn-ghost kr-complete-reconfirm"
                    disabled={busy || !isOnline}
                    onClick={() => { void handleConfirmComplete() }}
                  >
                    {t('kitchen.review.completeness.reconfirm')}
                  </button>
                )}
              </>
            ) : (
              <span className={`kr-complete-state${confirmed ? ' kr-complete-yes' : ''}`}>{stateText}</span>
            )}
            {busy && <span className="kr-complete-saving">{t('kitchen.review.completeness.saving')}</span>}
          </div>
        )
      })()
    : null

  // Under "All streams" there is no single list to vouch for, so each stream with pending logs gets its own line:
  // the same confirmation as the one-stream view, one tap away without switching stream first.
  const pendingStreams = streamFilter === ALL_STREAMS && load.kind === 'ready'
    ? [...new Set(visibleLogs.map(log => streamKey(log.branch_id, log.activity)))]
        .map(key => streamCatalog.find(stream => streamKey(stream.branch.id, stream.activity) === key))
        .filter((stream): stream is ProductionStream => stream !== undefined)
    : []
  const completenessAll = pendingStreams.length > 0 ? (
    <section className="kr-complete-all" aria-label={t('kitchen.review.completeness.aria')}>
      <ul>
        {pendingStreams.map(stream => {
          const key = streamKey(stream.branch.id, stream.activity)
          const confirmed = completeness.get(key) ?? null
          const canConfirm = isLeadOrAdmin || (isSupervisor && myStreamKeys.has(key))
          const busy = confirmingStream === key
          const name = streamLabel(t, stream)
          return (
            <li key={key}>
              <span className={`kr-complete-state${confirmed ? ' kr-complete-yes' : ''}`}>
                {confirmed
                  ? `${name} — ${t('kitchen.review.completeness.confirmed', { who: peopleMap.get(confirmed.confirmed_by) ?? '—', when: formatDate(confirmed.confirmed_at) })}`
                  : canConfirm ? t('cafe.review.complete.row', { stream: name }) : `${name} — ${t('kitchen.review.completeness.unconfirmed')}`}
              </span>
              {canConfirm && (
                <button
                  type="button"
                  className="btn btn-outline kr-complete-confirm"
                  aria-label={`${t(confirmed ? 'kitchen.review.completeness.reconfirm' : 'kitchen.review.completeness.confirm')} — ${name}`}
                  disabled={busy || !isOnline}
                  onClick={() => { void handleConfirmComplete(stream) }}
                >
                  {busy ? t('kitchen.review.completeness.saving') : t(confirmed ? 'kitchen.review.completeness.reconfirm' : 'cafe.review.complete.confirm')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  ) : null

  return (
    <CafePageFrame
      page="review"
      /* #236 (FR-041) + #440: the queue's stream — a supervisor opens on their own, ops_lead/
         admin cross-stream, and a stream chosen elsewhere in Café outranks both; either can move
         it. It reads in the head now, like every other Café surface, instead of as a filter chip
         buried above the queue: WHOSE books these rows are is the first thing a reviewer needs.
         "All streams" stays a first-class choice here — reviewing across streams is this
         surface's job (OD-WAY-48), and it is the one Café surface that has one. Display scoping
         only (NFR-002: the decision contract is the server's). */
      streamBar={{
        options: streamCatalog,
        stream: selectedStream,
        allStreams: streamFilter === ALL_STREAMS,
        onChange: next => {
          setStreamFilter(streamKey(next.branch.id, next.activity))
          // Review remembers the selected branch without claiming a location.
          rememberStream(next, viewerId, next.branch.id)
        },
        onAllStreams: () => setStreamFilter(ALL_STREAMS),
      }}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : submittedCount === 0 ? 'empty' : 'default'}
    >
      <div className="kr-review-views">
        <div className="kr-review-content">
        <div className="kr-log-workspace" hidden={reviewView !== 'logs'}>
      {/* Date scopes the Logs queue only (Counts has no date). */}
      <div className="kr-date-filterbar kr-block">
        <DateField
          id="kitchen-review-date-filter"
          className="kr-date-filter"
          label={t('kitchen.review.filter.date')}
          value={logDateFilter}
          onChange={setLogDateFilter}
          compact
        />
        {logDateFilter
          ? <button type="button" className="btn btn-outline kr-date-clear" onClick={() => setLogDateFilter('')}>{t('kitchen.review.filter.clear')}</button>
          : <span className="kr-all-pending" role="status">{t('kitchen.review.filter.allPending')}</span>}
      </div>
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
      {completenessRow}
      {completenessAll}

      {!isOnline && <Notice tone="attention" role="alert">{t('kitchen.review.offline')}</Notice>}

      {notice && (
        <Notice tone="success" action={noticeCanViewPushes ? <Link to="/cafe/pushes">{t('kitchen.review.notice.viewPushes')}</Link> : undefined}>
          {notice}
        </Notice>
      )}

      {actionError && <Notice tone="urgent">{actionError}</Notice>}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.queue') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && submittedCount === 0 && (
        <CafeQueueEmpty
          title={t(hasMore ? 'common.paging.emptyLoaded' : 'kitchen.review.empty.title')}
          action={<button type="button" className="btn btn-outline kr-refresh" onClick={() => setRetryKey(k => k + 1)}>{t('kitchen.review.refresh')}</button>}
        >
          {hasMore ? t('common.paging.continue') : logDateFilter
            ? selectedStream
              ? t('kitchen.review.empty.copyStream', { stream: streamLabel(t, selectedStream), date: formatWeekdayDayMonth(logDateFilter) })
              : t('kitchen.review.empty.copy', { date: formatWeekdayDayMonth(logDateFilter) })
            : selectedStream
              ? t('kitchen.review.empty.copyStreamAll', { stream: streamLabel(t, selectedStream) })
              : t('kitchen.review.empty.copyAll')
          }
        </CafeQueueEmpty>
      )}

      {load.kind === 'ready' && submittedCount > 0 && (
        <CafeCloseReviewWorkspace
          label={t('kitchen.review.caption')}
          selected={selectedLog !== null}
          onBack={() => setSelectedLogId(null)}
          backLabel={t('kitchen.review.master.back')}
          master={<DataTable columns={columns} rows={[]} groups={tableGroups} isDesktop={isDesktop} renderCard={renderReviewCard} caption={t('kitchen.review.caption')} />}
          detail={reviewWorkbench}
        />
      )}
      {load.kind === 'ready' ? <ListPaging count={visibleLogs.length} hasMore={hasMore}
        loading={loadingMore} error={moreError} onLoadMore={() => { void loadMore() }} /> : null}
        </div>
        <div hidden={reviewView !== 'counts'}><CafeCountReviewQueue
          streamFilter={streamFilter}
          streamCatalog={streamCatalog}
          canReviewAll={isLeadOrAdmin}
          reviewableStreamKeys={myStreamKeys}
          viewerId={viewerId}
          refreshKey={retryKey}
        /></div>
        </div>
      </div>
    </CafePageFrame>
  )
}
