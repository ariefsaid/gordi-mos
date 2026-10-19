import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { LocationLineField } from '@/components/preview/location-preview-fields'
import { CaptureQuantityControl, CaptureRow, CaptureTable, type CaptureGroup } from '@/components/kitchen/capture-row'
import { ActionBar } from '@/components/ui/action-bar'
import { CafeCountSheet, type CafeCountSection } from '@/components/cafe/redesign/cafe-count-sheet'
import { Notice } from '@/components/ui/notice'
import '@/components/ui/Disclosure.css'
import '@/components/cafe/redesign/cafe-count-sheet.css'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { QuantityFieldError } from '@/components/ui/quantity-field'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { CafeCountFollowUp } from '@/components/kitchen/cafe-count-followup'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DateField } from '@/components/ui/date-field'
import { Select } from '@/components/ui/select'
import { cafeReceiptArrivalDateBounds } from '@/lib/db/cafe-receipts'
import { addDays } from '@/lib/cafe-records/period'
import { listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { clearCafeCaptureDraft, readCafeCaptureDraft, writeCafeCaptureDraft, type CafeCaptureDraftScope } from '@/lib/cafe-capture-storage'
import { formatUnitMultiple, toDefaultUnitQuantity } from '@/lib/cafe-unit-multiples'
import { streamLabel } from '@/lib/kitchen-action-label'
import type { KitchenItemKindFilter } from '@/lib/kitchen-item-list'
import {
  listCafeCountCountedElsewhere,
  listCafeCountExcludedItems,
  listCafeCountFloorLines,
  listCafeCountableItems,
  newCafeCountClientKey,
  normalizeCafeCountQuantity,
  parseCafeCountQuantity,
  submitCafeCounts,
  type CafeCountableItem,
  type CafeCountFloorLine,
} from '@/lib/db/cafe-count'
import { wibToday } from '@/lib/db/cafe-opening'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { useCafeStreamBootstrap } from '@/lib/use-cafe-stream-bootstrap'
import { useStockComparisonLink } from '@/lib/cafe-stock-comparison-access'
import { useCafeLocationChoices } from '@/lib/use-cafe-location-choices'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { useIsOffline } from '@/shell/use-is-offline'

type CountEntry = {
  quantity: string
  clientKey: string
  /** The manager multiple the quantity is typed in; absent means the default unit. */
  unitFactor?: number
  changingUnit?: boolean
  outcome?: 'submitted' | 'existing'
  refusal?: string
  storage_location_id?: string | null
}
type LoadState = 'loading' | 'ready' | 'error'

function makeEntries(items: readonly CafeCountableItem[]): Record<string, CountEntry> {
  return Object.fromEntries(items.map(item => [item.id, {
    quantity: '',
    clientKey: newCafeCountClientKey(),
  }]))
}

function refusalText(reason: string | undefined, t: ReturnType<typeof useT>): string {
  switch (reason) {
    case 'already_counted': return t('cafe.count.refused.alreadyCounted')
    case 'item_not_countable': return t('cafe.count.refused.itemUnavailable')
    case 'client_key_conflict': return t('cafe.count.refused.retryConflict')
    case 'invalid_quantity':
    case 'invalid_quantity_or_item': return t('cafe.count.quantityInvalid')
    default: return t('cafe.count.refused.generic')
  }
}

/** What a count draft keeps on the device: the unsent quantity, its key and unit per item. */
type CountDraft = { entries: Record<string, { quantity: string; clientKey: string; unitFactor?: number }> }

function restoreEntries(items: readonly CafeCountableItem[], draft: CountDraft | null): Record<string, CountEntry> {
  const entries = makeEntries(items)
  for (const item of items) {
    const saved = draft?.entries?.[item.id]
    if (saved && typeof saved.quantity === 'string' && typeof saved.clientKey === 'string') {
      entries[item.id] = { quantity: saved.quantity, clientKey: saved.clientKey, ...(typeof saved.unitFactor === 'number' ? { unitFactor: saved.unitFactor } : {}) }
    }
  }
  return entries
}

const KIND_FILTERS: readonly KitchenItemKindFilter[] = ['All', 'RAW', 'WIP']

function byItem(lines: readonly CafeCountFloorLine[]): Record<string, CafeCountFloorLine> {
  return Object.fromEntries(lines.map(line => [line.itemId, line]))
}

export function CafeCountPage() {
  const t = useT()
  const auth = useAuth()
  const cafeStream = useCafeStream()
  const { options: streamOptions, stream, homeStream, myStreamKeys, setStream, branchId } = cafeStream
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({
    affiliated: auth.viewer.affiliated,
    accessRoles: auth.viewer.accessRoles,
  })
  const comparisonHref = useStockComparisonLink(stream, myStreamKeys)
  const locationChoices = useCafeLocationChoices(stream)
  const storageLocations = locationChoices.locations.filter(location => location.use === 'storage' || location.use === 'both')
  const defaultStorageLocationId = locationChoices.status === 'ready'
    && storageLocations.some(location => location.id === locationChoices.defaults?.storage_location_id)
    ? locationChoices.defaults?.storage_location_id ?? null
    : null
  const today = useMemo(() => wibToday(), [])
  const canBackdate = auth.status === 'authenticated'
    && (auth.viewer.accessRoles.includes('ops_lead') || auth.viewer.accessRoles.includes('admin'))
  const canSeeExcluded = auth.status === 'authenticated' && (canBackdate || auth.viewer.accessRoles.includes('supervisor'))
  // The server takes a back-dated count at most 7 days old.
  const dateBounds = canBackdate ? { min: addDays(today, -7), max: today } : cafeReceiptArrivalDateBounds(today, false)
  const [logDate, setLogDate] = useState(today)
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : null
  const personId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const draftScope = useMemo<CafeCaptureDraftScope | null>(() => orgId && personId && stream ? {
    orgId, personId, form: 'count', branchId: stream.branch.id, activity: stream.activity, logDate,
  } : null, [orgId, personId, stream, logDate])
  const draftKey = draftScope ? JSON.stringify(draftScope) : null
  // The scope whose stored draft is loaded into entries; saving waits for it so a switch never overwrites.
  const [hydratedKey, setHydratedKey] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set())
  const toggleSection = (key: string) => setCollapsedSections(current => {
    const next = new Set(current)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const { catalogReady, setCatalogReady } = useCafeStreamBootstrap(cafeStream, retryKey, setLoadState)
  const [items, setItems] = useState<CafeCountableItem[]>([])
  const [entries, setEntries] = useState<Record<string, CountEntry>>({})
  // Today's submitted lines of this stream by item, as floor-safe states.
  const [floorLines, setFloorLines] = useState<Record<string, CafeCountFloorLine>>({})
  const [elsewhere, setElsewhere] = useState<Record<string, { activity: ProductionStream['activity']; submittedAt: string }>>({})
  const [multiples, setMultiples] = useState<Record<string, number[]>>({})
  const [excluded, setExcluded] = useState<string[]>([])
  const [kindFilter, setKindFilter] = useState<KitchenItemKindFilter>('All')
  const [category, setCategory] = useState('All')
  const [notCountedOnly, setNotCountedOnly] = useState(false)
  const [pendingStream, setPendingStream] = useState<ProductionStream | null>(null)
  const [search, setSearch] = useSearchParamState('q', '')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const isOnline = !useIsOffline()
  const requestGeneration = useRef(0)

  useEffect(() => {
    if (!catalogReady) return
    const generation = ++requestGeneration.current
    let active = true
    setItems([])
    setEntries({})
    setFloorLines({})
    setElsewhere({})
    setExcluded([])
    setHydratedKey(null)
    setSubmitError(false)
    setLoadState('loading')
    if (!stream || !canCapture) {
      setLoadState('ready')
      return () => { active = false }
    }
    void Promise.all([
      listCafeCountableItems(stream),
      listCafeCountFloorLines(stream, logDate),
      listCafeCountCountedElsewhere(stream, logDate),
      // Multiples and the excluded list only add choices and notes; the count works without them.
      listCafeItemSettings(stream).catch(() => []),
      canSeeExcluded ? listCafeCountExcludedItems(stream).catch(() => []) : Promise.resolve([]),
    ]).then(([nextItems, nextLines, nextElsewhere, settings, nextExcluded]) => {
      if (!active || generation !== requestGeneration.current) return
      setItems(nextItems)
      setEntries(restoreEntries(nextItems, draftScope ? readCafeCaptureDraft<CountDraft>(draftScope)?.value ?? null : null))
      setHydratedKey(draftKey)
      setFloorLines(byItem(nextLines))
      setElsewhere(nextElsewhere)
      setMultiples(Object.fromEntries(settings.map(setting => [setting.id, setting.unitMultiples ?? []])))
      setExcluded(nextExcluded)
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== requestGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
    // draftScope follows stream and logDate, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCapture, canSeeExcluded, catalogReady, logDate, retryKey, stream, stream?.activity, stream?.branch.id])

  // FR-011: unsent entries stay on this device per person, stream and date until submitted or discarded.
  useEffect(() => {
    if (!draftScope || hydratedKey !== draftKey) return
    const unsent = Object.fromEntries(Object.entries(entries).flatMap(([itemId, entry]) => entry.quantity.trim() && !entry.outcome
      ? [[itemId, { quantity: entry.quantity, clientKey: entry.clientKey, ...(entry.unitFactor ? { unitFactor: entry.unitFactor } : {}) }]]
      : []))
    if (Object.keys(unsent).length === 0) clearCafeCaptureDraft(draftScope)
    else writeCafeCaptureDraft<CountDraft>(draftScope, { entries: unsent })
  }, [draftKey, draftScope, entries, hydratedKey])

  const entered = items.flatMap(item => {
    const entry = entries[item.id]
    if (!entry || !entry.quantity.trim() || entry.outcome || floorLines[item.id] || elsewhere[item.id]) return []
    const quantity = normalizeCafeCountQuantity(entry.quantity)
    return quantity === null ? [] : [{ item, entry, quantity }]
  })
  const enteredCount = entered.length
  const submittedCount = items.filter(item => entries[item.id]?.outcome).length
  const refusedCount = items.filter(item => entries[item.id]?.refusal).length
  const isCounted = useCallback((item: CafeCountableItem) => Boolean(floorLines[item.id] || elsewhere[item.id] || entries[item.id]?.outcome
    || normalizeCafeCountQuantity(entries[item.id]?.quantity ?? '') !== null), [elsewhere, entries, floorLines])
  const countedCount = items.filter(isCounted).length
  const categories = ['All', ...[...new Set(items.map(item => item.category?.trim()).filter((value): value is string => Boolean(value)))].sort()]
  const sections = useMemo<CafeCountSection[]>(() => {
    const grouped = new Map<string, CafeCountSection>()
    const needle = search.trim().toLocaleLowerCase()
    for (const item of items) {
      if (needle && !item.name.toLocaleLowerCase().includes(needle)) continue
      if (kindFilter !== 'All' && item.kind !== kindFilter) continue
      if (category !== 'All' && item.category?.trim() !== category) continue
      if (notCountedOnly && isCounted(item)) continue
      const label = item.category?.trim() || item.kind || 'RAW/WIP'
      const key = `${item.category?.trim() ? 'category' : 'kind'}-${label.toLocaleLowerCase()}`
      const section = grouped.get(key) ?? { key, label, rows: [] }
      section.rows.push(item)
      grouped.set(key, section)
    }
    return [...grouped.values()].sort((a, b) => {
      const aFallback = a.key.startsWith('kind-')
      const bFallback = b.key.startsWith('kind-')
      if (aFallback !== bFallback) return aFallback ? 1 : -1
      if (aFallback) return a.label.localeCompare(b.label)
      return a.label.localeCompare(b.label)
    })
    // isCounted is read only while the not-yet-counted filter is on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, kindFilter, category, notCountedOnly])
  // One group needs no header of its own: the list is the group.
  const singleGroup = new Set(items.map(item => item.category?.trim() || item.kind || 'RAW/WIP')).size <= 1
  const mixedKinds = new Set(items.map(item => item.kind)).size > 1
  const groups = useMemo<CaptureGroup<CafeCountableItem>[]>(() => sections.map(section => ({
    key: section.key,
    label: singleGroup ? null : section.key.startsWith('category-') ? kitchenCategoryLabel(t, section.label) : section.label,
    count: `${section.rows.filter(item => entries[item.id]?.quantity.trim()).length} / ${section.rows.length}`,
    rows: section.rows,
    anchorId: `cafe-count-section-${section.key}`,
  })), [sections, singleGroup, entries, t])
  const shownCount = sections.reduce((total, section) => total + section.rows.length, 0)
  const showRowCategory = new Set(items.map(item => item.category?.trim()).filter((category): category is string => Boolean(category))).size > 1
  const invalidCount = items.filter(item => {
    const entry = entries[item.id]
    return Boolean(entry && !entry.outcome && parseCafeCountQuantity(entry.quantity).kind === 'invalid')
  }).length
  const hasSubmitted = items.some(item => Boolean(entries[item.id]?.outcome))
  const hasUnsubmittedInput = items.some(item => Boolean(entries[item.id]?.quantity.trim() && !entries[item.id]?.outcome))

  const patchQuantity = useCallback((itemId: string, quantity: string) => {
    setEntries(current => {
      const entry = current[itemId]
      return entry ? { ...current, [itemId]: { ...entry, quantity, refusal: undefined } } : current
    })
  }, [])

  // Unsent entries stay saved for their own stream and date, but a switch with any asks first.
  const chooseStream = useCallback((next: ProductionStream) => {
    if (submitting) return
    if (hasUnsubmittedInput) setPendingStream(next)
    else setStream(next)
  }, [hasUnsubmittedInput, setStream, submitting])

  function discardEntries() {
    if (draftScope) clearCafeCaptureDraft(draftScope)
    setEntries(current => Object.fromEntries(Object.entries(current).map(([itemId, entry]) => [itemId,
      entry.outcome ? entry : { quantity: '', clientKey: newCafeCountClientKey() }])))
  }

  async function handleSubmit() {
    if (!stream || !canCapture || !isOnline || submitting || entered.length === 0) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      const outcomes = await submitCafeCounts(stream, entered.map(({ item, entry, quantity }) => ({
        client_key: entry.clientKey,
        item_id: item.id,
        quantity,
        ...(entry.unitFactor ? { unit_factor: entry.unitFactor } : {}),
        ...((entry.storage_location_id === undefined ? defaultStorageLocationId : entry.storage_location_id)
          ? { storage_location_id: entry.storage_location_id === undefined ? defaultStorageLocationId : entry.storage_location_id }
          : {}),
      })), logDate)
      const outcomeByKey = new Map(outcomes.map(outcome => [outcome.client_key, outcome]))
      setEntries(current => {
        const next = { ...current }
        for (const line of entered) {
          const outcome = outcomeByKey.get(line.entry.clientKey)
          if (!outcome) {
            next[line.item.id] = { ...line.entry, refusal: 'unknown' }
          } else if (outcome.outcome === 'refused') {
            next[line.item.id] = { ...line.entry, refusal: outcome.reason ?? 'unknown' }
          } else {
            next[line.item.id] = { ...line.entry, outcome: outcome.outcome, refusal: undefined }
          }
        }
        return next
      })
      void listCafeCountFloorLines(stream, logDate).then(lines => setFloorLines(byItem(lines))).catch(() => undefined)
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  function retryLoad() {
    setCatalogReady(false)
    setRetryKey(value => value + 1)
  }

  const streamBar = {
    options: streamOptions,
    locationBranchId: branchId ?? undefined,
    stream,
    homeStream,
    myStreamKeys,
    onChange: chooseStream,
    disabled: submitting,
  }
  const pageState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting ? 'saving' : hasSubmitted && entered.length === 0 && !hasUnsubmittedInput ? 'saved' : 'default'

  return (
    <CafePageFrame page="count" date={logDate} streamBar={streamBar} state={pageState} comparisonHref={comparisonHref}
      recordsHref={recordsHref({ question: 'counted', reading: 'entries', from: logDate, to: logDate, stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null, today: logDate })}>
      <div className="cafe-capture-page cafe-count">
        <RouteLeaveGuard when={hasUnsubmittedInput} message={t('kitchen.log.leave.confirm')} />
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={retryLoad}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <CafeStreamChoices
            options={streamOptions}
            homeStream={homeStream}
            myStreamKeys={myStreamKeys}
            onChoose={chooseStream}
            disabled={submitting}
          />
        )}
        {loadState === 'ready' && stream && !canCapture && (
          <Notice tone="info">{t('cafe.count.readOnly')}</Notice>
        )}
        {loadState === 'ready' && stream && canCapture && (
          <>
            <p className="cafe-count__intro">{t('cafe.count.blindShort')}</p>
            <div className="cafe-count__date">
              <label htmlFor="cafe-count-date">{t('cafe.count.date')}</label>
              <DateField id="cafe-count-date" value={logDate} min={dateBounds.min} max={dateBounds.max} required disabled={submitting}
                onChange={value => setLogDate(value || today)} />
            </div>
            {canSeeExcluded && excluded.length > 0 && <Notice tone="info">
              {t(excluded.length === 1 ? 'cafe.count.excluded.one' : 'cafe.count.excluded.other', { count: excluded.length, items: excluded.join(', ') })}
            </Notice>}
            {items.length === 0 ? (
              <CafeItemsEmptyState stream={stream} requiresStockUnit />
            ) : (
              <>
                <KitchenToolbar
                  search={search}
                  onSearchChange={setSearch}
                  searchPlaceholder={t('kitchen.log.searchPlaceholder')}
                  ariaLabel={t('kitchen.log.toolbarAria')}
                  resultCount={{ shown: shownCount, total: items.length }}
                  sortLabel={t('cafe.toolbar.sorted.az')}
                  filtersPanel={{ label: t('cafe.toolbar.filters'), summary: [
                    kindFilter === 'All' ? t('kitchen.filter.kind.all') : kindFilter,
                    category === 'All' ? t('kitchen.filter.all') : kitchenCategoryLabel(t, category),
                    notCountedOnly ? t('cafe.count.filter.notCounted') : t('cafe.count.filter.all'),
                  ].join(' · ') }}
                  kinds={KIND_FILTERS}
                  kind={kindFilter}
                  kindId="cafe-count-kind"
                  onKindChange={setKindFilter}
                  categories={categories.length > 2 ? categories : undefined}
                  category={category}
                  categoryId="cafe-count-category"
                  categoryLabel={value => kitchenCategoryLabel(t, value)}
                  onCategoryChange={setCategory}
                  trailing={<Select id="cafe-count-show" label={t('cafe.count.filter.label')} value={notCountedOnly ? 'not-counted' : 'all'}
                    onChange={event => setNotCountedOnly(event.target.value === 'not-counted')}>
                    <option value="all">{t('cafe.count.filter.all')}</option>
                    <option value="not-counted">{t('cafe.count.filter.notCounted')}</option>
                  </Select>}
                />
                <CafeCountSheet sections={sections} caption={t('cafe.count.listAria')} sectionLabel={t('cafe.count.sections')}>
                  <CaptureTable
                    caption={t('cafe.count.listAria')}
                    columns={{ item: t('kitchen.log.col.item'), itemSort: 'asc', controls: [{ label: t('cafe.count.quantityHeader') }] }}
                    groups={groups}
                    collapsedGroupKeys={collapsedSections}
                    onToggleGroup={toggleSection}
                    state={shownCount > 0 ? 'ready' : 'empty'}
                    emptyLabel={<CafeNoMatch bare onClear={() => setSearch('')} />}
                    renderRow={item => {
                      const entry = entries[item.id]
                      const line = floorLines[item.id]
                      const other = elsewhere[item.id]
                      const locked = Boolean(line || other)
                      const itemMultiples = multiples[item.id] ?? []
                      const units = itemMultiples.length > 0 ? [{ id: '1', name: item.unitName }, ...itemMultiples.map(factor => ({ id: String(factor), name: formatUnitMultiple(factor, item.unitName, document.documentElement.lang || 'en') }))] : undefined
                      const typedQuantity = normalizeCafeCountQuantity(entry?.quantity ?? '')
                      const parsed = parseCafeCountQuantity(entry?.quantity ?? '')
                      const invalid = parsed.kind === 'invalid'
                      const errorId = `cafe-count-${item.id}-quantity-error`
                      return <CaptureRow
                        id={item.id}
                        name={item.name}
                        kind={mixedKinds ? item.kind : null}
                        category={showRowCategory ? item.category : null}
                        controls={[{ node: <CaptureQuantityControl
                          id={`cafe-count-${item.id}`}
                          itemName={item.name}
                          quantityFor={t('cafe.count.quantityAccessibleName', { item: item.name, unit: item.unitName })}
                          value={locked && !entry?.outcome ? '' : entry?.quantity ?? ''}
                          unitName={entry?.unitFactor ? formatUnitMultiple(entry.unitFactor, item.unitName, document.documentElement.lang || 'en') : item.unitName}
                          invalid={invalid}
                          describedById={invalid ? errorId : undefined}
                          disabled={submitting || Boolean(entry?.outcome) || locked}
                          enterKeyHint="next"
                          units={locked || entry?.outcome ? undefined : units}
                          selectedUnitId={String(entry?.unitFactor ?? 1)}
                          changingUnit={Boolean(entry?.changingUnit)}
                          onToggleUnit={() => setEntries(current => current[item.id] ? { ...current, [item.id]: { ...current[item.id], changingUnit: !current[item.id].changingUnit } } : current)}
                          onUnitChange={unitId => setEntries(current => {
                            const currentEntry = current[item.id]
                            if (!currentEntry) return current
                            return { ...current, [item.id]: { ...currentEntry, changingUnit: false, unitFactor: unitId === '1' ? undefined : Number(unitId) } }
                          })}
                          onQuantityChange={value => patchQuantity(item.id, value)}
                        /> }]}
                        detail={<>
                          {/* Which storage was counted is decided on its own line, once the line has an amount (preview only). */}
                          {Boolean(entry?.quantity?.trim()) && !line && <LocationLineField
                            kind="count"
                            locations={storageLocations}
                            value={entry?.storage_location_id === undefined ? defaultStorageLocationId : entry.storage_location_id}
                            onChange={value => setEntries(current => {
                              const currentEntry = current[item.id]
                              return currentEntry ? { ...current, [item.id]: { ...currentEntry, storage_location_id: value } } : current
                            })}
                            loadState={locationChoices.status === 'idle' ? 'loading' : locationChoices.status}
                            onRetry={locationChoices.retry}
                            disabled={submitting || Boolean(entry?.outcome)}
                          />}
                          {other && !line && <p className="cafe-count__line-success" role="status">{t('cafe.count.countedElsewhere', {
                            stream: streamLabel(t, { branch: stream.branch, activity: other.activity }),
                            time: new Intl.DateTimeFormat(document.documentElement.lang || 'en', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(other.submittedAt)),
                          })}</p>}
                          {entry?.unitFactor && typedQuantity !== null && !entry.outcome && <p className="cafe-count__line-success">{t('cafe.count.inDefaultUnit', {
                            quantity: String(toDefaultUnitQuantity(Number(typedQuantity), entry.unitFactor)), unit: item.unitName,
                          })}</p>}
                          {invalid && <QuantityFieldError id={errorId} reason={parsed.reason} rawValue={entry?.quantity ?? ''} maxFractionDigits={2} className="cafe-count__field-error" />}
                          {line ? <CafeCountFollowUp line={line} itemName={item.name} unitName={item.unitName} online={isOnline}
                            onSaved={next => setFloorLines(current => ({ ...current, [item.id]: next }))} />
                            : entry?.outcome && <p className="cafe-count__line-success" role="status">{t('cafe.count.lineSubmitted')}</p>}
                          {entry?.refusal && <p className="cafe-count__field-error" role="alert">{refusalText(entry.refusal, t)}</p>}
                        </>}
                      />
                    }}
                  />
                </CafeCountSheet>
                <ActionBar
                  className="cafe-capture-footer"
                  alert={<>
                    {!isOnline && <Notice tone="attention" role="alert">{t('cafe.count.offline')}</Notice>}
                    {submitError && <Notice tone="urgent">{t('cafe.count.submitFailed')}</Notice>}
                  </>}
                  summary={<span className="cafe-count__progress" aria-live="polite">
                    <span>{t('cafe.count.progress.entered', { count: countedCount, eligible: items.length })}</span>
                    <span>{t('cafe.count.progress.submitted', { count: submittedCount })}</span>
                    <span>{t('cafe.count.progress.refused', { count: refusedCount })}</span>
                  </span>}
                  reason={<>
                    {invalidCount > 0 && <span className="cafe-count__fixing" role="status" aria-live="polite">
                      {t(invalidCount === 1 ? 'quantityField.fixing.one' : 'quantityField.fixing.other', { count: invalidCount })}
                    </span>}
                    {hasUnsubmittedInput && <span className="cafe-count__bar-status" role="status">{t('cafe.count.draftSaved')}</span>}
                    {enteredCount === 0 && !submitting && isOnline && items.some(item => !floorLines[item.id] && !elsewhere[item.id]) && <span className="cafe-count__bar-status" role="status">{t('cafe.count.needsEntry')}</span>}
                  </>}
                  secondary={hasUnsubmittedInput && !submitting ? <button type="button" className="btn btn-outline" onClick={discardEntries}>{t('cafe.count.discard')}</button> : undefined}
                  primary={<button type="button" className="btn btn-primary cafe-count__submit"
                    disabled={!canCapture || !isOnline || submitting || entered.length === 0}
                    onClick={() => void handleSubmit()}>
                    {submitting ? t('common.working') : t('cafe.count.submit')}
                  </button>}
                />
              </>
            )}
          </>
        )}
      </div>
      {pendingStream && <ConfirmDialog
        open
        title={t('cafe.count.switch.title')}
        body={t('cafe.count.switch.body', { from: streamLabel(t, stream), to: streamLabel(t, pendingStream) })}
        confirmLabel={t('cafe.count.switch.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => { const next = pendingStream; setPendingStream(null); setStream(next) }}
        onCancel={() => setPendingStream(null)}
      />}
    </CafePageFrame>
  )
}
