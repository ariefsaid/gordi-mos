// KitchenLogPage — /mos/kitchen/log — Log capture screen (OD-K-5 redesign).
// Design authority: docs/plans/2026-06-21-kitchen-log-redesign.md.
// ONE responsive screen built on the shared <DataTable> (desktop dense <table> +
// KPI strip (≥768px) ↔ phone floor-fast cards (<768px)), chosen via useIsDesktop()
// — ONE branch in the DOM (P-4).
//
// PARITY (unchanged from the prior screen — presentational redesign + derived KPIs ONLY):
//  - Data hooks unchanged in shape (listCaptureFormItems / fetchPlanMap / fetchStockMap /
//    resolveKitchenBuId / insertKitchenLogBatch).
//  - Gates unchanged (needsVarianceNote / transferExceedsAvailable / effectiveTarget).
//  - Submit payload byte-identical (NEVER sends status / org_id / submitted_by — NFR-003).
//  - AC-020/021 (variance-note gate), AC-022 (transfer cap REJECT — keeps typed qty),
//    AC-030 (submit payload) preserved.
// NEW (presentational only, P-1/P-3): the derived KPI strip (pure useMemo over `lines`),
// Planned/Off-plan grouping, client-side search + category filter, group collapse,
// Discard (confirmed). No new fetch/RPC/table/persistence/ESB.

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT, type Translate } from '@/i18n/use-t'
import {
  listCaptureFormItems,
  fetchPlanMap,
  fetchStockMap,
  resolveKitchenBuId,
  insertKitchenLogBatch,
  defaultStreamFrom,
} from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import type {
  BranchOption,
  KitchenLogLine,
  KitchenMovement,
  PlanMap,
  ProductionActivity,
  ProductionStream,
  StockMap,
  WipItemOption,
} from '@/lib/db/kitchen-logs.types'
import { PRODUCTION_ACTIVITIES } from '@/lib/db/kitchen-logs.types'
import {
  activityLabel,
  branchDisplayName,
  deriveActionLabel,
  movementKey,
  movementsForStream,
  PRODUCE,
} from '@/lib/kitchen-action-label'
import {
  needsVarianceNote,
  transferExceedsAvailable,
  VARIANCE_NOTE_CUE,
  TRANSFER_SHORT_CUE,
} from '@/lib/kitchen-gates'
import { useKitchenKpis } from '@/lib/kitchen-kpis'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { MovementSeg } from '@/components/kitchen/movement-seg'
import { Select } from '@/components/ui/select'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { WipItemStepper } from '@/components/kitchen/wip-item-stepper'
import { DataTable, type DataTableColumn, type DataTableGroup } from '@/components/dashboard/data-table'
import { kitchenStatus } from '@/lib/kitchen-status'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { HelpTip } from '@/components/ui/help-tip'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { ReportMissingItem } from '@/components/kitchen/report-missing-item'
import './kitchen-log-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007)
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

// Build fresh per-item line state from loaded items + plan + stock for one movement.
function buildLines(
  items: WipItemOption[],
  planMap: PlanMap,
  stockMap: StockMap,
  movement: KitchenMovement,
): Record<string, KitchenLogLine> {
  const lines: Record<string, KitchenLogLine> = {}
  for (const item of items) {
    const stock = stockMap[item.id]
    lines[item.id] = {
      wip_item_id: item.id,
      qty_porsi: 0,
      notes: '',
      plan_qty: planMap[item.id]?.[movementKey(movement)] ?? 0,
      stok: stock?.stok ?? 0,
      tersedia: stock?.tersedia ?? 0,
      dirty: false,
      error: '',
      capError: '',
    }
  }
  return lines
}

