import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canPushCafe } from '@/lib/kitchen-gates'
import { formatUnitMultiple, toDefaultUnitQuantity } from '@/lib/cafe-unit-multiples'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import {
  clearCafeCaptureDraft,
  isCafeCaptureRequestId,
  listOtherDateCafeCaptureDrafts,
  readCafeCaptureDraft,
  writeCafeCaptureDraft,
  type CafeCaptureDraftScope,
  type StoredCafeCaptureDraft,
} from '@/lib/cafe-capture-storage'
import { listCafeItemSettings, toCafeLogItem } from '@/lib/db/cafe-item-settings'
import { insertKitchenLog, isItemUnitNotShownError, resolveKitchenBuId } from '@/lib/db/kitchen-logs'
import {
  listCurrentPersonKitchenWasteDrafts,
  submitKitchenWasteLog,
  restartKitchenWasteDraft,
  isWastePhotoWindowExpired,
  WASTE_PHOTO_UPLOAD_WINDOW_MINUTES,
} from '@/lib/db/kitchen-waste-photos'
import type { KitchenWasteDraft, KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { formatDayMonthYear, formatWibDateTime, wibToday } from '@/lib/format/date'
import { useCafeCaptureDraftPageState } from '@/lib/use-cafe-capture-draft-page-state'
import {
  useKitchenItemTable,
  type KitchenItemKindFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { ReportMissingItem } from '@/components/kitchen/report-missing-item'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { LocationLineField } from '@/components/preview/location-preview-fields'
import { availableCafeLocationDefault, useCafeLocationChoices } from '@/lib/use-cafe-location-choices'
import { WastePhotoCapture } from '@/components/kitchen/waste-photo-capture'
import { CafeTransactionWorkspace } from '@/components/cafe/redesign/cafe-transaction-workspace'
import { Worksheet } from '@/components/cafe/redesign/worksheet'
import { ActionBar } from '@/components/ui/action-bar'
import { CafeWasteDraftsPanel } from '@/components/cafe/redesign/cafe-waste-drafts-panel'
import { CafeWasteWorkbench } from '@/components/cafe/redesign/cafe-waste-workbench'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/select'
import { CaptureControl, CaptureRow, CaptureTable } from '@/components/kitchen/capture-row'
import { QuantityField, QuantityFieldError } from '@/components/ui/quantity-field'
import { parseQuantityInput } from '@/lib/quantity-parser'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { Notice } from '@/components/ui/notice'
import './cafe-waste-page.css'
import './cafe-item-settings-page.css'

type CafeLogItem = NonNullable<ReturnType<typeof toCafeLogItem>>

type WasteEntry = {
  client_request_id: string
  client_attempted: boolean
  quantity: string
  unitId: string
  unitFactor: number
  unitBasisKnown: boolean
  logId?: string
  capturedUnitName?: string
  capturedLogDate?: string
  photoReady: boolean
  photoWindowExpired: boolean
  preparing: boolean
  unitNotShown: boolean
  submitted: boolean
  storage_location_id?: string | null
  photos: KitchenWastePhoto[]
  error?: string
}
type WasteRow = KitchenListRow<CafeLogItem>
type PageLoadState = 'loading' | 'ready' | 'error'

const WASTE_KIND_OPTIONS: readonly KitchenItemKindFilter[] = ['All', 'WIP', 'RAW']

type StoredWasteEntry = Pick<WasteEntry,
  'client_request_id' | 'client_attempted' | 'quantity' | 'unitId' | 'unitFactor' | 'unitBasisKnown'
  | 'logId' | 'capturedUnitName' | 'capturedLogDate' | 'storage_location_id'>

type StoredWasteCaptureDraft = {
  branch_id: string
  activity: string
  entries: Record<string, StoredWasteEntry>
}

function wasteDraftScope(orgId: string, personId: string, stream: ProductionStream, logDate: string): CafeCaptureDraftScope {
  return {
    orgId,
    personId,
    form: 'waste',
    branchId: stream.branch.id,
    activity: stream.activity,
    logDate,
  }
}

function quantityValue(raw: string): number | null {
  const parsed = parseQuantityInput(raw, {
    min: 0,
    maxIntegerDigits: 10,
    maxFractionDigits: 2,
  })
  return parsed.kind === 'valid' && parsed.value > 0 ? parsed.value : null
}

function createWasteEntry(item: CafeLogItem, clientRequestId = ''): WasteEntry {
  return {
    client_request_id: clientRequestId,
    client_attempted: false,
    quantity: '',
    unitId: item.defaultUnit.id,
    unitFactor: 1,
    unitBasisKnown: true,
    capturedUnitName: item.defaultUnit.name,
    photoReady: false,
    photoWindowExpired: false,
    preparing: false,
    unitNotShown: false,
    submitted: false,
    photos: [],
  }
}

function initialEntries(items: readonly CafeLogItem[]): Record<string, WasteEntry> {
  return Object.fromEntries(items.map(item => [item.id, createWasteEntry(item, crypto.randomUUID())]))
}

function displayUnit(unit: CafeLogItem['units'][number], t: ReturnType<typeof useT>): string {
  return unit.labelOrdinal === null
    ? unit.name
    : t('cafe.items.unitDisambiguated', { name: unit.name, number: unit.labelOrdinal })
}

// The default unit's option names the marker once, even when the unit's own name already says it.
function defaultUnitOptionLabel(unit: CafeLogItem['units'][number], t: ReturnType<typeof useT>): string {
  const label = displayUnit(unit, t)
  const tag = t('cafe.items.defaultTag')
  return label.toLowerCase().includes(tag.toLowerCase()) ? label : `${label} · ${tag}`
}

function wasteEntryUnitLabel(item: CafeLogItem, entry: WasteEntry, t: ReturnType<typeof useT>): string {
  if (entry.unitFactor !== 1) {
    return formatUnitMultiple(entry.unitFactor, item.defaultUnit.name, document.documentElement.lang || undefined)
  }
  const unit = item.units.find(candidate => candidate.id === entry.unitId)
  if (unit) return displayUnit(unit, t)
  if (entry.capturedUnitName) return entry.capturedUnitName
  const defaultUnit = item.units.find(candidate => candidate.isDefault)
    ?? { ...item.defaultUnit, isDefault: true, labelOrdinal: null, labelCount: 1 }
  return displayUnit(defaultUnit, t)
}

export function CafeWastePage() {
  const t = useT()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  const logDate = useMemo(() => wibToday(), [])
  const cafeStream = useCafeStream()
  const {
    options: streamOptions,
    stream: resolvedStream,
    homeStream,
    myStreamKeys,
  } = cafeStream
  const locationId = cafeStream.branchId ?? undefined
  const elevated = auth.status === 'authenticated' && canPushCafe(auth.viewer.accessRoles)
  const eligible = useCallback(
    (option: ProductionStream) => elevated || myStreamKeys.has(streamKey(option.branch.id, option.activity)),
    [elevated, myStreamKeys],
  )
  const locationStreams = useMemo(
    () => (locationId
      ? streamOptions.filter(option => option.branch.id === locationId)
      : streamOptions.filter(eligible)),
    [eligible, locationId, streamOptions],
  )
  const otherLocationStreams = useMemo(
    () => (locationId
      ? streamOptions.filter(option => option.branch.id !== locationId && eligible(option))
      : []),
    [eligible, locationId, streamOptions],
  )
  const streamOutsideLocation = Boolean(locationId) && resolvedStream !== null
    && resolvedStream.branch.id !== locationId
  const stream = streamOutsideLocation ? null : resolvedStream
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({
    affiliated: auth.viewer.affiliated,
    accessRoles: auth.viewer.accessRoles,
  })
  const locationChoices = useCafeLocationChoices(canCapture ? stream : null)
  const storageLocations = locationChoices.locations.filter(location => location.use === 'storage' || location.use === 'both')
  const defaultStorageLocationId = locationChoices.status === 'ready'
    ? availableCafeLocationDefault(locationChoices.locations, locationChoices.defaults?.storage_location_id, 'storage')
    : null
  const personId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : ''
  const { resolve, adopt, setStream } = cafeStream

  const [loadState, setLoadState] = useState<PageLoadState>('loading')
  const [loadRetry, setLoadRetry] = useState(0)
  const [catalogReady, setCatalogReady] = useState(false)
  const [items, setItems] = useState<CafeLogItem[]>([])
  const [esbItemCount, setEsbItemCount] = useState(0)
  const [businessUnitId, setBusinessUnitId] = useState('')
  const [entries, setEntries] = useState<Record<string, WasteEntry>>({})
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null)
  const [invalidQuantityIds, setInvalidQuantityIds] = useState<Set<string>>(new Set())
  const [visibleQuantityErrors, setVisibleQuantityErrors] = useState<Set<string>>(new Set())
  const [focusInvalidId, setFocusInvalidId] = useState<string | null>(null)
  const [resumableDrafts, setResumableDrafts] = useState<KitchenWasteDraft[]>([])
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
  const [otherDateDrafts, setOtherDateDrafts] = useState<StoredCafeCaptureDraft<StoredWasteCaptureDraft>[]>([])
  const [pendingDraftDiscard, setPendingDraftDiscard] = useState<{ scope: CafeCaptureDraftScope; current: boolean } | null>(null)
  const captureRootRef = useRef<HTMLDivElement>(null)
  const draftListHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusDraftAfterDiscardRef = useRef(false)

  useEffect(() => {
    if (!focusDraftAfterDiscardRef.current) return
    focusDraftAfterDiscardRef.current = false
    const target = draftListHeadingRef.current
      ?? captureRootRef.current?.querySelector<HTMLInputElement>('.cwl-quantity-input')
    target?.focus()
  }, [otherDateDrafts, pendingDraftDiscard, restoredDraft])
  const [submitError, setSubmitError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const readGeneration = useRef(0)
  const draftRequests = useRef(new Set<string>())

  // Kind/category controls remain visible on phone, including for receiving-only streams, so
  // their URL-backed values must filter the compact list just as they do on desktop.
  const effectiveKind: KitchenItemKindFilter = capturePageState.kindFilter === 'WIP' || capturePageState.kindFilter === 'RAW' ? capturePageState.kindFilter : 'All'
  const effectiveCategory = capturePageState.category

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // The catalog is resolved through the same module-wide stream decision as the other Café
  // surfaces. A stale resolution cannot land over a later retry or unmount.
  useEffect(() => {
    let active = true
    const generation = ++readGeneration.current
    setCatalogReady(false)
    setLoadState('loading')
    void resolve().then(catalog => {
      if (!active || generation !== readGeneration.current) return
      adopt(catalog)
      setCatalogReady(true)
    }).catch(() => {
      if (!active || generation !== readGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [adopt, loadRetry, resolve])

  // Item names, confirmed shown units and the Kitchen BU are all read from their existing
  // Café/ops sources. Waste is valid on a receiving-only stream too, so this route deliberately
  // does not apply production's `produces` gate.
  useEffect(() => {
    if (!catalogReady) return
    let active = true
    const generation = ++readGeneration.current
    setLoadState('loading')
    setItems([])
    setEntries({})
    setInvalidQuantityIds(new Set())
    setFocusInvalidId(null)
    setBusinessUnitId('')
    setResumableDrafts([])
    setRestoredDraft(false)
    setRestoredDraftInfo(null)
    setRestoreAnnouncement('')
    setOtherDateDrafts([])
    if (!stream) {
      setLoadState('ready')
      return () => { active = false }
    }
    const draftRead = canCapture && personId && orgId
      ? listCurrentPersonKitchenWasteDrafts({
        orgId,
        personId,
        branchId: stream.branch.id,
        activity: stream.activity,
      })
      : Promise.resolve([] as KitchenWasteDraft[])
    void Promise.all([listCafeItemSettings(stream), resolveKitchenBuId(), draftRead]).then(([settings, buId, drafts]) => {
      if (!active || generation !== readGeneration.current) return
      const nextItems = settings.flatMap(setting => {
        const item = toCafeLogItem(setting)
        return item ? [item] : []
      })
      setItems(nextItems)
      setEsbItemCount(settings.length)
      const offeredItemIds = new Set(nextItems.map(item => item.id))
      const currentDraftScope = canCapture && orgId && personId
        ? wasteDraftScope(orgId, personId, stream, logDate)
        : null
      const storedRecord = currentDraftScope
        ? readCafeCaptureDraft<StoredWasteCaptureDraft>(currentDraftScope)
        : null
      const stored = storedRecord?.value ?? null
      const dateDrafts = canCapture && orgId && personId
        ? listOtherDateCafeCaptureDrafts<StoredWasteCaptureDraft>(
          wasteDraftScope(orgId, personId, stream, logDate),
        )
        : []
      const storedEntries = stored?.branch_id === stream.branch.id && stored.activity === stream.activity
        && stored.entries && typeof stored.entries === 'object' && !Array.isArray(stored.entries)
        ? stored.entries
        : {}
      const nextEntries = Object.fromEntries(nextItems.map(item => {
        const initial = initialEntries([item])[item.id]!
        const candidate = storedEntries[item.id]
        const saved = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : undefined
        const serverDraft = saved && drafts.find(draft => draft.logDate === logDate && (
          draft.logId === saved.logId
          || (!!saved.client_request_id && draft.clientRequestId === saved.client_request_id)
        ))
        if (!saved) return [item.id, initial]
        if (saved.logId && !serverDraft) return [item.id, initial]
        return [item.id, {
          ...initial,
          client_request_id: isCafeCaptureRequestId(saved.client_request_id) ? saved.client_request_id : initial.client_request_id,
          client_attempted: saved.client_attempted === true,
          quantity: serverDraft ? String(serverDraft.quantity) : typeof saved.quantity === 'string' ? saved.quantity : '',
          unitId: serverDraft?.itemUnitId ?? (item.units.some(unit => unit.id === saved.unitId) ? saved.unitId : initial.unitId),
          unitFactor: serverDraft?.entryUnitFactor ?? (Number.isFinite(saved.unitFactor) && saved.unitFactor > 0 ? saved.unitFactor : 1),
          unitBasisKnown: saved.unitBasisKnown !== false,
          logId: serverDraft?.logId,
          capturedUnitName: serverDraft?.entryUnitName ?? saved.capturedUnitName ?? initial.capturedUnitName,
          capturedLogDate: serverDraft?.logDate ?? saved.capturedLogDate,
          storage_location_id: typeof saved.storage_location_id === 'string' || saved.storage_location_id === null
            ? saved.storage_location_id : undefined,
          photoReady: Boolean(serverDraft?.photos.length),
          photoWindowExpired: Boolean(serverDraft && serverDraft.photos.length === 0 && isWastePhotoWindowExpired(serverDraft.createdAt)),
          preparing: false,
          submitted: false,
          photos: serverDraft?.photos ?? [],
          error: undefined,
        }]
      }))
      setEntries(nextEntries)
      setResumableDrafts(drafts.filter(draft => offeredItemIds.has(draft.itemId)
        && !Object.values(nextEntries).some(entry => entry.logId === draft.logId)))
      setRestoredDraft(Boolean(storedRecord))
      const restoredCount = Object.values(nextEntries).filter(entry => quantityValue(entry.quantity) !== null).length
      setRestorationNotice(storedRecord?.updatedAt ?? null, restoredCount)
      setOtherDateDrafts(dateDrafts)
      setBusinessUnitId(buId)
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== readGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, loadRetry, logDate, orgId, personId, setRestorationNotice, setRestoreAnnouncement, setRestoredDraftInfo, stream, stream?.activity, stream?.branch.id, t])

  const filterRows = useMemo<WasteRow[]>(() => items.map(item => ({
    ...item,
    rowId: item.id,
    kind: item.kind,
    itemName: item.name,
    category: item.category,
    groupKey: 'waste',
  })), [items])
  const itemTable = useKitchenItemTable({
    data: filterRows,
    search: capturePageState.search,
    kind: effectiveKind,
    category: effectiveCategory,
  })
  const visibleItems = itemTable.getFilteredRowModel().rows.map(row => row.original)
  const hasMixedCategories = new Set(visibleItems.map(item => item.category).filter(Boolean)).size > 1
  // The kind ('WIP - ') is said only when the list holds more than one kind.
  const mixedKinds = new Set(items.map(item => item.kind)).size > 1
  const kindPrefix = (kind: string) => mixedKinds ? `${kind} - ` : ''
  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ], [items, t])
  const staged = items.flatMap(item => {
    const entry = entries[item.id]
    const quantity = quantityValue(entry?.quantity ?? '')
    return entry && quantity !== null ? [{ item, entry, quantity }] : []
  })
  const formatWasteQty = (quantity: number) => new Intl.NumberFormat(
    document.documentElement.lang || 'en', { useGrouping: false, maximumFractionDigits: 2 },
  ).format(quantity)
  const workbenchEntries = staged.map(line => ({
    id: line.item.id,
    name: `${kindPrefix(line.item.kind)}${line.item.name}`,
    quantity: formatWasteQty(line.quantity),
    unit: line.entry.unitFactor !== 1 ? wasteEntryUnitLabel(line.item, line.entry, t) : line.entry.capturedUnitName ?? wasteEntryUnitLabel(line.item, line.entry, t),
    capturedDate: line.entry.capturedLogDate ? formatDayMonthYear(line.entry.capturedLogDate) : undefined,
    status: line.entry.submitted ? t('cafe.waste.status.submitted')
      : line.entry.logId && line.entry.photoReady ? t('cafe.waste.status.ready')
        : line.entry.logId ? t('cafe.waste.status.photos') : t('cafe.waste.status.quantity'),
  }))
  const remaining = staged.filter(line => !line.entry.submitted)
  const allPhotosReady = remaining.length > 0 && remaining.every(line => line.entry.logId && line.entry.photoReady)
  const allSubmitted = staged.length > 0 && remaining.length === 0 && invalidQuantityIds.size === 0
  const submittedCount = staged.length - remaining.length
  const invalidQuantityCount = invalidQuantityIds.size
  const hasPendingCapture = staged.length > 0 || invalidQuantityCount > 0
  const localDraftEntries = staged.filter(line => !line.entry.submitted && !line.entry.logId)

  useEffect(() => {
    if (loadState !== 'ready' || !canCapture || !stream || !orgId || !personId) return
    const scope = wasteDraftScope(orgId, personId, stream, logDate)
    const unsent = Object.fromEntries(Object.entries(entries).flatMap(([itemId, entry]) => {
      if (entry.submitted || entry.logId || quantityValue(entry.quantity) === null) return []
      return [[itemId, {
        client_request_id: entry.client_request_id,
        client_attempted: entry.client_attempted,
        quantity: entry.quantity,
        unitId: entry.unitId,
        unitFactor: entry.unitFactor,
        unitBasisKnown: entry.unitBasisKnown,
        logId: entry.logId,
        capturedUnitName: entry.capturedUnitName,
        capturedLogDate: entry.capturedLogDate,
        storage_location_id: entry.storage_location_id,
      } satisfies StoredWasteEntry]]
    }))
    if (Object.keys(unsent).length === 0) {
      clearCafeCaptureDraft(scope)
      setRestoredDraft(false)
      setRestoredDraftInfo(null)
      setRestoreAnnouncement('')
      return
    }
    writeCafeCaptureDraft<StoredWasteCaptureDraft>(scope, {
      branch_id: stream.branch.id,
      activity: stream.activity,
      entries: unsent,
    })
  }, [canCapture, entries, loadState, logDate, orgId, personId, setRestoreAnnouncement, setRestoredDraftInfo, stream])

  const patchEntry = useCallback((itemId: string, patch: Partial<WasteEntry>) => {
    setEntries(current => {
      const entry = current[itemId]
      return entry ? { ...current, [itemId]: { ...entry, ...patch } } : current
    })
  }, [])

  const reportQuantityValidity = useCallback((itemId: string, valid: boolean) => {
    setInvalidQuantityIds(current => {
      if (current.has(itemId) === !valid) return current
      const next = new Set(current)
      if (valid) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  function reportQuantityErrorVisibility(itemId: string, visible: boolean) {
    setVisibleQuantityErrors(current => {
      if (current.has(itemId) === visible) return current
      const next = new Set(current)
      if (visible) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  function renderQuantityError(item: WasteRow) {
    const rawValue = entries[item.id]?.quantity ?? ''
    if (!visibleQuantityErrors.has(item.id)) return null
    const parsed = parseQuantityInput(rawValue, { min: 0, maxIntegerDigits: 10, maxFractionDigits: 2 })
    return parsed.kind === 'invalid' ? (
      <QuantityFieldError
        id={`cafe-waste-qty-${item.id}-quantity-error`}
        reason={parsed.reason}
        rawValue={rawValue}
        className="cwl-field-error"
      />
    ) : null
  }

  function focusFirstInvalidQuantity() {
    const itemId = Array.from(invalidQuantityIds).find(id => items.some(item => item.id === id))
    if (!itemId) return
    resetSearchFilters()
    setFocusInvalidId(itemId)
  }

  useLayoutEffect(() => {
    if (!focusInvalidId) return
    const field = document.getElementById(`cafe-waste-qty-${focusInvalidId}`)
    if (!field) return
    field.scrollIntoView?.({ block: 'center' })
    field.focus()
    setFocusInvalidId(null)
  }, [focusInvalidId, search, effectiveKind, effectiveCategory, items])

  // Stable callback identities keep readiness effects from firing again on every parent entry update.
  const photoReadyCallbacks = useMemo(() => new Map(items.map(item => [item.id, (ready: boolean) => {
    setEntries(current => {
      const entry = current[item.id]
      return entry ? { ...current, [item.id]: { ...entry, photoReady: ready } } : current
    })
  }])), [items])
  const photoExpiredCallbacks = useMemo(() => new Map(items.map(item => [item.id, () => {
    setEntries(current => {
      const entry = current[item.id]
      return entry ? { ...current, [item.id]: { ...entry, photoWindowExpired: true } } : current
    })
  }])), [items])
  function changeWasteEntryUnit(item: CafeLogItem, choice: string) {
    const nextFactor = choice.startsWith('multiple:') ? Number(choice.slice('multiple:'.length)) : 1
    if (!Number.isFinite(nextFactor) || nextFactor <= 0
      || (nextFactor !== 1 && !item.multiples.includes(nextFactor))) return
    setEntries(current => {
      const entry = current[item.id]
      if (!entry || entry.logId || entry.preparing || entry.submitted) return current
      return {
        ...current,
        [item.id]: {
          ...entry,
          ...(entry.client_attempted ? { client_request_id: crypto.randomUUID() } : {}),
          client_attempted: false,
          unitId: item.defaultUnit.id,
          unitFactor: nextFactor,
          unitBasisKnown: true,
          capturedUnitName: item.defaultUnit.name,
          error: entry.unitNotShown ? entry.error : undefined,
        },
      }
    })
  }

  const photoUploadedCallbacks = useMemo(() => new Map(items.map(item => [item.id, (photo: KitchenWastePhoto) => {
    setEntries(current => {
      const entry = current[item.id]
      if (!entry || entry.photos.some(existing => existing.path === photo.path)) return current
      return { ...current, [item.id]: { ...entry, photos: [...entry.photos, photo], photoReady: true } }
    })
  }])), [items])

  async function prepareEntry(item: CafeLogItem) {
    const entry = entries[item.id]
    const quantity = quantityValue(entry?.quantity ?? '')
    if (!entry || quantity === null || !stream || !businessUnitId || !canCapture || !isOnline
      || entry.logId || entry.preparing || entry.unitNotShown || draftRequests.current.has(item.id)) return
    draftRequests.current.add(item.id)
    setSelectedEvidenceId(item.id)
    patchEntry(item.id, { preparing: true, client_attempted: true, error: undefined })
    try {
      const logId = await insertKitchenLog({
        client_request_id: entry.client_request_id,
        business_unit_id: businessUnitId,
        log_date: logDate,
        branch_id: stream.branch.id,
        activity: stream.activity,
        action: 'waste',
        destination_branch_id: null,
        wip_item_id: item.id,
        item_unit_id: item.defaultUnit.id,
        qty_porsi: toDefaultUnitQuantity(quantity, entry.unitFactor ?? 1),
        entry_quantity: quantity,
        entry_unit_factor: entry.unitFactor ?? 1,
        ...(locationChoices.status === 'ready' ? {
          from_storage_location_id: entry.storage_location_id === undefined ? defaultStorageLocationId : entry.storage_location_id,
        } : {}),
      })
      patchEntry(item.id, { logId, capturedLogDate: logDate, preparing: false })
    } catch (cause) {
      const unitNotShown = isItemUnitNotShownError(cause)
      patchEntry(item.id, {
        preparing: false,
        unitNotShown,
        error: t(unitNotShown ? 'kitchen.log.error.unitNotShown' : 'kitchen.waste.prepareFailed'),
      })
    } finally {
      draftRequests.current.delete(item.id)
    }
  }

  async function restartExpiredEntry(item: CafeLogItem) {
    const entry = entries[item.id]
    const quantity = quantityValue(entry?.quantity ?? '')
    if (!entry?.logId || !entry.photoWindowExpired || entry.photos.length > 0 || quantity === null
      || !entry.unitBasisKnown || !stream || !businessUnitId || !canCapture || !isOnline || submitting || entry.preparing
      || draftRequests.current.has(item.id)) return
    draftRequests.current.add(item.id)
    patchEntry(item.id, { preparing: true, error: undefined })
    try {
      const replacement = await restartKitchenWasteDraft(entry.logId, logDate)
      patchEntry(item.id, {
        logId: replacement.logId,
        client_request_id: crypto.randomUUID(),
        client_attempted: false,
        capturedUnitName: entry.capturedUnitName,
        capturedLogDate: replacement.logDate,
        preparing: false,
        photoReady: false,
        photoWindowExpired: false,
        photos: [],
      })
    } catch {
      patchEntry(item.id, { preparing: false, error: t('kitchen.waste.prepareFailed') })
    } finally {
      draftRequests.current.delete(item.id)
    }
  }

  function resumeWasteDraft(draft: KitchenWasteDraft) {
    if (!canCapture || !draft.itemUnitId || !draft.unitName || !items.some(item => item.id === draft.itemId)) return
    const { itemUnitId, unitName } = draft
    setSelectedEvidenceId(draft.itemId)
    const entry = entries[draft.itemId]
    if (entry?.logId || entry?.preparing || entry?.quantity.trim()) return
    setEntries(current => {
      const currentEntry = current[draft.itemId]
      if (currentEntry?.logId || currentEntry?.preparing || currentEntry?.quantity.trim()) return current
      return {
        ...current,
        [draft.itemId]: {
          ...(currentEntry ?? initialEntries(items)[draft.itemId]!),
          client_request_id: draft.clientRequestId ?? currentEntry?.client_request_id ?? crypto.randomUUID(),
          client_attempted: true,
          quantity: String(draft.quantity),
          unitId: itemUnitId,
          unitFactor: draft.entryUnitFactor ?? 1,
          unitBasisKnown: draft.entryUnitFactor != null
            || items.find(item => item.id === draft.itemId)?.defaultUnit.id === itemUnitId,
          capturedUnitName: draft.entryUnitName ?? unitName,
          capturedLogDate: draft.logDate,
          logId: draft.logId,
          photoReady: draft.photos.length > 0,
          photoWindowExpired: draft.photos.length === 0 && isWastePhotoWindowExpired(draft.createdAt),
          preparing: false,
          submitted: false,
          photos: draft.photos,
          error: undefined,
        },
      }
    })
    setResumableDrafts(current => current.filter(candidate => candidate.logId !== draft.logId))
    setSubmitError(false)
  }

  function renderEvidence(item: CafeLogItem) {
    const entry = entries[item.id]
    if (!entry?.logId || entry.submitted) return null
    if (entry.photoWindowExpired && entry.photos.length === 0) {
      return (
        <div className="cwl-evidence cwl-expired" role="status">
          <p>{t('kitchen.waste.expiredDraft', { minutes: WASTE_PHOTO_UPLOAD_WINDOW_MINUTES })}</p>
          {!entry.unitBasisKnown && <p className="cwl-lock-note">{t('kitchen.waste.restartUnknownUnit')}</p>}
          <button
            type="button"
            className="btn btn-outline"
            disabled={!canCapture || !isOnline || submitting || entry.preparing || !entry.unitBasisKnown}
            onClick={() => void restartExpiredEntry(item)}
          >
            {entry.preparing ? t('common.working') : t('kitchen.waste.startReplacement')}
          </button>
          {entry.error && <span className="cwl-field-error" role="alert">{entry.error}</span>}
        </div>
      )
    }
    return (
      <WastePhotoCapture
        key={entry.logId}
        wasteLogId={entry.logId}
        initialPhotos={entry.photos}
        onPhotoUploaded={photoUploadedCallbacks.get(item.id)}
        onCanSubmitChange={photoReadyCallbacks.get(item.id)}
        onPhotoWindowExpired={photoExpiredCallbacks.get(item.id)}
      />
    )
  }

  async function handleSubmit() {
    if (submitting || !canCapture || !isOnline || !stream || !businessUnitId || !allPhotosReady) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      for (const line of remaining) {
        await submitKitchenWasteLog(line.entry.logId!)
        patchEntry(line.item.id, { submitted: true })
      }
      if (stream) clearCafeCaptureDraft(wasteDraftScope(orgId, personId, stream, logDate))
      setRestoredDraft(false)
      setRestoredDraftInfo(null)
      setRestoreAnnouncement('')
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  function startAnotherLog() {
    setEntries(initialEntries(items))
    setInvalidQuantityIds(new Set())
    setFocusInvalidId(null)
    setSubmitError(false)
  }

  function discardCurrentLocalDraft() {
    if (!stream) return
    clearCafeCaptureDraft(wasteDraftScope(orgId, personId, stream, logDate))
    const blank = initialEntries(items)
    setEntries(current => Object.fromEntries(items.map(item => {
      const entry = current[item.id]
      return [item.id, entry?.logId || entry?.submitted ? entry : blank[item.id]!]
    })))
    setRestoredDraft(false)
    setRestoredDraftInfo(null)
    setRestoreAnnouncement('')
  }

  function discardOtherDateDraft(scope: CafeCaptureDraftScope) {
    clearCafeCaptureDraft(scope)
    setOtherDateDrafts(current => current.filter(record =>
      record.scope.branchId !== scope.branchId || record.scope.activity !== scope.activity
        || record.scope.logDate !== scope.logDate,
    ))
  }

  function requestCurrentLocalDraftDiscard() {
    if (!stream || !orgId || !personId || submitting) return
    setPendingDraftDiscard({ scope: wasteDraftScope(orgId, personId, stream, logDate), current: true })
  }

  function requestOtherDateDraftDiscard(scope: CafeCaptureDraftScope) {
    if (submitting) return
    setPendingDraftDiscard({ scope, current: false })
  }

  function confirmDraftDiscard() {
    if (!pendingDraftDiscard) return
    focusDraftAfterDiscardRef.current = true
    if (pendingDraftDiscard.current) discardCurrentLocalDraft()
    else discardOtherDateDraft(pendingDraftDiscard.scope)
    setPendingDraftDiscard(null)
  }

  function retryLoad() {
    setCatalogReady(false)
    setLoadRetry(value => value + 1)
  }

  function selectStream(next: ProductionStream) {
    if (hasPendingCapture) return
    setStream(next)
  }

  const streamBar = {
    options: [...locationStreams, ...otherLocationStreams],
    locationBranchId: locationId,
    stream,
    homeStream,
    myStreamKeys,
    onChange: selectStream,
    disabled: submitting || hasPendingCapture,
  }

  const wasteRowProps = (item: WasteRow) => ({
    item,
    entry: entries[item.id],
    canCapture,
    formatQuantity: formatWasteQty,
    isOnline,
    disabled: submitting || loadState !== 'ready',
  })
  const renderControl = (item: WasteRow) => (
    <WasteQuantityControl
      {...wasteRowProps(item)}
      onQuantityChange={value => patchEntry(item.id, {
        quantity: value,
        error: entries[item.id]?.unitNotShown ? entries[item.id]?.error : undefined,
        ...(entries[item.id]?.client_attempted || !value.trim()
          ? { client_request_id: crypto.randomUUID(), client_attempted: false }
          : {}),
      })}
      onQuantityValidityChange={valid => reportQuantityValidity(item.id, valid)}
      onQuantityErrorVisibilityChange={visible => reportQuantityErrorVisibility(item.id, visible)}
      onUnitChange={choice => changeWasteEntryUnit(item, choice)}
    />
  )
  const renderPhotoAction = (item: WasteRow) => (
    <WastePhotoAction {...wasteRowProps(item)} onPrepare={() => void prepareEntry(item)} />
  )
  const renderRowDetail = (item: WasteRow) => (
    <>
      {renderQuantityError(item)}
      <WasteRowNotes {...wasteRowProps(item)} />
      {/* Which storage the waste came out of is decided on its own line, once the line has an amount (preview only). */}
      {canCapture && Boolean(entries[item.id]?.quantity?.trim()) && <LocationLineField
        kind="waste"
        locations={storageLocations}
        value={entries[item.id]?.storage_location_id === undefined ? defaultStorageLocationId : entries[item.id]?.storage_location_id}
        onChange={value => {
          const entry = entries[item.id]
          patchEntry(item.id, {
            storage_location_id: value,
            ...(entry?.client_attempted && !entry.logId ? { client_request_id: crypto.randomUUID(), client_attempted: false } : {}),
          })
        }}
        loadState={locationChoices.status === 'idle' ? 'loading' : locationChoices.status}
        onRetry={locationChoices.retry}
        disabled={submitting || Boolean(entries[item.id]?.logId)}
      />}
    </>
  )

  const state = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting ? 'saving' : allSubmitted ? 'saved' : !canCapture ? 'read-only' : 'default'

  return (
    <CafePageFrame page="waste" date={logDate} streamBar={streamBar} state={state}
      recordsHref={recordsHref({ question: 'wasted', reading: 'entries', from: logDate, to: logDate, stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null, today: wibToday() })}>
      <div ref={captureRootRef} className="kl-page cwl-page kl-capture-content kl-capture-wide cafe-capture-content">
        <div className="kl-capture-main">
        <RouteLeaveGuard when={remaining.length > 0 || invalidQuantityCount > 0} message={t('kitchen.log.leave.confirm')} />
        {!isOnline && <Notice tone="attention" role="alert">{t('kitchen.log.offline.banner')}</Notice>}

        {loadState === 'loading' && <LoadingShell />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={retryLoad}
            retryLabel={t('common.retry')}
          />
        )}

        {loadState === 'ready' && !stream && (
          <CafeStreamChoices
            options={locationStreams}
            homeStream={homeStream}
            myStreamKeys={myStreamKeys}
            onChoose={selectStream}
            disabled={submitting}
          />
        )}

        {loadState === 'ready' && stream && (
          <CafeTransactionWorkspace>
            <div className="cwl-work-scroll" tabIndex={0} role="region" aria-label={t('kitchen.waste.tableCaption')}>
            {!canCapture && <Notice tone="info">{t('cafe.capture.readOnly')}</Notice>}
            <Notice
              tone="info"
              action={canCapture && (localDraftEntries.length + resumableDrafts.length + otherDateDrafts.length > 0) ? <a href="#cwl-drafts">{t('cafe.waste.draftsResumeCount', { count: localDraftEntries.length + resumableDrafts.length })}</a> : undefined}
            >
              {t('kitchen.waste.held')}{canCapture && <> <span id="cafe-waste-photo-guidance">{t('kitchen.waste.help')}</span></>}
            </Notice>
            {restoreAnnouncement && (
              <p className="cafe-vh" role="status" aria-live="polite">{restoreAnnouncement}</p>
            )}
            {(restoredDraft && localDraftEntries.length > 0 || otherDateDrafts.length > 0 || resumableDrafts.length > 0) && canCapture && (
              <div id="cwl-drafts">
              <CafeWasteDraftsPanel title={`${t('cafe.waste.draftsResume')} · ${localDraftEntries.length + otherDateDrafts.length + resumableDrafts.length}`}>
                {restoredDraft && localDraftEntries.length > 0 && restoredDraftInfo && (
              <section className="kl-capture-draft-notice" aria-live="off">
                <details className="kl-capture-draft-details" open={isDesktop}>
                  <summary>
                    <strong>{t(
                      restoredDraftInfo.count === 1
                        ? 'cafe.captureDraft.restoredCompact.one'
                        : 'cafe.captureDraft.restoredCompact.other',
                      { count: restoredDraftInfo.count },
                    )}</strong>
                    <span className="cafe-vh">{t('cafe.captureDraft.details')}</span>
                  </summary>
                  <div className="kl-capture-draft-details__body">
                    <small>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(restoredDraftInfo.savedAt) })}</small>
                    {otherDateDrafts.length === 0 && <small>{t('cafe.captureDraft.expiry')}</small>}
                  </div>
                </details>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={requestCurrentLocalDraftDiscard}
                  disabled={submitting}
                >
                  {t('kitchen.log.discard')}
                </button>
              </section>
            )}
            {canCapture && otherDateDrafts.length > 0 && (
              <section className="kl-capture-draft-list" aria-labelledby="cwl-other-date-drafts">
                <h2 id="cwl-other-date-drafts" ref={draftListHeadingRef} tabIndex={-1}>{t('cafe.captureDraft.otherDates')}</h2>
                <p className="kl-capture-draft-guidance">{t('cafe.captureDraft.otherDatesNextStep')}</p>
                {otherDateDrafts.map(record => {
                  const savedEntries = record.value?.entries && typeof record.value.entries === 'object'
                    && !Array.isArray(record.value.entries) ? record.value.entries : {}
                  const rows = Object.entries(savedEntries).filter(([, entry]) => entry
                    && typeof entry === 'object' && quantityValue(entry.quantity) !== null)
                  const date = formatDayMonthYear(record.scope.logDate)
                  return (
                    <article
                      key={`${record.scope.branchId}:${record.scope.activity}:${record.scope.logDate}`}
                      className="kl-capture-draft-notice"
                      aria-label={t(rows.length === 1 ? 'cafe.captureDraft.otherDate.one' : 'cafe.captureDraft.otherDate.other', { date, count: rows.length })}
                    >
                      <details className="kl-capture-draft-details" open={isDesktop}>
                        <summary>
                          <strong>{t(rows.length === 1 ? 'cafe.captureDraft.otherDate.one' : 'cafe.captureDraft.otherDate.other', { date, count: rows.length })}</strong>
                          <span className="cafe-vh">{t('cafe.captureDraft.details')}</span>
                        </summary>
                        <div className="kl-capture-draft-details__body">
                          <ul>
                            {rows.map(([itemId, entry]) => {
                              const item = items.find(candidate => candidate.id === itemId)
                              const quantity = quantityValue(entry.quantity) ?? 0
                              const unit = entry.capturedUnitName
                                ?? item?.units.find(candidate => candidate.id === entry.unitId)?.name
                                ?? t('kitchen.waste.unitUnavailable')
                              const label = entry.unitFactor !== 1 && item
                                ? formatUnitMultiple(entry.unitFactor, item.defaultUnit.name, document.documentElement.lang || 'en')
                                : unit
                              const itemName = item
                                ? `${kindPrefix(item.kind)}${item.name}`
                                : t('kitchen.log.draft.itemUnavailable')
                              return <li key={itemId}>
                                <span>{itemName}</span>
                                <span>{formatWasteQty(quantity)} {label}</span>
                              </li>
                            })}
                          </ul>
                          <small>{t('cafe.captureDraft.savedAt', { time: formatWibDateTime(record.updatedAt) })}</small>
                        </div>
                      </details>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => requestOtherDateDraftDiscard(record.scope)}
                        disabled={submitting}
                      >
                        {t('kitchen.log.discard')}
                      </button>
                    </article>
                  )
                })}
                <small className="kl-capture-draft-expiry">{t('cafe.captureDraft.expiry')}</small>
              </section>
            )}
                {canCapture && resumableDrafts.length > 0 && (
              <section className="cwl-resume" aria-labelledby="cwl-resume-title">
                <h2 id="cwl-resume-title">{t('kitchen.waste.resumableDrafts')}</h2>
                <ul>
                  {resumableDrafts.map(draft => {
                    const item = items.find(candidate => candidate.id === draft.itemId)
                    if (!item) return null
                    const current = entries[draft.itemId]
                    const alreadyEditing = Boolean(current?.logId || current?.preparing || current?.quantity.trim())
                    const timestamp = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
                      dateStyle: 'medium', timeStyle: 'medium',
                    }).format(new Date(draft.createdAt))
                    return (
                      <li key={draft.logId}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={alreadyEditing || submitting || !draft.itemUnitId || !draft.unitName}
                          onClick={() => resumeWasteDraft(draft)}
                        >
                          {t('kitchen.waste.resumeDraft', {
                            item: item.name,
                            quantity: formatWasteQty(draft.quantity),
                            unit: draft.unitName ?? t('kitchen.waste.unitUnavailable'),
                            date: formatDayMonthYear(draft.logDate),
                            createdAt: timestamp,
                          })}
                        </button>
                        {(!draft.itemUnitId || !draft.unitName) && (
                          <span className="cwl-lock-note">{t('kitchen.waste.unitUnavailableHelp')}</span>
                        )}
                        {draft.photos.length === 0 && isWastePhotoWindowExpired(draft.createdAt) && (
                          <span className="cwl-lock-note">{t('kitchen.waste.expiredDraft', { minutes: WASTE_PHOTO_UPLOAD_WINDOW_MINUTES })}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
                )}
              </CafeWasteDraftsPanel>
              </div>
            )}

            {items.length === 0 ? (
              <CafeItemsEmptyState stream={stream} esbItemCount={esbItemCount} />
            ) : (
              <div className={`cwl-finder-layout${selectedEvidenceId && staged.some(line => line.item.id === selectedEvidenceId && line.entry.logId) ? ' cwl-finder-layout--evidence' : ''}${canCapture && workbenchEntries.length > 0 ? '' : ' cwl-finder-layout--single'}`}>
                <div className="cwl-finder">
                  <KitchenToolbar
                    search={capturePageState.search}
                    onSearchChange={capturePageState.setSearch}
                    kinds={WASTE_KIND_OPTIONS}
                    kind={capturePageState.kindFilter as KitchenItemKindFilter}
                    kindId="cafe-waste-kind"
                    onKindChange={capturePageState.setKindFilter}
                    categories={categories}
                    categoryId="cafe-waste-category"
                    categoryLabel={value => kitchenCategoryLabel(t, value)}
                    category={capturePageState.category}
                    onCategoryChange={capturePageState.setCategory}
                    searchPlaceholder={t('kitchen.log.searchPlaceholder')}
                    ariaLabel={t('kitchen.log.toolbarAria')}
                    resultCount={{ shown: visibleItems.length, total: items.length }}
                    sortLabel={t('cafe.toolbar.sorted.az')}
                    filtersPanel={{ label: t('cafe.toolbar.filters'), summary: [capturePageState.kindFilter !== 'All' ? capturePageState.kindFilter : t('kitchen.filter.kind.all'), capturePageState.category !== 'All' ? kitchenCategoryLabel(t, capturePageState.category) : t('kitchen.filter.all')].join(' · ') }}
                  />
                  <Worksheet label={t('kitchen.waste.tableCaption')} className="cwl-sheet">
                    <CaptureTable
                      caption={t('kitchen.waste.tableCaption')}
                      className="cwl-table"
                      columns={{
                        item: t('kitchen.log.col.item'),
                        itemSort: 'asc',
                        controls: [{ label: t('kitchen.waste.quantity') }],
                        action: t('cafe.waste.photoColumn'),
                        actionRem: 7,
                      }}
                      hideHead={!canCapture}
                      rows={visibleItems}
                      state={visibleItems.length > 0 ? 'ready' : 'empty'}
                      emptyLabel={<CafeNoMatch bare onClear={() => { capturePageState.setSearch(''); capturePageState.setKindFilter('All'); capturePageState.setCategory('All') }} />}
                      renderRow={item => (
                        <CaptureRow
                          id={item.id}
                          name={item.itemName}
                          kind={mixedKinds ? item.kind : null}
                          category={hasMixedCategories ? item.category : null}
                          controls={[{ node: renderControl(item) }]}
                          action={renderPhotoAction(item)}
                          detail={renderRowDetail(item)}
                        />
                      )}
                    />
                  </Worksheet>
                  {businessUnitId && canCapture && <ReportMissingItem stream={stream} streamLabel={streamLabel(t, stream)} />}
                </div>
                {canCapture && workbenchEntries.length > 0 && <section className="cwl-entry-work" aria-labelledby="cwl-entry-heading">
                  <h2 id="cwl-entry-heading">{t('cafe.waste.entries')}</h2>
                  <CafeWasteWorkbench
                    title={t('cafe.waste.entries')}
                    emptyMessage={t('cafe.waste.noEntries')}
                    entries={workbenchEntries}
                    selectedId={selectedEvidenceId && staged.some(line => line.item.id === selectedEvidenceId)
                      ? selectedEvidenceId : workbenchEntries[0]?.id ?? null}
                    onSelect={setSelectedEvidenceId}
                    onBack={() => setSelectedEvidenceId(null)}
                    backLabel={t('cafe.waste.backToItems')}
                    editor={(() => {
                      const selected = staged.find(line => line.item.id === (selectedEvidenceId && staged.some(item => item.item.id === selectedEvidenceId)
                        ? selectedEvidenceId : staged[0]?.item.id))
                      return selected ? renderEvidence(selected.item) : null
                    })()}
                  />
                </section>}
              </div>
            )}

            </div>
            {canCapture && items.length > 0 && <ActionBar
              className="cafe-capture-footer"
              alert={<>
                {submitError && <Notice tone="urgent">{t('kitchen.waste.submitFailed')}</Notice>}
                {submittedCount > 0 && !allSubmitted && <Notice tone="info">{t('kitchen.waste.partial', { submitted: submittedCount, total: staged.length })}</Notice>}
                {allSubmitted && (
                  <Notice tone="success">
                    {t(staged.length === 1 ? 'kitchen.waste.success.one' : 'kitchen.waste.success.other', { count: staged.length })}
                  </Notice>
                )}
              </>}
              summary={<span className="cwl-bar-summary">
                <span aria-live="polite">{t(staged.length === 1 ? 'kitchen.waste.footer.count.one' : 'kitchen.waste.footer.count.other', { count: staged.length })}</span>
                {staged.length > 0 && <span className="cwl-batch-status" role="status">{t('cafe.waste.batchStatus', { submitted: submittedCount, total: staged.length, remaining: remaining.length })}</span>}
              </span>}
              reason={<>
                {!allPhotosReady && !allSubmitted && staged.length > 0 && <span className="kl-submit-reason">{t('kitchen.waste.photoRequired')}</span>}
                {!allSubmitted && staged.length === 0 && <span className="kl-submit-reason">{t('kitchen.waste.noItems')}</span>}
                {invalidQuantityCount > 0 && (
                  <button type="button" className="kl-submit-reason kl-note-pointer" onClick={focusFirstInvalidQuantity}>
                    {t(invalidQuantityCount === 1 ? 'quantityField.fixing.one' : 'quantityField.fixing.other', { count: invalidQuantityCount })}
                  </button>
                )}
              </>}
              primary={allSubmitted ? (
                <button type="button" className="btn btn-outline" onClick={startAnotherLog}>{t('kitchen.waste.newLog')}</button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary kl-submit"
                  disabled={!canCapture || !isOnline || submitting || !allPhotosReady}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? t('common.working') : t('kitchen.waste.submit')}
                </button>
              )}
            />}
          </CafeTransactionWorkspace>
        )}
        </div>
      </div>
      {pendingDraftDiscard && (
        <ConfirmDialog
          open
          title={t('kitchen.log.draft.discardTitle')}
          body={t('kitchen.log.draft.discardBody', {
            date: formatDayMonthYear(pendingDraftDiscard.scope.logDate),
          })}
          confirmLabel={t('kitchen.log.discard')}
          cancelLabel={t('common.cancel')}
          tone="destructive"
          onConfirm={async () => confirmDraftDiscard()}
          onCancel={() => setPendingDraftDiscard(null)}
        />
      )}
    </CafePageFrame>
  )
}

type WasteRowViewProps = {
  item: CafeLogItem
  entry: WasteEntry | undefined
  canCapture: boolean
  formatQuantity: (quantity: number) => string
  isOnline: boolean
  disabled: boolean
}

/** What every part of one waste row needs to know about its entry. */
function useWasteRowView({ item, entry, canCapture, isOnline, disabled }: WasteRowViewProps) {
  const t = useT()
  const current = entry ?? createWasteEntry(item)
  const quantity = quantityValue(current.quantity)
  const selectedUnitLabel = wasteEntryUnitLabel(item, current, t)
  const locked = Boolean(current.logId || current.preparing || current.submitted)
  const editable = canCapture && isOnline && !disabled && !locked
  return { t, current, quantity, selectedUnitLabel, locked, editable }
}

/** The typed quantity and its unit (a fixed label, or a picker when the item has other units). */
function WasteQuantityControl(props: WasteRowViewProps & {
  onQuantityChange: (quantity: string) => void
  onQuantityValidityChange: (valid: boolean) => void
  onQuantityErrorVisibilityChange: (visible: boolean) => void
  onUnitChange: (choice: string) => void
}) {
  const { item, entry, canCapture, formatQuantity, onQuantityChange, onQuantityValidityChange, onQuantityErrorVisibilityChange, onUnitChange } = props
  const { t, current, quantity, selectedUnitLabel, editable } = useWasteRowView(props)
  const inputId = `cafe-waste-qty-${item.id}`
  const unitId = `cafe-waste-unit-${item.id}`
  const selectedUnit = item.units.find(unit => unit.id === item.defaultUnit.id)
    ?? { ...item.defaultUnit, isDefault: true, labelOrdinal: null, labelCount: 1 }
  const historicalUnit = Boolean(entry?.capturedUnitName
    && !item.units.some(unit => unit.id === current.unitId))
  const showUnitPicker = item.multiples.length > 0 || historicalUnit
  if (!canCapture) {
    return (
      <span className="cafe-items__mos-value tabular">
        {quantity === null ? t('cafe.capture.notRecorded') : `${formatQuantity(quantity)} ${selectedUnitLabel}`}
      </span>
    )
  }
  const selectedChoice = current.unitFactor !== 1
    ? `multiple:${String(current.unitFactor)}`
    : current.unitId
  return (
    <CaptureControl>
      <QuantityField
        id={inputId}
        label={t('kitchen.waste.quantityFor', { item: item.name })}
        className="cwl-quantity-input tabular"
        value={quantity ?? 0}
        onChange={next => onQuantityChange(next > 0 ? String(next) : '')}
        onInvalid={(_reason, raw) => onQuantityChange(raw)}
        onValidityChange={onQuantityValidityChange}
        onErrorVisibilityChange={onQuantityErrorVisibilityChange}
        hideError
        errorMessageId={`${inputId}-quantity-error`}
        initialDraft={quantity === null && current.quantity !== '' ? current.quantity : undefined}
        suffixPosition="inline"
        suffix={showUnitPicker ? (
          <>
            <Select
              id={unitId}
              className="cwl-unit-select"
              contentClassName="cwl-unit-menu"
              aria-label={t('kitchen.waste.unitFor', { item: item.name })}
              aria-describedby={`cafe-waste-selected-unit-${item.id}`}
              title={selectedUnitLabel}
              value={selectedChoice}
              disabled={!editable}
              onChange={event => onUnitChange(event.target.value)}
            >
              {historicalUnit && <option value={current.unitId}>{entry?.capturedUnitName}</option>}
              <option value={item.defaultUnit.id}>{defaultUnitOptionLabel(selectedUnit, t)}</option>
              {item.multiples.map(factor => (
                <option key={`multiple:${factor}`} value={`multiple:${String(factor)}`}>
                  {formatUnitMultiple(factor, item.defaultUnit.name, document.documentElement.lang || undefined)}
                </option>
              ))}
            </Select>
            <span id={`cafe-waste-selected-unit-${item.id}`} className="cafe-vh">{selectedUnitLabel}</span>
          </>
        ) : (
          <span className="cwl-unit-label" aria-label={t('kitchen.waste.unitFor', { item: item.name })} title={selectedUnitLabel}>
            {selectedUnitLabel}
          </span>
        )}
        maxIntegerDigits={10}
        maxFractionDigits={2}
        min={0}
        disabled={!editable}
      />
    </CaptureControl>
  )
}

/** "Add photo" once there is a quantity (or a saved log); nothing while the row is empty or already submitted. */
function WastePhotoAction({ onPrepare, ...props }: WasteRowViewProps & { onPrepare: () => void }) {
  const { canCapture, isOnline, disabled } = props
  const { t, current, quantity } = useWasteRowView(props)
  if (!canCapture || current.submitted || !(quantity !== null || current.logId)) return null
  return (
    <button
      type="button"
      className="btn btn-outline"
      aria-describedby="cafe-waste-photo-guidance"
      disabled={!canCapture || !isOnline || disabled || current.preparing || current.unitNotShown || Boolean(current.logId) || quantity === null}
      onClick={onPrepare}
    >
      {current.preparing ? t('common.working') : t('kitchen.waste.addPhoto')}
    </button>
  )
}

/** The row's detail line: a refusal, why the entry is locked, or that it has been submitted. */
function WasteRowNotes(props: WasteRowViewProps) {
  const { canCapture } = props
  const { t, current } = useWasteRowView(props)
  if (!canCapture) return null
  return (
    <>
      {current.error && <span className="cwl-field-error" role="alert">{current.error}</span>}
      {current.logId && !current.submitted && (
        <p className="cwl-lock-note">
          {current.capturedLogDate
            ? t('kitchen.waste.capturedOn', { date: formatDayMonthYear(current.capturedLogDate) })
            : t('kitchen.waste.entryLocked')}
        </p>
      )}
      {current.submitted && <p className="cwl-submitted" role="status">{t('kitchen.waste.itemSubmitted')}</p>}
    </>
  )
}
