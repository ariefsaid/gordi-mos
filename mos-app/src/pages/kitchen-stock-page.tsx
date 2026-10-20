// KitchenStockPage — /cafe/stock — S4 Stock view (read-only, auto-computed).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
//
// PER-STREAM (#237, FR-060): the page reads ONE (branch, activity) production stream at a
// time — default resolved from shared.default_stream() (the viewer's live primary stream
// Team, FR-001), switchable to any stream via the same scope affordance the capture
// surface uses (FR-003 — a default, never a wall). Each active WIP item shows its system
// quantity — `stok`, the net of approved production minus approved transfers for the
// SELECTED stream — beside the ERP inventory comparison column (placeholder until the ERP
// read is wired) and the start-of-day `tersedia` cut. This is the verification plane that
// derived raw usage depends on (OD-WAY-45): load-bearing, not decoration.
//
// "Stok HQ" in the incumbent means the CENTRAL KITCHEN, which books to Rumah Rames — not
// the GHQ branch — so no label here may read "HQ" for it (FR-061, CONTEXT.md trap); the
// stream is named by the branch's CANONICAL catalog name, which is what keeps that true.
// #238 owner ruling (CONTEXT.md, Production stream): canonical everywhere a stream is named;
// the 'Bungur' alias names a transfer DESTINATION and the derived action label only. #237
// shipped the alias on this surface; the ruling moved it, and the test was inverted to pin
// both halves rather than deleted.
//
// Proves (unit): AC-011's RENDER half (the system-quantity column beside the ERP column,
// per-stream scoping + switch, no "HQ" label) and AC-032 (negative balances preserved).
// The NET itself — approved production minus approved transfers, per stream, cross-stream
// isolated — is owned at pgTAP: supabase/tests/ops_09_daily_log_and_stock.sql (+ ops_10
// block H for the one-round-trip reader this page calls through fetchKitchenStock).
// Access: any authenticated member may read (FR-060 is
// org-readable; RLS is the authority — no UI role gate). Date defaults to WIB today
// (OQ-7). Read-only is the signal — NO edit/save/approve affordances.

