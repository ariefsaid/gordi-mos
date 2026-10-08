import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsWide } from '@/shell/use-is-wide'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useCafeStream } from '@/lib/use-cafe-stream'
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
import { insertKitchenLog, resolveKitchenBuId } from '@/lib/db/kitchen-logs'
import {
  listCurrentPersonKitchenWasteDrafts,
  submitKitchenWasteLog,
  restartKitchenWasteDraft,
  isWastePhotoWindowExpired,
  WASTE_PHOTO_UPLOAD_WINDOW_MINUTES,
} from '@/lib/db/kitchen-waste-photos'
import type { KitchenWasteDraft, KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { formatDayMonthYear, formatWeekdayDayMonth, formatWibDateTime, wibToday } from '@/lib/format/date'
import { useCafeCaptureDraftPageState } from '@/lib/use-cafe-capture-draft-page-state'
import {
  useKitchenItemTable,
  kitchenDataTableGroups,
  type KitchenItemKindFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { ReportMissingItem } from '@/components/kitchen/report-missing-item'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { WastePhotoCapture } from '@/components/kitchen/waste-photo-capture'
import { CafeCaptureTable } from '@/components/kitchen/cafe-capture-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/select'
import { QuantityField, QuantityFieldError } from '@/components/ui/quantity-field'
import { parseQuantityInput } from '@/lib/quantity-parser'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import '@/components/kitchen/status-banner-tone.css'
import './cafe-waste-page.css'

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
  submitted: boolean
  photos: KitchenWastePhoto[]
  error?: string
}
type WasteRow = KitchenListRow<CafeLogItem>
type PageLoadState = 'loading' | 'ready' | 'error'

const WASTE_KIND_OPTIONS: readonly KitchenItemKindFilter[] = ['All', 'WIP', 'RAW']

type StoredWasteEntry = Pick<WasteEntry,
  'client_request_id' | 'client_attempted' | 'quantity' | 'unitId' | 'unitFactor' | 'unitBasisKnown'
  | 'logId' | 'capturedUnitName' | 'capturedLogDate'>

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
  const isWide = useIsWide()
  const logDate = useMemo(() => wibToday(), [])
  const pageLabel = t('nav.cafe.waste')
  useDocumentTitle(t('common.docTitle', { page: `${pageLabel} · ${t('nav.cafe')}` }))

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
  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ], [items, t])
  const groups = loadState === 'loading' ? [] : kitchenDataTableGroups(itemTable, () => null)
  const staged = items.flatMap(item => {
    const entry = entries[item.id]
    const quantity = quantityValue(entry?.quantity ?? '')
    return entry && quantity !== null ? [{ item, entry, quantity }] : []
  })
  const stagedSummary = staged.map(line => ({
    id: line.item.id,
    name: line.item.name,
    quantity: line.quantity,
    unit: wasteEntryUnitLabel(line.item, line.entry, t),
    logDate: line.entry.capturedLogDate,
    submitted: line.entry.submitted,
  }))
  const formatWasteQty = (quantity: number) => new Intl.NumberFormat(
    document.documentElement.lang || 'en', { useGrouping: false, maximumFractionDigits: 2 },
  ).format(quantity)
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
          error: undefined,
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
      || entry.logId || entry.preparing || draftRequests.current.has(item.id)) return
    draftRequests.current.add(item.id)
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
      })
      patchEntry(item.id, { logId, capturedLogDate: logDate, preparing: false })
    } catch {
      patchEntry(item.id, {
        preparing: false,
        error: t('kitchen.waste.prepareFailed'),
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

  const streamPicker = (
    <CafeStreamBar
      options={[...locationStreams, ...otherLocationStreams]}
      locationBranchId={locationId}
      stream={stream}
      homeStream={homeStream}
      myStreamKeys={myStreamKeys}
      onChange={selectStream}
      disabled={submitting || hasPendingCapture}
      switchLabel={t(stream?.activity === 'bar' ? 'cafe.stream.switchBar' : 'cafe.stream.switchKitchen')}
      switchAriaLabel={t(stream?.activity === 'bar' ? 'cafe.stream.switchBarAria' : 'cafe.stream.switchKitchenAria')}
    />
  )

  const renderControls = (item: WasteRow) => (
    <WasteItemControls
      item={item}
      entry={entries[item.id]}
      canCapture={canCapture}
      isOnline={isOnline}
      disabled={submitting || loadState !== 'ready'}
      onQuantityChange={value => patchEntry(item.id, {
        quantity: value,
        error: undefined,
        ...(entries[item.id]?.client_attempted || !value.trim()
          ? { client_request_id: crypto.randomUUID(), client_attempted: false }
          : {}),
      })}
      onQuantityValidityChange={valid => reportQuantityValidity(item.id, valid)}
      onQuantityErrorVisibilityChange={visible => reportQuantityErrorVisibility(item.id, visible)}
      hideQuantityError={isDesktop}
      onUnitChange={choice => changeWasteEntryUnit(item, choice)}
      onPrepare={() => void prepareEntry(item)}
    />
  )

  const state = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting ? 'saving' : allSubmitted ? 'saved' : !canCapture ? 'read-only' : 'default'

  const captureContext = stream === null ? undefined : (
    <div className="cafe-capture-context">{streamPicker}</div>
  )

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageLabel}
      headClassName="cafe-capture-head"
      statusRow={captureContext}
      meta={<time className="cafe-capture-date tabular" dateTime={logDate}>{formatWeekdayDayMonth(logDate)}</time>}
      state={state}
    >
      <div ref={captureRootRef} className="kl-page cwl-page kl-capture-content kl-capture-wide cafe-capture-content">
        <div className="kl-capture-main">
        <RouteLeaveGuard when={remaining.length > 0 || invalidQuantityCount > 0} message={t('kitchen.log.leave.confirm')} />
        {!isOnline && <div role="alert" className="kl-banner kl-banner-offline">{t('kitchen.log.offline.banner')}</div>}

        {loadState === 'loading' && <LoadingShell />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={retryLoad}
            retryLabel={t('common.retry')}
          />
        )}

        {loadState === 'ready' && !stream && (
          <EmptyState
            variant="next-step"
            title={t('kitchen.waste.noStream.title')}
            copy={t('kitchen.waste.noStream.copy')}
          >
            <CafeStreamChoices
              options={locationStreams}
              homeStream={homeStream}
              myStreamKeys={myStreamKeys}
              onChoose={selectStream}
              disabled={submitting}
            />
          </EmptyState>
        )}

        {loadState === 'ready' && stream && (
          <>
            <div className="kl-banner cwl-held" role="status">
              {t('kitchen.waste.held')}
            </div>
            {restoreAnnouncement && (
              <p className="sr-only" role="status" aria-live="polite">{restoreAnnouncement}</p>
            )}
            {canCapture && restoredDraft && localDraftEntries.length > 0 && restoredDraftInfo && (
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
                          <span className="sr-only">{t('cafe.captureDraft.details')}</span>
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
                                ? `${item.kind} - ${item.name}`
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
            <p id="cafe-waste-photo-guidance" className="cwl-help">{t('kitchen.waste.help')}</p>
            {!canCapture && <p className="kl-banner cwl-read-only" role="status">{t('kitchen.waste.readOnly')}</p>}
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
            {businessUnitId && canCapture && (
              <ReportMissingItem stream={stream} streamLabel={streamLabel(t, stream)} />
            )}

            {items.length === 0 ? (
              <CafeItemsEmptyState stream={stream} esbItemCount={esbItemCount} />
            ) : (
              <>
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
                />
                <CafeCaptureTable
                    rows={visibleItems}
                    groups={groups}
                    renderControls={renderControls}
                    renderFeedback={isDesktop ? renderQuantityError : undefined}
                    renderItemDetails={renderEvidence}
                    renderCardDetails={renderEvidence}
                    showCategory={hasMixedCategories}
                    className="cwl-list"
                    isDesktop={isDesktop}
                    state={visibleItems.length > 0 ? 'ready' : 'empty'}
                    emptyLabel={t('kitchen.filter.noMatch')}
                    caption={t('kitchen.waste.tableCaption')}
                    quantityHeader={t('kitchen.waste.quantity')}
                />
              </>
            )}

            <div className="kl-footer cwl-footer cafe-capture-footer">
              {submitError && (
                <p role="alert" className="kl-submit-outcome kl-submit-outcome--error">{t('kitchen.waste.submitFailed')}</p>
              )}
              {submittedCount > 0 && !allSubmitted && (
                <p role="status" className="kl-submit-outcome">{t('kitchen.waste.partial', { submitted: submittedCount, total: staged.length })}</p>
              )}
              {allSubmitted && (
                <p role="status" aria-live="polite" className="kl-submit-outcome kl-submit-outcome--success">
                  {t(staged.length === 1 ? 'kitchen.waste.success.one' : 'kitchen.waste.success.other', { count: staged.length })}
                </p>
              )}
              {!allPhotosReady && !allSubmitted && staged.length > 0 && (
                <p className="kl-submit-reason">{t('kitchen.waste.photoRequired')}</p>
              )}
              {!allSubmitted && staged.length === 0 && (
                <p className="kl-submit-reason">{t('kitchen.waste.noItems')}</p>
              )}
              <div className="kl-footer-count-row">
                <div className="kl-tally" aria-live="polite">
                  <span className="kl-tally-num tabular">
                    {t(staged.length === 1 ? 'kitchen.waste.footer.count.one' : 'kitchen.waste.footer.count.other', { count: staged.length })}
                  </span>
                </div>
              </div>
              {invalidQuantityCount > 0 && (
                <p className="kl-submit-reason" role="status" aria-live="polite">
                  <button type="button" className="kl-submit-reason kl-note-pointer" onClick={focusFirstInvalidQuantity}>
                    {t(invalidQuantityCount === 1 ? 'quantityField.fixing.one' : 'quantityField.fixing.other', { count: invalidQuantityCount })}
                  </button>
                </p>
              )}
              {allSubmitted ? (
                <button type="button" className="btn btn-outline" onClick={startAnotherLog}>
                  {t('kitchen.waste.newLog')}
                </button>
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
            </div>
          </>
        )}
        </div>
        {isWide && loadState === 'ready' && stream && items.length > 0 && (
          <aside className="kl-capture-summary cwl-summary" aria-label={t('kitchen.log.summary.captureAria')}>
            <h2>{t('kitchen.log.summary.captureTitle')}</h2>
            <h3>{t('kitchen.log.summary.entered')}</h3>
            {stagedSummary.length === 0 ? (
              <p className="kl-capture-summary__empty">{t('kitchen.log.summary.draftEmpty')}</p>
            ) : (
              <ul className="kl-capture-summary__lines" aria-live="polite">
                {stagedSummary.map(line => (
                  <li key={line.id}>
                    <span>{line.name}</span>
                    <strong className="tabular">{formatWasteQty(line.quantity)} {line.unit}</strong>
                    {line.logDate && <small>{t('kitchen.waste.capturedOn', { date: formatDayMonthYear(line.logDate) })}</small>}
                    {line.submitted && <em>{t('kitchen.waste.itemSubmitted')}</em>}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
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
    </PageFamilyFrame>
  )
}

function WasteItemControls({
  item,
  entry,
  canCapture,
  isOnline,
  disabled,
  onQuantityChange,
  onQuantityValidityChange,
  onQuantityErrorVisibilityChange,
  hideQuantityError,
  onUnitChange,
  onPrepare,
}: {
  item: CafeLogItem
  entry: WasteEntry | undefined
  canCapture: boolean
  isOnline: boolean
  disabled: boolean
  onQuantityChange: (quantity: string) => void
  onQuantityValidityChange: (valid: boolean) => void
  onQuantityErrorVisibilityChange: (visible: boolean) => void
  hideQuantityError: boolean
  onUnitChange: (choice: string) => void
  onPrepare: () => void
}) {
  const t = useT()
  const inputId = `cafe-waste-qty-${item.id}`
  const unitId = `cafe-waste-unit-${item.id}`
  const current = entry ?? createWasteEntry(item)
  const selectedUnit = item.units.find(unit => unit.id === item.defaultUnit.id)
    ?? { ...item.defaultUnit, isDefault: true, labelOrdinal: null, labelCount: 1 }
  const selectedUnitLabel = wasteEntryUnitLabel(item, current, t)
  const historicalUnit = Boolean(entry?.capturedUnitName
    && !item.units.some(unit => unit.id === current.unitId))
  const showUnitPicker = item.multiples.length > 0 || historicalUnit
  const selectedChoice = current.unitFactor !== 1
    ? `multiple:${String(current.unitFactor)}`
    : current.unitId
  const locked = Boolean(current.logId || current.preparing || current.submitted)
  const quantity = quantityValue(current.quantity)
  const editable = canCapture && isOnline && !disabled && !locked
  return (
    <div className="cwl-controls">
      <label className="sr-only" htmlFor={inputId}>
        {t('kitchen.waste.quantityFor', { item: item.name })}
      </label>
      <div className="cwl-quantity-row">
        <QuantityField
          id={inputId}
          label={t('kitchen.waste.quantityFor', { item: item.name })}
          className="cwl-quantity-input cafe-capture-quantity-field tabular"
          value={quantity ?? 0}
          onChange={next => onQuantityChange(next > 0 ? String(next) : '')}
          onInvalid={(_reason, raw) => onQuantityChange(raw)}
          onValidityChange={onQuantityValidityChange}
          onErrorVisibilityChange={onQuantityErrorVisibilityChange}
          hideError={hideQuantityError}
          errorMessageId={`${inputId}-quantity-error`}
          initialDraft={quantity === null && current.quantity !== '' ? current.quantity : undefined}
          suffixPosition="inline"
          suffix={showUnitPicker ? (
            <>
              <Select
                id={unitId}
                className="cwl-unit-select cafe-capture-unit"
                contentClassName="cwl-unit-menu"
                aria-label={t('kitchen.waste.unitFor', { item: item.name })}
                aria-describedby={`cafe-waste-selected-unit-${item.id}`}
                title={selectedUnitLabel}
                value={selectedChoice}
                disabled={!editable}
                onChange={event => onUnitChange(event.target.value)}
              >
                {historicalUnit && <option value={current.unitId}>{entry?.capturedUnitName}</option>}
                <option value={item.defaultUnit.id}>{displayUnit(selectedUnit, t)} · {t('cafe.items.defaultTag')}</option>
                {item.multiples.map(factor => (
                  <option key={`multiple:${factor}`} value={`multiple:${String(factor)}`}>
                    {formatUnitMultiple(factor, item.defaultUnit.name, document.documentElement.lang || undefined)}
                  </option>
                ))}
              </Select>
              <span id={`cafe-waste-selected-unit-${item.id}`} className="sr-only">{selectedUnitLabel}</span>
            </>
          ) : (
            <span className="cwl-unit-label cafe-capture-unit cafe-capture-unit-label" aria-label={t('kitchen.waste.unitFor', { item: item.name })} title={selectedUnitLabel}>
              {selectedUnitLabel}
            </span>
          )}
          maxIntegerDigits={10}
          maxFractionDigits={2}
          min={0}
          disabled={!editable}
          errorClassName="cwl-field-error"
        />

      </div>
      {current.error && <span className="cwl-field-error" role="alert">{current.error}</span>}
      {current.logId && !current.submitted && (
        <p className="cwl-lock-note">
          {current.capturedLogDate
            ? t('kitchen.waste.capturedOn', { date: formatDayMonthYear(current.capturedLogDate) })
            : t('kitchen.waste.entryLocked')}
        </p>
      )}
      {current.submitted ? (
        <p className="cwl-submitted" role="status">{t('kitchen.waste.itemSubmitted')}</p>
      ) : (
        <button
          type="button"
          className="btn btn-outline cwl-add-photo cafe-capture-action"
          aria-describedby="cafe-waste-photo-guidance"
          disabled={!canCapture || !isOnline || disabled || current.preparing || Boolean(current.logId) || quantity === null}
          onClick={onPrepare}
        >
          {current.preparing ? t('common.working') : t('kitchen.waste.addPhoto')}
        </button>
      )}
    </div>
  )
}