// Recompute a line's gate state (note + cap) against its qty / movement.
// FR-022: note required when qty != effective target (max(plan − stok, 0) for transfers).
// FR-023: transfer cue when qty > tersedia.
function gateLine(line: KitchenLogLine, movement: KitchenMovement): KitchenLogLine {
  if (line.qty_porsi <= 0) return { ...line, error: '', capError: '' }
  const error = needsVarianceNote(line, movement) && !line.notes.trim() ? VARIANCE_NOTE_CUE : ''
  const capError = transferExceedsAvailable(line, movement) ? TRANSFER_SHORT_CUE : ''
  return { ...line, error, capError }
}

// Nielsen sweep (Café·Log 24/40): kitchenStatus (src/lib/kitchen-status.ts, outside this
// slice's touch list) returns a hardcoded-English label alongside its `tone`. The tone
// mapping stays authoritative (untouched); this mirrors ONLY the label branching so the
// row status pill — the exact microcopy a floor worker reads at the moment they save —
// reads in the active locale. Duplicated (not imported) because the source file is out
// of scope for this pass; the branching is a straight copy of kitchenStatus's own.
function statusLabel(t: Translate, made: number, plan: number): string {
  if (plan <= 0) return made > 0 ? t('kitchen.status.logged') : t('kitchen.status.notLogged')
  if (made >= plan) {
    if (made === plan) return t('kitchen.status.onPlan')
    return t('kitchen.status.over', { count: made - plan })
  }
  return t('kitchen.status.under', { count: plan - made })
}

type PageStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'success'; count: number }

