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
import { wibToday } from '@/lib/db/cafe-opening'
import { formatDayMonthYear, formatWeekdayDayMonth } from '@/lib/format/date'
import { useSearchParamReset, useSearchParamState } from '@/lib/use-search-param-state'
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
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { Select } from '@/components/ui/select'
import { QuantityField } from '@/components/ui/quantity-field'
import { parseQuantityInput } from '@/lib/quantity-parser'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import './kitchen-log-page.css'
import './cafe-waste-page.css'

type CafeLogItem = NonNullable<ReturnType<typeof toCafeLogItem>>

type WasteEntry = {
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

function quantityValue(raw: string): number | null {
  const parsed = parseQuantityInput(raw, {
    min: 0,
    maxIntegerDigits: 10,
    maxFractionDigits: 2,
  })
  return parsed.kind === 'valid' && parsed.value > 0 ? parsed.value : null
}

function initialEntries(items: readonly CafeLogItem[]): Record<string, WasteEntry> {
  return Object.fromEntries(items.map(item => [item.id, {
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
  }]))
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
  const [focusInvalidId, setFocusInvalidId] = useState<string | null>(null)
  const [resumableDrafts, setResumableDrafts] = useState<KitchenWasteDraft[]>([])
  const [submitError, setSubmitError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const readGeneration = useRef(0)
  const draftRequests = useRef(new Set<string>())

  const [search, setSearch] = useSearchParamState('q', '')
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')
  const resetSearchFilters = useSearchParamReset(['q', 'kind', 'category'])
  // Kind/category controls remain visible on phone, including for receiving-only streams, so
  // their URL-backed values must filter the compact list just as they do on desktop.
  const effectiveKind: KitchenItemKindFilter = kindFilter === 'WIP' || kindFilter === 'RAW' ? kindFilter : 'All'
  const effectiveCategory = category

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
      setEntries(initialEntries(nextItems))
      const offeredItemIds = new Set(nextItems.map(item => item.id))
      setResumableDrafts(drafts.filter(draft => offeredItemIds.has(draft.itemId)))
      setBusinessUnitId(buId)
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== readGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, loadRetry, orgId, personId, stream, stream?.activity, stream?.branch.id])

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
    search,
    kind: effectiveKind,
    category: effectiveCategory,
  })
  const visibleItems = itemTable.getFilteredRowModel().rows.map(row => row.original)
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
    patchEntry(item.id, { preparing: true, error: undefined })
    try {
      const logId = await insertKitchenLog({
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
      context={<>
        <span aria-hidden="true">·</span>
        <span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>
      </>}
    />
  )

  const columns: DataTableColumn<WasteRow>[] = [
    {
      key: 'item',
      header: t('kitchen.log.col.item'),
      cardLabel: '',
      render: item => (
        <div className="cwl-item-cell">
          <div className="kl-dish">
            <span className="kl-dish-name"><span>{item.kind} - </span><span>{item.name}</span></span>
            {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
          </div>
          {renderEvidence(item)}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: t('kitchen.waste.quantity'),
      numeric: true,
      render: item => (
        <WasteItemControls
          item={item}
          entry={entries[item.id]}
          canCapture={canCapture}
          isOnline={isOnline}
          disabled={submitting || loadState !== 'ready'}
          onQuantityChange={value => patchEntry(item.id, { quantity: value, error: undefined })}
          onQuantityValidityChange={valid => reportQuantityValidity(item.id, valid)}
          onUnitChange={choice => changeWasteEntryUnit(item, choice)}
          onPrepare={() => void prepareEntry(item)}
        />
      ),
    },
  ]

  const renderCard = (item: WasteRow) => (
    <div className="cwl-capture-row" role="group" aria-labelledby={`cafe-waste-item-${item.id}`}>
      <div className="cwl-capture-row__item">
        <div className="kl-dish">
          <span id={`cafe-waste-item-${item.id}`} className="kl-dish-name"><span>{item.kind} - </span><span>{item.name}</span></span>
          {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
        </div>
      </div>
      <div className="cwl-capture-row__controls">
        <WasteItemControls
          item={item}
          entry={entries[item.id]}
          canCapture={canCapture}
          isOnline={isOnline}
          disabled={submitting || loadState !== 'ready'}
          onQuantityChange={value => patchEntry(item.id, { quantity: value, error: undefined })}
          onQuantityValidityChange={valid => reportQuantityValidity(item.id, valid)}
          onUnitChange={choice => changeWasteEntryUnit(item, choice)}
          onPrepare={() => void prepareEntry(item)}
        />
      </div>
      <div className="cwl-capture-row__evidence">{renderEvidence(item)}</div>
    </div>
  )

  const state = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting ? 'saving' : allSubmitted ? 'saved' : !canCapture ? 'read-only' : 'default'

  const captureContext = (
    <div className="cafe-capture-context">
      {streamPicker}
      {stream === null && <span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>}
    </div>
  )

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageLabel}
      headClassName="cafe-capture-head"
      statusRow={captureContext}
      state={state}
    >
      <div className="kl-page cwl-page kl-capture-wide cafe-capture-content">
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
            <p className="cwl-help">{t('kitchen.waste.help')}</p>
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
                  search={search}
                  onSearchChange={setSearch}
                  kinds={WASTE_KIND_OPTIONS}
                  kind={kindFilter as KitchenItemKindFilter}
                  kindId="cafe-waste-kind"
                  onKindChange={setKindFilter}
                  categories={categories}
                  categoryId="cafe-waste-category"
                  categoryLabel={value => kitchenCategoryLabel(t, value)}
                  category={category}
                  onCategoryChange={setCategory}
                  searchPlaceholder={t('kitchen.log.searchPlaceholder')}
                  ariaLabel={t('kitchen.log.toolbarAria')}
                />
                <div className="cwl-list">
                  <DataTable
                    columns={columns}
                    rows={visibleItems}
                    groups={groups}
                    renderCard={renderCard}
                    isDesktop={isDesktop}
                    state={visibleItems.length > 0 ? 'ready' : 'empty'}
                    emptyLabel={t('kitchen.filter.noMatch')}
                    caption={t('kitchen.waste.tableCaption')}
                  />
                </div>
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
  onUnitChange: (choice: string) => void
  onPrepare: () => void
}) {
  const t = useT()
  const inputId = `cafe-waste-qty-${item.id}`
  const unitId = `cafe-waste-unit-${item.id}`
  const current: WasteEntry = entry ?? {
    quantity: '', unitId: item.defaultUnit.id, unitFactor: 1, unitBasisKnown: true,
    capturedUnitName: item.defaultUnit.name, photoReady: false, photoWindowExpired: false,
    preparing: false, submitted: false, photos: [],
  }
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
  const needsQuantity = editable && quantity === null
  const photoHintId = `cafe-waste-photo-hint-${item.id}`

  return (
    <div className="cwl-controls">
      <label className="sr-only" htmlFor={inputId}>
        {t('kitchen.waste.quantityFor', { item: item.name })}
      </label>
      <div className="cwl-quantity-row">
        <QuantityField
          id={inputId}
          label={t('kitchen.waste.quantityFor', { item: item.name })}
          className="cwl-quantity-input tabular"
          value={quantity ?? 0}
          onChange={next => onQuantityChange(next > 0 ? String(next) : '')}
          onInvalid={(_reason, raw) => onQuantityChange(raw)}
          onValidityChange={onQuantityValidityChange}
          initialDraft={quantity === null && current.quantity !== '' ? current.quantity : undefined}
          suffixPosition="below"
          suffix={showUnitPicker ? (
            <Select
              id={unitId}
              className="cwl-unit-select"
              aria-label={t('kitchen.waste.unitFor', { item: item.name })}
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
          ) : (
            <span className="cwl-unit-label" aria-label={t('kitchen.waste.unitFor', { item: item.name })}>
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
          className="btn btn-outline cwl-add-photo"
          aria-describedby={needsQuantity ? photoHintId : undefined}
          disabled={!canCapture || !isOnline || disabled || current.preparing || Boolean(current.logId) || quantity === null}
          onClick={onPrepare}
        >
          {current.preparing ? t('common.working') : t('kitchen.waste.addPhoto')}
        </button>
      )}
      {needsQuantity && (
        <p id={photoHintId} className="cwl-photo-hint">{t('kitchen.waste.quantityBeforePhoto')}</p>
      )}
    </div>
  )
}
