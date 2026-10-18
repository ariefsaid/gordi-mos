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

import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { RecordDisclosure } from '@/components/record/record-page-layout'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { LocationPanelFields, type LocationFieldValues, type LocationChoices } from '@/components/preview/location-preview-fields'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsWide } from '@/shell/use-is-wide'
import { useAuth } from '@/auth/use-auth'
import { useT, type Translate } from '@/i18n/use-t'
import {
  listCaptureFormItems,
  fetchActualsMap,
  fetchLatestItemLogDates,
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
import { availableCafeLocationDefault, useCafeLocationChoices } from '@/lib/use-cafe-location-choices'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { formatUnitMultiple, toDefaultUnitQuantity } from '@/lib/cafe-unit-multiples'
import { parseQuantityInput } from '@/lib/quantity-parser'
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
  defaultTransferMovement,
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
import { WipItemDetail, WipItemEntry } from '@/components/kitchen/wip-item-entry'
import { CaptureControl, CaptureRow, CaptureTable, type CaptureFigure } from '@/components/kitchen/capture-row'
import { Worksheet } from '@/components/cafe/redesign/worksheet'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { cafeItemLabel } from '@/lib/cafe-item-label'
import {
  KITCHEN_KIND_FILTER_OPTIONS,
  WIP_KIND_FILTER_OPTIONS,
  kitchenDataTableGroups,
  toKitchenListRows,
  useKitchenItemTable,
  type KitchenItemKindFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { CafeTransferContext } from '@/components/cafe/redesign/cafe-transfer-context'
import { Panel } from '@/components/cafe/redesign/worksheet'
import { ActionBar } from '@/components/ui/action-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDayMonthYear, formatWibDateTime, wibToday } from '@/lib/format/date'
import { LoadingShell } from '@/components/ui/state-kit'
import { QuantityFieldError } from '@/components/ui/quantity-field'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { useFocusRestore } from '@/components/ui/use-focus-restore'
import { reportError } from '@/lib/telemetry'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/select'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { ReportMissingItem } from '@/components/kitchen/report-missing-item'
import { Notice } from '@/components/ui/notice'
import '@/components/ui/Disclosure.css'
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

async function readLatestItemLogDates(stream: ProductionStream | null, itemIds: string[], enabled: boolean) {
  if (!stream || !enabled || itemIds.length === 0) return {}
  try {
    return await fetchLatestItemLogDates(itemIds, stream)
  } catch (error) {
    reportError(error, { source: 'kitchen-log.recent-item-order' })
    return {}
  }
}

export function KitchenLogPage({ mode = 'production', leading }: {
  mode?: KitchenLogMode
  leading?: ReactNode
} = {}) {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : 'anonymous'

  // Catalog, rows, and staged capture lines belong to one person. A route remains mounted
  // through an auth replacement, so a key makes that replacement atomic at render time.
  return <KitchenLogPageForViewer key={`${viewerId}:${mode}`} mode={mode} leading={leading} />
}

/** DD-MVP-17: leading slot — content (the Opening door row) the module root renders
 *  above the capture form when this surface IS the Café root. */
function KitchenLogPageForViewer({ mode, leading }: { mode: KitchenLogMode; leading?: ReactNode }) {
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
  // The location the stream ladder derived (session choice, home branch, only branch).
  const locationId = cafeStream.branchId ?? undefined
  const locationName = branches.find((branch) => branch.id === locationId)?.name
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
      setMovement(defaultTransferMovement(movementOptions, stream, {}) ?? movementOptions[0])
    }
  }, [mode, movementOptions, movement, stream])
  const transferDestinationChosen = mode !== 'transfer' || (
    movement.action === 'transfer' && movementOptions.some(option => movementKey(option) === movementKey(movement))
  )
  const destinationBranch = movement.action === 'transfer'
    ? branches.find(branch => branch.id === movement.destinationBranchId) ?? null
    : null
  const destinationStream = stream && destinationBranch ? { branch: destinationBranch, activity: stream.activity } : null
  const sourceLocationChoices = useCafeLocationChoices(canCapture ? stream : null)
  const destinationLocationChoices = useCafeLocationChoices(canCapture ? destinationStream : null)
  const locationScope = `${mode}:${stream?.branch.id ?? ''}:${stream?.activity ?? ''}:${movementKey(movement)}`
  const [selectedLocationState, setSelectedLocationState] = useState<{ scope: string; values: LocationFieldValues } | null>(null)
  const defaultLocationValues: LocationFieldValues = {
    production_location_id: sourceLocationChoices.status === 'ready'
      ? availableCafeLocationDefault(sourceLocationChoices.locations, sourceLocationChoices.defaults?.production_location_id, 'production') : null,
    from_storage_location_id: sourceLocationChoices.status === 'ready'
      ? availableCafeLocationDefault(sourceLocationChoices.locations, sourceLocationChoices.defaults?.storage_location_id, 'storage') : null,
    to_storage_location_id: mode === 'transfer'
      ? destinationLocationChoices.status === 'ready'
        ? availableCafeLocationDefault(destinationLocationChoices.locations, destinationLocationChoices.defaults?.storage_location_id, 'storage') : null
      : sourceLocationChoices.status === 'ready'
        ? availableCafeLocationDefault(sourceLocationChoices.locations, sourceLocationChoices.defaults?.storage_location_id, 'storage') : null,
  }
  const locationValues = selectedLocationState?.scope === locationScope ? selectedLocationState.values : defaultLocationValues
  const needsDestinationLocations = mode === 'transfer' && transferDestinationChosen
  const locationLoadState = sourceLocationChoices.status === 'error' || (needsDestinationLocations && destinationLocationChoices.status === 'error')
    ? 'error'
    : sourceLocationChoices.status === 'ready' && (!needsDestinationLocations || destinationLocationChoices.status === 'ready')
      ? 'ready' : 'loading'
  const locationChoices: LocationChoices = {
    production: sourceLocationChoices.locations.filter(location => location.use === 'production' || location.use === 'both'),
    from: sourceLocationChoices.locations.filter(location => location.use === 'storage' || location.use === 'both'),
    to: (mode === 'transfer' ? destinationLocationChoices.locations : sourceLocationChoices.locations)
      .filter(location => location.use === 'storage' || location.use === 'both'),
    storage: sourceLocationChoices.locations.filter(location => location.use === 'storage' || location.use === 'both'),
  }
  const retryLocationChoices = () => {
    sourceLocationChoices.retry()
    if (needsDestinationLocations) destinationLocationChoices.retry()
  }
  const writeClosed = !canCapture || streamMissing || streamNonProducing
  const captureClosed = writeClosed || !transferDestinationChosen
  const [logDate] = useState(wibToday) // today WIB; owner-decision: allow past dates flagged
  const [wipItems, setWipItems] = useState<CaptureFormItem[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [actualsMap, setActualsMap] = useState<ActualsMap>({})
  const [recentItemLogDates, setRecentItemLogDates] = useState<Record<string, string>>({})
  const [summaryCountsAvailable, setSummaryCountsAvailable] = useState(false)
  const [buId, setBuId] = useState('')
  const [lines, setLines] = useState<Record<string, KitchenLogLine>>({})
  const [status, setStatus] = useState<PageStatus>({ kind: 'loading' })
  const [submitError, setSubmitError] = useState('')
  const [unitNotShownItemIds, setUnitNotShownItemIds] = useState<Set<string>>(new Set())
  const [unitNotShownBatch, setUnitNotShownBatch] = useState(false)
  // The capture inputs disable while a batch saves; a failed save gives focus back to the field being typed in.
  const captureRef = useFocusRestore<HTMLDivElement>(status.kind === 'submitting', !!submitError)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [inspectEntriesOpen, setInspectEntriesOpen] = useState(false)
  const inspectionFocusRef = useRef<'heading' | 'trigger' | null>(null)
  const inspectionPanelRef = useRef<HTMLDivElement>(null)
  const companionHeadingRef = useRef<HTMLHeadingElement>(null)
  const [savedDraftAt, setSavedDraftAt] = useState<string | null>(null)
  const [restoredDraft, setRestoredDraft] = useState(false)
  const capturePageState = useCafeCaptureDraftPageState()
  const {
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

  useLayoutEffect(() => {
    if (isDesktop) return
    const destination = inspectionFocusRef.current
    if (!destination) return
    inspectionFocusRef.current = null
    if (destination === 'heading' && inspectEntriesOpen) {
      const heading = inspectionPanelRef.current?.querySelector<HTMLElement>('h3')
      heading?.scrollIntoView?.({ block: 'nearest' })
      heading?.focus()
    } else if (destination === 'trigger') {
      inspectionPanelRef.current?.querySelector<HTMLElement>('summary')?.focus()
    }
  }, [inspectEntriesOpen, isDesktop])
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
  const [quantityDraftResetKey, setQuantityDraftResetKey] = useState(0)
  // A missing note reads as plain guidance until the person points at it from the footer.
  const [noteAttempted, setNoteAttempted] = useState(false)

  // Client-side search + category (P-3), URL-synced so the view survives refresh/share (I7 / D-E1).
  // Group collapse stays INTERNAL to the shared <DataTable> (no page-level collapsedGroups state).
  // Category and kind selectors are hidden inside the capture form on phones, so copied
  // The kind and category filters work at every width (phone folds them into the Filters row).
  // RAW is only valid for Transfer.
  const requestedKindFilter = capturePageState.kindFilter as KitchenItemKindFilter
  const supportedKindFilter = requestedKindFilter === 'All' || requestedKindFilter === 'WIP'
    || (mode === 'transfer' && requestedKindFilter === 'RAW')
    ? requestedKindFilter
    : 'All'
  const effectiveKindFilter: KitchenItemKindFilter = supportedKindFilter
  const effectiveCategory = capturePageState.category
  const filterRows = useMemo(
    () => toKitchenListRows([...wipItems].sort((a, b) => {
      const aPlanned = (lines[a.id]?.plan_qty ?? 0) > 0
      const bPlanned = (lines[b.id]?.plan_qty ?? 0) > 0
      const byName = a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      if (aPlanned !== bPlanned) return aPlanned ? -1 : 1
      if (aPlanned || mode !== 'production') return byName
      const aRecent = recentItemLogDates[a.id]
      const bRecent = recentItemLogDates[b.id]
      if (aRecent && bRecent && aRecent !== bRecent) return bRecent.localeCompare(aRecent)
      if (Boolean(aRecent) !== Boolean(bRecent)) return aRecent ? -1 : 1
      return byName
    }), {
      kind: 'WIP',
      getId: item => item.id,
      getKind: item => item.kind ?? 'WIP',
      getName: item => item.name,
      getCategory: item => item.category,
      getGroupKey: item => (lines[item.id]?.plan_qty ?? 0) > 0 ? 'planned' : 'offplan',
    }),
    [lines, mode, recentItemLogDates, wipItems],
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
  // One group needs no header of its own: the list is the group.
  const shownGroups = groups.length === 1 ? groups.map(group => ({ ...group, label: null })) : groups
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
    : summaryMetrics.map(metric => ({ ...metric, value: '–' }))
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
    { items, plan, stock, actuals, recentItemLogDates, restored, record, dateDrafts }: {
      items: CaptureFormItem[]
      plan: PlanMap
      stock: StockMap
      actuals: ActualsMap
      recentItemLogDates: Record<string, string>
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
    setRecentItemLogDates(recentItemLogDates)
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
    setRecentItemLogDates({})
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
        setMovement(storedDraft?.movement || mode !== 'transfer' ? resolvedMovement : defaultTransferMovement(availableMovements, resolvedStream, plan) ?? resolvedMovement)
        setPlanMap(plan)
        setStockMap({})
        setActualsMap(actuals)
        setRecentItemLogDates({})
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
      const [plan, stock, actuals, recentItemLogDates] = resolvedStream
        ? await Promise.all([
            fetchPlanMap(logDate, resolvedStream),
            fetchStockMap(logDate, resolvedStream),
            fetchActualsMap(logDate, resolvedStream),
            readLatestItemLogDates(resolvedStream, items.map(item => item.id), mode === 'production'),
          ])
        : [{} as PlanMap, {} as StockMap, {} as ActualsMap, {} as Record<string, string>]
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      setInvalidQuantityIds(new Set())
      setInvalidQuantityDrafts({})
      setVisibleQuantityErrors(new Set())
      setFocusInvalidId(null)
      // A transfer with no saved draft starts on where work is planned, else the viewer's own branch's other stream.
      const startMovement = storedDraft?.movement || mode !== 'transfer'
        ? resolvedMovement
        : defaultTransferMovement(availableMovements, resolvedStream, plan) ?? resolvedMovement
      const restored = resolvedStream
        ? restoreKitchenCaptureDraft(storedDraft, items, plan, stock, resolvedStream, availableMovements, startMovement)
        : { lines: buildLines(items, plan, stock, startMovement), movement: startMovement }
      adoptStream(catalog)
      setBuId(bu)
      commitRestoredStreamDraft(
        { items, plan, stock, actuals, recentItemLogDates, restored, record: storedDraftRecord, dateDrafts },
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

  const invalidQuantityCount = invalidQuantityIds.size
  const draftCount = Object.entries(lines).filter(([itemId, line]) =>
    line.qty_porsi > 0 || invalidQuantityIds.has(itemId),
  ).length
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
    const footer = document.querySelector<HTMLElement>('.cafe-capture-footer')
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
    setNoteAttempted(false)
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
    setSubmitError('')
    setUnitNotShownItemIds(new Set())
    setUnitNotShownBatch(false)
    chooseStream(nextStream) // the whole Café module follows this choice (#440)
    setMovement(PRODUCE)
    setSavedDraftAt(null)
    setRestoredDraft(false)
    setRestoredDraftInfo(null)
    setRestoreAnnouncement('')
    setOtherDateDrafts([])
    setStatus({ kind: 'loading' })
    setSummaryCountsAvailable(false)
    setRecentItemLogDates({})
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
        setRecentItemLogDates({})
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
      const [plan, stock, actuals, recentItemLogDates] = await Promise.all([
        fetchPlanMap(logDate, nextStream),
        fetchStockMap(logDate, nextStream),
        fetchActualsMap(logDate, nextStream),
        readLatestItemLogDates(nextStream, items.map(item => item.id), mode === 'production'),
      ])
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      const availableMovements = mode === 'transfer'
        ? movementsForStream(nextStream, streamOptions, cafeStream.destinations).filter(option => option.action === 'transfer')
        : [PRODUCE]
      const fallbackMovement = (mode === 'transfer' ? defaultTransferMovement(availableMovements, nextStream, plan) : undefined) ?? availableMovements[0] ?? PRODUCE
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
        { items, plan, stock, actuals, recentItemLogDates, restored, record: storedDraftRecord, dateDrafts },
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
    setQuantityDraftResetKey(key => key + 1)
    setNoteAttempted(false)
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
    setSubmitError('')
    setUnitNotShownItemIds(new Set())
    setUnitNotShownBatch(false)
    setDiscardConfirmOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline || invalidQuantityCount > 0 || unitNotShownBatch) return

    const staged = Object.values(lines).filter(l => l.qty_porsi > 0)
    if (staged.length === 0 || staged.some(line => unitNotShownItemIds.has(line.wip_item_id))) return
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
    setUnitNotShownBatch(false)
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
          ...(locationLoadState === 'ready' ? movement.action === 'produce' ? {
            production_location_id: locationValues.production_location_id ?? null,
            to_storage_location_id: locationValues.to_storage_location_id ?? null,
          } : {
            from_storage_location_id: locationValues.from_storage_location_id ?? null,
            to_storage_location_id: locationValues.to_storage_location_id ?? null,
          } : {}),
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
      setUnitNotShownBatch(false)
      setInvalidQuantityIds(new Set())
      setInvalidQuantityDrafts({})
      setVisibleQuantityErrors(new Set())
      setFocusInvalidId(null)
      setNoteAttempted(false)
      setLines(buildLines(wipItems, planMap, stockMap, movement))
    } catch (err) {
      reportError(err, { source: 'kitchen-log.submit' })
      if (isItemUnitNotShownError(err)) {
        if (staged.length === 1) setUnitNotShownItemIds(new Set([staged[0]!.wip_item_id]))
        else {
          setUnitNotShownBatch(true)
          setSubmitError(t('kitchen.log.error.unitNotShownBatch'))
        }
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

  // How many items each destination has planned today, so the choice says where work is waiting.
  const planCounts: Record<string, number> = {}
  if (mode === 'transfer') {
    for (const option of movementOptions) {
      planCounts[movementKey(option)] = wipItems.filter(item => (planMap[item.id]?.[movementKey(option)] ?? 0) > 0).length
    }
  }
  const destinationLabel = (option: KitchenMovement) => {
    const base = deriveActionLabel(t, option, branches)
    const planned = planCounts[movementKey(option)] ?? 0
    return planned > 0 ? t('cafe.transfer.destinationPlanned', { label: base, count: planned }) : base
  }
  const transferDestinationControl = mode === 'transfer' && canCapture && movementOptions.length > 0
    ? movementOptions.length > 3
      ? <div className="cafe-transfer-select"><Select className="cafe-transfer-select__control" fullWidth id="cafe-transfer-destination" aria-label={t('cafe.transfer.destination')} value={movementKey(movement)} disabled={writeClosed || status.kind !== 'ready'} onChange={event => {
        const next = movementOptions.find(option => movementKey(option) === event.target.value)
        if (next) handleMovementChange(next)
      }}>{movementOptions.map(option => <option key={movementKey(option)} value={movementKey(option)}>{destinationLabel(option)}</option>)}</Select></div>
      : <div className="kl-scope"><MovementSeg value={movement} options={movementOptions} branches={branches} origin={stream} onChange={handleMovementChange} disabled={writeClosed || status.kind !== 'ready'} planCounts={planCounts} /></div>
    : null

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
          <Notice
            tone="urgent"
            action={<button
              type="button"
              className="btn btn-outline"
              aria-label={t('kitchen.log.retryAria')}
              onClick={() => setRetryKey(k => k + 1)}
            >
              {t('common.retry')}
            </button>}
          >{!isOnline ? t('kitchen.log.offline.error') : status.message}</Notice>
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
          {!canCapture && <Notice tone="info">{t('cafe.capture.readOnly')}</Notice>}
          {streamNonProducing && receivingOnlyNotice}
          {canCapture && mode === 'transfer' && stream && transferDestinationControl && <CafeTransferContext from={streamLabel(t, stream)} fromLabel={t('cafe.transfer.from')} destinationLabel={t('cafe.transfer.to')} ariaLabel={t('cafe.transfer.context')} selector={transferDestinationControl} />}
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
          {/* No items to enter: a disabled Submit would only be a dead end, so the page offers no action bar. */}
        </div>
      </CafePageFrame>
    )
  }

  const isSubmitting = status.kind === 'submitting'
  const stagedLines = Object.values(lines).filter(l => l.qty_porsi > 0)
  const stagedCount = stagedLines.length
  // The kind ('WIP - ') is said only when the list holds more than one kind; otherwise it is the same on every row.
  const mixedKinds = new Set(wipItems.map(item => item.kind ?? 'WIP')).size > 1
  const showEmptyTransferAvailability = mode === 'transfer' && transferDestinationChosen && stagedCount === 0
    && visibleItems.some(item => lines[item.id].stok > 0 && lines[item.id].tersedia === 0)
  const stagedSummary = wipItems.flatMap(item => {
    const line = lines[item.id]
    if (!line) return []
    const invalidRaw = invalidQuantityIds.has(item.id) ? invalidQuantityDrafts[item.id] : undefined
    if (line.qty_porsi <= 0 && invalidRaw === undefined) return []
    const unit = line.entry_unit_name ?? item.units.find(candidate => candidate.id === line.item_unit_id)?.name ?? item.units[0]?.name ?? t('kitchen.unit.porsi')
    return [{
      id: item.id,
      name: item.name,
      quantity: invalidRaw ?? (line.entry_quantity ?? line.qty_porsi),
      factor: line.entry_unit_factor ?? 1,
      unit,
    }]
  })
  const formatCaptureQty = (quantity: number) => new Intl.NumberFormat(
    document.documentElement.lang || 'en', { useGrouping: false, maximumFractionDigits: 2 },
  ).format(quantity)
  // Stock and plan figures are in the item's default unit (the Stock page says the same); an item with
  // no unit yet says so instead of showing a bare number.
  const renderUnitValue = (value: ReactNode, item: CaptureFormItem, show = true) => {
    const unitName = (item.units.find(unit => unit.is_default) ?? item.units[0])?.name
    return (
      <span className="kl-unit-value">
        <strong className="tabular">{value}</strong>
        {show && (unitName ? <span>{unitName}</span> : <small>{t('kitchen.log.unit.unrecorded')}</small>)}
      </span>
    )
  }
  // A stock figure the database has no row for is unknown, not zero.
  const renderStockValue = (item: CaptureFormItem, value: number) => stockMap[item.id]
    ? renderUnitValue(formatCaptureQty(value), item)
    : <span className="kl-unit-value" title={t('kitchen.log.stock.none')}><strong>—</strong></span>
  const defaultUnitOf = (item: CaptureFormItem) => (item.units.find(unit => unit.is_default) ?? item.units[0])?.name
  const renderPlanValue = (quantity: number, item: CaptureFormItem) => renderUnitValue(quantity > 0 ? formatCaptureQty(quantity) : '–', item, quantity > 0)
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
      : !canCapture ? t('cafe.capture.notRecorded') : '–'
  }
  const captureDraftContent = (
    <>
      {mode === 'transfer' && (
        <div className="kl-capture-summary__destination">
          <span>{t('kitchen.transfer.draft.destination')}</span>
          <strong>{transferDestinationName ?? t('kitchen.actionType.transferTo.fallback')}</strong>
        </div>
      )}
      <h3 tabIndex={-1}>{t(mode === 'transfer' ? 'kitchen.transfer.draft.items' : 'kitchen.log.summary.entered')}</h3>
      {stagedSummary.length === 0 ? (
        <p className="kl-capture-summary__empty">{t('kitchen.log.summary.draftEmpty')}</p>
      ) : (
        <ul className="kl-capture-summary__lines" aria-live="polite">
          {stagedSummary.map(line => (
            <li key={line.id}>
              <span>{line.name}</span>
              <strong className="tabular">
                {typeof line.quantity === 'number' ? formatCaptureQty(line.quantity) : line.quantity}{line.factor === 1 ? ' ' : ' × '}
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
  const hasBlockingError = unitNotShownBatch || stagedLines.some(
    l => unitNotShownItemIds.has(l.wip_item_id) || transferExceedsAvailable(l, movement),
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
    setNoteAttempted(true)
    const field = document.getElementById(`note-${first.wip_item_id}`)
    field?.scrollIntoView?.({ block: 'center' })
    ;(field as HTMLTextAreaElement | null)?.focus()
  }

  // ── The capture sheet: every row is a CaptureRow (name + meta | figures | box + unit | action) ─────────────
  const renderCaptureEntry = (item: KitchenListRow<CaptureFormItem>, line: KitchenLogLine) => (
    <WipItemEntry
      itemName={item.name}
      line={line}
      movement={movement}
      destinationName={transferDestinationName ?? undefined}
      onQtyChange={qty => handleQtyChange(item.id, qty)}
      onQuantityValidityChange={valid => handleQuantityValidityChange(item.id, valid)}
      onQuantityErrorVisibilityChange={visible => handleQuantityErrorVisibilityChange(item.id, visible)}
      quantityErrorId={`quantity-${item.id}-quantity-error`}
      invalidDraft={invalidQuantityDrafts[item.id]}
      resetKey={quantityDraftResetKey}
      onInvalidQuantityDraft={raw => handleInvalidQuantityDraft(item.id, raw)}
      unitOptions={item.units}
      unitMultiples={item.unit_multiples}
      onUnitChange={unitChoice => handleUnitChange(item.id, unitChoice)}
      disabled={isSubmitting || captureClosed}
    />
  )
  const renderCaptureDetail = (item: KitchenListRow<CaptureFormItem>, line: KitchenLogLine) => (
    <WipItemDetail
      itemName={item.name}
      line={line}
      movement={movement}
      onNotesChange={note => handleNotesChange(item.id, note)}
      noteAttempted={noteAttempted}
      unitOptions={item.units}
      disabled={isSubmitting || captureClosed}
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
          <span className="kl-dish-name">{mixedKinds && <span>{item.kind} - </span>}<span>{item.name}</span></span>
          {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('kitchen.log.col.plan'),
      numeric: true,
      render: item => renderPlanValue(lines[item.id]?.plan_qty ?? 0, item),
    },
    {
      key: 'stock',
      header: t('kitchen.log.col.stock'),
      numeric: true,
      render: item => renderStockValue(item, lines[item.id]?.stok ?? 0),
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
        return <StatusBadge status="posted" label={t('kitchen.status.logged')} />
      },
    },
  ]

  function handleInspectEntriesAction() {
    if (mode === 'transfer') {
      setInspectEntriesOpen(value => !value)
      return
    }
    if (isDesktop) {
      companionHeadingRef.current?.scrollIntoView?.({ block: 'nearest' })
      companionHeadingRef.current?.focus()
      return
    }
    const next = !inspectEntriesOpen
    inspectionFocusRef.current = next ? 'heading' : 'trigger'
    setInspectEntriesOpen(next)
  }

  function handleInlineInspectClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element) || !event.target.closest('summary')) return
    event.preventDefault()
    const next = !inspectEntriesOpen
    inspectionFocusRef.current = next ? 'heading' : 'trigger'
    setInspectEntriesOpen(next)
  }

  const clearCaptureFilters = () => { capturePageState.setSearch(''); capturePageState.setKindFilter('All'); capturePageState.setCategory('All') }
  const logToolbar = (
    <KitchenToolbar
      search={capturePageState.search}
      onSearchChange={capturePageState.setSearch}
      kinds={mode === 'transfer' ? KITCHEN_KIND_FILTER_OPTIONS : WIP_KIND_FILTER_OPTIONS}
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
      filtersPanel={{ label: t('cafe.toolbar.filters'), summary: [effectiveKindFilter !== 'All' ? effectiveKindFilter : t('kitchen.filter.kind.all'), capturePageState.category !== 'All' ? kitchenCategoryLabel(t, capturePageState.category) : t('kitchen.filter.all')].join(' · ') }}
      resultCount={{ shown: visibleItems.length, total: wipItems.length }}
      sortLabel={t(mode === 'production' ? 'cafe.toolbar.sorted.production' : 'cafe.toolbar.sorted.plannedFirst')}
    >
    </KitchenToolbar>
  )

  const captureCaption = mode === 'transfer'
    ? t('kitchen.transfer.caption', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })
    : t('kitchen.log.caption')
  const receivingCaption = mode === 'transfer'
    ? t('kitchen.transfer.receivingCaption')
    : t('kitchen.stream.receivingOnly.logCaption')
  // A fact that is the same for every row is said once above the sheet, not repeated down a column.
  const noPlanForAll = visibleItems.every(item => !lines[item.id]?.plan_qty)
  const noRecordedForAll = visibleItems.every(item => (actualsMap[item.id]?.[movementKey(movement)] ?? []).length === 0)
  const availableMatchesStock = visibleItems.every(item => lines[item.id]?.tersedia === lines[item.id]?.stok)
  const productionWorksheet = mode === 'production' && canCapture && !streamNonProducing
  const transferWorksheet = mode === 'transfer' && canCapture && !streamNonProducing && transferDestinationChosen
  const logTableReadOnly = (
    <DataTable
      columns={receivingColumns}
      rows={visibleItems}
      groups={shownGroups}
      key={`${movementKey(movement)}:${plannedLines.length > 0 ? 'planned' : 'off-plan'}:${tableResetKey}`}
      defaultCollapsedGroupKeys={shownGroups.length > 1 && plannedLines.length > 0 && focusInvalidGroupKey !== 'offplan' ? new Set(['offplan']) : undefined}
      isDesktop={isDesktop}
      state={visibleItems.length > 0 ? 'ready' : 'empty'}
      emptyLabel={readOnlyNoStream ? t('kitchen.log.readOnlyNoStreamEmpty') : <CafeNoMatch bare onClear={clearCaptureFilters} />}
      caption={streamNonProducing ? receivingCaption : t('cafe.capture.readOnlyCaption')}
    />
  )
  // Reference figures, in the order every row passes them. A figure that is the same on every row is said once
  // above the sheet instead (noPlanForAll, availableMatchesStock), so its column is left out.
  const unitOfItem = (item: CaptureFormItem) => defaultUnitOf(item) ?? t('kitchen.log.unit.unrecorded')
  const planFigure = (item: CaptureFormItem): CaptureFigure => {
    const quantity = lines[item.id]?.plan_qty ?? 0
    return { label: t('kitchen.log.col.plan'), value: quantity > 0 ? formatCaptureQty(quantity) : '–', unit: quantity > 0 ? unitOfItem(item) : null }
  }
  const stockFigure = (item: CaptureFormItem, label: string, quantity: number): CaptureFigure => stockMap[item.id]
    ? { label, value: formatCaptureQty(quantity), unit: unitOfItem(item) }
    : { label, value: '—', unit: null }
  const figureSpecs: { label: string; of: (item: CaptureFormItem) => CaptureFigure }[] = [
    ...(noPlanForAll ? [] : [{ label: t('kitchen.log.col.plan'), of: planFigure }]),
    ...(transferWorksheet ? [{ label: t('kitchen.stock.col.tersedia'), of: (item: CaptureFormItem) => stockFigure(item, t('kitchen.stock.col.tersedia'), lines[item.id]?.tersedia ?? 0) }] : []),
    ...(transferWorksheet && availableMatchesStock ? [] : [{ label: t('kitchen.log.col.stock'), of: (item: CaptureFormItem) => stockFigure(item, t('kitchen.log.col.stock'), lines[item.id]?.stok ?? 0) }]),
  ]
  const recordedLabel = transferWorksheet
    ? t('kitchen.transfer.col.quantity', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })
    : t('cafe.production.recorded')
  const renderCaptureRow = (item: KitchenListRow<CaptureFormItem>) => {
    const line = lines[item.id]
    const actuals = actualsMap[item.id]?.[movementKey(movement)] ?? []
    const staged = line.qty_porsi > 0
    const logged = actuals.some(entry => entry.qty_porsi > 0)
    return (
      <CaptureRow
        id={item.id}
        name={item.name}
        kind={mixedKinds ? item.kind : null}
        meta={<>
          {invalidItemIds.has(item.id) && <NotOnStreamTag />}
          {unitNotShownItemIds.has(item.id) && <p role="alert" className="cafe-count__field-error">{t('kitchen.log.error.unitNotShown')}</p>}
          {!line.item_unit_id && <small>{t('kitchen.log.unit.missingCapture')}</small>}
          {actuals.length > 0 && <span>{recordedLabel} <strong>{renderActualUnits(actuals, item)}</strong></span>}
          {(staged || logged) && <StatusBadge status={staged ? 'pending' : 'posted'} label={t(staged ? 'kitchen.status.staged' : 'kitchen.status.logged')} />}
        </>}
        figures={figureSpecs.map(spec => spec.of(item))}
        controls={[{ node: <CaptureControl>{renderCaptureEntry(item, line)}</CaptureControl> }]}
        detail={<>{renderQuantityError(item)}{renderCaptureDetail(item, line)}</>}
      />
    )
  }
  const logTable = transferWorksheet || productionWorksheet ? (
    <Worksheet label={captureCaption} className={transferWorksheet ? 'cafe-transfer-sheet' : 'cafe-production-sheet'}>
      <CaptureTable
        key={`${movementKey(movement)}:${plannedLines.length > 0 ? 'planned' : 'off-plan'}:${tableResetKey}`}
        className={transferWorksheet ? 'cafe-transfer-sheet__table' : 'cafe-production-sheet__table'}
        caption={captureCaption}
        columns={{
          item: t('kitchen.log.col.item'),
          itemSort: transferWorksheet ? 'asc' : undefined,
          figures: figureSpecs.map(spec => spec.label),
          controls: [{ label: t(transferWorksheet ? 'cafe.transfer.now' : 'cafe.production.addNow') }],
        }}
        rows={visibleItems}
        groups={shownGroups}
        defaultCollapsedGroupKeys={shownGroups.length > 1 && plannedLines.length > 0 && focusInvalidGroupKey !== 'offplan' ? new Set(['offplan']) : undefined}
        state={visibleItems.length > 0 ? 'ready' : 'empty'}
        emptyLabel={readOnlyNoStream ? t('kitchen.log.readOnlyNoStreamEmpty') : <CafeNoMatch bare onClear={clearCaptureFilters} />}
        renderRow={renderCaptureRow}
      />
    </Worksheet>
  ) : (
    logTableReadOnly
  )

  return (
    <CafePageFrame
      page={page}
      date={logDate}
      streamBar={streamBar}
      recordsHref={recordsHref({
        question: mode === 'production' ? 'made' : 'transferred', reading: 'entries', from: logDate, to: logDate,
        stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null,
        destination: mode === 'transfer' && movement.action === 'transfer' ? movement.destinationBranchId : null, today: wibToday(),
      })}
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
          <Notice tone="info">{t('cafe.capture.readOnly')}</Notice>
        )}
        {restoreAnnouncement && (
          <p className="cafe-vh" role="status" aria-live="polite">{restoreAnnouncement}</p>
        )}
        {status.kind === 'ready' && otherDateDrafts.length > 0 && (
          <RecordDisclosure
            title={`${t('workbench.production.otherDrafts')} · ${otherDateDrafts.length}`}
            className="kl-capture-draft-list cafe-production-other-drafts"
          >
            <section aria-labelledby="kl-other-date-drafts">
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
                  <RecordDisclosure
                    className="kl-capture-draft-details"
                    title={t(savedLines.length === 1 ? 'cafe.captureDraft.otherDate.one' : 'cafe.captureDraft.otherDate.other', { date, count: savedLines.length })}
                  >
                    <div className="kl-capture-draft-details__body">
                      <ul>
                        {savedLines.map(line => {
                          const item = wipItems.find(candidate => candidate.id === line.wip_item_id)
                          const itemName = item
                            ? (mixedKinds ? `${item.kind ?? 'WIP'} - ${item.name}` : item.name)
                            : t('kitchen.log.draft.itemUnavailable')
                          return <li key={line.wip_item_id}>
                            <span>{itemName}</span>
                            <span>{formatCaptureQty(line.entry_quantity ?? line.qty_porsi)} {line.entry_unit_name ?? t('kitchen.unit.porsi')}</span>
                          </li>
                        })}
                      </ul>
                      <small>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(record.updatedAt) })}</small>
                    </div>
                  </RecordDisclosure>
                  <button type="button" className="btn btn-outline" onClick={() => requestDiscardDateDraft(record.scope)}>
                    {t('kitchen.log.discard')}
                  </button>
                </article>
              )
            })}
            <small className="kl-capture-draft-expiry">{t('cafe.captureDraft.expiry')}</small>
            </section>
          </RecordDisclosure>
        )}
        {/* The Location/opening door and the Plan/Made/Off-plan figures dock into one compact
            context header so the summary reads as that header's own figures, never an orphan
            line floating with no container of its own. Falls back to the plain band (unchanged)
            when there is no leading door to dock onto — most callers of this page render no
            `leading` at all. */}
        {mode === 'transfer' && canCapture && stream && transferDestinationControl && <CafeTransferContext from={streamLabel(t, stream)} fromLabel={t('cafe.transfer.from')} destinationLabel={t('cafe.transfer.to')} ariaLabel={t('cafe.transfer.context')} selector={transferDestinationControl} />}
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
          <Notice tone="urgent">{submitError}</Notice>
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
          ) : productionWorksheet && stream !== null ? (
            <>
              <p className="cafe-production-additive-help">{t('cafe.production.additiveHelp')}</p>
              {logToolbar}
              <div className="cafe-production-workbench">
                <section className="cafe-production-workbench__ledger">
                  {!isDesktop && draftCount > 0 && (
                    <p className="cafe-production-inline-status" role="status">
                      <span>{t('workbench.production.localOnly')}</span>
                      {stagedCount > 0 && savedDraftAt && <time dateTime={savedDraftAt}>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(savedDraftAt) })}</time>}
                    </p>
                  )}
                  {!isDesktop && <div className="cafe-production-inspect-mobile" ref={inspectionPanelRef} onClick={handleInlineInspectClick}>
                    <Panel title={t('cafe.production.inspectEntries')} open={inspectEntriesOpen} className="cafe-production-inspect">{captureDraftContent}</Panel>
                  </div>}
                  {logTable}
                  {visibleItems.length > 0 && (
                    <div className="kl-about">
                      <RecordDisclosure title={t('cafe.capture.aboutFigures')}>
                        <p className="kl-unit-context-note">
                          {t('cafe.capture.balanceBasis')}
                          {noPlanForAll && ` ${t('cafe.capture.uniform.noPlan')}`}
                          {noRecordedForAll && ` ${t('cafe.capture.uniform.noRecorded', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })}`}
                        </p>
                      </RecordDisclosure>
                    </div>
                  )}
                  {stream && buId && !captureClosed && <div className="cafe-production-sheet__missing"><ReportMissingItem stream={stream} streamLabel={streamLabel(t, stream)} /></div>}
                </section>
                <aside className="cafe-production-workbench__companion" aria-label={t(isDesktop ? 'cafe.production.stagedEntries' : 'cafe.production.recordedToday')}>
                  {isDesktop && <section className="cafe-production-companion__draft">
                    <h2 ref={companionHeadingRef} tabIndex={-1}>{t('cafe.production.stagedEntries')}</h2>
                    {draftCount > 0 && <p className="cafe-production-local-only" role="status">{t('workbench.production.localOnly')}</p>}
                    {draftCount > 0 && stagedCount > 0 && savedDraftAt && <time className="cafe-production-saved-at" dateTime={savedDraftAt}>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(savedDraftAt) })}</time>}
                    {captureDraftContent}
                  </section>}
                  <Panel title={t('cafe.production.recordedToday')} className="cafe-production-recorded">
                    <ul>{wipItems.filter(item => (actualsMap[item.id]?.[movementKey(movement)] ?? []).length > 0).map(item => <li key={item.id}><strong>{mixedKinds ? cafeItemLabel(item) : item.name}</strong><span>{renderActualUnits(actualsMap[item.id]?.[movementKey(movement)] ?? [], item)}</span></li>)}</ul>
                    {wipItems.every(item => !(actualsMap[item.id]?.[movementKey(movement)] ?? []).length) && <p>{t('cafe.production.noRecordedToday')}</p>}
                  </Panel>
                </aside>
              </div>
              {canCapture && <LocationPanelFields
                kind="production"
                locations={locationChoices}
                values={locationValues}
                onChange={(field, value) => setSelectedLocationState({
                  scope: locationScope, values: { ...locationValues, [field]: value },
                })}
                loadState={locationLoadState}
                onRetry={retryLocationChoices}
                disabled={status.kind === 'submitting'}
              />}
            </>
          ) : (
            <>
              {logToolbar}
              {showEmptyTransferAvailability && (
                <p className="kls-availability-note" role="status">{t('kitchen.transfer.availabilityCut')}</p>
              )}
              {mode === 'transfer' && !transferDestinationChosen && !readOnlyNoStream ? null : logTable}
              {transferWorksheet && visibleItems.length > 0 && (
                <div className="kl-about">
                  <RecordDisclosure title={t('cafe.capture.aboutFigures')}>
                    <p className="kl-unit-context-note">
                      {t('cafe.capture.balanceBasis')}
                      {noPlanForAll && ` ${t('cafe.capture.uniform.noPlan')}`}
                      {noRecordedForAll && ` ${t('cafe.capture.uniform.noTransferred', { branch: transferDestinationName ?? t('kitchen.actionType.transferTo.fallback') })}`}
                      {availableMatchesStock && ` ${t('cafe.capture.uniform.availableMatchesStock')}`}
                    </p>
                  </RecordDisclosure>
                </div>
              )}
              {mode === 'transfer' && stream && buId && !captureClosed && <div className="cafe-production-sheet__missing"><ReportMissingItem stream={stream} streamLabel={streamLabel(t, stream)} /></div>}
              {mode === 'transfer' && <Panel title={t('kitchen.transfer.draft.title')} open={inspectEntriesOpen} className="cafe-transfer-inspect">{captureDraftContent}</Panel>}
              {/* Where it is made / stored is decided here, above Submit and the entries panel, not in the page header (preview only; nothing when the preview is off). */}
              {canCapture && mode === 'transfer' && transferDestinationChosen && <LocationPanelFields
                kind="transfer"
                locations={locationChoices}
                values={locationValues}
                onChange={(field, value) => setSelectedLocationState({
                  scope: locationScope, values: { ...locationValues, [field]: value },
                })}
                loadState={locationLoadState}
                onRetry={retryLocationChoices}
                disabled={status.kind === 'submitting'}
              />}
            </>
          )}

          {/* Sticky action footer — ONE branch; tally + Discard + Submit. #744 review: when
              capture is closed the tally and the stream hint describe a submit path the viewer
              cannot take — the reason line is the ONE message (rows stay visible, nothing else). */}
          {/* With no stream chosen the placeholder above is the whole message and nothing can be
              staged, so there is no bar to show. A stale stream from another location keeps the
              bar: its reason line names that stream, which the placeholder does not. */}
          {canCapture && !(noStreamChosen && !streamOutsideLocation) && (
          <ActionBar
            className="cafe-capture-footer"
            alert={<>
              {/* The result of Submit appears in the pinned bar, next to the button that caused it. */}
              {submitError && <Notice tone="urgent">{submitError}</Notice>}
              {showOfflineInFooter && (
                <Notice tone="attention" role="alert" aria-label={t('kitchen.log.offline.aria')}>{t('kitchen.log.offline.banner')}</Notice>
              )}
              {status.kind === 'success' && (
                <Notice tone="success">
                  {t(status.count === 1 ? 'kitchen.log.success.one' : 'kitchen.log.success.other', { count: status.count })}
                </Notice>
              )}
            </>}
            summary={!streamMissing ? <>
              <span aria-live="polite">{t(stagedCount === 1 ? 'kitchen.log.footer.item.one' : 'kitchen.log.footer.item.other', { count: stagedCount })}</span>
              {draftCount > 0 && (
                <button type="button" className="kl-discard-link" onClick={handleDiscardClick} disabled={isSubmitting}>{t('workbench.production.discard')}</button>
              )}
            </> : undefined}
            reason={<>
              {mode === 'transfer' && stream !== null && !transferDestinationChosen && (
                <span className="kl-submit-reason" role="status">
                  {movementOptions.length > 0 ? t('kitchen.transfer.destination.prompt') : t('kitchen.transfer.destination.none')}
                </span>
              )}
              {canCapture && streamMissing && (
                <span className="kl-submit-reason" role="status" aria-live="polite">
                  {streamOutsideLocation
                    ? t('kitchen.log.stream.otherLocation', { stream: streamLabel(t, resolvedStream), location: locationName ?? '' })
                    : t('kitchen.log.stream.missing')}
                </span>
              )}
              {canCapture && streamNonProducing && (
                <span className="kl-submit-reason" role="status" aria-live="polite">{t('kitchen.log.stream.nonProducing')}</span>
              )}
              {stagedCount === 0 && !streamMissing && !streamNonProducing && !captureClosed && isOnline && transferDestinationChosen && (
                <span className="kl-submit-reason" role="status">{t('cafe.capture.needsQuantity')}</span>
              )}
              {/* A count and a destination: it scrolls to and focuses the first line still missing its note. */}
              {invalidQuantityCount > 0 && (
                <button type="button" className="kl-submit-reason kl-note-pointer" onClick={focusFirstInvalidQuantity}>
                  {t(invalidQuantityCount === 1 ? 'quantityField.fixing.one' : 'quantityField.fixing.other', { count: invalidQuantityCount })}
                </button>
              )}
              {noteUnresolved && !streamMissing && !streamNonProducing && (
                <button type="button" className="kl-submit-reason kl-note-pointer" onClick={focusFirstMissingNote}>
                  {t(missingNoteLines.length === 1 ? 'kitchen.log.footer.noteMissing.one' : 'kitchen.log.footer.noteMissing.other', { count: missingNoteLines.length })}
                </button>
              )}
            </>}
            secondary={(productionWorksheet || mode === 'transfer') ? <button type="button" className="btn btn-outline" aria-expanded={mode === 'transfer' || !isDesktop ? inspectEntriesOpen : undefined} onClick={handleInspectEntriesAction}>{t(mode === 'transfer' ? 'cafe.transfer.inspectEntries' : 'cafe.production.inspectEntries')}</button> : undefined}
            primary={<SubmitButton
              form="kitchen-log-form"
              mode={mode}
              destination={transferDestinationChosen ? transferDestinationName : null}
              stagedCount={stagedCount}
              isSubmitting={isSubmitting}
              isOnline={isOnline}
              blocked={captureClosed || hasBlockingError || noteUnresolved || invalidQuantityCount > 0}
              t={t}
            />}
          />
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
      </div>
    </CafePageFrame>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OfflineBanner({ show }: { show: boolean }) {
  const t = useT()
  if (!show) return null
  return (
    <Notice tone="attention" role="alert" aria-label={t('kitchen.log.offline.aria')}>
      {t('kitchen.log.offline.banner')}
    </Notice>
  )
}

function SubmitButton({
  stagedCount,
  isSubmitting,
  isOnline,
  blocked = false,
  form,
  mode,
  destination,
  t,
}: {
  mode: 'production' | 'transfer' | string
  /** Transfer only: the branch the transfer goes to, said on the button. */
  destination?: string | null
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
          ? (mode === 'transfer' && destination
            ? t(stagedCount === 1 ? 'kitchen.log.submit.entryTo.one' : 'kitchen.log.submit.entryTo.other', { count: stagedCount, branch: destination })
            : t(stagedCount === 1 ? 'kitchen.log.submit.entry.one' : 'kitchen.log.submit.entry.other', { count: stagedCount }))
          : mode === 'transfer' && destination
            ? t('kitchen.log.submit.transferTo', { branch: destination })
            : t(mode === 'transfer' ? 'kitchen.log.submit.transfer' : mode === 'production' ? 'kitchen.log.submit.production' : 'kitchen.log.submit.default')}
    </button>
  )
}
