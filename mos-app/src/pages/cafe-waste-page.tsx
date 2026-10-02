import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canPushCafe } from '@/lib/kitchen-gates'
import { streamKey } from '@/lib/kitchen-action-label'
import { listCafeLogItems } from '@/lib/db/cafe-item-settings'
import type { CafeLogItem } from '@/lib/db/cafe-item-settings'
import { insertKitchenLog, resolveKitchenBuId } from '@/lib/db/kitchen-logs'
import { submitKitchenWasteLog } from '@/lib/db/kitchen-waste-photos'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { wibToday } from '@/lib/db/cafe-opening'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useSearchParamState } from '@/lib/use-search-param-state'
import {
  useKitchenItemTable,
  kitchenDataTableGroups,
  type KitchenItemKindFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { WastePhotoCapture } from '@/components/kitchen/waste-photo-capture'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import './kitchen-log-page.css'
import './cafe-waste-page.css'

type WasteEntry = {
  quantity: string
  unitId: string
  logId?: string
  photoReady: boolean
  preparing: boolean
  submitted: boolean
  error?: string
}
type WasteRow = KitchenListRow<CafeLogItem>
type PageLoadState = 'loading' | 'ready' | 'error'

const WASTE_KIND_OPTIONS: readonly KitchenItemKindFilter[] = ['All', 'WIP', 'RAW']

function quantityValue(raw: string): number | null {
  if (!raw.trim()) return null
  const quantity = Number(raw.trim().replace(',', '.'))
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

function isInvalidQuantity(raw: string): boolean {
  if (!raw.trim()) return false
  const value = Number(raw.trim().replace(',', '.'))
  return !Number.isFinite(value) || value < 0
}

function initialEntries(items: readonly CafeLogItem[]): Record<string, WasteEntry> {
  return Object.fromEntries(items.map(item => [item.id, {
    quantity: '',
    unitId: item.defaultUnit.id,
    photoReady: false,
    preparing: false,
    submitted: false,
  }]))
}

function displayUnit(unit: CafeLogItem['units'][number], t: ReturnType<typeof useT>): string {
  return unit.labelOrdinal === null
    ? unit.name
    : t('cafe.items.unitDisambiguated', { name: unit.name, number: unit.labelOrdinal })
}

export function CafeWastePage() {
  const t = useT()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
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
  const { resolve, adopt, setStream } = cafeStream

  const [loadState, setLoadState] = useState<PageLoadState>('loading')
  const [loadRetry, setLoadRetry] = useState(0)
  const [catalogReady, setCatalogReady] = useState(false)
  const [items, setItems] = useState<CafeLogItem[]>([])
  const [businessUnitId, setBusinessUnitId] = useState('')
  const [entries, setEntries] = useState<Record<string, WasteEntry>>({})
  const [submitError, setSubmitError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const readGeneration = useRef(0)
  const draftRequests = useRef(new Set<string>())

  const [search, setSearch] = useSearchParamState('q', '')
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // Match the shared capture list: desktop kind/category filters are not silently applied to the
  // compact phone list, even when a viewer arrives through a copied desktop URL.
  const effectiveKind = isDesktop ? kindFilter as KitchenItemKindFilter : 'All'
  const effectiveCategory = isDesktop ? category : 'All'

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
    setBusinessUnitId('')
    if (!stream) {
      setLoadState('ready')
      return () => { active = false }
    }
    void Promise.all([listCafeLogItems(stream), resolveKitchenBuId()]).then(([nextItems, buId]) => {
      if (!active || generation !== readGeneration.current) return
      setItems(nextItems)
      setEntries(initialEntries(nextItems))
      setBusinessUnitId(buId)
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== readGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [catalogReady, loadRetry, stream, stream?.activity, stream?.branch.id])

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
  const groups = kitchenDataTableGroups(itemTable, () => null)
  const staged = items.flatMap(item => {
    const entry = entries[item.id]
    const quantity = quantityValue(entry?.quantity ?? '')
    return entry && quantity !== null ? [{ item, entry, quantity }] : []
  })
  const remaining = staged.filter(line => !line.entry.submitted)
  const allPhotosReady = remaining.length > 0 && remaining.every(line => line.entry.logId && line.entry.photoReady)
  const allSubmitted = staged.length > 0 && remaining.length === 0
  const submittedCount = staged.length - remaining.length
  const hasPendingCapture = staged.length > 0

  const patchEntry = useCallback((itemId: string, patch: Partial<WasteEntry>) => {
    setEntries(current => {
      const entry = current[itemId]
      return entry ? { ...current, [itemId]: { ...entry, ...patch } } : current
    })
  }, [])

  const photoReadyCallbacks = useMemo(() => new Map(items.map(item => [item.id, (ready: boolean) => {
    setEntries(current => {
      const entry = current[item.id]
      return entry ? { ...current, [item.id]: { ...entry, photoReady: ready } } : current
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
        item_unit_id: entry.unitId,
        qty_porsi: quantity,
      })
      patchEntry(item.id, { logId, preparing: false })
    } catch {
      patchEntry(item.id, {
        preparing: false,
        error: t('kitchen.waste.prepareFailed'),
      })
    } finally {
      draftRequests.current.delete(item.id)
    }
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
          {entries[item.id]?.logId && !entries[item.id]?.submitted && (
            <div className="cwl-evidence">
              <WastePhotoCapture
                wasteLogId={entries[item.id]!.logId!}
                onCanSubmitChange={photoReadyCallbacks.get(item.id)}
              />
            </div>
          )}
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
          onUnitChange={unitId => patchEntry(item.id, { unitId, error: undefined })}
          onPrepare={() => void prepareEntry(item)}
        />
      ),
    },
  ]

  const renderCard = (item: WasteRow) => (
    <div className="cwl-card">
      <div className="kl-dish">
        <span className="kl-dish-name"><span>{item.kind} - </span><span>{item.name}</span></span>
        {item.category && <span className="kl-dish-cat">{kitchenCategoryLabel(t, item.category)}</span>}
      </div>
      <WasteItemControls
        item={item}
        entry={entries[item.id]}
        canCapture={canCapture}
        isOnline={isOnline}
        disabled={submitting || loadState !== 'ready'}
        onQuantityChange={value => patchEntry(item.id, { quantity: value, error: undefined })}
        onUnitChange={unitId => patchEntry(item.id, { unitId, error: undefined })}
        onPrepare={() => void prepareEntry(item)}
      />
      {entries[item.id]?.logId && !entries[item.id]?.submitted && (
        <div className="cwl-evidence">
          <WastePhotoCapture
            wasteLogId={entries[item.id]!.logId!}
            onCanSubmitChange={photoReadyCallbacks.get(item.id)}
          />
        </div>
      )}
    </div>
  )

  const pageTitle = `${t('dest.cafe')} · ${pageLabel}`
  const state = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting ? 'saving' : allSubmitted ? 'saved' : !canCapture ? 'read-only' : 'default'

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      statusRow={streamPicker}
      meta={<span className="kl-date tabular">{formatWeekdayDayMonth(logDate)}</span>}
      state={state}
    >
      <div className="kl-page cwl-page">
        <RouteLeaveGuard when={remaining.length > 0} message={t('kitchen.log.leave.confirm')} />
        {!isOnline && <div role="alert" className="kl-banner kl-banner-offline">{t('kitchen.log.offline.banner')}</div>}

        {loadState === 'loading' && <LoadingShell title={pageTitle} />}
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

            {items.length === 0 ? (
              <EmptyState variant="blank" title={t('kitchen.waste.empty.title')} copy={t('kitchen.waste.empty.copy')} />
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

            {items.length > 0 && (
              <div className="kl-footer cwl-footer">
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
                  {allSubmitted ? (
                    <button type="button" className="btn btn-outline" onClick={startAnotherLog}>
                      {t('kitchen.waste.newLog')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canCapture || !isOnline || submitting || !allPhotosReady}
                      onClick={() => void handleSubmit()}
                    >
                      {submitting ? t('common.working') : t('kitchen.waste.submit')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
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
  onUnitChange,
  onPrepare,
}: {
  item: CafeLogItem
  entry: WasteEntry | undefined
  canCapture: boolean
  isOnline: boolean
  disabled: boolean
  onQuantityChange: (quantity: string) => void
  onUnitChange: (unitId: string) => void
  onPrepare: () => void
}) {
  const t = useT()
  const inputId = `cafe-waste-qty-${item.id}`
  const unitId = `cafe-waste-unit-${item.id}`
  const current = entry ?? {
    quantity: '', unitId: item.defaultUnit.id, photoReady: false, preparing: false, submitted: false,
  }
  const selectedUnit = item.units.find(unit => unit.id === current.unitId)
    ?? item.units.find(unit => unit.id === item.defaultUnit.id)
    ?? { ...item.defaultUnit, isDefault: true, labelOrdinal: null, labelCount: 1 }
  const locked = Boolean(current.logId || current.preparing || current.submitted)
  const invalid = isInvalidQuantity(current.quantity)
  const quantity = quantityValue(current.quantity)
  const editable = canCapture && isOnline && !disabled && !locked

  return (
    <div className="cwl-controls">
      <label className="cwl-field-label" htmlFor={inputId}>
        {t('kitchen.waste.quantityFor', { item: item.name })}
      </label>
      <div className="cwl-quantity-row">
        <input
          id={inputId}
          className="cwl-quantity-input tabular"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={current.quantity}
          aria-invalid={invalid || undefined}
          aria-label={t('kitchen.waste.quantityFor', { item: item.name })}
          disabled={!editable}
          onChange={event => onQuantityChange(event.target.value)}
        />
        {item.units.length > 1 ? (
          <Select
            id={unitId}
            className="cwl-unit-select"
            aria-label={t('kitchen.waste.unitFor', { item: item.name })}
            value={current.unitId}
            disabled={!editable}
            onChange={event => onUnitChange(event.target.value)}
          >
            {item.units.map(unit => (
              <option key={unit.id} value={unit.id}>
                {displayUnit(unit, t)}{unit.isDefault ? ` · ${t('cafe.items.defaultTag')}` : ''}
              </option>
            ))}
          </Select>
        ) : (
          <span className="cwl-unit-label" aria-label={t('kitchen.waste.unitFor', { item: item.name })}>
            {displayUnit(selectedUnit, t)}
          </span>
        )}
      </div>
      {invalid && <span className="cwl-field-error" role="alert">{t('kitchen.waste.quantityInvalid')}</span>}
      {current.error && <span className="cwl-field-error" role="alert">{current.error}</span>}
      {current.logId && !current.submitted && <p className="cwl-lock-note">{t('kitchen.waste.entryLocked')}</p>}
      {current.submitted ? (
        <p className="cwl-submitted" role="status">{t('kitchen.waste.itemSubmitted')}</p>
      ) : (
        <button
          type="button"
          className="btn btn-outline cwl-add-photo"
          disabled={!canCapture || !isOnline || disabled || current.preparing || Boolean(current.logId) || quantity === null}
          onClick={onPrepare}
        >
          {current.preparing ? t('common.working') : t('kitchen.waste.addPhoto')}
        </button>
      )}
    </div>
  )
}