import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { GroupHeader } from '@/components/ui/group-header'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { SortIndicator } from '@/components/ui/sort-indicator'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { LocationBalanceSection } from '@/components/preview/location-preview-fields'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { fetchKitchenStock } from '@/lib/db/kitchen-logs'
import { cafeUnitDisplayLabel, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import type { CafeItemSetting } from '@/lib/db/cafe-item-settings'
import { formatQuantityWithUnit } from '@/lib/cafe-unit-multiples'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { useStockComparisonLink } from '@/lib/cafe-stock-comparison-access'
import { recordsHref } from '@/lib/cafe-records/url-state'
import type { KitchenStockRow, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { streamLabel } from '@/lib/kitchen-action-label'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { Panel } from '@/components/cafe/redesign/worksheet'
import { StockComparison } from '@/components/cafe/redesign/cafe-stock-comparison'
import { formatWeekdayDayMonth, wibToday } from '@/lib/format/date'
import { Notice } from '@/components/ui/notice'
import { Select } from '@/components/ui/select'
import { fetchCafeLocationBalances, listCafeLocations, type CafeLocation, type LocationBalances } from '@/lib/db/cafe-locations'
import './kitchen-stock-page.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

function stockUnitNames(settings: CafeItemSetting[]): Record<string, string | null> {
  return Object.fromEntries(settings.map(item => {
    const unit = item.units.find(candidate => candidate.id === item.defaultUnitId)
    return [item.id, unit ? cafeUnitDisplayLabel(unit) : null]
  }))
}

// The stream label lives in `lib/kitchen-action-label` now (#440) — the same words on every
// Café surface, and the #238 naming ruling (canonical catalog name, never the 'Bungur'
// alias, never "HQ") stated once instead of once per page.

export function KitchenStockPage() {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : 'anonymous'

  // A stock table is viewer-scoped state. Remount on an in-place account switch so the new
  // render starts empty instead of committing the previous person's rows before effects run.
  return <KitchenStockPageForViewer key={viewerId} />
}

function KitchenStockPageForViewer() {
  const t = useT()
  const auth = useAuth()

  const [asOf] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  // The module's stream + the enumerable stream catalog it is chosen from (FR-005),
  // through the ONE bootstrap every Café surface shares (issue 456).
  const cafeStream = useCafeStream()
  // OD-CAFE-1: stock is keyed on (org, date, item, branch, activity) — a balance belongs to one
  // branch's books — so the picker offers this location's streams only.
  const { options: streamOptions, locationOptions, stream, homeStream, myStreamKeys } = cafeStream
  const comparisonHref = useStockComparisonLink(stream, myStreamKeys)
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const [rows, setRows] = useState<KitchenStockRow[]>([])
  const [unitNames, setUnitNames] = useState<Record<string, string | null>>({})
  const [defaultUnitIds, setDefaultUnitIds] = useState<Record<string, string | null>>({})
  const [place, setPlace] = useState('all')
  const [places, setPlaces] = useState<{ locations: CafeLocation[]; balances: LocationBalances } | null>(null)
  const [placesState, setPlacesState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [placesRetry, setPlacesRetry] = useState(0)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [search, setSearch] = useSearchParamState('q', '')
  const [negativeOnly, setNegativeOnly] = useSearchParamState('negative', '')
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())
  const toggleGroup = (key: string) => setCollapsedGroups(current => {
    const next = new Set(current)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const searchQuery = search.trim().toLowerCase()
  const placeRows = place === 'all' ? rows : rows.map(row => {
    const unitId = defaultUnitIds[row.wip_item_id]
    const balancesKnown = placesState === 'ready' && places && places.balances.coverage !== 'unavailable' && unitId
    const balance = balancesKnown ? places.balances.rows.find(balance => balance.item_id === row.wip_item_id && balance.item_unit_id === unitId && balance.location_id === (place === 'unassigned' ? null : place)) : null
    return { ...row, stok: balancesKnown ? Number(balance?.usable_qty ?? (balance ? NaN : 0)) : NaN, tersedia: balancesKnown ? Number(balance?.available_qty ?? (balance ? NaN : 0)) : NaN }
  })
  const searchedRows = placeRows.filter(row => (
    !searchQuery || row.wip_item_name.toLowerCase().includes(searchQuery)
  ))
  const negativeCount = searchedRows.filter(row => row.stok < 0 || row.tersedia < 0).length
  const visibleRows = negativeOnly === '1' ? searchedRows.filter(row => row.stok < 0 || row.tersedia < 0) : searchedRows
  const negativeRows = visibleRows.filter(row => row.stok < 0 || row.tersedia < 0)
  const otherRows = visibleRows.filter(row => !(row.stok < 0 || row.tersedia < 0))
  const stockGroups = [
    ...(negativeRows.length ? [{ key: 'negative', label: t('kitchen.stock.negativeGroup'), rows: negativeRows }] : []),
    ...(otherRows.length ? [{ key: 'other', label: t('kitchen.stock.otherGroup'), rows: otherRows }] : []),
  ]
  // Number and unit are separate cells so the figures keep one right edge whatever the unit's width.
  const formatStockQuantity = (quantity: number, unitName: string | null | undefined) => (
    <>
      <span className="ks-qty__num">{Number.isFinite(quantity) ? formatQuantityWithUnit(quantity, '', document.documentElement.lang || 'en').trimEnd() : '—'}</span>
      {' '}
      <span className="ks-qty__unit">{unitName ?? t('kitchen.stock.unitNotSet')}</span>
    </>
  )
  // Negative balances lead; within each group source order remains stable.
  const renderStockRow = (row: KitchenStockRow) => <div className="ks-row" key={row.wip_item_id}>
    <div className="ks-item">
      <strong>{row.wip_item_name}</strong>
      <span className="ks-item__context">
        {row.on_stream === false && <NotOnStreamTag />}
        {new Set(rows.map(item => item.category).filter(Boolean)).size > 1 && row.category && <span className="ks-category">{kitchenCategoryLabel(t, row.category)}</span>}
        {!unitNames[row.wip_item_id] && <span className="ks-unit-warning">{t('kitchen.stock.unitNotSet')}</span>}
      </span>
    </div>
    <div className="ks-value" data-label={t('kitchen.stock.col.stok')}><span className={`ks-qty ${row.stok < 0 ? 'ks-negative tabular' : 'tabular'}`}>{formatStockQuantity(row.stok, unitNames[row.wip_item_id])}</span></div>
    <div className="ks-value" data-label={t('kitchen.stock.col.tersedia')}><span className={`ks-qty ${row.tersedia < 0 ? 'ks-negative tabular' : 'tabular'}`}>{formatStockQuantity(row.tersedia, unitNames[row.wip_item_id])}</span></div>
  </div>

  // Stale-response guard: every read bumps the generation, and only the LATEST
  // generation's result may land. Without this, two rapid stream switches can resolve
  // out of order and render stream A's rows under stream B's label — the exact
  // wrong-books confusion FR-061 exists to end, produced by the page itself. Shared by
  // bootstrap and applyStream so a slow bootstrap can't clobber a later switch either.
  const requestGen = useRef(0)

  // Initial load: catalog → stream → that stream's rows. #440: the stream is the MODULE's
  // selection — whatever the person chose on Log/Plan/Review this session wins, then their own
  // stream from shared.default_stream() (FR-001). No default (FR-002) now means the same here
  // as on capture: an explicit choice, never a silent fallback to the catalog's first branch.
  // A read surface that guesses is worse than one that asks — it answers "how much stock is
  // there" about books the person never picked.
  // One place adopts a finished stock read: rows, their unit labels and default units.
  const showRead = useCallback((data: KitchenStockRow[], settings: CafeItemSetting[]) => {
    setRows(data)
    setUnitNames(stockUnitNames(settings))
    setDefaultUnitIds(Object.fromEntries(settings.map(item => [item.id, item.defaultUnitId])))
    setLoad({ kind: 'ready' })
  }, [])

  const bootstrap = useCallback(async () => {
    const gen = ++requestGen.current
    setLoad({ kind: 'loading' })
    try {
      const catalog = await resolveStream()
      let data: KitchenStockRow[] = []
      let settings: CafeItemSetting[] = []
      if (catalog.stream) {
        data = await fetchKitchenStock(asOf, catalog.stream)
        if (data.length > 0) settings = await listCafeItemSettings(catalog.stream)
      }
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      adoptStream(catalog)
      showRead(data, settings)
    } catch {
      if (gen !== requestGen.current) return
      setLoad({ kind: 'error' })
    }
  }, [asOf, resolveStream, adoptStream, showRead])

  // Switching the stream re-reads the rows: the same dish has a different balance in
  // another stream's books (OD-WAY-28) — a kept list would show one stream's numbers
  // under another stream's name, the exact confusion FR-061 exists to end.
  const applyStream = useCallback(async (next: ProductionStream) => {
    const gen = ++requestGen.current
    chooseStream(next) // the whole Café module follows this choice (#440)
    setPlace('all')
    setLoad({ kind: 'loading' })
    try {
      const data = await fetchKitchenStock(asOf, next)
      const settings = data.length > 0 ? await listCafeItemSettings(next) : []
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      showRead(data, settings)
    } catch {
      if (gen !== requestGen.current) return
      setLoad({ kind: 'error' })
    }
  }, [asOf, chooseStream, showRead])

  // Read once authenticated (an unauthenticated viewer never triggers the read).
  useEffect(() => {
    if (auth.status !== 'authenticated') return
    void bootstrap()
  }, [auth.status, bootstrap, retryKey])

  // Place reads fail independently so the stream's existing All places view remains usable.
  useEffect(() => {
    if (auth.status !== 'authenticated' || !stream) return
    let active = true
    setPlaces(null); setPlacesState('loading')
    void Promise.all([
      listCafeLocations({ branch_id: stream.branch.id, archived: false }),
      fetchCafeLocationBalances(asOf, { branch_id: stream.branch.id, activity: stream.activity }),
    ]).then(([locations, balances]) => {
      if (!active) return
      setPlaces({ locations: locations.filter(location => location.use === 'storage' || location.use === 'both'), balances })
      setPlacesState('ready')
    }).catch(() => { if (active) setPlacesState('error') })
    return () => { active = false }
  }, [asOf, auth.status, stream, placesRetry])

  // ── Auth loading / unauth ──────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return (
      <CafePageFrame page="stock" streamBar={{ options: [], stream: null, onChange: () => undefined }} state="loading">
        <LoadingShell count={3} />
      </CafePageFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <CafePageFrame page="stock" streamBar={{ options: [], stream: null, onChange: () => undefined }} state="permission">
        <div className="ks-block ks-forbidden">
          <p className="ks-forbidden-msg">{t('kitchen.stock.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </CafePageFrame>
    )
  }

  // #440: the head states the stream in EVERY state — the empty one and the mid-switch one
  // included. A stream with no picker is an implicit wall (the viewer would be stuck in the
  // very stream that has nothing to show) and a picker that unmounts during the re-read makes
  // rapid correction impossible — both violate FR-003. The generation guard above is what
  // makes rapid switching safe to allow.
  const streamBar = {
    options: locationOptions,
    stream,
    homeStream,
    myStreamKeys,
    onChange: (next: ProductionStream) => { void applyStream(next) },
  }

  return (
    <CafePageFrame
      page="stock"
      date={asOf}
      description={t('cafe.stock.description')}
      streamBar={streamBar}
      recordsHref={recordsHref({ question: 'everything', reading: 'day', stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null, today: wibToday() })}
      comparisonHref={comparisonHref}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >
      {load.kind === 'loading' && streamOptions.length === 0 && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.stock') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {/* No stream resolved (FR-002 — no live primary stream Team, nothing chosen yet): the
          head has nothing to state, so the one-step choice renders here instead of a table of
          nothing under an em dash. */}
      {load.kind === 'ready' && stream === null && (
        <CafeStreamChoices
          options={locationOptions}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          onChoose={next => { void applyStream(next) }}
        />
      )}

      {((load.kind === 'ready' && stream !== null) || (load.kind === 'loading' && streamOptions.length > 0)) && (
        <div className="ks-block">
          <LocationBalanceSection />
          {placesState === 'error' && <ErrorState message={t('kitchen.stock.placesError')} onRetry={() => setPlacesRetry(count => count + 1)} />}
          {place !== 'all' && places?.balances.coverage === 'unavailable' && <Notice tone="info">{t('kitchen.stock.placeUnavailable')}</Notice>}
          {rows.length > 0 && <Notice tone="info">{t('kitchen.stock.erpPending')}</Notice>}
          <div className="ks-collection-head">
            <KitchenToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('kitchen.stock.searchPlaceholder')}
              ariaLabel={t('kitchen.stock.toolbarAria')}
              resultCount={load.kind === 'ready' ? { shown: visibleRows.length, total: rows.length } : undefined}
              sortLabel={t('cafe.toolbar.sorted.negativeFirst')}
              trailing={<>
                <Select label={t('kitchen.stock.place')} value={place} disabled={placesState !== 'ready'} onChange={event => setPlace(event.target.value)}>
                  <option value="all">{t('kitchen.stock.allPlaces')}</option>
                  {places?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                  <option value="unassigned">{t('kitchen.stock.unassignedPlace')}</option>
                </Select>
                <Link className="btn btn-outline" to="/cafe/locations/change-location" state={{ changeLocationFrom: 'stock' }}>{t('kitchen.stock.changeLocation')}</Link>
                {load.kind === 'ready' && rows.length > 0 && <button type="button" className="ks-negative-toggle" aria-pressed={negativeOnly === '1'} onClick={() => setNegativeOnly(negativeOnly === '1' ? '' : '1')}>
                  <span>{t('kitchen.stock.kpi.negative')}</span><span className="tabular">{negativeCount}</span>
                </button>}
              </>}
              extraChips={negativeOnly === '1' ? [{ key: 'negative', label: t('kitchen.stock.kpi.negative'), clear: () => setNegativeOnly('') }] : undefined}
            />
          </div>
          {load.kind === 'loading' ? <LoadingShell count={3} /> : rows.length === 0 ? (
            stream && <CafeItemsEmptyState stream={stream} />
          ) : visibleRows.length === 0 ? <CafeNoMatch onClear={() => setSearch('')} /> : (
            <>
              <>
              <StockComparison label={t('kitchen.stock.caption', { stream: streamLabel(t, stream), date: formatWeekdayDayMonth(asOf) })}>
                <div className="ks-columns" aria-hidden="true">
                  <span>{t('kitchen.stock.col.item')}<SortIndicator dir="asc" /></span>
                  <span>{t('kitchen.stock.head.stok')}</span>
                  <span>{t('kitchen.stock.head.tersedia')}</span>
                </div>
                {stockGroups.map(group => <section className="ks-group" key={group.key} aria-label={group.label}>
                  {(stockGroups.length > 1 || group.key === 'negative') && <GroupHeader className="ks-group__heading" label={group.label} count={group.rows.length} open={!collapsedGroups.has(group.key)} onToggle={() => toggleGroup(group.key)} />}
                  {!collapsedGroups.has(group.key) && group.rows.map(renderStockRow)}
                </section>)}
              </StockComparison>
              </>
              <Panel title={t('kitchen.stock.definitions')}>
                <p>{t('kitchen.stock.stockDefinition')}</p><p>{t('kitchen.stock.availableDefinition')}</p><p>{t('kitchen.stock.systemDefinition')}</p>
              </Panel>
            </>
          )}
        </div>
      )}
    </CafePageFrame>
  )
}
