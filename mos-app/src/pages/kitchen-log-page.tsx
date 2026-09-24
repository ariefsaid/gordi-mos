// KitchenLogPage — /mos/kitchen/log — Log capture screen (OD-K-5 redesign).
// Design authority: docs/plans/2026-06-21-kitchen-log-redesign.md.
// ONE responsive screen built on the shared <DataTable> (desktop dense <table> +
// metric summary + phone floor-fast cards (<768px), chosen via useIsDesktop()
// — ONE branch in the DOM (P-4).
//
// PARITY (unchanged from the prior screen — presentational redesign + derived KPIs ONLY):
//  - Data hooks unchanged in shape (listCaptureFormItems / fetchPlanMap / fetchStockMap /
//    resolveKitchenBuId / insertKitchenLogBatch).
//  - Gates unchanged (needsVarianceNote / transferExceedsAvailable / effectiveTarget).
//  - Submit payload byte-identical (NEVER sends status / org_id / submitted_by — NFR-003).
//  - AC-020/021 (variance-note gate), AC-022 (transfer cap REJECT — keeps typed qty),
//    AC-030 (submit payload) preserved.
// NEW (presentational only, P-1/P-3): the submitted metric summary, Planned/Off-plan grouping,
// client-side search + category filter, group collapse,
// Discard (confirmed). No new fetch/RPC/table/persistence/ESB.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT, type Translate } from '@/i18n/use-t'
import {
  listCaptureFormItems,
  fetchActualsMap,
  fetchPlanMap,
  fetchStockMap,
  listStreamItemIds,
  isItemNotOnStreamError,
  resolveKitchenBuId,
  insertKitchenLogBatch,
} from '@/lib/db/kitchen-logs'
// #440: the stream is the MODULE's selection, not this page's — useCafeStream records it so
// Plan/Stock/Review open on the same books, and every switch carries across (issue 456).
import { useCafeStream } from '@/lib/use-cafe-stream'
import { clearCafeDraftCount, setCafeDraftCount } from '@/lib/cafe-capture-draft'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import type { ReactNode } from 'react'
import type {
  ActualsMap,
  CaptureFormItem,
  KitchenLogLine,
  KitchenMovement,
  PlanMap,
  ProductionStream,
  StockMap,
} from '@/lib/db/kitchen-logs.types'
import {
  deriveActionLabel,
  movementKey,
  movementsForStream,
  streamProduces,
  streamLabel,
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
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { WipItemStepper } from '@/components/kitchen/wip-item-stepper'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { DataTable, type DataTableColumn, type DataTableGroup } from '@/components/dashboard/data-table'
import { kitchenStatus } from '@/lib/kitchen-status'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { reportError } from '@/lib/telemetry'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
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
// Every line opens bound to its item's DEFAULT unit (units[0] — the reader puts the
// default first): the common path enters no unit, yet every staged line knows which
// item-unit its quantity means (FR-020/022). A rebuild (movement/stream switch, discard,
// submit) deliberately resets any "change unit" re-binding along with the quantities —
// a bound alternate belongs to the entry it was chosen for.
function buildLines(
  items: CaptureFormItem[],
  planMap: PlanMap,
  stockMap: StockMap,
  movement: KitchenMovement,
): Record<string, KitchenLogLine> {
  const lines: Record<string, KitchenLogLine> = {}
  for (const item of items) {
    const stock = stockMap[item.id]
    lines[item.id] = {
      wip_item_id: item.id,
      item_unit_id: item.units[0]?.id ?? null,
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
// reads in the active locale. Duplicated (not imported) because the source file is out of
// scope here; the branching is a straight copy of kitchenStatus's own.
// `submitted` distinguishes a persisted actual (the receiving-only reader, and Review) from a
// typed-but-unsaved staged line: both can be "off-plan and > 0", but only the former has been
// written — a staged, unsubmitted quantity must never read as "Logged".
function statusLabel(t: Translate, made: number, plan: number, submitted: boolean): string {
  if (plan <= 0) {
    if (made <= 0) return t('kitchen.status.notLogged')
    return submitted ? t('kitchen.status.logged') : t('kitchen.status.staged')
  }
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

export function KitchenLogPage({ leading, activeBranchId, activeBranchName }: {
  leading?: ReactNode
  /**
   * OD-CAFE-1: the location this capture belongs to, from the module root's own location
   * context. Production capture is location-bound — the picker offers this branch's streams and
   * nothing else, and a remembered stream from another branch is stale rather than usable.
   * Absent (a single-location org, or a surface with no location context) leaves the catalog whole.
   */
  activeBranchId?: string
  /** The active location's user-facing name, for the boundary message. */
  activeBranchName?: string
} = {}) {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : 'anonymous'

  // Catalog, rows, and staged capture lines belong to one person. A route remains mounted
  // through an auth replacement, so a key makes that replacement atomic at render time.
  return <KitchenLogPageForViewer key={viewerId} leading={leading} activeBranchId={activeBranchId} activeBranchName={activeBranchName} />
}

/** DD-MVP-17: leading slot — content (the Opening door row) the module root renders
 *  above the capture form when this surface IS the Café root. */
function KitchenLogPageForViewer({ leading, activeBranchId, activeBranchName }: { leading?: ReactNode; activeBranchId?: string; activeBranchName?: string } = {}) {
  const auth = useAuth()
  const t = useT()
  // issue 455: the tab names the module the rail and breadcrumb name; leaf-first per
  // the catalog's own docTitle convention (tasks-layout, signals-archive).
  useDocumentTitle(t('common.docTitle', { page: `${t('nav.cafe.log')} · ${t('nav.cafe')}` }))
  const isDesktop = useIsDesktop()
  // I18N sweep: the H1 was a literal "Café · Log" — mixed-locale in `id` (breadcrumb
  // correctly translated the module/page, the heading below it did not). Reuses the
  // existing nav.cafe.* family rather than adding a duplicate composed key.
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.log')}`

  // The (branch, activity) production stream every captured row belongs to (OD-WAY-28), and
  // the movement within it (DD-WAY-13). The default is the person's OWN stream — their live
  // primary Team resolved by shared.default_stream() (FR-001, #233) — never a hardcoded
  // branch. `stream` is null while loading, and STAYS null when the person has no
  // stream-linked primary Team: capture then requires an explicit choice from the picker
  // (FR-002), and nothing can be submitted meanwhile because `ops.kitchen_logs.branch_id` /
  // `.activity` are NOT NULL (AC-007). `streamOptions` is the enumerable stream catalog (FR-005):
  // the live stream Teams, so the roastery — a branch with no stream — can never appear.
  const cafeStream = useCafeStream()
  const { branches, options: streamOptions, stream: resolvedStream, homeStream, myStreamKeys } = cafeStream
  // OD-CAFE-1 — production capture is location-bound.
  //
  // The picker offered every stream in the org while the page said which location you were at, so
  // production done at one branch could be filed against another branch's books with nothing
  // asking whether that was meant. The choice is now bounded by the active location, and switching
  // location is the deliberate act that changes it.
  //
  // `streamOptions` stays WHOLE for everything else. The transfer movements are derived from it —
  // a transfer's destination is by definition another branch — so filtering the catalog itself
  // would delete the cross-location workflow instead of bounding the production choice.
  const locationStreams = useMemo(
    () => (activeBranchId ? streamOptions.filter((option) => option.branch.id === activeBranchId) : streamOptions),
    [activeBranchId, streamOptions],
  )
  // A remembered stream from another location is stale, not a default. Clearing it puts the page
  // in the same "choose a stream" state as a person with no default at all — nothing is captured
  // against a branch the viewer did not pick, and nothing is silently substituted for them.
  const streamOutsideLocation = Boolean(activeBranchId) && resolvedStream !== null
    && resolvedStream.branch.id !== activeBranchId
  const stream = streamOutsideLocation ? null : resolvedStream
  // #744: the presentation of the RLS write gate — rows stay visible, capture controls close,
  // one line says why. Same selector the policies arm: affiliated, or ops_lead/admin.
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({
    affiliated: auth.viewer.affiliated,
    accessRoles: auth.viewer.accessRoles,
  })
  const streamMissing = stream === null
  // The producer fact is owned by the selected catalog row. Activity alone never grants a
  // write path: a receiving-only kitchen can still read its books, but it cannot stage or
  // submit production against them (DD-MVP-9).
  const streamCanProduce = streamProduces(stream, streamOptions)
  const streamNonProducing = stream !== null && !streamCanProduce
  const captureClosed = !canCapture || streamMissing || streamNonProducing
  const movementOptions = stream ? movementsForStream(stream, streamOptions) : []
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const [movement, setMovement] = useState<KitchenMovement>(PRODUCE)
  const [logDate] = useState(wibToday) // today WIB; owner-decision: allow past dates flagged
  const [wipItems, setWipItems] = useState<CaptureFormItem[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [actualsMap, setActualsMap] = useState<ActualsMap>({})
  const [buId, setBuId] = useState('')
  const [lines, setLines] = useState<Record<string, KitchenLogLine>>({})
  const [status, setStatus] = useState<PageStatus>({ kind: 'loading' })
  const [submitError, setSubmitError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  // #586: `lines` stages ONE row per item across every movement segment (produce, each
  // transfer) — a qty typed under Produce was still there, unchanged, when the segment
  // switched to a Transfer that never touched that item, and Submit filed it under
  // whichever segment was active at the click. Smaller honest fix than per-(item,movement)
  // storage: a switch with anything staged goes through the ConfirmDialog primitive with the
  // SAME destructive-confirm copy pattern Discard uses (DESIGN.md Overlays) — a second,
  // separately-mounted instance, not the Discard dialog itself — and only a confirmed switch
  // clears `lines` before the new movement takes effect. `pendingMovement` holds the tab the
  // person clicked while that confirm is open; null means no switch is pending.
  const [pendingMovement, setPendingMovement] = useState<KitchenMovement | null>(null)
  // A stream the person picked while quantities are staged, held until the discard confirm
  // resolves. Null = nothing pending.
  const [pendingStream, setPendingStream] = useState<ProductionStream | null>(null)
  // Staged items the database refused as not on this stream's list (#222). Their lines stay, marked.
  const [invalidItemIds, setInvalidItemIds] = useState<Set<string>>(new Set())

  // Client-side search + category (P-3), URL-synced so the view survives refresh/share (I7 / D-E1).
  // Group collapse stays INTERNAL to the shared <DataTable> (no page-level collapsedGroups state).
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')

  // Staged KPIs drive only the pending-review footer. The head summary must never read this
  // editable capture state: DD-7 requires its figures to come from submitted day entries.
  const stagedKpis = useKitchenKpis(lines)
  const submittedKpiLines = useMemo(() => {
    const base = buildLines(wipItems, planMap, stockMap, movement)
    const key = movementKey(movement)
    return Object.fromEntries(
      Object.entries(base).map(([itemId, line]) => [itemId, {
        ...line,
        qty_porsi: actualsMap[itemId]?.[key] ?? 0,
      }]),
    )
  }, [actualsMap, movement, planMap, stockMap, wipItems])
  const kpis = useKitchenKpis(submittedKpiLines)
  const hasSubmittedActuals = Object.values(actualsMap).some(
    itemActuals => (itemActuals[movementKey(movement)] ?? 0) > 0,
  )
  const summaryMetrics = [
    { key: 'plan', label: t('kitchen.log.summary.plan'), value: String(kpis.plannedTotal) },
    { key: 'made', label: t('kitchen.log.summary.made'), value: String(kpis.madeSoFar) },
    {
      key: 'off-plan',
      label: t('kitchen.log.summary.offPlan'),
      value: String(Math.max(kpis.madeOffPlan, 0)),
      ...(hasSubmittedActuals && kpis.madeOffPlan === 0
        ? { delta: { text: t('kitchen.log.summary.onPlan'), tone: 'success' as const } }
        : {}),
    },
  ]

  // Stale-response guard: every read bumps the generation, and only the LATEST
  // generation's result may land. Without this, two rapid stream switches can resolve
  // out of order and seed the form with stream A's plan/stock/actuals under stream B's
  // label — and submit would then file those quantities to B's books, the exact
  // wrong-books defect this spec exists to end, produced by the page itself. Shared by
  // bootstrap and applyStream so a slow bootstrap can't clobber a later switch either
  // (same shape as the stock page's guard).
  const requestGen = useRef(0)

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

  // Load the branch catalog + the stream catalog + the person's own default stream + WIP
  // items + the Café BU id, then the plan, stock and actuals FOR THE RESOLVED STREAM.
  // All three are stream-scoped reads (OD-WAY-28): the date-only signatures they replace
  // summed every branch's balance and reported the total as any one of them.
  //
  // FR-001/002 (#233): the default is shared.default_stream() — the (branch, activity) of
  // the person's live primary Team. No stream-linked primary Team → NO default: the surface
  // opens on the explicit "choose stream" state rather than silently filing production
  // against a branch the person never chose (a wrong default is the defect class this spec
  // exists to end; a missing one costs one tap).
  const loadData = useCallback(async () => {
    const gen = ++requestGen.current
    setStatus({ kind: 'loading' })
    try {
      const [catalog, bu] = await Promise.all([
        // The GATED item source (FR-011, DD-WAY-29): only confirmed item-units reach the
        // capture form. Stock/plan surfaces keep the ungated listActiveWipItems.
        // The module's stream, resolved the one way every Café surface resolves it
        // (issue 456): the session's own choice (#440) outranks the person's own stream
        // (shared.default_stream(), FR-001), and neither may name a pair outside the live
        // enumerable stream catalog — a stale pair resolves to "choose", never to a guess (FR-002).
        resolveStream(),
        resolveKitchenBuId(),
      ])
      const resolvedStream = catalog.stream
      // The stream's own list (#222). No stream yet: the whole gated catalog, as before — nothing
      // is writable until a stream is chosen, and the choose-stream state replaces the list.
      const items = await listCaptureFormItems(resolvedStream ?? undefined)
      const resolvedMovement = PRODUCE
      // An empty successful item read is a complete empty state. Do not make follow-up
      // plan/stock/actual reads turn that honest absence into a false load error.
      if (items.length === 0) {
        if (gen !== requestGen.current) return
        setWipItems(items)
        adoptStream(catalog)
        setMovement(resolvedMovement)
        setPlanMap({})
        setStockMap({})
        setActualsMap({})
        setBuId(bu)
        setLines({})
        setStatus({ kind: 'ready' })
        return
      }
      const [plan, stock, actuals] = resolvedStream
        ? await Promise.all([
            fetchPlanMap(logDate, resolvedStream),
            fetchStockMap(logDate, resolvedStream),
            fetchActualsMap(logDate, resolvedStream),
          ])
        : [{} as PlanMap, {} as StockMap, {} as ActualsMap]
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      setWipItems(items)
      setInvalidItemIds(new Set())
      adoptStream(catalog)
      setMovement(resolvedMovement)
      setPlanMap(plan)
      setStockMap(stock)
      setActualsMap(actuals)
      setBuId(bu)
      setLines(buildLines(items, plan, stock, resolvedMovement))
      setStatus({ kind: 'ready' })
    } catch {
      if (gen !== requestGen.current) return
      // Can't resolve items/streams/stock/BU — render an error state rather than stamping a
      // wrong BU or capturing against a guessed stream.
      setStatus({ kind: 'error', message: t('common.loadFailed', { what: t('common.what.items') }) })
    }
  }, [adoptStream, logDate, resolveStream, t])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    loadData()
  }, [auth.status, loadData, retryKey])

  // The module root owns the location switch and cannot see these quantities. Publish how many are
  // staged so it can warn before discarding them, and retract it on unmount so a dead form never
  // makes the root warn about work that no longer exists. Above every early return: this is a hook.
  const draftCount = Object.values(lines).filter(line => line.qty_porsi > 0).length
  useEffect(() => {
    setCafeDraftCount(draftCount)
    return () => { clearCafeDraftCount() }
  }, [draftCount])

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

  // #586: a movement switch with nothing staged is free (nothing would be lost); with
  // staged quantities, the switch is held behind `pendingMovement` until the confirm
  // dialog below resolves it — MovementSeg is controlled by `movement`, so leaving it
  // unset here is what keeps the tab strip showing the OLD movement while the dialog is open.
  function handleMovementChange(next: KitchenMovement) {
    if (captureClosed) return
    const staged = Object.values(lines).some(l => l.qty_porsi > 0)
    if (!staged) {
      setMovement(next)
      return
    }
    setPendingMovement(next)
  }

  function confirmMovementSwitch() {
    if (!pendingMovement) return
    setLines(buildLines(wipItems, planMap, stockMap, pendingMovement))
    setMovement(pendingMovement)
    setPendingMovement(null)
  }

  function cancelMovementSwitch() {
    setPendingMovement(null)
  }

  // Switching the stream re-reads the plan, the stock and the actuals, because all three
  // are stream-scoped facts: the same dish has a different plan, a different balance and a
  // different "already logged" in another branch's books. Staged quantities are cleared with
  // them — a typed number belongs to the stream it was typed against, and silently re-filing
  // it under a different one is how a COGS series acquires rows nobody meant.
  const applyStream = useCallback(async (nextStream: ProductionStream) => {
    const gen = ++requestGen.current
    chooseStream(nextStream) // the whole Café module follows this choice (#440)
    setMovement(PRODUCE)
    setStatus({ kind: 'loading' })
    try {
      const [items, plan, stock, actuals] = await Promise.all([
        listCaptureFormItems(nextStream),
        fetchPlanMap(logDate, nextStream),
        fetchStockMap(logDate, nextStream),
        fetchActualsMap(logDate, nextStream),
      ])
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      setPlanMap(plan)
      setWipItems(items)
      setInvalidItemIds(new Set())
      setStockMap(stock)
      setActualsMap(actuals)
      setLines(buildLines(items, plan, stock, PRODUCE))
      setStatus({ kind: 'ready' })
    } catch {
      if (gen !== requestGen.current) return
      setStatus({ kind: 'error', message: t('common.loadFailed', { what: t('common.what.items') }) })
    }
  }, [chooseStream, logDate, t])

  // Staged quantities belong to the stream they were typed against: ask before a switch
  // discards them, and switch straight through when nothing is staged. Shared by the head's
  // Switch/Back actions and the body's one-step choice (#781 item 2) so both routes into a
  // stream change go through the one guard.
  function selectStream(next: ProductionStream) {
    if (draftCount > 0) setPendingStream(next)
    else void applyStream(next)
  }

  // The stream picker (FR-003/005) — ONE definition, rendered in the page head in EVERY
  // state including while a switch's read is in flight: a slow stream's fetch must never
  // unmount the control that lets the person leave that stream (default-not-wall).
  // #440: it is the shared <CafeStreamBar> now — the same statement-and-switch every Café
  // surface carries, in the same place, so a person who walks Log → Plan → Stock reads the
  // stream in one spot instead of guessing on two thirds of the module.
  const streamPicker = (
    <>
    <CafeStreamBar
      options={locationStreams}
      stream={stream}
      homeStream={homeStream}
      myStreamKeys={myStreamKeys}
      onChange={selectStream}
      disabled={status.kind === 'submitting'}
    />
    {pendingStream && <ConfirmDialog
      open
      title={t('kitchen.log.streamSwitch.confirmTitle')}
      body={t('kitchen.log.streamSwitch.confirmBody', {
        count: draftCount,
        qty: t(draftCount === 1 ? 'kitchen.log.discard.qty.one' : 'kitchen.log.discard.qty.other'),
        from: streamLabel(t, stream),
        to: streamLabel(t, pendingStream),
      })}
      confirmLabel={t('kitchen.log.streamSwitch.confirm')}
      cancelLabel={t('common.cancel')}
      tone="destructive"
      onConfirm={async () => { const next = pendingStream; setPendingStream(null); await applyStream(next) }}
      onCancel={() => setPendingStream(null)}
    />}
    </>
  )

  const receivingOnlyNotice = (
    <section className="kl-receiving-only" role="status" aria-labelledby="kl-receiving-only-title">
      <div className="kl-receiving-only-copy">
        <h2 id="kl-receiving-only-title" className="kl-receiving-only-title">
          {t('kitchen.stream.receivingOnly.title')}
        </h2>
        <p className="kl-receiving-only-note">
          {t('kitchen.stream.receivingOnly.body')}
        </p>
      </div>
      <Link to="/cafe/stock" className="btn btn-outline btn-touch kl-receiving-only-cta">
        {t('kitchen.stream.receivingOnly.stockCta')}
      </Link>
    </section>
  )

  function handleQtyChange(itemId: string, qty: number) {
    if (captureClosed) return
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
    if (captureClosed) return
    setLines(prev => {
      const next: KitchenLogLine = { ...prev[itemId], notes: note }
      return { ...prev, [itemId]: gateLine(next, movement) }
    })
  }

  // The "change unit" path (#234, FR-021/022): re-bind the line to the chosen item-unit.
  // The id comes from the item's OFFERED units only (the stepper renders nothing else),
  // and the binding rides the line into the submit payload — the ERP coordinate is the
  // unit, so this is the whole selection, no qty conversion, no second field.
  function handleUnitChange(itemId: string, itemUnitId: string) {
    if (captureClosed) return
    setLines(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], item_unit_id: itemUnitId },
    }))
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
    if (!canCapture) {
      setSubmitError(t('kitchen.log.readOnlyReason'))
      return
    }

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
      setSubmitError(t('kitchen.log.error.noBusinessUnit'))
      return
    }

    // AC: a production log cannot be submitted without its (branch, activity) stream. The
    // columns are NOT NULL and the insert helper refuses too — this is the third of three,
    // and the only one the capturer ever sees.
    if (!stream) {
      setSubmitError(t('kitchen.log.stream.missing'))
      return
    }
    if (!streamCanProduce) {
      setSubmitError(t('kitchen.log.stream.nonProducing'))
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
          // the line's bound item-unit (#234, FR-022) — the default unless "change unit"
          // re-bound it; the DB re-binds a null to the default server-side (FR-020).
          item_unit_id: line.item_unit_id,
          qty_porsi: line.qty_porsi,
          notes: line.notes.trim() || null,
          // status / source / org_id / submitted_by NOT sent — server-stamped (NFR-003)
        })),
      )
      const key = movementKey(movement)
      setActualsMap(prev => {
        const next = { ...prev }
        for (const line of staged) {
          next[line.wip_item_id] = {
            ...next[line.wip_item_id],
            [key]: (next[line.wip_item_id]?.[key] ?? 0) + line.qty_porsi,
          }
        }
        return next
      })
      setStatus({ kind: 'success', count: staged.length })
      setInvalidItemIds(new Set())
      setLines(buildLines(wipItems, planMap, stockMap, movement))
    } catch (err) {
      reportError(err, { source: 'kitchen-log.submit' })
      if (isItemNotOnStreamError(err)) {
        // The list changed under the open form (#222). The draft stays; the refused lines are
        // marked so the person can clear them or switch stream, then submit again.
        try {
          const offered = await listStreamItemIds(stream)
          setInvalidItemIds(new Set(staged.filter(line => !offered.has(line.wip_item_id)).map(line => line.wip_item_id)))
        } catch { /* The guidance below still applies when the re-read fails. */ }
        setSubmitError(t('kitchen.log.error.itemNotOnStream'))
      } else setSubmitError(t('kitchen.log.error.submitFailed'))
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
          <p className="kl-unauth-msg">{t('kitchen.log.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary btn-touch kl-touch">{t('common.signIn')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Data loading state — offline indicator surfaced here too (#2, RI-2) ──────
  // The picker rides in the page head in every state, bootstrap included: a slow stream's
  // read must never take away the control that switches off it (FR-003 default-not-wall),
  // and a head that goes silent about its stream is the #440 defect itself.
  if (status.kind === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} statusRow={streamPicker} state="loading" meta={<span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>}>
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
      <PageFamilyFrame family="workspace" title={pageTitle} statusRow={streamPicker} state="error" meta={<span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>}>
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
      <PageFamilyFrame family="workspace" title={pageTitle} statusRow={streamPicker} state={streamNonProducing ? 'read-only' : 'empty'} meta={<span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>}>
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          {streamNonProducing && receivingOnlyNotice}
          {/* 'blank' — no WIP items are configured yet (an ops-lead task), not a source that
              fills on its own; never 'quiet' ✓, which would misread as "nothing to log,
              all done" instead of "nothing CAN be logged until items exist". */}
          <EmptyState
            variant="blank"
            title={stream ? t('kitchen.streamItems.empty.title', { stream: streamLabel(t, stream) }) : t('kitchen.empty.noActiveItems.title')}
            copy={stream ? t('kitchen.streamItems.empty.copy') : t('kitchen.log.empty.copy')}
          />
          {/* AC-013: the DD-WAY-29 gate also empties this list when nothing is confirmed —
              the report route must be reachable from here too, not only under a full list.
              #744 review: the report files a WRITE (ops.log_entries), so it closes with the
              same capture gate as Submit — an unaffiliated reader sees no report control. */}
          {buId && !captureClosed && <ReportMissingItem businessUnitId={buId} />}
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
  // F3 (FR-022): surface the variance-note gate as an EXPLICIT disabled control — a
  // staged off-plan line whose required note is empty disables Submit (the blocking
  // state is visible up front, not enabled-until-bounced). handleSubmit still re-gates
  // on click (defense in depth — the re-gate is the authority, this is the UX cue).
  const missingNoteLines = stagedLines.filter(
    l => needsVarianceNote(l, movement) && !l.notes.trim(),
  )
  const noteUnresolved = missingNoteLines.length > 0

  // Before a stream is chosen, nothing can be submitted and no plan/stock/actuals are fetched
  // for the list below to mean anything — rendering quantity inputs that look editable but are
  // not is worse than an empty list. Gated on `canCapture` (an unaffiliated/non-lead viewer's
  // block is the OWN read-only state, unrelated to the stream choice) and `!streamNonProducing`
  // (that state has its own receiving-only notice).
  const noStreamChosen = canCapture && streamMissing && !streamNonProducing

  // Scrolls to and focuses the first blocked item's note field — the footer's pointer names a
  // count and is itself the destination that scrolls to and focuses the first missing note.
  function focusFirstMissingNote() {
    const first = missingNoteLines[0]
    if (!first) return
    const field = document.getElementById(`note-${first.wip_item_id}`)
    field?.scrollIntoView?.({ block: 'center' })
    ;(field as HTMLTextAreaElement | null)?.focus()
  }

  // ── Shared DataTable wiring (P-4: ONE branch in the DOM) ───────────────────
  // Client-side search + category filter (parity with the prior desktop toolbar),
  // then the Planned/Off-plan split fed to the DataTable `groups` prop. Group
  // collapse is INTERNAL to the DataTable (no page-level state). Token-only.
  const q = search.trim().toLowerCase()
  const matchSearch = (it: CaptureFormItem) => !q || it.name.toLowerCase().includes(q)
  // The category control is intentionally desktop-only. A shared/deep-linked category query
  // must not silently hide rows on phone when its control is unavailable to clear it.
  const effectiveCategory = isDesktop ? category : 'All'
  const matchCat = (it: CaptureFormItem) => effectiveCategory === 'All' || (it.category ?? '') === effectiveCategory
  const visibleItems = wipItems.filter(it => matchSearch(it) && matchCat(it))
  const plannedLines = visibleItems.filter(it => (lines[it.id]?.plan_qty ?? 0) > 0)
  const offPlanLines = visibleItems.filter(it => (lines[it.id]?.plan_qty ?? 0) <= 0)
  const categories = [
    'All',
    ...Array.from(new Set(wipItems.map(i => i.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ]

  const columns: DataTableColumn<CaptureFormItem>[] = [
    {
      key: 'dish',
      header: t('kitchen.log.col.item'),
      cardLabel: '',
      render: item => (
        <span className="kl-dish">
          <span className="kl-dish-name">{item.name}</span>
          {invalidItemIds.has(item.id) && <NotOnStreamTag />}
          {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
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
          alreadyLogged={actualsMap[item.id]?.[movementKey(movement)] ?? 0}
          onQtyChange={qty => handleQtyChange(item.id, qty)}
          onNotesChange={note => handleNotesChange(item.id, note)}
          unitOptions={item.units}
          onUnitChange={unitId => handleUnitChange(item.id, unitId)}
          disabled={isSubmitting || captureClosed}
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
        return <span className={`kl-status kl-status--${status.tone}`}>{statusLabel(t, line.qty_porsi, line.plan_qty, false)}</span>
      },
    },
  ]

  // Receiving-only streams keep the same readable plan/stock/history rows, but render the
  // submitted actual instead of mounting the production stepper. A plain DataTable card is
  // intentional here: it keeps every value readable on phone without introducing a disabled
  // capture control that looks like an unfinished write path.
  const receivingColumns: DataTableColumn<CaptureFormItem>[] = [
    {
      key: 'dish',
      header: t('kitchen.log.col.item'),
      cardLabel: '',
      render: item => (
        <span className="kl-dish">
          <span className="kl-dish-name">{item.name}</span>
          {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
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
      numeric: true,
      render: item => actualsMap[item.id]?.[movementKey(movement)] ?? 0,
    },
    {
      key: 'status',
      header: t('kitchen.log.col.status'),
      render: item => {
        const made = actualsMap[item.id]?.[movementKey(movement)] ?? 0
        const plan = lines[item.id]?.plan_qty ?? 0
        if (made <= 0) return null
        const rowStatus = kitchenStatus({ made, plan, isOffPlan: plan <= 0 })
        // actualsMap rows are submitted production (DB actuals), never staged form state.
        return <span className={`kl-status kl-status--${rowStatus.tone}`}>{statusLabel(t, made, plan, true)}</span>
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
  const renderLogCard = (item: CaptureFormItem) => {
    const line = lines[item.id]
    if (!line) return null
    const status = kitchenStatus({
      made: line.qty_porsi,
      plan: line.plan_qty,
      isOffPlan: line.plan_qty <= 0,
    })
    return (
      <div className="kl-row">
        <div className="kl-card-head">
          <div className="kl-card-identity">
            <span className="kl-card-name">{item.name}</span>
            {invalidItemIds.has(item.id) && <NotOnStreamTag />}
          </div>
          <WipItemStepper
            itemName={item.name}
            line={line}
            movement={movement}
            alreadyLogged={actualsMap[item.id]?.[movementKey(movement)] ?? 0}
            onQtyChange={qty => handleQtyChange(item.id, qty)}
            onNotesChange={note => handleNotesChange(item.id, note)}
            unitOptions={item.units}
            onUnitChange={unitId => handleUnitChange(item.id, unitId)}
            disabled={isSubmitting || captureClosed}
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
        <div className="kl-card-meta">
          <span className="kl-card-stock">
            <span>{t('kitchen.log.col.stock')}</span> <strong className="tabular">{line.stok}</strong>
          </span>
          {line.qty_porsi > 0 && (
            <span className={`kl-status kl-status--${status.tone}`}>{statusLabel(t, line.qty_porsi, line.plan_qty, false)}</span>
          )}
        </div>
      </div>
    )
  }

  const groups: DataTableGroup<CaptureFormItem>[] = [
    ...(plannedLines.length > 0
      ? [{ key: 'planned', label: t('kitchen.log.group.planned'), count: plannedLines.length, rows: plannedLines }]
      : []),
    ...(offPlanLines.length > 0
      ? [{
          key: 'offplan',
          label: t('kitchen.log.group.offplan'),
          ...(streamNonProducing ? {} : { hint: t('kitchen.log.group.offplan.hint') }),
          count: offPlanLines.length,
          rows: offPlanLines,
        }]
      : []),
  ]

  const logToolbar = (
    <KitchenToolbar
      search={search}
      onSearchChange={setSearch}
      categories={isDesktop ? categories : undefined}
      categoryId="cafe-log-category"
      categoryLabel={value => kitchenCategoryLabel(t, value)}
      category={isDesktop ? category : undefined}
      onCategoryChange={isDesktop ? setCategory : undefined}
      searchPlaceholder={t('kitchen.log.searchPlaceholder')}
      ariaLabel={t('kitchen.log.toolbarAria')}
    >
      {movementOptions.length > 0 && <div className="kl-scope">
        <MovementSeg
          value={movement}
          options={movementOptions}
          branches={branches}
          origin={stream}
          onChange={handleMovementChange}
          disabled={isSubmitting || captureClosed}
        />
      </div>}
    </KitchenToolbar>
  )

  const logTable = (
    <DataTable
      columns={streamNonProducing ? receivingColumns : columns}
      rows={visibleItems}
      groups={groups}
      key={`${movementKey(movement)}:${plannedLines.length > 0 ? 'planned' : 'off-plan'}`}
      defaultCollapsedGroupKeys={plannedLines.length > 0 ? new Set(['offplan']) : undefined}
      renderCard={streamNonProducing ? undefined : renderLogCard}
      isDesktop={isDesktop}
      state={visibleItems.length > 0 ? 'ready' : 'empty'}
      emptyLabel={t('kitchen.filter.noMatch')}
      caption={streamNonProducing ? t('kitchen.stream.receivingOnly.logCaption') : t('kitchen.log.caption')}
    />
  )

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      /* #440: the head's orientation signal is the stream this capture files into — which books
         a row lands in decides what the row MEANS, so it outranks the static job sentence the
         shared head would otherwise carry (PageHead renders one or the other). */
      statusRow={streamPicker}
      meta={<span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>}
      state={status.kind === 'submitting' ? 'saving' : status.kind === 'success' ? 'saved' : streamNonProducing ? 'read-only' : submitError ? 'validation' : 'default'}
    >
      <div className="kl-page">
        {/* GAP-4/#9: staged-but-unsubmitted quantities must not vanish on navigation — prompt
            stay/discard when leaving the route with unsaved entries. */}
        <RouteLeaveGuard when={stagedCount > 0} message={t('kitchen.log.leave.confirm')} />
        <OfflineBanner show={!isOnline} />
        {/* The Location/opening door and the Plan/Made/Off-plan figures dock into one compact
            context header so the summary reads as that header's own figures, never an orphan
            line floating with no container of its own. Falls back to the plain band (unchanged)
            when there is no leading door to dock onto — most callers of this page render no
            `leading` at all. */}
        {leading ? (
          <div className="kl-context">
            {leading}
            {/* R4 / FR-018: derived from submitted actuals only — staged typing never moves it. */}
            {status.kind === 'ready' && wipItems.length > 0 && (
              <div className="kl-context-summary">
                <MetricSummaryRule
                  ariaLabel={t('kitchen.log.summary.aria')}
                  metrics={summaryMetrics}
                  variant="inline"
                />
              </div>
            )}
          </div>
        ) : (
          status.kind === 'ready' && wipItems.length > 0 && (
            <MetricSummaryRule
              ariaLabel={t('kitchen.log.summary.aria')}
              metrics={summaryMetrics}
            />
          )
        )}

        {/* With no action bar on screen (no stream chosen) a submit-path message has nowhere else
            to go, so it shows here; otherwise the bar carries it. */}
        {submitError && noStreamChosen && !streamOutsideLocation && (
          <div role="alert" className="kl-banner kl-banner-error kl-block">
            {submitError}
          </div>
        )}

        {streamNonProducing ? (
          <>
            {receivingOnlyNotice}
            {logToolbar}
            {logTable}
          </>
        ) : (
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
              opens with one band and the dish list starts higher.
              #440: the STREAM picker left this block for the page head. The two controls
              looked alike but answer different questions — the movement is a property of the
              rows you are about to write, the stream is which books the whole surface is
              written in, and that second one has to be readable from every Café screen, not
              only from the ones with a toolbar. */}
          {noStreamChosen ? (
            // No dish list, no filters over a list that isn't there, and nothing that LOOKS
            // like an editable quantity field until a stream makes it one — one guidance state
            // where the list would render. #781 item 2 / B5: the head has nothing to state while
            // no default resolves (FR-002), so the one-click choice itself renders here — never
            // a button that only focused a hidden control. A person who inherits exactly one
            // stream never sees this: `stream` resolves before this render is reached.
            <EmptyState variant="next-step" title={t('kitchen.log.stream.chooseTitle')}>
              <CafeStreamChoices
                options={locationStreams}
                homeStream={homeStream}
                myStreamKeys={myStreamKeys}
                onChoose={selectStream}
                disabled={status.kind === 'submitting'}
              />
            </EmptyState>
          ) : (
            <>
              {logToolbar}
              {logTable}
            </>
          )}

          {/* AC-013 / FR-012: the DD-WAY-29 gate removes unconfirmed items silently, so the
              surface carries a visible route to report one missing — absence must never read
              as a bug with no exit. Own type="button" controls only; never submits this form.
              #744 review: same capture gate as Submit — a report is a write (AC-003 arm). */}
          {buId && !captureClosed && (
            <ReportMissingItem
              businessUnitId={buId}
              streamLabel={stream ? streamLabel(t, stream) : undefined}
            />
          )}

          {/* Sticky action footer — ONE branch; tally + Discard + Submit. #744 review: when
              capture is closed the tally and the stream hint describe a submit path the viewer
              cannot take — the reason line is the ONE message (rows stay visible, nothing else). */}
          {/* With no stream chosen the placeholder above is the whole message and nothing can be
              staged, so there is no bar to show. A stale stream from another location keeps the
              bar: its reason line names that stream, which the placeholder does not. */}
          {!(noStreamChosen && !streamOutsideLocation) && (
          <div className="kl-footer">
            {/* The result of Submit appears in the pinned bar, next to the button that caused it:
                the list is long, and a message at the top of the page is off screen on a phone. */}
            {submitError && (
              <p role="alert" className="kl-submit-outcome kl-submit-outcome--error">{submitError}</p>
            )}
            {status.kind === 'success' && (
              <p role="status" aria-live="polite" className="kl-submit-outcome kl-submit-outcome--success">
                {t(status.count === 1 ? 'kitchen.log.success.one' : 'kitchen.log.success.other', { count: status.count })}
              </p>
            )}
            {!canCapture && (
              <p className="kl-submit-reason" role="status">{t('kitchen.log.readOnlyReason')}</p>
            )}
            {/* The tally is a claim about staged work; with none staged there is nothing to
                state, so it does not render "0 items · 0 porsi" noise beside a disabled Submit
                that already says nothing is staged. */}
            {!captureClosed && stagedCount > 0 && (
              <div className="kl-tally">
                <span className="kl-tally-num tabular">
                  {t(stagedCount === 1 ? 'kitchen.log.footer.item.one' : 'kitchen.log.footer.item.other', { count: stagedCount })}
                  {' · '}
                  {t(stagedKpis.madeSoFar === 1 ? 'kitchen.log.footer.unit.one' : 'kitchen.log.footer.unit.other', { count: stagedKpis.madeSoFar })}
                </span>
                <span className="kl-tally-sub">{t('kitchen.log.footer.reviewNext')}</span>
              </div>
            )}
            {/* The reason Submit is dead is a SENTENCE, and it gets a line of its own. Nested in
                the action cluster it was a `flex: none` column beside the buttons, so on a phone
                "Choose a production stream before submitting." wrapped into three cramped lines
                against the thing it was explaining — and on a 1440px screen it did the same with
                a screen's width to spare. */}
            {canCapture && streamMissing && (
              <span className="kl-submit-reason" role="status" aria-live="polite">
                {streamOutsideLocation
                  ? t('kitchen.log.stream.otherLocation', {
                    // Name the stale stream: once the picker clears, "that stream" points at
                    // nothing on screen.
                    stream: streamLabel(t, resolvedStream),
                    location: activeBranchName ?? '',
                  })
                  : t('kitchen.log.stream.missing')}
              </span>
            )}
            {canCapture && streamNonProducing && (
              <span className="kl-submit-reason" role="status" aria-live="polite">
                {t('kitchen.log.stream.nonProducing')}
              </span>
            )}
            {/* A count, not a restatement of the field's own cue — and a destination: it
                scrolls to and focuses the first line still missing its note. */}
            {noteUnresolved && !hasBlockingError && !streamMissing && !streamNonProducing && (
              <button
                type="button"
                className="kl-submit-reason kl-note-pointer"
                onClick={focusFirstMissingNote}
              >
                {t(
                  missingNoteLines.length === 1
                    ? 'kitchen.log.footer.noteMissing.one'
                    : 'kitchen.log.footer.noteMissing.other',
                  { count: missingNoteLines.length },
                )}
              </button>
            )}
            <div className="kl-footer-actions">
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
                blocked={captureClosed || hasBlockingError || noteUnresolved}
                t={t}
              />
            </div>
          </div>
          )}

          {/* Destructive confirm — DESIGN.md Overlays: "one centered blocking dialog",
              replacing window.confirm. Only the staged quantities are at stake; search
              and category filters are untouched by Discard.
              ConfirmDialog is safe both mounted styles (confirm-dialog.tsx owns the contract);
              conditional mount kept for unmount-cleanup. */}
          {discardConfirmOpen && (
            <ConfirmDialog
              open
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
          )}

          {/* #586: the unsaved-entries confirm for a movement switch, held behind a movement-
              tab click while anything is staged — a switch never silently carries one
              movement's qty into another's submit. ConfirmDialog is safe both mounted styles
              (confirm-dialog.tsx owns the contract); conditional mount kept for
              unmount-cleanup. */}
          {pendingMovement !== null && (
            <ConfirmDialog
              open
              title={t('kitchen.log.movementSwitch.confirmTitle')}
              body={t('kitchen.log.movementSwitch.confirmBody', {
                count: stagedCount,
                qty: t(stagedCount === 1 ? 'kitchen.log.discard.qty.one' : 'kitchen.log.discard.qty.other'),
                actionType: deriveActionLabel(t, movement, branches),
              })}
              confirmLabel={t('kitchen.log.movementSwitch.confirm')}
              cancelLabel={t('common.cancel')}
              tone="destructive"
              onConfirm={async () => confirmMovementSwitch()}
              onCancel={cancelMovementSwitch}
            />
          )}
          </form>
        )}
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
