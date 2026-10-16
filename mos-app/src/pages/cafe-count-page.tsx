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
import {
  listCafeCountableItems,
  newCafeCountClientKey,
  normalizeCafeCountQuantity,
  parseCafeCountQuantity,
  submitCafeCounts,
  type CafeCountableItem,
} from '@/lib/db/cafe-count'
import { wibToday } from '@/lib/db/cafe-opening'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { useStockComparisonLink } from '@/lib/cafe-stock-comparison-access'
import { useCafeLocationChoices } from '@/lib/use-cafe-location-choices'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { useIsOffline } from '@/shell/use-is-offline'

type CountEntry = {
  quantity: string
  clientKey: string
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

export function CafeCountPage() {
  const t = useT()
  const auth = useAuth()
  const cafeStream = useCafeStream()
  const { options: streamOptions, stream, homeStream, myStreamKeys, resolve, adopt, setStream, branchId } = cafeStream
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
  const logDate = useMemo(() => wibToday(), [])
  const [catalogReady, setCatalogReady] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set())
  const toggleSection = (key: string) => setCollapsedSections(current => {
    const next = new Set(current)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<CafeCountableItem[]>([])
  const [entries, setEntries] = useState<Record<string, CountEntry>>({})
  const [search, setSearch] = useSearchParamState('q', '')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const isOnline = !useIsOffline()
  const requestGeneration = useRef(0)

  useEffect(() => {
    let active = true
    setCatalogReady(false)
    void resolve().then(catalog => {
      if (!active) return
      adopt(catalog)
      setCatalogReady(true)
    }).catch(() => {
      if (active) setLoadState('error')
    })
    return () => { active = false }
  }, [adopt, resolve, retryKey])

  useEffect(() => {
    if (!catalogReady) return
    const generation = ++requestGeneration.current
    let active = true
    setItems([])
    setEntries({})
    setSubmitError(false)
    setLoadState('loading')
    if (!stream || !canCapture) {
      setLoadState('ready')
      return () => { active = false }
    }
    void listCafeCountableItems(stream).then(nextItems => {
      if (!active || generation !== requestGeneration.current) return
      setItems(nextItems)
      setEntries(makeEntries(nextItems))
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== requestGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, retryKey, stream, stream?.activity, stream?.branch.id])

  const entered = items.flatMap(item => {
    const entry = entries[item.id]
    if (!entry || !entry.quantity.trim() || entry.outcome) return []
    const quantity = normalizeCafeCountQuantity(entry.quantity)
    return quantity === null ? [] : [{ item, entry, quantity }]
  })
  const enteredCount = entered.length
  const submittedCount = items.filter(item => entries[item.id]?.outcome).length
  const refusedCount = items.filter(item => entries[item.id]?.refusal).length
  const sections = useMemo<CafeCountSection[]>(() => {
    const grouped = new Map<string, CafeCountSection>()
    const needle = search.trim().toLocaleLowerCase()
    for (const item of items) {
      if (needle && !item.name.toLocaleLowerCase().includes(needle)) continue
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
  }, [items, search])
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
  const canSwitch = !submitting && !hasUnsubmittedInput

  const patchQuantity = useCallback((itemId: string, quantity: string) => {
    setEntries(current => {
      const entry = current[itemId]
      return entry ? { ...current, [itemId]: { ...entry, quantity, refusal: undefined } } : current
    })
  }, [])

  const chooseStream = useCallback((next: ProductionStream) => {
    if (!canSwitch) return
    setStream(next)
  }, [canSwitch, setStream])

  async function handleSubmit() {
    if (!stream || !canCapture || !isOnline || submitting || entered.length === 0) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      const outcomes = await submitCafeCounts(stream, entered.map(({ item, entry, quantity }) => ({
        client_key: entry.clientKey,
        item_id: item.id,
        quantity,
        ...((entry.storage_location_id === undefined ? defaultStorageLocationId : entry.storage_location_id)
          ? { storage_location_id: entry.storage_location_id === undefined ? defaultStorageLocationId : entry.storage_location_id }
          : {}),
      })))
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
    disabled: !canSwitch,
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
                          value={entry?.quantity ?? ''}
                          unitName={item.unitName}
                          invalid={invalid}
                          describedById={invalid ? errorId : undefined}
                          disabled={submitting || Boolean(entry?.outcome)}
                          enterKeyHint="next"
                          onQuantityChange={value => patchQuantity(item.id, value)}
                        /> }]}
                        detail={<>
                          {/* Which storage was counted is decided on its own line, once the line has an amount (preview only). */}
                          {Boolean(entry?.quantity?.trim()) && <LocationLineField
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
                          {invalid && <QuantityFieldError id={errorId} reason={parsed.reason} rawValue={entry?.quantity ?? ''} maxFractionDigits={2} className="cafe-count__field-error" />}
                          {entry?.outcome && <p className="cafe-count__line-success" role="status">{t('cafe.count.lineSubmitted')}</p>}
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
                    <span>{t('cafe.count.progress.entered', { count: enteredCount, eligible: items.length })}</span>
                    <span>{t('cafe.count.progress.submitted', { count: submittedCount })}</span>
                    <span>{t('cafe.count.progress.refused', { count: refusedCount })}</span>
                  </span>}
                  reason={<>
                    {invalidCount > 0 && <span className="cafe-count__fixing" role="status" aria-live="polite">
                      {t(invalidCount === 1 ? 'quantityField.fixing.one' : 'quantityField.fixing.other', { count: invalidCount })}
                    </span>}
                    {hasUnsubmittedInput && <span className="cafe-count__bar-status" role="status">{t('cafe.count.streamLocked')}</span>}
                    {enteredCount === 0 && !submitting && isOnline && <span className="cafe-count__bar-status" role="status">{t('cafe.count.needsEntry')}</span>}
                  </>}
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
    </CafePageFrame>
  )
}
