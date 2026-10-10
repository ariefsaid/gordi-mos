// KitchenLogPage — /cafe — Log capture screen (OD-K-5 redesign).
// Design authority: docs/plans/2026-06-21-kitchen-log-redesign.md.
// ONE responsive screen built on the shared <DataTable> (desktop dense <table> +
// metric summary + phone floor-fast cards (<768px), chosen via useIsDesktop()
// — ONE branch in the DOM (P-4).
//
// Existing capture gates and payload contract remain: status / org_id / submitted_by are never
// sent by the client (NFR-003), and AC-020/021 (variance-note gate), AC-022 (transfer cap),
// AC-030 (submit payload) are unchanged. A selected stream supplies its MOS name, default ERP
// detail and manager-defined factors through the existing Café settings reader. The captured amount
// is converted to the default-unit basis; `item_unit_id` stays that ERP coordinate on the save path.

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsWide } from '@/shell/use-is-wide'
import { useAuth } from '@/auth/use-auth'
import { useT, type Translate } from '@/i18n/use-t'
import {
  listCaptureFormItems,
  fetchActualsMap,
  fetchPlanMap,
  fetchStockMap,
  listStreamItemIds,
  isItemNotOnStreamError,
  isItemUnitNotShownError,
  resolveKitchenBuId,
  insertKitchenLogBatch,
} from '@/lib/db/kitchen-logs'
// #440: the stream is the MODULE's selection, not this page's — useCafeStream records it so
// Plan/Stock/Review open on the same books, and every switch carries across (issue 456).
import { useCafeStream } from '@/lib/use-cafe-stream'
import { formatUnitMultiple, toDefaultUnitQuantity } from '@/lib/cafe-unit-multiples'
import { parseQuantityInput } from '@/lib/quantity-parser'
import { clearCafeDraftCount, setCafeDraftCount } from '@/lib/cafe-capture-draft'
import {
  clearCafeCaptureDraft,
  isCafeCaptureRequestId,
  listOtherDateCafeCaptureDrafts,
  readCafeCaptureDraft,
  writeCafeCaptureDraft,
  type CafeCaptureDraftScope,
  type StoredCafeCaptureDraft,
} from '@/lib/cafe-capture-storage'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import type { ReactNode } from 'react'
import type {
  ActualsMap,
  ActualUnitTotal,
  CaptureFormItem,
  KitchenLogLine,
  KitchenMovement,
  PlanMap,
  ProductionStream,
  StockMap,
} from '@/lib/db/kitchen-logs.types'
import {
  branchDisplayName,
  deriveActionLabel,
  movementKey,
  movementsForStream,
  streamProduces,
  streamKey,
  streamLabel,
  PRODUCE,
} from '@/lib/kitchen-action-label'
import {
  canPushCafe,
  needsVarianceNote,
  transferExceedsAvailable,
  VARIANCE_NOTE_CUE,
  TRANSFER_SHORT_CUE,
} from '@/lib/kitchen-gates'
import { useKitchenKpis } from '@/lib/kitchen-kpis'
import { useCafeCaptureDraftPageState } from '@/lib/use-cafe-capture-draft-page-state'
import { MovementSeg } from '@/components/kitchen/movement-seg'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { WipItemStepper } from '@/components/kitchen/wip-item-stepper'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import {
  KITCHEN_KIND_FILTER_OPTIONS,
  kitchenDataTableGroups,
  toKitchenListRows,
  useKitchenItemTable,
  type KitchenItemKindFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { CafeCaptureTable } from '@/components/kitchen/cafe-capture-table'
import { formatDayMonthYear, formatWibDateTime, wibToday } from '@/lib/format/date'
import { LoadingShell } from '@/components/ui/state-kit'
import { QuantityFieldError } from '@/components/ui/quantity-field'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { useFocusRestore } from '@/components/ui/use-focus-restore'
import { reportError } from '@/lib/telemetry'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { ReportMissingItem } from '@/components/kitchen/report-missing-item'
import '@/components/kitchen/status-banner-tone.css'
import './kitchen-log-page.css'
import './cafe-item-settings-page.css'

// Build fresh per-item line state from loaded items + plan + stock for one movement.
// Every line opens on its item's default ERP unit (units[0]); configured multiples are
// opt-in. Canonical qty_porsi always stays in the default-unit basis for plans, stock,
// validation and posting, while entry_quantity/factor retain what staff selected.
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
      client_request_id: crypto.randomUUID(),
      client_attempted: false,
      item_unit_id: item.units[0]?.id ?? null,
      entry_quantity: 0,
      entry_unit_factor: 1,
      entry_unit_name: item.units[0]?.name ?? null,
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

type StoredKitchenCaptureDraft = {
  branch_id: string
  activity: string
  movement: KitchenMovement
  lines: Record<string, KitchenLogLine>
}

function kitchenDraftScope(
  form: 'production' | 'transfer',
  orgId: string,
  personId: string,
  stream: ProductionStream,
  logDate: string,
): CafeCaptureDraftScope {
  return {
    orgId,
    personId,
    form,
    branchId: stream.branch.id,
    activity: stream.activity,
    logDate,
  }
}

function restoreKitchenCaptureDraft(
  saved: StoredKitchenCaptureDraft | null,
  items: CaptureFormItem[],
  planMap: PlanMap,
  stockMap: StockMap,
  stream: ProductionStream,
  allowedMovements: KitchenMovement[],
  fallbackMovement: KitchenMovement,
): { lines: Record<string, KitchenLogLine>; movement: KitchenMovement } {
  const blankLines = buildLines(items, planMap, stockMap, fallbackMovement)
  if (!saved || saved.branch_id !== stream.branch.id || saved.activity !== stream.activity
    || !saved.lines || typeof saved.lines !== 'object' || Array.isArray(saved.lines)
    || !saved.movement || typeof saved.movement !== 'object'
    || (saved.movement.action !== 'produce'
      && !(saved.movement.action === 'transfer' && typeof saved.movement.destinationBranchId === 'string'))) {
    return { lines: blankLines, movement: fallbackMovement }
  }
  const movement = allowedMovements.find(option => movementKey(option) === movementKey(saved.movement))
  if (!movement) return { lines: blankLines, movement: fallbackMovement }

  const lines = buildLines(items, planMap, stockMap, movement)
  for (const item of items) {
    const stored = saved.lines?.[item.id]
    const line = lines[item.id]
    if (!stored || !line) continue
    const itemUnitId = item.units.some(unit => unit.id === stored.item_unit_id)
      ? stored.item_unit_id
      : line.item_unit_id
    const quantity = Number.isFinite(stored.qty_porsi) && stored.qty_porsi > 0 ? stored.qty_porsi : 0
    lines[item.id] = gateLine({
      ...line,
      client_request_id: isCafeCaptureRequestId(stored.client_request_id)
        ? stored.client_request_id
        : line.client_request_id,
      client_attempted: stored.client_attempted === true,
      item_unit_id: itemUnitId,
      entry_quantity: Number.isFinite(stored.entry_quantity) ? stored.entry_quantity : quantity,
      entry_unit_factor: typeof stored.entry_unit_factor === 'number'
        && Number.isFinite(stored.entry_unit_factor) && stored.entry_unit_factor > 0
        ? stored.entry_unit_factor
        : 1,
      entry_unit_name: typeof stored.entry_unit_name === 'string' ? stored.entry_unit_name : line.entry_unit_name,
      qty_porsi: quantity,
      notes: typeof stored.notes === 'string' ? stored.notes : '',
      dirty: quantity > 0,
    }, movement)
  }
  return { lines, movement }
}

function kitchenDraftLines(draft: StoredKitchenCaptureDraft | null | undefined): KitchenLogLine[] {
  if (!draft?.lines || typeof draft.lines !== 'object' || Array.isArray(draft.lines)) return []
  return Object.values(draft.lines).filter(line => line && typeof line === 'object'
    && Number.isFinite(line.qty_porsi) && line.qty_porsi > 0)
}

type PageStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'success'; count: number }

export type KitchenLogMode = 'production' | 'transfer'