export function KitchenLogPage() {
  const auth = useAuth()
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.kitchen.log') }))
  const isDesktop = useIsDesktop()
  // I18N sweep: the H1 was a literal "Café · Log" — mixed-locale in `id` (breadcrumb
  // correctly translated the module/page, the heading below it did not). Reuses the
  // existing nav.cafe.* family rather than adding a duplicate composed key.
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.log')}`

  // The (branch, activity) production stream every captured row belongs to (OD-WAY-28), and
  // the movement within it (DD-WAY-13). `stream` is null only until the branch catalog has
  // loaded, or when the org has no branches at all — and while it is null nothing can be
  // submitted, because `ops.kitchen_logs.branch_id` / `.activity` are NOT NULL (AC-007).
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [stream, setStream] = useState<ProductionStream | null>(null)
  const [movement, setMovement] = useState<KitchenMovement>(PRODUCE)
  const [logDate] = useState(wibToday) // today WIB; owner-decision: allow past dates flagged
  const [wipItems, setWipItems] = useState<WipItemOption[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [buId, setBuId] = useState('')
  const [lines, setLines] = useState<Record<string, KitchenLogLine>>({})
  const [status, setStatus] = useState<PageStatus>({ kind: 'loading' })
  const [submitError, setSubmitError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  // Client-side search + category (P-3), URL-synced so the view survives refresh/share (I7 / D-E1).
  // Group collapse stays INTERNAL to the shared <DataTable> (no page-level collapsedGroups state).
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')

  // Derived KPIs (P-1) — pure useMemo over `lines`; no fetch/RPC/persistence.
  const kpis = useKitchenKpis(lines)

  // Online/offline detection (NFR-008)
  useEffect(() => {
    function handleOnline() { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load the branch catalog + WIP items + the Café BU id, then the plan and stock FOR THE
  // RESOLVED STREAM. Plan and stock are stream-scoped reads now (OD-WAY-28): the date-only
  // signatures they replace summed every branch's balance and reported the total as any one
  // of them, so the stream has to be resolved before either can be asked for.
  const loadData = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const [items, branchRows, bu] = await Promise.all([
        // The GATED item source (FR-011, DD-WAY-29): only confirmed item-units reach the
        // capture form. Stock/plan surfaces keep the ungated listActiveWipItems.
        listCaptureFormItems(),
        listActiveBranches(),
        resolveKitchenBuId(),
      ])
      const resolvedStream = defaultStreamFrom(branchRows)
      const resolvedMovement = PRODUCE
      const [plan, stock] = resolvedStream
        ? await Promise.all([
            fetchPlanMap(logDate, resolvedStream),
            fetchStockMap(logDate, resolvedStream),
          ])
        : [{} as PlanMap, {} as StockMap]
      setWipItems(items)
      setBranches(branchRows)
      setStream(resolvedStream)
      setMovement(resolvedMovement)
      setPlanMap(plan)
      setStockMap(stock)
      setBuId(bu)
      setLines(buildLines(items, plan, stock, resolvedMovement))
      setStatus({ kind: 'ready' })
    } catch {
      // Can't resolve items/branches/stock/BU — render an error state rather than stamping a
      // wrong BU or capturing against a guessed stream.
      setStatus({ kind: 'error', message: t('common.loadFailed', { what: t('common.what.items') }) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate, retryKey])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    loadData()
  }, [auth.status, loadData])

  // Rebuild plan_qty / stock / gate state per line when the movement or the loaded
  // stream-scoped plan/stock change.
  useEffect(() => {
    if (wipItems.length === 0) return
    setLines(prev => {
      const next = { ...prev }
      for (const item of wipItems) {
        const base: KitchenLogLine = {
          ...next[item.id],
          plan_qty: planMap[item.id]?.[movementKey(movement)] ?? 0,
          stok: stockMap[item.id]?.stok ?? 0,
          tersedia: stockMap[item.id]?.tersedia ?? 0,
        }
        next[item.id] = gateLine(base, movement)
      }
      return next
    })
  }, [movement, wipItems, planMap, stockMap])

  function handleMovementChange(next: KitchenMovement) {
    setMovement(next)
  }

  // Switching the stream re-reads the plan and the stock, because both are stream-scoped
  // facts: the same dish has a different plan and a different balance in another branch's
  // books. Staged quantities are cleared with them — a typed number belongs to the stream it
  // was typed against, and silently re-filing it under a different one is how a COGS series
  // acquires rows nobody meant.
  const applyStream = useCallback(async (nextStream: ProductionStream) => {
    setStream(nextStream)
    setMovement(PRODUCE)
    setStatus({ kind: 'loading' })
    try {
      const [plan, stock] = await Promise.all([
        fetchPlanMap(logDate, nextStream),
        fetchStockMap(logDate, nextStream),
      ])
      setPlanMap(plan)
      setStockMap(stock)
      setLines(buildLines(wipItems, plan, stock, PRODUCE))
      setStatus({ kind: 'ready' })
    } catch {
      setStatus({ kind: 'error', message: t('common.loadFailed', { what: t('common.what.items') }) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate, wipItems])

  function handleQtyChange(itemId: string, qty: number) {
    setLines(prev => {
      const cur = prev[itemId]
      // FR-023 / AC-022: do NOT clamp — keep the entered qty. An over-`tersedia` transfer
      // sets capError (TRANSFER_SHORT_CUE) which blocks Submit (parity with the OLD app's
      // hard stop "Produksi dulu sebelum transfer"); the user types the real number.
      const staged = qty > 0
      const gated = gateLine({ ...cur, qty_porsi: qty, dirty: staged }, movement)
      return { ...prev, [itemId]: gated }
    })
  }

  function handleNotesChange(itemId: string, note: string) {
    setLines(prev => {
      const next: KitchenLogLine = { ...prev[itemId], notes: note }
      return { ...prev, [itemId]: gateLine(next, movement) }
    })
  }

  // Discard all staged entries (consequential — confirmed). Opens the shared centered
  // dialog (DESIGN.md Overlays: "destructive confirmation is one centered blocking
  // dialog") rather than window.confirm, which is unstyled and not app-consistent.
  function handleDiscardClick() {
    const stagedCount = Object.values(lines).filter(l => l.qty_porsi > 0).length
    if (stagedCount === 0) return
    setDiscardConfirmOpen(true)
  }

  // Clears only the staged quantities/notes for the current action_type. Search and
  // category are independent view/filter state, not staged data — Discard used to wipe
  // them too, silently losing the user's filter context along with their entries.
  function performDiscard() {
    setLines(buildLines(wipItems, planMap, stockMap, movement))
    setDiscardConfirmOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline) return

    const staged = Object.values(lines).filter(l => l.qty_porsi > 0)
    if (staged.length === 0) return

    // Re-gate all staged lines; block on any note-required or cap violation.
    let hasErrors = false
    const validated = { ...lines }
    for (const line of staged) {
      const gated = gateLine({ ...line, dirty: true }, movement)
      if (gated.error || gated.capError) {
        validated[line.wip_item_id] = gated
        hasErrors = true
      }
    }
    if (hasErrors) {
      setLines(validated)
      return
    }

    if (!buId) {
      setSubmitError('Cannot determine the Café business unit. Please contact an admin.')
      return
    }

    // AC: a production log cannot be submitted without its (branch, activity) stream. The
    // columns are NOT NULL and the insert helper refuses too — this is the third of three,
    // and the only one the capturer ever sees.
    if (!stream) {
      setSubmitError(t('kitchen.log.stream.missing'))
      return
    }

    setStatus({ kind: 'submitting' })
    setSubmitError('')
    try {
      await insertKitchenLogBatch(
        staged.map(line => ({
          business_unit_id: buId,
          log_date: logDate,
          // the (branch, activity) production stream this row belongs to (OD-WAY-28)
          branch_id: stream.branch.id,
          activity: stream.activity,
          // the movement — no stored action_type (DD-WAY-13)
          action: movement.action,
          destination_branch_id: movement.destinationBranchId,
          wip_item_id: line.wip_item_id,
          qty_porsi: line.qty_porsi,
          notes: line.notes.trim() || null,
          // status / source / org_id / submitted_by NOT sent — server-stamped (NFR-003)
        })),
      )
      setStatus({ kind: 'success', count: staged.length })
      setLines(buildLines(wipItems, planMap, stockMap, movement))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('common.unexpectedError'))
      setStatus({ kind: 'ready' })
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="loading">
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <LoadingShell count={3} />
        </div>
      </PageFamilyFrame>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kl-page kl-unauth kl-block">
          <p className="kl-unauth-msg">You need to sign in to use the Café Log.</p>
          <Link to="/login" className="btn btn-primary btn-touch kl-touch">Sign in</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Data loading state — offline indicator surfaced here too (#2, RI-2) ──────
  if (status.kind === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="loading" meta={<span className="kl-date tabular">{logDate}</span>}>
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <LoadingShell count={3} />
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Error state — never a bare Retry loop when offline (#2, RI-2) ────────────
  if (status.kind === 'error') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="error" meta={<span className="kl-date tabular">{logDate}</span>}>
        <div className="kl-page kl-error kl-block">
          <OfflineBanner show={!isOnline} />
          <p className="kl-error-msg" role="alert">
            {!isOnline ? t('kitchen.log.offline.error') : status.message}
          </p>
          <button
            type="button"
            className="btn btn-outline btn-touch kl-touch"
            aria-label={t('kitchen.log.retryAria')}
            onClick={() => setRetryKey(k => k + 1)}
          >
            {t('common.retry')}
          </button>
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Empty state (no WIP items) — no KPI strip (nothing to derive, plan §7) ────
  if (wipItems.length === 0) {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="empty" meta={<span className="kl-date tabular">{logDate}</span>}>
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          {/* 'blank' — no WIP items are configured yet (an ops-lead task), not a source that
              fills on its own; never 'quiet' ✓, which would misread as "nothing to log,
              all done" instead of "nothing CAN be logged until items exist". */}
          <EmptyState
            variant="blank"
            title={t('kitchen.empty.noActiveItems.title')}
            copy={t('kitchen.log.empty.copy')}
          />
          {/* AC-013: the DD-WAY-29 gate also empties this list when nothing is confirmed —
              the report route must be reachable from here too, not only under a full list. */}
          {buId && <ReportMissingItem businessUnitId={buId} />}
        </div>
      </PageFamilyFrame>
    )
  }

  const isSubmitting = status.kind === 'submitting'
  const stagedLines = Object.values(lines).filter(l => l.qty_porsi > 0)
  const stagedCount = stagedLines.length
  // FR-023 / AC-022: an over-`tersedia` transfer line is a hard stop — Submit stays
  // disabled while any staged line exceeds availability (the line shows the cue).
  const hasBlockingError = stagedLines.some(
    l => transferExceedsAvailable(l, movement),
  )
  // A row cannot exist without its (branch, activity) stream (OD-WAY-28) — the columns are
  // NOT NULL. With no resolved stream there is nothing to submit AGAINST, so Submit is
  // disabled up front and the reason is named beside it, rather than the capturer typing a
  // whole service and being refused by the database.
  const streamMissing = stream === null
  // F3 (FR-022): surface the variance-note gate as an EXPLICIT disabled control — a
  // staged off-plan line whose required note is empty disables Submit (the blocking
  // state is visible up front, not enabled-until-bounced). handleSubmit still re-gates
  // on click (defense in depth — the re-gate is the authority, this is the UX cue).
  const noteUnresolved = stagedLines.some(
    l => needsVarianceNote(l, movement) && !l.notes.trim(),
  )

  // ── Shared DataTable wiring (P-4: ONE branch in the DOM) ───────────────────
  // Client-side search + category filter (parity with the prior desktop toolbar),
  // then the Planned/Off-plan split fed to the DataTable `groups` prop. Group
  // collapse is INTERNAL to the DataTable (no page-level state). Token-only.
  const q = search.trim().toLowerCase()
  const matchSearch = (it: WipItemOption) => !q || it.name.toLowerCase().includes(q)
  const matchCat = (it: WipItemOption) => category === 'All' || (it.category ?? '') === category
  const visibleItems = wipItems.filter(it => matchSearch(it) && matchCat(it))
  const plannedLines = visibleItems.filter(it => (lines[it.id]?.plan_qty ?? 0) > 0)
  const offPlanLines = visibleItems.filter(it => (lines[it.id]?.plan_qty ?? 0) <= 0)
  const categories = [
    'All',
    ...Array.from(new Set(wipItems.map(i => i.category ?? '').filter(Boolean))).sort(),
  ]

  const columns: DataTableColumn<WipItemOption>[] = [
    {
      key: 'dish',
      header: t('kitchen.log.col.dish'),
      cardLabel: '',
      render: item => (
        <span className="kl-dish">
          <span className="kl-dish-name">{item.name}</span>
          {item.category && <span className="kl-dish-cat">{item.category}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('kitchen.log.col.plan'),
      numeric: true,
      render: item => {
        const plan = lines[item.id]?.plan_qty ?? 0
        return plan > 0 ? plan : '—'
      },
    },
    {
      key: 'stock',
      header: t('kitchen.log.col.stock'),
      numeric: true,
      render: item => lines[item.id]?.stok ?? 0,
    },
    {
      key: 'made',
      header: t('kitchen.log.col.made'),
      // The reused WipItemStepper (SAME props/handlers as the prior phone card):
      // name + stepper + plan/stok/tersedia meta + cap cue + variance-note gate.
      // cafe-3: dense on the desktop table row (drops the bordered/full-width card
      // box that otherwise creates card-soup + a dead void in the column); the phone
      // card floor keeps the full card look (dense omitted there via isDesktop).
      render: item => (
        <WipItemStepper
          itemName={item.name}
          line={lines[item.id]}
          movement={movement}
          onQtyChange={qty => handleQtyChange(item.id, qty)}
          onNotesChange={note => handleNotesChange(item.id, note)}
          disabled={isSubmitting}
          hideName
          dense={isDesktop}
        />
      ),
    },
    {
      key: 'status',
      header: t('kitchen.log.col.status'),
      render: item => {
        const line = lines[item.id]
        const status = kitchenStatus({
          made: line.qty_porsi,
          plan: line.plan_qty,
          isOffPlan: line.plan_qty <= 0,
        })
        // v4: was a filled <Pill> on EVERY row, which rendered the column as a wall of red at
        // shift start. Two changes: the fill is dropped (toned text, same tone semantics —
        // kitchenStatus is untouched), and the status only renders once a quantity has been
        // TYPED. The owner's requirement is immediate per-menu feedback when production diverges
        // from plan; at rest nothing has diverged yet, so an empty cell is the honest state.
        if (line.qty_porsi <= 0) return null
        return <span className={`kl-status kl-status--${status.tone}`}>{statusLabel(t, line.qty_porsi, line.plan_qty)}</span>
      },
    },
  ]

  /**
   * v4 — the phone capture row. The generic DataTable card rendered five labelled
   * <dl> rows per dish (~200px), so a 21-dish service was ~4,000px of scrolling and about
   * one dish visible at a time. The contributor's job is "capture in one short pass and be
   * back to work in under a minute", so the row is built for running a list and acting on
   * each item: identity on the left, the stepper on the right where the thumb is, basis and
   * status on one muted line beneath. Same data, same controls, ~76px instead of ~200px.
   * Touch targets stay ≥44px (.kls-qty is unchanged).
   */
  const renderLogCard = (item: WipItemOption) => {
    const line = lines[item.id]
    if (!line) return null
    const status = kitchenStatus({
      made: line.qty_porsi,
      plan: line.plan_qty,
      isOffPlan: line.plan_qty <= 0,
    })
    return (
      <div className="kl-card">
        <div className="kl-card-head">
          <span className="kl-card-name">{item.name}</span>
          <WipItemStepper
            itemName={item.name}
            line={line}
            movement={movement}
            onQtyChange={qty => handleQtyChange(item.id, qty)}
            onNotesChange={note => handleNotesChange(item.id, note)}
            disabled={isSubmitting}
            hideName
            dense
          />
        </div>
        {/* v4 (owner-corrected): the meta line no longer restates Plan — the greyed placeholder
            inside the qty field IS the plan anchor, so printing it again broke the same
            No-Restated-Value rule this pass exists to enforce. And status renders ONLY once a
            quantity has been typed: the owner's requirement is immediate feedback *when
            production diverges from plan*, per menu. At rest nothing has diverged, so a red
            "Under −25" on all 21 rows was noise wearing feedback's clothes. */}
        {/* v4 (owner-directed): category is gone — the toolbar already filters by category and
            the list is grouped, so repeating it on every row was noise. The meta line now renders
            ONLY when it has something to say, so a normal row is a single line. */}
        {/* layout/distill pass: the "no plan" caption used to render on EVERY row of the
            Off-plan group — the group header + its "log as produced" hint already say that
            once for the whole group (DataTable groups.hint), so repeating it per row was the
            exact "true of every row → not information" pattern that dropped the status-pill
            fill (kl-status below). Off-plan rows are now silent at rest, same as planned rows. */}
        {line.qty_porsi > 0 && (
          <div className="kl-card-meta">
            <span className={`kl-status kl-status--${status.tone}`}>{statusLabel(t, line.qty_porsi, line.plan_qty)}</span>
          </div>
        )}
      </div>
    )
  }

  const groups: DataTableGroup<WipItemOption>[] = [
    { key: 'planned', label: t('kitchen.log.group.planned'), count: plannedLines.length, rows: plannedLines },
    { key: 'offplan', label: t('kitchen.log.group.offplan'), hint: t('kitchen.log.group.offplan.hint'), count: offPlanLines.length, rows: offPlanLines },
  ]

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      /* v4 (owner-directed): the date chip and the planned-total band were two stacked lines
         saying very little. They are now one compacted meta line, in separate columns. */
      meta={
        <span className="kl-meta-line">
          {/* onboard (2026-07-28): Café - Log is the FIRST MOS surface a new floor hire ever
              opens, and it had no in-app help. It rides in the existing meta line rather than
              claiming new chrome, because DD-15 already measured chrome as this surface's
              dominant phone cost. */}
          <HelpTip label={t('kitchen.log.help')} />
          <span className="kl-date tabular">{logDate}</span>
          {kpis.plannedTotal > 0 && (
            <span className="kl-plan-sum">
              {t('kitchen.kpi.plannedTotal')} <strong className="tabular">{kpis.plannedTotal}</strong>
              <span className="kl-plan-dishes tabular">{kpis.plannedDishCount}</span>
            </span>
          )}
        </span>
      }
      state={status.kind === 'submitting' ? 'saving' : status.kind === 'success' ? 'saved' : submitError ? 'validation' : 'default'}
    >
      <div className="kl-page">
        {/* GAP-4/#9: staged-but-unsubmitted quantities must not vanish on navigation — prompt
            stay/discard when leaving the route with unsaved entries. */}
        <RouteLeaveGuard when={stagedCount > 0} message={t('kitchen.log.leave.confirm')} />
        <OfflineBanner show={!isOnline} />

        {/* Derived KPI strip (P-1) — pure view over `lines`; one branch in the DOM */}

        {submitError && (
          <div role="alert" className="kl-banner kl-banner-error kl-block">
            {submitError}
          </div>
        )}

        {status.kind === 'success' && (
          <div role="status" aria-live="polite" className="kl-banner kl-banner-success kl-block">
            {t(status.count === 1 ? 'kitchen.log.success.one' : 'kitchen.log.success.other', { count: status.count })}
          </div>
        )}

        <form
          id="kitchen-log-form"
          onSubmit={handleSubmit}
          noValidate
          aria-label={t('kitchen.log.captureAria')}
          className="kl-form"
        >
          {/* Reflow (P-4): ONE branch in the DOM — the shared DataTable
              (desktop <table> ↔ phone cards) with the Planned/Off-plan group
              split + the Off-plan "log as produced" hint. */}
          {/* v4 chrome merge: the scope seg used to be its own bordered band stacked
              directly above this one — two utility strips, two paddings, two rules, for one
              row of controls. It is now the toolbar's LEADING scope slot, so the surface
              opens with one band and the dish list starts higher. The stream pickers join
              it there: which books a movement lands in decides what every row in the list
              means, exactly as the movement does, so the two belong in one scope block. */}
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={categories}
            category={category}
            onCategoryChange={setCategory}
            searchPlaceholder={t('kitchen.log.searchPlaceholder')}
            ariaLabel={t('kitchen.log.toolbarAria')}
          >
            <div className="kl-scope">
              <Select
                className="kl-scope-branch"
                aria-label={t('kitchen.log.stream.branchAria')}
                value={stream?.branch.id ?? ''}
                disabled={isSubmitting || branches.length === 0}
                onChange={e => {
                  const branch = branches.find(b => b.id === e.target.value)
                  if (branch && stream) void applyStream({ ...stream, branch })
                }}
              >
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branchDisplayName(branch)}</option>
                ))}
              </Select>
              <Select
                className="kl-scope-activity"
                aria-label={t('kitchen.log.stream.activityAria')}
                value={stream?.activity ?? ''}
                disabled={isSubmitting || !stream}
                onChange={e => {
                  if (stream) {
                    void applyStream({ ...stream, activity: e.target.value as ProductionActivity })
                  }
                }}
              >
                {PRODUCTION_ACTIVITIES.map(activity => (
                  <option key={activity} value={activity}>{activityLabel(t, activity)}</option>
                ))}
              </Select>
              <MovementSeg
                value={movement}
                options={movementsForStream(branches)}
                branches={branches}
                onChange={handleMovementChange}
                disabled={isSubmitting}
              />
            </div>
          </KitchenToolbar>
          <DataTable
            columns={columns}
            rows={visibleItems}
            groups={groups}
            renderCard={renderLogCard}
            isDesktop={isDesktop}
            state={visibleItems.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.log.caption')}
          />

          {/* AC-013 / FR-012: the DD-WAY-29 gate removes unconfirmed items silently, so the
              surface carries a visible route to report one missing — absence must never read
              as a bug with no exit. Own type="button" controls only; never submits this form. */}
          {buId && (
            <ReportMissingItem
              businessUnitId={buId}
              streamLabel={
                stream
                  ? `${branchDisplayName(stream.branch)} / ${activityLabel(t, stream.activity)}`
                  : undefined
              }
            />
          )}

          {/* Sticky action footer — ONE branch; tally + Discard + Submit */}
          <div className="kl-footer">
            <div className="kl-tally">
              <span className="kl-tally-num tabular">
                {t(stagedCount === 1 ? 'kitchen.log.footer.dish.one' : 'kitchen.log.footer.dish.other', { count: stagedCount })}
                {' · '}
                {t(kpis.madeSoFar === 1 ? 'kitchen.log.footer.unit.one' : 'kitchen.log.footer.unit.other', { count: kpis.madeSoFar })}
              </span>
              <span className="kl-tally-sub">{t('kitchen.log.footer.pendingReview')}</span>
            </div>
            <div className="kl-footer-actions">
              {/* F3 inline blocker reason — visible near the button so the user knows
                  why Submit is disabled without having to attempt a click (Fix 3). */}
              {streamMissing && (
                <span className="kl-submit-reason" role="status" aria-live="polite">
                  {t('kitchen.log.stream.missing')}
                </span>
              )}
              {noteUnresolved && !hasBlockingError && !streamMissing && (
                <span className="kl-submit-reason" role="status" aria-live="polite">
                  {t('kitchen.log.footer.noteRequired')}
                </span>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleDiscardClick}
                disabled={isSubmitting || stagedCount === 0}
              >
                {t('kitchen.log.discard')}
              </button>
              <SubmitButton
                stagedCount={stagedCount}
                isSubmitting={isSubmitting}
                isOnline={isOnline}
                blocked={hasBlockingError || noteUnresolved || streamMissing}
                t={t}
              />
            </div>
          </div>

          {/* Destructive confirm — DESIGN.md Overlays: "one centered blocking dialog",
              replacing window.confirm. Only the staged quantities are at stake; search
              and category filters are untouched by Discard. */}
          <ConfirmDialog
            open={discardConfirmOpen}
            title={t('kitchen.log.discard.confirmTitle')}
            body={t('kitchen.log.discard.confirmBody', {
              count: stagedCount,
              qty: t(stagedCount === 1 ? 'kitchen.log.discard.qty.one' : 'kitchen.log.discard.qty.other'),
              actionType: deriveActionLabel(t, movement, branches),
            })}
            confirmLabel={t('kitchen.log.discard')}
            cancelLabel={t('common.cancel')}
            tone="destructive"
            onConfirm={async () => performDiscard()}
            onCancel={() => setDiscardConfirmOpen(false)}
          />
        </form>
      </div>
    </PageFamilyFrame>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OfflineBanner({ show }: { show: boolean }) {
  const t = useT()
  if (!show) return null
  return (
    <div role="alert" aria-label={t('kitchen.log.offline.aria')} className="kl-banner kl-banner-offline kl-block">
      {t('kitchen.log.offline.banner')}
    </div>
  )
}

function SubmitButton({
  stagedCount,
  isSubmitting,
  isOnline,
  blocked = false,
  t,
}: {
  stagedCount: number
  isSubmitting: boolean
  isOnline: boolean
  /** true when a staged line exceeds transfer availability (FR-023 hard stop) */
  blocked?: boolean
  t: Translate
}) {
  const disabled = isSubmitting || !isOnline || stagedCount === 0 || blocked
  return (
    <button
      type="submit"
      className="btn btn-primary btn-touch kl-submit"
      disabled={disabled}
      aria-busy={isSubmitting}
    >
      {isSubmitting
        ? t('kitchen.log.submit.submitting')
        : stagedCount > 0
          ? t(stagedCount === 1 ? 'kitchen.log.submit.entry.one' : 'kitchen.log.submit.entry.other', { count: stagedCount })
          : t('kitchen.log.submit.default')}
    </button>
  )
}