export function KitchenLogPage({ mode = 'production', leading, activeBranchId, activeBranchName }: {
  mode?: KitchenLogMode
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
  return <KitchenLogPageForViewer key={`${viewerId}:${mode}`} mode={mode} leading={leading} activeBranchId={activeBranchId} activeBranchName={activeBranchName} />
}

/** DD-MVP-17: leading slot — content (the Opening door row) the module root renders
 *  above the capture form when this surface IS the Café root. */
function KitchenLogPageForViewer({ mode, leading, activeBranchId, activeBranchName }: { mode: KitchenLogMode; leading?: ReactNode; activeBranchId?: string; activeBranchName?: string }) {
  const auth = useAuth()
  const draftOrgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : ''
  const draftPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const t = useT()
  const page: 'production' | 'transfer' = mode === 'production' ? 'production' : 'transfer'
  const isDesktop = useIsDesktop()
  const isWide = useIsWide()

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
  // The location is the module root's when it passes one; otherwise the one the stream ladder
  // derived (session choice, home branch, only branch), so the root Log is location-bound too.
  const locationId = activeBranchId ?? cafeStream.branchId ?? undefined
  const locationName = activeBranchName ?? branches.find((branch) => branch.id === locationId)?.name
  // OD-CAFE-1 — production capture is location-bound.
  //
  // The picker offered every stream in the org while the page said which location you were at, so
  // production done at one branch could be filed against another branch's books with nothing
  // asking whether that was meant. The choice is now bounded by the active location, and switching
  // location is the deliberate act that changes it.
  //
  // `streamOptions` stays WHOLE for everything else. Cross-branch movements intersect its live
  // streams with the org-scoped route rows — filtering the catalog itself would delete the
  // cross-location workflow instead of bounding the production choice.
  // A person may work at a stream if they hold a Team on it (any, for ops_lead/admin).
  const elevated = auth.status === 'authenticated' && canPushCafe(auth.viewer.accessRoles)
  const eligible = useCallback(
    (option: ProductionStream) => elevated || myStreamKeys.has(streamKey(option.branch.id, option.activity)),
    [elevated, myStreamKeys],
  )
  // With no location resolved (ask), the choice is the person's eligible streams, never the whole
  // catalog; choosing one claims that location.
  const locationStreams = useMemo(
    () => (locationId
      ? streamOptions.filter((option) => option.branch.id === locationId)
      : streamOptions.filter(eligible)),
    [eligible, locationId, streamOptions],
  )
  // Change may also reach another location the person can work at. Choosing one is the explicit
  // location switch: setStream commits it.
  const otherLocationStreams = useMemo(
    () => (locationId
      ? streamOptions.filter((option) => option.branch.id !== locationId && eligible(option))
      : []),
    [eligible, locationId, streamOptions],
  )
  // A remembered stream from another location is stale, not a default. Clearing it puts the page
  // in the same "choose a stream" state as a person with no default at all — nothing is captured
  // against a branch the viewer did not pick, and nothing is silently substituted for them.
  const streamOutsideLocation = Boolean(locationId) && resolvedStream !== null
    && resolvedStream.branch.id !== locationId
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
  const allMovementOptions = stream
    ? movementsForStream(stream, streamOptions, cafeStream.destinations)
    : []
  const movementOptions = allMovementOptions.filter(movement =>
    mode === 'production' ? movement.action === 'produce' : movement.action === 'transfer',
  )
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const [movement, setMovement] = useState<KitchenMovement>(PRODUCE)
  useEffect(() => {
    if (mode !== 'transfer' || movementOptions.length === 0) return
    if (!movementOptions.some(option => movementKey(option) === movementKey(movement))) {
      setMovement(movementOptions[0])
    }
  }, [mode, movementOptions, movement])
  const transferDestinationChosen = mode !== 'transfer' || (
    movement.action === 'transfer' && movementOptions.some(option => movementKey(option) === movementKey(movement))
  )
  const writeClosed = !canCapture || streamMissing || streamNonProducing
  const captureClosed = writeClosed || !transferDestinationChosen
  const [logDate] = useState(wibToday) // today WIB; owner-decision: allow past dates flagged
  const [wipItems, setWipItems] = useState<CaptureFormItem[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [actualsMap, setActualsMap] = useState<ActualsMap>({})
  const [summaryCountsAvailable, setSummaryCountsAvailable] = useState(false)
  const [buId, setBuId] = useState('')
  const [lines, setLines] = useState<Record<string, KitchenLogLine>>({})
  const [status, setStatus] = useState<PageStatus>({ kind: 'loading' })
  const [submitError, setSubmitError] = useState('')
  const [unitNotShownItemIds, setUnitNotShownItemIds] = useState<Set<string>>(new Set())
  // The capture inputs disable while a batch saves; a failed save gives focus back to the field being typed in.
  const captureRef = useFocusRestore<HTMLDivElement>(status.kind === 'submitting', !!submitError)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [savedDraftAt, setSavedDraftAt] = useState<string | null>(null)
  const [restoredDraft, setRestoredDraft] = useState(false)
  const capturePageState = useCafeCaptureDraftPageState()
  const {
    restoredDraftInfo,
    setRestoredDraftInfo,
    restoreAnnouncement,
    setRestoreAnnouncement,
    setRestorationNotice,
    search,
    resetSearchFilters,
  } = capturePageState
  const [otherDateDrafts, setOtherDateDrafts] = useState<StoredCafeCaptureDraft<StoredKitchenCaptureDraft>[]>([])
  const [pendingDateDraftDiscard, setPendingDateDraftDiscard] = useState<CafeCaptureDraftScope | null>(null)
  const draftListHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusDraftAfterDiscardRef = useRef(false)

  useEffect(() => {
    if (!focusDraftAfterDiscardRef.current) return
    focusDraftAfterDiscardRef.current = false
    const target = draftListHeadingRef.current
      ?? captureRef.current?.querySelector<HTMLInputElement>('.kls-qty')
    target?.focus()
  }, [captureRef, discardConfirmOpen, otherDateDrafts, pendingDateDraftDiscard, restoredDraft])
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
  const [invalidQuantityIds, setInvalidQuantityIds] = useState<Set<string>>(new Set())
  const [invalidQuantityDrafts, setInvalidQuantityDrafts] = useState<Record<string, string>>({})
  const [visibleQuantityErrors, setVisibleQuantityErrors] = useState<Set<string>>(new Set())
  const [focusInvalidId, setFocusInvalidId] = useState<string | null>(null)
  const [tableResetKey, setTableResetKey] = useState(0)

  // Client-side search + category (P-3), URL-synced so the view survives refresh/share (I7 / D-E1).
  // Group collapse stays INTERNAL to the shared <DataTable> (no page-level collapsedGroups state).
  // Category and kind selectors are hidden inside the capture form on phones, so copied
  // production/transfer links must not hide rows behind controls the reader cannot use. The
  // receiving toolbar is outside that form and stays filterable at phone widths. RAW is only
  // valid for Transfer.
  const canUseCategoryAndKindFilters = isDesktop || streamNonProducing
  const requestedKindFilter = capturePageState.kindFilter as KitchenItemKindFilter
  const supportedKindFilter = requestedKindFilter === 'All' || requestedKindFilter === 'WIP'
    || (mode === 'transfer' && requestedKindFilter === 'RAW')
    ? requestedKindFilter
    : 'All'
  const effectiveKindFilter: KitchenItemKindFilter = canUseCategoryAndKindFilters ? supportedKindFilter : 'All'
  const effectiveCategory = canUseCategoryAndKindFilters ? capturePageState.category : 'All'
  const filterRows = useMemo(
    () => toKitchenListRows(wipItems, {
      kind: 'WIP',
      getId: item => item.id,
      getKind: item => item.kind ?? 'WIP',
      getName: item => item.name,
      getCategory: item => item.category,
      getGroupKey: item => (lines[item.id]?.plan_qty ?? 0) > 0 ? 'planned' : 'offplan',
    }),
    [lines, wipItems],
  )
  const itemTable = useKitchenItemTable({
    data: filterRows,
    search: capturePageState.search,
    kind: effectiveKindFilter,
    category: effectiveCategory,
  })
  const visibleItems = itemTable.getFilteredRowModel().rows.map(row => row.original)
  const plannedLines = visibleItems.filter(item => (lines[item.id]?.plan_qty ?? 0) > 0)
  const categories = [
    'All',
    ...Array.from(new Set(wipItems.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ]
  // TanStack's grouped model queues its auto-reset update on first access. During the initial
  // async bootstrap the route can still be suspended/uncommitted; reading that model then retries
  // its mount and repeats the queued update. The loading frame doesn't consume groups, so defer
  // grouped-row derivation until the page has committed and its data is ready.
  const groups = status.kind === 'loading' ? [] : kitchenDataTableGroups(
    itemTable,
    groupKey => groupKey === 'planned' ? t('kitchen.log.group.planned') : t('kitchen.log.group.offplan'),
  ).sort((a, b) => (a.key === 'planned' ? -1 : b.key === 'planned' ? 1 : 0))
  const focusInvalidGroupKey = focusInvalidId
    ? filterRows.find(row => row.rowId === focusInvalidId)?.groupKey ?? null
    : null

  // The day summary uses only submitted map membership, independent of draft lines and the
  // currently offered list. Plan and actual quantities have no proven shared unit basis.
  const kpis = useKitchenKpis(planMap, actualsMap, movementKey(movement))
  const transferDestination = movement.action === 'transfer'
    ? branches.find(branch => branch.id === movement.destinationBranchId)
    : undefined
  const transferDestinationName = transferDestination
    ? branchDisplayName(transferDestination)
    : movement.action === 'transfer' ? t('kitchen.actionType.transferTo.fallback') : null
  const summaryAriaLabel = mode === 'transfer'
    ? t('kitchen.transfer.summary.aria', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })
    : t('kitchen.log.summary.aria')
  const summaryMetrics = [
    { key: 'plan', label: t(mode === 'transfer' ? 'kitchen.plan.pesanan.col.planned' : 'kitchen.log.summary.plan'), value: String(kpis.plannedItemCount) },
    {
      key: 'made',
      label: mode === 'transfer' ? t('kitchen.transfer.summary.quantity') : t('kitchen.log.summary.made'),
      value: String(kpis.loggedItemCount),
    },
    {
      key: 'off-plan',
      label: t(mode === 'transfer' ? 'kitchen.review.summary.offPlan' : 'kitchen.log.summary.offPlan'),
      value: String(kpis.offPlanItemCount),
    },
  ]
  const displayedSummaryMetrics = summaryCountsAvailable
    ? summaryMetrics
    : summaryMetrics.map(metric => ({ ...metric, value: '—' }))
  const renderSummarySupport = () => !summaryCountsAvailable && (
    <p role="status" className="kl-summary-unavailable">{t('kitchen.log.summary.unavailable')}</p>
  )

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

  const recordDraftRestoration = useCallback((
    record: StoredCafeCaptureDraft<StoredKitchenCaptureDraft> | null,
    restoredLines: Record<string, KitchenLogLine>,
  ) => {
    setSavedDraftAt(record?.updatedAt ?? null)
    setRestoredDraft(Boolean(record))
    const restoredCount = Object.values(restoredLines).filter(line => line.qty_porsi > 0).length
    setRestorationNotice(record?.updatedAt ?? null, restoredCount)
  }, [setRestorationNotice])

  const commitRestoredStreamDraft = useCallback((
    { items, plan, stock, actuals, restored, record, dateDrafts }: {
      items: CaptureFormItem[]
      plan: PlanMap
      stock: StockMap
      actuals: ActualsMap
      restored: ReturnType<typeof restoreKitchenCaptureDraft>
      record: StoredCafeCaptureDraft<StoredKitchenCaptureDraft> | null
      dateDrafts: StoredCafeCaptureDraft<StoredKitchenCaptureDraft>[]
    },
    stream: ProductionStream | null,
    options: readonly ProductionStream[],
  ) => {
    setWipItems(items)
    setInvalidItemIds(new Set())
    setPlanMap(plan)
    setStockMap(stock)
    setActualsMap(actuals)
    setSummaryCountsAvailable(streamProduces(stream, options))
    setMovement(restored.movement)
    setLines(restored.lines)
    recordDraftRestoration(record, restored.lines)
    setOtherDateDrafts(dateDrafts)
    setStatus({ kind: 'ready' })
  }, [recordDraftRestoration])

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
    setRestoredDraftInfo(null)
    setRestoreAnnouncement('')
    setSummaryCountsAvailable(false)
    try {
      const [catalog, bu] = await Promise.all([
        // The module's stream, resolved the one way every Café surface resolves it
        // (issue 456): the session's own choice (#440) outranks the person's own stream
        // (shared.default_stream(), FR-001), and neither may name a pair outside the live
        // enumerable stream catalog — a stale pair resolves to "choose", never to a guess (FR-002).
        resolveStream(),
        resolveKitchenBuId(),
      ])
      const resolvedStream = catalog.stream
      const availableMovements = mode === 'transfer' && resolvedStream
        ? movementsForStream(resolvedStream, catalog.options, catalog.destinations).filter(option => option.action === 'transfer')
        : [PRODUCE]
      const fallbackMovement = availableMovements[0] ?? PRODUCE
      const currentDraftScope = resolvedStream && draftOrgId && draftPersonId
        ? kitchenDraftScope(mode, draftOrgId, draftPersonId, resolvedStream, logDate)
        : null
      const storedDraftRecord = currentDraftScope
        ? readCafeCaptureDraft<StoredKitchenCaptureDraft>(currentDraftScope)
        : null
      const storedDraft = storedDraftRecord?.value ?? null
      const dateDrafts = resolvedStream && canCapture && draftOrgId && draftPersonId
        ? listOtherDateCafeCaptureDrafts<StoredKitchenCaptureDraft>(
          kitchenDraftScope(mode, draftOrgId, draftPersonId, resolvedStream, logDate),
        )
        : []
      const resolvedMovement = storedDraft?.movement
        ? availableMovements.find(option => movementKey(option) === movementKey(storedDraft.movement)) ?? fallbackMovement
        : fallbackMovement
      // The stream's own ESB list (#222), plus the person's stream/date-scoped draft restore.
      // With no stream, there is no list — the choose-stream state replaces it.
      const items = await listCaptureFormItems(resolvedStream ?? undefined, mode === 'transfer' ? 'transfer' : 'produce')
      // An empty offered roster still has submitted plan/actual membership for a producing
      // stream. Keep those counts independent of the item list; stock is only needed to build
      // editable lines, so do not fetch it when there are none.
      if (items.length === 0) {
        let plan: PlanMap = {}
        let actuals: ActualsMap = {}
        let countsAvailable = false
        if (resolvedStream && streamProduces(resolvedStream, catalog.options)) {
          try {
            ;[plan, actuals] = await Promise.all([
              fetchPlanMap(logDate, resolvedStream),
              fetchActualsMap(logDate, resolvedStream),
            ])
            countsAvailable = true
          } catch (error) {
            reportError(error, { source: 'kitchen-log.summary' })
          }
        }
        if (gen !== requestGen.current) return
        setWipItems(items)
        setInvalidItemIds(new Set())
        setInvalidQuantityIds(new Set())
        setInvalidQuantityDrafts({})
        setVisibleQuantityErrors(new Set())
        setFocusInvalidId(null)
        adoptStream(catalog)
        setMovement(resolvedMovement)
        setPlanMap(plan)
        setStockMap({})
        setActualsMap(actuals)
        setSummaryCountsAvailable(countsAvailable)
        setBuId(bu)
        setLines({})
        setSavedDraftAt(storedDraftRecord?.updatedAt ?? null)
        setRestoredDraft(Boolean(storedDraftRecord))
        setRestoredDraftInfo(null)
        setRestoreAnnouncement('')
        setOtherDateDrafts(dateDrafts)
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
      setInvalidQuantityIds(new Set())
      setInvalidQuantityDrafts({})
      setVisibleQuantityErrors(new Set())
      setFocusInvalidId(null)
      const restored = resolvedStream
        ? restoreKitchenCaptureDraft(storedDraft, items, plan, stock, resolvedStream, availableMovements, resolvedMovement)
        : { lines: buildLines(items, plan, stock, resolvedMovement), movement: resolvedMovement }
      adoptStream(catalog)
      setBuId(bu)
      commitRestoredStreamDraft(
        { items, plan, stock, actuals, restored, record: storedDraftRecord, dateDrafts },
        resolvedStream,
        catalog.options,
      )
    } catch {
      if (gen !== requestGen.current) return
      // Can't resolve items/streams/stock/BU — render an error state rather than stamping a
      // wrong BU or capturing against a guessed stream.
      setStatus({ kind: 'error', message: t('common.loadFailed', { what: t('common.what.items') }) })
    }
  }, [adoptStream, canCapture, commitRestoredStreamDraft, draftOrgId, draftPersonId, logDate, mode, resolveStream, setRestoreAnnouncement, setRestoredDraftInfo, t])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    loadData()
  }, [auth.status, loadData, retryKey])

  // The module root owns the location switch and cannot see these quantities. Publish how many are
  // staged so it can warn before discarding them, and retract it on unmount so a dead form never
  // makes the root warn about work that no longer exists. Above every early return: this is a hook.
  const invalidQuantityCount = invalidQuantityIds.size
  const draftCount = Object.entries(lines).filter(([itemId, line]) =>
    line.qty_porsi > 0 || invalidQuantityIds.has(itemId),
  ).length
  useEffect(() => {
    setCafeDraftCount(draftCount)
    return () => { clearCafeDraftCount() }
  }, [draftCount])

  useEffect(() => {
    if (status.kind !== 'ready' || !draftOrgId || !draftPersonId || !canCapture || !stream) return
    const scope = kitchenDraftScope(mode, draftOrgId, draftPersonId, stream, logDate)
    if (draftCount === 0) {
      clearCafeCaptureDraft(scope)
      setSavedDraftAt(null)
      setRestoredDraft(false)
      setRestoredDraftInfo(null)
      setRestoreAnnouncement('')
      return
    }
    const updatedAt = writeCafeCaptureDraft<StoredKitchenCaptureDraft>(scope, {
      branch_id: stream.branch.id,
      activity: stream.activity,
      movement,
      lines,
    })
    if (updatedAt) setSavedDraftAt(updatedAt)
  }, [canCapture, draftCount, draftOrgId, draftPersonId, lines, logDate, mode, movement, setRestoreAnnouncement, setRestoredDraftInfo, status.kind, stream])

  // A required-note field can make a lower row and the sticky footer taller while the person
  // keeps typing in its quantity input. Recheck only that focused capture input after React has
  // laid out the new row; scroll the existing PageFrame ancestor only when the field overlaps
  // the footer. This preserves focus and draft state and leaves deliberate navigation alone.
  useLayoutEffect(() => {
    const container = captureRef.current
    const active = document.activeElement
    if (!container || !(active instanceof HTMLInputElement)
      || !active.matches('.kls-qty') || !container.contains(active)) return
    const footer = container.querySelector<HTMLElement>('.kl-footer')
    if (!footer) return
    const inputRect = active.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()
    if (footer.getClientRects().length === 0 || footerRect.height <= 0) return
    if (inputRect.bottom <= footerRect.top) return
    active.scrollIntoView?.({ block: 'nearest' })
  }, [captureRef, lines])

  useLayoutEffect(() => {
    if (!focusInvalidId) return
    const field = document.getElementById(`quantity-${focusInvalidId}`)
    if (!(field instanceof HTMLInputElement)) return
    field.scrollIntoView?.({ block: 'center' })
    field.focus()
    setFocusInvalidId(null)
  }, [focusInvalidId, tableResetKey, search, effectiveKindFilter, effectiveCategory, status.kind])

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
  function handleMovementChange(next: KitchenMovement): boolean {
    if (writeClosed) return false
    if (draftCount === 0) {
      setMovement(next)
      return true
    }
    setPendingMovement(next)
    return false
  }

  function confirmMovementSwitch() {
    if (!pendingMovement) return
    setLines(buildLines(wipItems, planMap, stockMap, pendingMovement))
    setInvalidQuantityIds(new Set())
    setInvalidQuantityDrafts({})
    setVisibleQuantityErrors(new Set())
    setFocusInvalidId(null)
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
    setInvalidQuantityIds(new Set())
    setInvalidQuantityDrafts({})
    setVisibleQuantityErrors(new Set())
    setFocusInvalidId(null)
    chooseStream(nextStream) // the whole Café module follows this choice (#440)
    setMovement(PRODUCE)
    setSavedDraftAt(null)
    setRestoredDraft(false)
    setRestoredDraftInfo(null)
    setRestoreAnnouncement('')
    setOtherDateDrafts([])
    setStatus({ kind: 'loading' })
    setSummaryCountsAvailable(false)
    try {
      const items = await listCaptureFormItems(nextStream, mode === 'transfer' ? 'transfer' : 'produce')
      if (gen !== requestGen.current) return
      if (items.length === 0) {
        let plan: PlanMap = {}
        let actuals: ActualsMap = {}
        let countsAvailable = false
        if (streamProduces(nextStream, streamOptions)) {
          try {
            ;[plan, actuals] = await Promise.all([
              fetchPlanMap(logDate, nextStream),
              fetchActualsMap(logDate, nextStream),
            ])
            countsAvailable = true
          } catch (error) {
            reportError(error, { source: 'kitchen-log.summary' })
          }
        }
        if (gen !== requestGen.current) return
        setPlanMap(plan)
        setWipItems(items)
        setInvalidItemIds(new Set())
        setStockMap({})
        setActualsMap(actuals)
        setSummaryCountsAvailable(countsAvailable)
        setLines({})
        setOtherDateDrafts(draftOrgId && draftPersonId
          ? listOtherDateCafeCaptureDrafts<StoredKitchenCaptureDraft>(
            kitchenDraftScope(mode, draftOrgId, draftPersonId, nextStream, logDate),
          )
          : [])
        setStatus({ kind: 'ready' })
        return
      }
      const [plan, stock, actuals] = await Promise.all([
        fetchPlanMap(logDate, nextStream),
        fetchStockMap(logDate, nextStream),
        fetchActualsMap(logDate, nextStream),
      ])
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      const availableMovements = mode === 'transfer'
        ? movementsForStream(nextStream, streamOptions, cafeStream.destinations).filter(option => option.action === 'transfer')
        : [PRODUCE]
      const fallbackMovement = availableMovements[0] ?? PRODUCE
      const currentDraftScope = draftOrgId && draftPersonId
        ? kitchenDraftScope(mode, draftOrgId, draftPersonId, nextStream, logDate)
        : null
      const storedDraftRecord = currentDraftScope
        ? readCafeCaptureDraft<StoredKitchenCaptureDraft>(currentDraftScope)
        : null
      const storedDraft = storedDraftRecord?.value ?? null
      const dateDrafts = draftOrgId && draftPersonId
        ? listOtherDateCafeCaptureDrafts<StoredKitchenCaptureDraft>(
          kitchenDraftScope(mode, draftOrgId, draftPersonId, nextStream, logDate),
        )
        : []
      const restored = restoreKitchenCaptureDraft(
        storedDraft, items, plan, stock, nextStream, availableMovements, fallbackMovement,
      )
      commitRestoredStreamDraft(
        { items, plan, stock, actuals, restored, record: storedDraftRecord, dateDrafts },
        nextStream,
        streamOptions,
      )
    } catch {
      if (gen !== requestGen.current) return
      setStatus({ kind: 'error', message: t('common.loadFailed', { what: t('common.what.items') }) })
    }
  }, [cafeStream.destinations, chooseStream, commitRestoredStreamDraft, draftOrgId, draftPersonId, logDate, mode, setRestoreAnnouncement, setRestoredDraftInfo, streamOptions, t])

  // Staged quantities belong to the stream they were typed against: ask before a switch
  // discards them, and switch straight through when nothing is staged. Shared by the head's
  // Switch/Back actions and the body's one-step choice (#781 item 2) so both routes into a
  // stream change go through the one guard.
  function selectStream(next: ProductionStream) {
    if (draftCount > 0) setPendingStream(next)
    else void applyStream(next)
  }

  function requestDiscardDateDraft(scope: CafeCaptureDraftScope) {
    setPendingDateDraftDiscard(scope)
  }

  function discardDateDraft() {
    if (!pendingDateDraftDiscard) return
    focusDraftAfterDiscardRef.current = true
    clearCafeCaptureDraft(pendingDateDraftDiscard)
    const key = `${pendingDateDraftDiscard.branchId}:${pendingDateDraftDiscard.activity}:${pendingDateDraftDiscard.logDate}`
    setOtherDateDrafts(current => current.filter(record =>
      `${record.scope.branchId}:${record.scope.activity}:${record.scope.logDate}` !== key,
    ))
    setPendingDateDraftDiscard(null)
  }

  const streamBar = {
    options: [...locationStreams, ...otherLocationStreams],
    locationBranchId: locationId,
    stream,
    homeStream,
    myStreamKeys,
    onChange: selectStream,
    disabled: status.kind === 'submitting',
  }
  const streamSwitchConfirm = pendingStream && (
    <ConfirmDialog
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
      onConfirm={async () => {
        const next = pendingStream
        setPendingStream(null)
        if (auth.status === 'authenticated' && stream) {
          clearCafeCaptureDraft(kitchenDraftScope(
            mode, auth.viewer.person.org_id, auth.viewer.person.id, stream, logDate,
          ))
        }
        await applyStream(next)
      }}
      onCancel={() => setPendingStream(null)}
    />
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

  function handleQuantityValidityChange(itemId: string, valid: boolean) {
    setInvalidQuantityIds(current => {
      if (current.has(itemId) === !valid) return current
      const next = new Set(current)
      if (valid) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    if (valid) {
      setInvalidQuantityDrafts(current => {
        if (!(itemId in current)) return current
        const next = { ...current }
        delete next[itemId]
        return next
      })
    }
  }

  function handleInvalidQuantityDraft(itemId: string, raw: string) {
    setInvalidQuantityDrafts(current => ({ ...current, [itemId]: raw }))
  }

  function handleQuantityErrorVisibilityChange(itemId: string, visible: boolean) {
    setVisibleQuantityErrors(current => {
      if (current.has(itemId) === visible) return current
      const next = new Set(current)
      if (visible) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  function focusFirstInvalidQuantity() {
    const itemId = Array.from(invalidQuantityIds).find(id => wipItems.some(item => item.id === id))
    if (!itemId) return
    resetSearchFilters()
    setFocusInvalidId(itemId)
    setTableResetKey(key => key + 1)
  }

  function handleQtyChange(itemId: string, qty: number) {
    if (captureClosed) return
    setLines(prev => {
      const cur = prev[itemId]
      // FR-023 / AC-022: do NOT clamp — keep the entered qty. An over-`tersedia` transfer
      // sets capError (TRANSFER_SHORT_CUE) which blocks Submit (parity with the OLD app's
      // hard stop "Produksi dulu sebelum transfer"); the user types the real number.
      const factor = cur.entry_unit_factor ?? 1
      const staged = qty > 0
      const gated = gateLine({
        ...cur,
        client_request_id: cur.client_attempted || !staged ? crypto.randomUUID() : cur.client_request_id,
        client_attempted: false,
        entry_quantity: qty,
        qty_porsi: toDefaultUnitQuantity(qty, factor),
        dirty: staged,
      }, movement)
      return { ...prev, [itemId]: gated }
    })
  }

  function handleNotesChange(itemId: string, note: string) {
    if (captureClosed) return
    setLines(prev => {
      const current = prev[itemId]
      const next: KitchenLogLine = {
        ...current,
        ...(current.client_attempted ? { client_request_id: crypto.randomUUID() } : {}),
        client_attempted: false,
        notes: note,
      }
      return { ...prev, [itemId]: gateLine(next, movement) }
    })
  }

  // The selected unit gives the unchanged typed amount its meaning; only the canonical quantity
  // submitted to the ERP changes with the factor.
  function handleUnitChange(itemId: string, unitChoice: string) {
    if (captureClosed) return
    const item = wipItems.find(candidate => candidate.id === itemId)
    setLines(prev => {
      const current = prev[itemId]
      if (unitChoice.startsWith('multiple:')) {
        const factor = Number(unitChoice.slice('multiple:'.length))
        const defaultUnit = item?.units.find(unit => unit.is_default) ?? item?.units[0]
        if (!Number.isFinite(factor) || !item?.unit_multiples?.includes(factor) || !defaultUnit) return prev
        const entryQuantity = current.entry_quantity ?? current.qty_porsi
        const next: KitchenLogLine = {
          ...current,
          ...(current.client_attempted ? { client_request_id: crypto.randomUUID() } : {}),
          client_attempted: false,
          item_unit_id: defaultUnit.id,
          entry_quantity: entryQuantity,
          entry_unit_factor: factor,
          entry_unit_name: defaultUnit.name,
          qty_porsi: toDefaultUnitQuantity(entryQuantity, factor),
        }
        return { ...prev, [itemId]: gateLine(next, movement) }
      }
      const selectedUnit = item?.units.find(unit => unit.id === unitChoice)
      if (!selectedUnit) return prev
      const entryQuantity = current.entry_quantity ?? current.qty_porsi
      const next: KitchenLogLine = {
        ...current,
        ...(current.client_attempted ? { client_request_id: crypto.randomUUID() } : {}),
        client_attempted: false,
        item_unit_id: selectedUnit.id,
        entry_quantity: entryQuantity,
        entry_unit_factor: 1,
        entry_unit_name: selectedUnit.name,
        qty_porsi: toDefaultUnitQuantity(entryQuantity, 1),
      }
      return { ...prev, [itemId]: gateLine(next, movement) }
    })
  }

  // Discard all staged entries (consequential — confirmed). Opens the shared centered
  // dialog (DESIGN.md Overlays: "destructive confirmation is one centered blocking
  // dialog") rather than window.confirm, which is unstyled and not app-consistent.
  function handleDiscardClick() {
    if (draftCount === 0) return
    setDiscardConfirmOpen(true)
  }

  // Clears only the staged quantities/notes for the current action_type. Search and
  // category are independent view/filter state, not staged data — Discard used to wipe
  // them too, silently losing the user's filter context along with their entries.
  function performDiscard() {
    focusDraftAfterDiscardRef.current = true
    setLines(buildLines(wipItems, planMap, stockMap, movement))
    if (auth.status === 'authenticated' && stream) {
      clearCafeCaptureDraft(kitchenDraftScope(
        mode, auth.viewer.person.org_id, auth.viewer.person.id, stream, logDate,
      ))
    }
    setSavedDraftAt(null)
    setRestoredDraft(false)
    setRestoredDraftInfo(null)
    setRestoreAnnouncement('')
    setInvalidQuantityIds(new Set())
    setInvalidQuantityDrafts({})
    setVisibleQuantityErrors(new Set())
    setFocusInvalidId(null)
    setDiscardConfirmOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline || invalidQuantityCount > 0) return

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
    setUnitNotShownItemIds(new Set())
    setLines(prev => {
      const next = { ...prev }
      for (const line of staged) {
        if (next[line.wip_item_id]) next[line.wip_item_id] = { ...next[line.wip_item_id], client_attempted: true }
      }
      return next
    })
    try {
      const insertedLogIds = await insertKitchenLogBatch(
        staged.map(line => ({
          client_request_id: line.client_request_id ?? crypto.randomUUID(),
          business_unit_id: buId,
          log_date: logDate,
          // the (branch, activity) production stream this row belongs to (OD-WAY-28)
          branch_id: stream.branch.id,
          activity: stream.activity,
          // the movement — no stored action_type (DD-WAY-13)
          action: movement.action,
          destination_branch_id: movement.destinationBranchId,
          wip_item_id: line.wip_item_id,
          // ERP logs always bind the default item-unit; the entry metadata says which
          // manager-defined multiple was used and the trigger recomputes canonical qty_porsi.
          item_unit_id: line.item_unit_id,
          qty_porsi: line.qty_porsi,
          entry_quantity: line.entry_quantity ?? line.qty_porsi,
          entry_unit_factor: line.entry_unit_factor ?? 1,
          notes: line.notes.trim() || null,
          // status / source / org_id / submitted_by NOT sent — server-stamped (NFR-003)
        })),
      )
      const key = movementKey(movement)
      setActualsMap(prev => {
        const next = { ...prev }
        staged.forEach((line, index) => {
          const entries = next[line.wip_item_id]?.[key] ?? []
          const entryKey = `log:${insertedLogIds[index] ?? `pending-${Date.now()}-${index}`}`
          if (entries.some(entry => entry.key === entryKey)) return
          const item = wipItems.find(candidate => candidate.id === line.wip_item_id)
          const selectedUnit = item?.units.find(unit => unit.id === line.item_unit_id)
          const entry: ActualUnitTotal = {
            key: entryKey,
            item_unit_id: line.item_unit_id,
            unit_name: selectedUnit?.name ?? null,
            qty_porsi: line.qty_porsi,
            entry_quantity: line.entry_quantity ?? line.qty_porsi,
            entry_unit_factor: line.entry_unit_factor ?? 1,
            entry_unit_name: line.entry_unit_name ?? selectedUnit?.name ?? null,
          }
          next[line.wip_item_id] = {
            ...next[line.wip_item_id],
            [key]: [...entries, entry],
          }
        })
        return next
      })
      setStatus({ kind: 'success', count: staged.length })
      if (stream) clearCafeCaptureDraft(kitchenDraftScope(mode, draftOrgId, draftPersonId, stream, logDate))
      setSavedDraftAt(null)
      setRestoredDraft(false)
      setRestoredDraftInfo(null)
      setRestoreAnnouncement('')
      setInvalidItemIds(new Set())
      setUnitNotShownItemIds(new Set())
      setInvalidQuantityIds(new Set())
      setInvalidQuantityDrafts({})
      setVisibleQuantityErrors(new Set())
      setFocusInvalidId(null)
      setLines(buildLines(wipItems, planMap, stockMap, movement))
    } catch (err) {
      reportError(err, { source: 'kitchen-log.submit' })
      if (isItemUnitNotShownError(err)) {
        if (staged.length === 1) setUnitNotShownItemIds(new Set([staged[0]!.wip_item_id]))
        else setSubmitError(t('kitchen.log.error.unitNotShownBatch'))
      } else if (isItemNotOnStreamError(err)) {
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
      <CafePageFrame page={page} date={logDate} streamBar={streamBar} state="loading">
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <LoadingShell count={3} />
        </div>
      </CafePageFrame>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <CafePageFrame page={page} date={logDate} streamBar={streamBar} state="permission">
        <div className="kl-page kl-unauth kl-block">
          <p className="kl-unauth-msg">{t('kitchen.log.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary btn-touch kl-touch">{t('common.signIn')}</Link>
        </div>
      </CafePageFrame>
    )
  }

  // ── Data loading state — offline indicator surfaced here too (#2, RI-2) ──────
  // The picker rides in the page head in every state, bootstrap included: a slow stream's
  // read must never take away the control that switches off it (FR-003 default-not-wall),
  // and a head that goes silent about its stream is the #440 defect itself.
  if (status.kind === 'loading') {
    return (
      <CafePageFrame page={page} date={logDate} streamBar={streamBar} state="loading">
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <LoadingShell count={3} />
        </div>
      </CafePageFrame>
    )
  }

  // ── Error state — never a bare Retry loop when offline (#2, RI-2) ────────────
  if (status.kind === 'error') {
    return (
      <CafePageFrame page={page} date={logDate} streamBar={streamBar} state="error">
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
      </CafePageFrame>
    )
  }

  // ── Empty offered roster — submitted membership counts remain independent of capture rows.
  // With no stream there is no roster to be empty: the choose-a-stream state below owns that case. ──
  if (wipItems.length === 0 && stream !== null) {
    return (
      <CafePageFrame page={page} date={logDate} streamBar={streamBar} state={streamNonProducing || !canCapture ? 'read-only' : 'empty'}>
        <div className={`kl-page kl-capture-content cafe-capture-content${isWide ? ' kl-capture-wide' : ''}`}>
          <OfflineBanner show={!isOnline} />
          {!canCapture && <p className="cafe-items__read-only" role="note">{t('cafe.capture.readOnly')}</p>}
          {streamNonProducing && receivingOnlyNotice}
          {canCapture && mode === 'transfer' && movementOptions.length > 0 && (
            <div className="kl-scope">
              <MovementSeg
                value={movement}
                options={movementOptions}
                branches={branches}
                origin={stream}
                onChange={handleMovementChange}
                disabled={writeClosed || status.kind !== 'ready'}
              />
            </div>
          )}
          {status.kind === 'ready' && stream !== null && !streamNonProducing && transferDestinationChosen && (
            <div className="kl-empty-summary" role="group" aria-label={summaryAriaLabel}>
              <MetricSummaryRule metrics={displayedSummaryMetrics} variant="inline" />
              {renderSummarySupport()}
            </div>
          )}
          {stream === null ? (
            <CafeStreamChoices
              options={locationStreams}
              homeStream={homeStream}
              myStreamKeys={myStreamKeys}
              onChoose={selectStream}
              disabled={status.kind === 'submitting'}
            />
          ) : <CafeItemsEmptyState stream={stream} />}
          {/* AC-013: the DD-WAY-29 gate also empties this list when nothing is confirmed —
              the report route must be reachable from here too, not only under a full list.
              #744 review: the report files a WRITE (ops.log_entries), so it closes with the
              same capture gate as Submit — an unaffiliated reader sees no report control. */}
          {buId && stream && !captureClosed && (
            <ReportMissingItem stream={stream} streamLabel={streamLabel(t, stream)} />
          )}
          {stream !== null && !streamNonProducing && canCapture && (
            <div className="kl-footer cafe-capture-footer">
              <div className="kl-footer-count-row">
                <div className="kl-tally" aria-live="polite">
                  <span className="kl-tally-num tabular">{t('kitchen.log.footer.item.other', { count: 0 })}</span>
                </div>
              </div>
              <SubmitButton stagedCount={0} isSubmitting={false} isOnline={isOnline} blocked t={t} />
            </div>
          )}
        </div>
      </CafePageFrame>
    )
  }

  const isSubmitting = status.kind === 'submitting'
  const stagedLines = Object.values(lines).filter(l => l.qty_porsi > 0)
  const stagedCount = stagedLines.length
  const stagedSummary = stagedLines.flatMap(line => {
    const item = wipItems.find(candidate => candidate.id === line.wip_item_id)
    if (!item) return []
    const unit = line.entry_unit_name ?? item.units.find(candidate => candidate.id === line.item_unit_id)?.name ?? item.units[0]?.name ?? t('kitchen.unit.porsi')
    return [{
      id: item.id,
      name: item.name,
      quantity: line.entry_quantity ?? line.qty_porsi,
      factor: line.entry_unit_factor ?? 1,
      unit,
    }]
  })
  const formatCaptureQty = (quantity: number) => new Intl.NumberFormat(
    document.documentElement.lang || 'en', { useGrouping: false, maximumFractionDigits: 2 },
  ).format(quantity)
  const renderUnitlessValue = (value: ReactNode) => (
    <span className="kl-unitless-value">
      <strong className="tabular">{value}</strong>
      <small>{t('kitchen.log.unit.unrecorded')}</small>
    </span>
  )
  const renderPlanValue = (quantity: number) => (
    <span className="kl-unitless-value">
      <strong className="tabular">{quantity > 0 ? formatCaptureQty(quantity) : '—'}</strong>
      {quantity > 0 && <small>{t('kitchen.log.unit.unrecorded')}</small>}
    </span>
  )
  const displayActualUnitsForItem = (entries: ActualUnitTotal[], item: CaptureFormItem) => entries.map(entry => {
    // Current offer labels already distinguish repeated ERP names (for example, batch (1/2)).
    // Apply one only to the exact recorded identity. Archived or otherwise unoffered history
    // keeps its own recorded label, and unresolved/null identities stay explicitly unknown.
    const offeredLabel = entry.item_unit_id === null
      ? undefined
      : item.units.find(unit => unit.id === entry.item_unit_id)?.name
    return offeredLabel ? { ...entry, unit_name: offeredLabel } : entry
  })
  const renderActualUnits = (entries: ActualUnitTotal[], item: CaptureFormItem) => {
    const displayedEntries = displayActualUnitsForItem(entries, item)
    return displayedEntries.length > 0
      ? (
        <span className="kl-actual-units">
          {displayedEntries.map(entry => {
            const quantity = entry.entry_quantity ?? entry.qty_porsi
            const factor = entry.entry_unit_factor ?? 1
            const unitName = entry.entry_unit_name ?? entry.unit_name?.trim() ?? t('kitchen.log.unit.unknownHistory')
            return (
              <span key={entry.key}>
                {formatCaptureQty(quantity)}{factor === 1 ? ' ' : ' × '}
                {factor === 1 ? unitName : formatUnitMultiple(factor, unitName, document.documentElement.lang || 'en')}
              </span>
            )
          })}
        </span>
      )
      : !canCapture ? t('cafe.capture.notRecorded') : '—'
  }
  const captureDraftContent = (
    <>
      {mode === 'transfer' && (
        <div className="kl-capture-summary__destination">
          <span>{t('kitchen.transfer.draft.destination')}</span>
          <strong>{transferDestinationName ?? t('kitchen.actionType.transferTo.fallback')}</strong>
        </div>
      )}
      <h3>{t(mode === 'transfer' ? 'kitchen.transfer.draft.items' : 'kitchen.log.summary.entered')}</h3>
      {stagedSummary.length === 0 ? (
        <p className="kl-capture-summary__empty">{t('kitchen.log.summary.draftEmpty')}</p>
      ) : (
        <ul className="kl-capture-summary__lines" aria-live="polite">
          {stagedSummary.map(line => (
            <li key={line.id}>
              <span>{line.name}</span>
              <strong className="tabular">
                {formatCaptureQty(line.quantity)}{line.factor === 1 ? ' ' : ' × '}
                {line.factor === 1 ? line.unit : formatUnitMultiple(line.factor, line.unit, document.documentElement.lang || 'en')}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </>
  )
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

  // Direct stream choices remain useful to read-only viewers; capture still requires authority.
  const showNoStreamChoices = streamMissing && !streamNonProducing
  const noStreamChosen = canCapture && showNoStreamChoices
  const readOnlyNoStream = !canCapture && streamMissing
  // On the live capture form, explain offline blocking once in the sticky band. States with no
  // band (no stream, receiving-only, loading/error, or empty catalog) keep the page banner.
  const showOfflineInFooter = !isOnline && !streamNonProducing && !(noStreamChosen && !streamOutsideLocation)

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
  // Each capture row keeps its item facts together on the left and the bound-unit input on the
  // right. Plan and stock stay explicitly unitless; the field's placeholder is only a typing aid.
  const renderCaptureMeta = (line: KitchenLogLine, rowStatus?: string) => (
    <div className="kl-card-meta">
      <span className="kl-card-plan">
        <span>{t('kitchen.log.col.plan')}</span>
        <strong className="tabular">{line.plan_qty > 0 ? formatCaptureQty(line.plan_qty) : '—'}</strong>
      </span>
      <span className="kl-card-meta-separator" aria-hidden="true">·</span>
      <span className="kl-card-stock">
        <span>{t('kitchen.log.col.stock')}</span>
        <strong className="tabular">{formatCaptureQty(line.stok)}</strong>
      </span>
      {mode === 'transfer' && line.tersedia !== line.stok && <>
        <span className="kl-card-meta-separator" aria-hidden="true">·</span>
        <span className="kl-card-stock">
          <span>{t('kitchen.stock.col.tersedia')}</span>
          <strong className="tabular">{formatCaptureQty(line.tersedia)}</strong>
        </span>
      </>}
      {!line.item_unit_id && <small>{t('kitchen.log.unit.missingCapture')}</small>}
      {rowStatus && <span className="kl-status kl-status--neutral">{rowStatus}</span>}
    </div>
  )
  const renderCaptureItemMeta = (item: KitchenListRow<CaptureFormItem>) => {
    const line = lines[item.id]
    const actuals = actualsMap[item.id]?.[movementKey(movement)] ?? []
    const rowStatus = isDesktop ? undefined : line.qty_porsi > 0
      ? t('kitchen.status.staged')
      : actuals.some(entry => entry.qty_porsi > 0) ? t('kitchen.status.logged') : undefined
    return (
      <>
        {invalidItemIds.has(item.id) && <NotOnStreamTag />}
        {unitNotShownItemIds.has(item.id) && (
          <p role="alert" className="cafe-count__field-error">{t('kitchen.log.error.unitNotShown')}</p>
        )}
        {renderCaptureMeta(line, rowStatus)}
      </>
    )
  }
  const renderCaptureStepper = (
    item: KitchenListRow<CaptureFormItem>,
    line: KitchenLogLine,
    dense: boolean,
    hideQuantityError = false,
  ) => (
    <WipItemStepper
      itemName={item.name}
      line={line}
      movement={movement}
      destinationName={transferDestinationName ?? undefined}
      alreadyLogged={displayActualUnitsForItem(actualsMap[item.id]?.[movementKey(movement)] ?? [], item)}
      onQtyChange={qty => handleQtyChange(item.id, qty)}
      onQuantityValidityChange={valid => handleQuantityValidityChange(item.id, valid)}
      onQuantityErrorVisibilityChange={visible => handleQuantityErrorVisibilityChange(item.id, visible)}
      hideQuantityError={hideQuantityError}
      quantityErrorId={`quantity-${item.id}-quantity-error`}
      invalidDraft={invalidQuantityDrafts[item.id]}
      onInvalidQuantityDraft={raw => handleInvalidQuantityDraft(item.id, raw)}
      onNotesChange={note => handleNotesChange(item.id, note)}
      unitOptions={item.units}
      unitMultiples={item.unit_multiples}
      onUnitChange={unitChoice => handleUnitChange(item.id, unitChoice)}
      disabled={isSubmitting || captureClosed}
      hideName
      dense={dense}
    />
  )

  const renderQuantityError = (item: KitchenListRow<CaptureFormItem>) => {
    const rawValue = invalidQuantityDrafts[item.id]
    if (!rawValue || !visibleQuantityErrors.has(item.id)) return null
    const parsed = parseQuantityInput(rawValue, { min: 0, maxIntegerDigits: 10, maxFractionDigits: 2 })
    if (parsed.kind !== 'invalid') return null
    return (
      <QuantityFieldError
        id={`quantity-${item.id}-quantity-error`}
        reason={parsed.reason}
        rawValue={rawValue}
        maxFractionDigits={2}
        className="kl-row-quantity-error"
      />
    )
  }

  // Receiving-only streams keep the same readable plan/stock/history rows, but render the
  // submitted actual instead of mounting the production stepper. A plain DataTable card is
  // intentional here: it keeps every value readable on phone without introducing a disabled
  // capture control that looks like an unfinished write path.
  const receivingColumns: DataTableColumn<KitchenListRow<CaptureFormItem>>[] = [
    {
      key: 'dish',
      header: t('kitchen.log.col.item'),
      cardLabel: '',
      render: item => (
        <span className="kl-dish">
          <span className="kl-dish-name"><span>{item.kind} - </span><span>{item.name}</span></span>
          {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('kitchen.log.col.plan'),
      numeric: true,
      render: item => renderPlanValue(lines[item.id]?.plan_qty ?? 0),
    },
    {
      key: 'stock',
      header: t('kitchen.log.col.stock'),
      numeric: true,
      render: item => renderUnitlessValue(lines[item.id]?.stok ?? 0),
    },
    {
      key: 'made',
      header: mode === 'transfer'
        ? t('kitchen.transfer.col.quantity', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })
        : t('kitchen.log.col.made'),
      numeric: true,
      render: item => renderActualUnits(actualsMap[item.id]?.[movementKey(movement)] ?? [], item),
    },
    {
      key: 'status',
      header: t('kitchen.log.col.status'),
      render: item => {
        const actuals = actualsMap[item.id]?.[movementKey(movement)] ?? []
        if (!actuals.some(entry => entry.qty_porsi > 0)) return null
        return <span className="kl-status kl-status--neutral">{t('kitchen.status.logged')}</span>
      },
    },
  ]

  const logToolbar = (
    <KitchenToolbar
      search={capturePageState.search}
      onSearchChange={capturePageState.setSearch}
      kinds={mode === 'transfer' ? KITCHEN_KIND_FILTER_OPTIONS : undefined}
      kind={effectiveKindFilter}
      kindId="cafe-log-kind"
      onKindChange={capturePageState.setKindFilter}
      categories={categories}
      categoryId="cafe-log-category"
      categoryLabel={value => kitchenCategoryLabel(t, value)}
      category={capturePageState.category}
      onCategoryChange={capturePageState.setCategory}
      searchPlaceholder={t('kitchen.log.searchPlaceholder')}
      ariaLabel={t('kitchen.log.toolbarAria')}
      trailing={buId && stream && !captureClosed
        ? <ReportMissingItem stream={stream} streamLabel={streamLabel(t, stream)} />
        : undefined}
    >
      {canCapture && mode === 'transfer' && movementOptions.length > 0 && <div className="kl-scope">
        <MovementSeg
          value={movement}
          options={movementOptions}
          branches={branches}
          origin={stream}
          onChange={handleMovementChange}
          disabled={isSubmitting || writeClosed}
        />
      </div>}
    </KitchenToolbar>
  )

  const captureCaption = mode === 'transfer'
    ? t('kitchen.transfer.caption', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })
    : t('kitchen.log.caption')
  const receivingCaption = mode === 'transfer'
    ? t('kitchen.transfer.receivingCaption')
    : t('kitchen.stream.receivingOnly.logCaption')
  const logTable = streamNonProducing || !canCapture ? (
    <DataTable
      columns={receivingColumns}
      rows={visibleItems}
      groups={groups}
      key={`${movementKey(movement)}:${plannedLines.length > 0 ? 'planned' : 'off-plan'}:${tableResetKey}`}
      defaultCollapsedGroupKeys={plannedLines.length > 0 && focusInvalidGroupKey !== 'offplan' ? new Set(['offplan']) : undefined}
      isDesktop={isDesktop}
      state={visibleItems.length > 0 ? 'ready' : 'empty'}
      emptyLabel={t(readOnlyNoStream ? 'kitchen.log.readOnlyNoStreamEmpty' : 'kitchen.filter.noMatch')}
      caption={streamNonProducing ? receivingCaption : t('cafe.capture.readOnlyCaption')}
    />
  ) : (
    <CafeCaptureTable
      rows={visibleItems}
      groups={groups}
      key={`${movementKey(movement)}:${plannedLines.length > 0 ? 'planned' : 'off-plan'}:${tableResetKey}`}
      defaultCollapsedGroupKeys={plannedLines.length > 0 && focusInvalidGroupKey !== 'offplan' ? new Set(['offplan']) : undefined}
      renderControls={item => renderCaptureStepper(item, lines[item.id], true, isDesktop)}
      renderItemMeta={renderCaptureItemMeta}
      renderFeedback={isDesktop ? renderQuantityError : undefined}
      showCategory={false}
      cardWrapperClassName="kl-row"
      quantityHeader={mode === 'transfer'
        ? t('kitchen.transfer.col.quantity', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })
        : t('kitchen.log.col.made')}
      isDesktop={isDesktop}
      state={visibleItems.length > 0 ? 'ready' : 'empty'}
      emptyLabel={t(readOnlyNoStream ? 'kitchen.log.readOnlyNoStreamEmpty' : 'kitchen.filter.noMatch')}
      caption={captureCaption}
    />
  )

  return (
    <CafePageFrame
      page={page}
      date={logDate}
      streamBar={streamBar}
      state={status.kind === 'submitting' ? 'saving' : status.kind === 'success' ? 'saved' : streamNonProducing || !canCapture ? 'read-only' : submitError ? 'validation' : 'default'}
    >
      {streamSwitchConfirm}
      <div ref={captureRef} className={`kl-page kl-capture-content cafe-capture-content${isWide ? ' kl-capture-wide' : ''}`}>
        <div className="kl-capture-main">
        {/* GAP-4/#9: staged-but-unsubmitted quantities must not vanish on navigation — prompt
            stay/discard when leaving the route with unsaved entries. */}
        <RouteLeaveGuard when={draftCount > 0} message={t('kitchen.log.leave.confirm')} />
        <OfflineBanner show={!isOnline && !showOfflineInFooter} />
        {status.kind === 'ready' && stream !== null && !canCapture && (
          <p className="cafe-items__read-only" role="note">{t('cafe.capture.readOnly')}</p>
        )}
        {restoreAnnouncement && (
          <p className="sr-only" role="status" aria-live="polite">{restoreAnnouncement}</p>
        )}
        {status.kind === 'ready' && restoredDraft && draftCount > 0 && savedDraftAt && restoredDraftInfo && (
          <section className="kl-capture-draft-notice" aria-live="off">
            <details className="kl-capture-draft-details" open={isDesktop}>
              <summary>
                <strong>{t(
                  restoredDraftInfo.count === 1
                    ? 'cafe.captureDraft.restoredCompact.one'
                    : 'cafe.captureDraft.restoredCompact.other',
                  { count: restoredDraftInfo.count },
                )}</strong>
                <span className="sr-only">{t('cafe.captureDraft.details')}</span>
              </summary>
              <div className="kl-capture-draft-details__body">
                <small>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(restoredDraftInfo.savedAt) })}</small>
                {otherDateDrafts.length === 0 && <small>{t('cafe.captureDraft.expiry')}</small>}
              </div>
            </details>
            <button type="button" className="btn btn-outline" onClick={handleDiscardClick} disabled={isSubmitting}>
              {t('kitchen.log.discard')}
            </button>
          </section>
        )}
        {status.kind === 'ready' && otherDateDrafts.length > 0 && (
          <section className="kl-capture-draft-list" aria-labelledby="kl-other-date-drafts">
            <h2 id="kl-other-date-drafts" ref={draftListHeadingRef} tabIndex={-1}>{t('cafe.captureDraft.otherDates')}</h2>
            <p className="kl-capture-draft-guidance">{t('cafe.captureDraft.otherDatesNextStep')}</p>
            {otherDateDrafts.map(record => {
              const savedLines = kitchenDraftLines(record.value)
              const date = formatDayMonthYear(record.scope.logDate)
              return (
                <article
                  key={`${record.scope.branchId}:${record.scope.activity}:${record.scope.logDate}`}
                  className="kl-capture-draft-notice"
                  aria-label={t(savedLines.length === 1 ? 'cafe.captureDraft.otherDate.one' : 'cafe.captureDraft.otherDate.other', { date, count: savedLines.length })}
                >
                  <details className="kl-capture-draft-details" open={isDesktop}>
                    <summary>
                      <strong>{t(savedLines.length === 1 ? 'cafe.captureDraft.otherDate.one' : 'cafe.captureDraft.otherDate.other', { date, count: savedLines.length })}</strong>
                      <span className="sr-only">{t('cafe.captureDraft.details')}</span>
                    </summary>
                    <div className="kl-capture-draft-details__body">
                      <ul>
                        {savedLines.map(line => {
                          const item = wipItems.find(candidate => candidate.id === line.wip_item_id)
                          const itemName = item
                            ? `${item.kind ?? 'WIP'} - ${item.name}`
                            : t('kitchen.log.draft.itemUnavailable')
                          return <li key={line.wip_item_id}>
                            <span>{itemName}</span>
                            <span>{formatCaptureQty(line.entry_quantity ?? line.qty_porsi)} {line.entry_unit_name ?? t('kitchen.unit.porsi')}</span>
                          </li>
                        })}
                      </ul>
                      <small>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(record.updatedAt) })}</small>
                    </div>
                  </details>
                  <button type="button" className="btn btn-outline" onClick={() => requestDiscardDateDraft(record.scope)}>
                    {t('kitchen.log.discard')}
                  </button>
                </article>
              )
            })}
            <small className="kl-capture-draft-expiry">{t('cafe.captureDraft.expiry')}</small>
          </section>
        )}
        {/* The Location/opening door and the Plan/Made/Off-plan figures dock into one compact
            context header so the summary reads as that header's own figures, never an orphan
            line floating with no container of its own. Falls back to the plain band (unchanged)
            when there is no leading door to dock onto — most callers of this page render no
            `leading` at all. */}
        {leading ? (
          <div className="kl-context">
            {leading}
            {/* R4 / FR-018: derived from submitted actuals only — staged typing never moves it. */}
            {status.kind === 'ready' && stream !== null && !streamNonProducing && wipItems.length > 0 && transferDestinationChosen && (
              <div className="kl-context-summary kl-inline-summary" role="group" aria-label={summaryAriaLabel}>
                <MetricSummaryRule
                  metrics={displayedSummaryMetrics}
                  variant="inline"
                />
                {renderSummarySupport()}
              </div>
            )}
          </div>
        ) : (
          status.kind === 'ready' && stream !== null && !streamNonProducing && wipItems.length > 0 && transferDestinationChosen && (
            <div className="kl-inline-summary" role="group" aria-label={summaryAriaLabel}>
              <MetricSummaryRule
                metrics={displayedSummaryMetrics}
              />
              {renderSummarySupport()}
            </div>
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
            onSubmit={canCapture ? handleSubmit : event => event.preventDefault()}
            noValidate
            aria-label={canCapture ? t('kitchen.log.captureAria') : undefined}
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
          {showNoStreamChoices ? (
            // No dish list, no filters over a list that isn't there, and nothing that LOOKS
            // like an editable quantity field until a stream makes it one — one guidance state
            // where the list would render. #781 item 2 / B5: the head has nothing to state while
            // no default resolves (FR-002), so the one-click choice itself renders here — never
            // a button that only focused a hidden control. A person who inherits exactly one
            // stream never sees this: `stream` resolves before this render is reached.
            <CafeStreamChoices
              options={locationStreams}
              homeStream={homeStream}
              myStreamKeys={myStreamKeys}
              onChoose={selectStream}
              disabled={status.kind === 'submitting'}
            />
          ) : (
            <>
              {logToolbar}
              {mode === 'transfer' && !transferDestinationChosen && !readOnlyNoStream ? null : logTable}
              {!isWide && mode === 'transfer' && stream !== null && !streamNonProducing && transferDestinationChosen && stagedCount > 0 && (
                <section
                  className="kl-capture-summary"
                  aria-labelledby="kl-transfer-draft-title"
                  role="region"
                >
                  <h2 id="kl-transfer-draft-title">{t('kitchen.transfer.draft.title')}</h2>
                  {captureDraftContent}
                </section>
              )}
            </>
          )}

          {/* Sticky action footer — ONE branch; tally + Discard + Submit. #744 review: when
              capture is closed the tally and the stream hint describe a submit path the viewer
              cannot take — the reason line is the ONE message (rows stay visible, nothing else). */}
          {/* With no stream chosen the placeholder above is the whole message and nothing can be
              staged, so there is no bar to show. A stale stream from another location keeps the
              bar: its reason line names that stream, which the placeholder does not. */}
          {canCapture && !(noStreamChosen && !streamOutsideLocation) && (
          <div className="kl-footer cafe-capture-footer">
            {/* The result of Submit appears in the pinned bar, next to the button that caused it:
                the list is long, and a message at the top of the page is off screen on a phone. */}
            {submitError && (
              <p role="alert" className="kl-submit-outcome kl-submit-outcome--error">{submitError}</p>
            )}
            {showOfflineInFooter && (
              <p role="alert" aria-label={t('kitchen.log.offline.aria')} className="kl-submit-reason">
                {t('kitchen.log.offline.banner')}
              </p>
            )}
            {status.kind === 'success' && (
              <p role="status" aria-live="polite" className="kl-submit-outcome kl-submit-outcome--success">
                {t(status.count === 1 ? 'kitchen.log.success.one' : 'kitchen.log.success.other', { count: status.count })}
              </p>
            )}
            {!streamMissing && (
            <div className="kl-footer-count-row">
              <div className="kl-tally" aria-live="polite">
                <span className="kl-tally-num tabular">
                  {t(stagedCount === 1 ? 'kitchen.log.footer.item.one' : 'kitchen.log.footer.item.other', { count: stagedCount })}
                </span>
              </div>
              {draftCount > 0 && !(restoredDraft && savedDraftAt) && (
                <button
                  type="button"
                  className="kl-discard-link"
                  onClick={handleDiscardClick}
                  disabled={isSubmitting}
                >
                  {t('kitchen.log.discard')}
                </button>
              )}
            </div>
            )}
            {mode === 'transfer' && stream !== null && !transferDestinationChosen && (
              <p className="kl-submit-reason" role="status">
                {movementOptions.length > 0
                  ? t('kitchen.transfer.destination.prompt')
                  : t('kitchen.transfer.destination.none')}
              </p>
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
                    location: locationName ?? '',
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
            {invalidQuantityCount > 0 && (
              <p className="kl-submit-reason" role="status" aria-live="polite">
                <button type="button" className="kl-submit-reason kl-note-pointer" onClick={focusFirstInvalidQuantity}>
                  {t(invalidQuantityCount === 1 ? 'quantityField.fixing.one' : 'quantityField.fixing.other', { count: invalidQuantityCount })}
                </button>
              </p>
            )}
            {noteUnresolved && !streamMissing && !streamNonProducing && (
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
            <SubmitButton
              stagedCount={stagedCount}
              isSubmitting={isSubmitting}
              isOnline={isOnline}
              blocked={captureClosed || hasBlockingError || noteUnresolved || invalidQuantityCount > 0}
              t={t}
            />
          </div>
          )}

          {/* Destructive confirm — DESIGN.md Overlays: "one centered blocking dialog",
              replacing window.confirm. Only the staged quantities are at stake; search
              and category filters are untouched by Discard.
              ConfirmDialog is safe both mounted styles (confirm-dialog.tsx owns the contract);
              conditional mount kept for unmount-cleanup. */}
          {pendingDateDraftDiscard && (
            <ConfirmDialog
              open
              title={t('kitchen.log.draft.discardTitle')}
              body={t('kitchen.log.draft.discardBody', {
                date: formatDayMonthYear(pendingDateDraftDiscard.logDate),
              })}
              confirmLabel={t('kitchen.log.discard')}
              cancelLabel={t('common.cancel')}
              tone="destructive"
              onConfirm={async () => discardDateDraft()}
              onCancel={() => setPendingDateDraftDiscard(null)}
            />
          )}
          {discardConfirmOpen && (
            <ConfirmDialog
              open
              title={t('kitchen.log.discard.confirmTitle')}
              body={t('kitchen.log.discard.confirmBody', {
                count: draftCount,
                qty: t(draftCount === 1 ? 'kitchen.log.discard.qty.one' : 'kitchen.log.discard.qty.other'),
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
                count: draftCount,
                qty: t(draftCount === 1 ? 'kitchen.log.discard.qty.one' : 'kitchen.log.discard.qty.other'),
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
        {isWide && canCapture && stream && !streamNonProducing && wipItems.length > 0 && (
          <aside
            className="kl-capture-summary"
            aria-label={t(mode === 'transfer' ? 'kitchen.transfer.draft.title' : 'kitchen.log.summary.captureAria')}
          >
            <h2>{t(mode === 'transfer' ? 'kitchen.transfer.draft.title' : 'kitchen.log.summary.captureTitle')}</h2>
            {captureDraftContent}
          </aside>
        )}
      </div>
    </CafePageFrame>
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
  form,
  t,
}: {
  stagedCount: number
  isSubmitting: boolean
  isOnline: boolean
  /** true when a staged line exceeds transfer availability (FR-023 hard stop) */
  blocked?: boolean
  form?: string
  t: Translate
}) {
  const disabled = isSubmitting || !isOnline || stagedCount === 0 || blocked
  return (
    <button
      type="submit"
      form={form}
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
