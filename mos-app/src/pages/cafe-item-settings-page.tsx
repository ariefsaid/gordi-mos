import { ActionBar } from '@/components/ui/action-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeItemRecipeSection } from '@/components/kitchen/cafe-recipe-detail'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/dashboard/data-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { Select } from '@/components/ui/select'
import { MultiPicker } from '@/components/ui/picker'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import type { CafeItemSetting, CafeItemSettingUnit } from '@/lib/db/cafe-item-settings'
import { formatUnitMultiple } from '@/lib/cafe-unit-multiples'
import {
  KITCHEN_ACTIVE_FILTER_OPTIONS,
  KITCHEN_KIND_FILTER_OPTIONS,
  KITCHEN_NEEDS_UNIT_FILTER_OPTIONS,
  kitchenDataTableGroups,
  toKitchenListRows,
  useKitchenItemTable,
  type KitchenItemActiveFilter,
  type KitchenItemKindFilter,
  type KitchenItemNeedsUnitFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
import { isCafeItemDraftKind, type CafeItemDraftKind } from './cafe-item-settings-kind'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import {
  canManageCafeItemSettings,
  listCafeItemSettings,
  saveCafeItemSettings,
} from '@/lib/db/cafe-item-settings'
import {
  listCafeMissingItemReports,
  resolveCafeMissingItemReport,
  type CafeMissingItemReport,
} from '@/lib/db/cafe-missing-item-reports'
import { useCafeStream, type CafeStreamCatalog } from '@/lib/use-cafe-stream'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useIsWide } from '@/shell/use-is-wide'
import { Notice } from '@/components/ui/notice'
import '@/components/record-collection/record-collection.css'
import './cafe-item-settings-page.css'
import '@/components/kitchen/cafe-setup-workspace.css'

type ItemDraft = {
  mosName: string
  kind: CafeItemDraftKind
  isActive: boolean
  defaultUnitId: string
  unitMultiples: number[]
}

type ReadState = 'loading' | 'ready' | 'error'
type EditPermission = 'checking' | 'allowed' | 'read-only' | 'error'

type SaveState = { kind: 'saved' } | { kind: 'error'; message: string } | null
type CafeItemListRow = KitchenListRow<CafeItemSetting>
const GROUP_BY_ACTIVE_STORAGE_KEY = 'mos.cafe.items.groupByActive'

function readGroupByActive(): boolean {
  try {
    return localStorage.getItem(GROUP_BY_ACTIVE_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}
type ItemEditorProps = {
  item: CafeItemListRow
  draft: ItemDraft
  canEdit: boolean
  saving: boolean
  changed: boolean
  saveState: SaveState
  onDraftChange: (update: (draft: ItemDraft) => ItemDraft) => void
  onSave: () => void
}
type ItemFieldProps = Pick<ItemEditorProps, 'item' | 'draft' | 'canEdit' | 'saving' | 'onDraftChange'>

function initialDraft(item: CafeItemSetting): ItemDraft {
  return {
    mosName: item.mosName,
    kind: item.kind ?? '',
    isActive: item.isActive,
    defaultUnitId: item.defaultUnitId ?? '',
    unitMultiples: [...(item.unitMultiples ?? [])],
  }
}

function sameFactors(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((left, right) => left - right)
  const sortedB = [...b].sort((left, right) => left - right)
  return sortedA.every((factor, index) => factor === sortedB[index])
}

function itemDraftChanged(item: CafeItemSetting, draft: ItemDraft): boolean {
  return draft.mosName.trim() !== item.mosName
    || draft.kind !== (item.kind ?? '')
    || draft.isActive !== item.isActive
    || draft.defaultUnitId !== (item.defaultUnitId ?? '')
    || !sameFactors(draft.unitMultiples, item.unitMultiples ?? [])
}

function hasDefault(item: CafeItemSetting): boolean {
  return item.defaultUnitId !== null && item.units.some(unit =>
    unit.id === item.defaultUnitId && unit.isDefault,
  )
}

function needsUnit(item: CafeItemSetting): boolean {
  return item.units.length > 0 && !hasDefault(item)
}

export function CafeItemSettingsPage() {
  const auth = useAuth()
  const viewerKey = auth.status === 'authenticated' ? auth.viewer.person.id : auth.status
  return <CafeItemSettingsPageForViewer key={viewerKey} />
}

/** `catalog` opened on the linked stream (a `branch|activity` key) when it is one of the org's
 *  streams; otherwise unchanged. */
function withLinkedStream(catalog: CafeStreamCatalog, wanted: string | null): CafeStreamCatalog {
  const option = wanted ? catalog.options.find(o => streamKey(o.branch.id, o.activity) === wanted) : undefined
  if (!option) return catalog
  return {
    ...catalog,
    stream: option,
    branchId: option.branch.id,
    locationOptions: catalog.options.filter(o => o.branch.id === option.branch.id),
  }
}

function CafeItemSettingsPageForViewer() {
  const t = useT()
  const cafeStream = useCafeStream()
  const {
    options: streamOptions,
    locationOptions,
    stream,
    homeStream,
    myStreamKeys,
    branchId,
    resolve: resolveStream,
    adopt: adoptStream,
    setStream,
  } = cafeStream

  const [items, setItems] = useState<CafeItemSetting[]>([])
  const needsUnitCount = items.filter(needsUnit).length
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [pendingStream, setPendingStream] = useState<ProductionStream | null>(null)
  const itemsRef = useRef(items)
  const draftsRef = useRef(drafts)
  const draftStreamKey = useRef<string | null>(null)
  // A link from elsewhere (Money's Branch page) may name an item (?q=) and its stream (?stream=
  // branch|activity). Both are read once and dropped from the URL. The linked stream is shown for
  // this visit only, at any branch: it is adopted, not chosen, so the viewer's Café location and
  // remembered stream stay as they were.
  const [searchParams, setSearchParams] = useSearchParams()
  const linked = useRef({ q: searchParams.get('q'), stream: searchParams.get('stream') })
  // Search, filters and the open item live in the URL, so a reload or Back keeps the same view (UX-STANDARD NV4).
  const [search, setSearch] = useSearchParamState('q', '')
  const [kindParam, setKindParam] = useSearchParamState('kind', 'All')
  const [activeParam, setActiveParam] = useSearchParamState('status', 'All')
  const [unitParam, setUnitParam] = useSearchParamState('unit', 'All')
  const kindFilter = kindParam as KitchenItemKindFilter
  const activeFilter = activeParam as KitchenItemActiveFilter
  const needsUnitFilter = unitParam as KitchenItemNeedsUnitFilter
  const setKindFilter = (next: KitchenItemKindFilter) => setKindParam(next)
  const setActiveFilter = (next: KitchenItemActiveFilter) => setActiveParam(next)
  const setNeedsUnitFilter = (next: KitchenItemNeedsUnitFilter) => setUnitParam(next)
  const [groupByActive, setGroupByActive] = useState(readGroupByActive)
  const [listSort, setListSort] = useState<DataTableSort | undefined>({ key: 'itemName', dir: 'asc' })
  // Inactive items start folded under their header; any search or filter opens them so results are never hidden.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set(['inactive']))
  const [selectedParam, setSelectedParam] = useSearchParamState('item', '')
  const selectedItemId = selectedParam || null
  const setSelectedItemId = useCallback((next: string | null) => setSelectedParam(next ?? ''), [setSelectedParam])
  // The editor table needs the wide operating layout, as on the other Café pages; narrower widths
  // get one card per item.
  const isWide = useIsWide()
  const [readState, setReadState] = useState<ReadState>('loading')
  const [catalogReady, setCatalogReady] = useState(false)
  const [permission, setPermission] = useState<EditPermission>('checking')
  const [permissionStreamKey, setPermissionStreamKey] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [reports, setReports] = useState<CafeMissingItemReport[]>([])
  const reportCount = reports.length
  const [reportsError, setReportsError] = useState(false)
  const [resolvingReportIds, setResolvingReportIds] = useState<Set<string>>(() => new Set())
  const [retryKey, setRetryKey] = useState(0)
  const requestGeneration = useRef(0)

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => {
    if (search.trim() || kindFilter !== 'All' || activeFilter !== 'All' || needsUnitFilter !== 'All') setCollapsedGroups(new Set())
  }, [activeFilter, kindFilter, needsUnitFilter, search])
  useEffect(() => { draftsRef.current = drafts }, [drafts])
  useEffect(() => {
    try {
      localStorage.setItem(GROUP_BY_ACTIVE_STORAGE_KEY, String(groupByActive))
    } catch {
      // Storage may be disabled; grouping still works for this visit.
    }
  }, [groupByActive])

  // One CafeStream bootstrap preserves the module's stream choice and location rules.
  useEffect(() => {
    let active = true
    setReadState('loading')
    setCatalogReady(false)
    void resolveStream().then(catalog => {
      if (active) {
        const wanted = linked.current.stream
        linked.current.stream = null
        adoptStream(withLinkedStream(catalog, wanted))
        setCatalogReady(true)
      }
    }).catch(() => {
      if (active) setReadState('error')
    })
    return () => { active = false }
  }, [adoptStream, resolveStream, retryKey])

  useEffect(() => {
    if (!searchParams.has('stream')) return
    const next = new URLSearchParams(searchParams)
    next.delete('stream')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const loadStreamItems = useCallback(async () => {
    if (!catalogReady) return
    const generation = ++requestGeneration.current
    if (!stream) {
      draftStreamKey.current = null
      setItems([])
      setDrafts({})
      setReports([])
      setReportsError(false)
      setReadState('ready')
      setPermission('read-only')
      setPermissionError(false)
      return
    }

    setReadState('loading')
    setPermission('checking')
    setPermissionError(false)
    try {
      const [nextItems, canEdit] = await Promise.all([
        listCafeItemSettings(stream),
        canManageCafeItemSettings(stream.activity).then(
          value => ({ value, failed: false as const }),
          () => ({ value: false, failed: true as const }),
        ),
      ])
      let nextReports: CafeMissingItemReport[] = []
      let nextReportsError = false
      if (canEdit.value && !canEdit.failed) {
        try {
          nextReports = await listCafeMissingItemReports(stream)
        } catch {
          nextReportsError = true
        }
      }
      if (generation !== requestGeneration.current) return
      const nextStreamKey = streamKey(stream.branch.id, stream.activity)
      const sameDraftStream = draftStreamKey.current === nextStreamKey
      const previousItems = new Map(itemsRef.current.map(item => [item.id, item]))
      const previousDrafts = draftsRef.current
      draftStreamKey.current = nextStreamKey
      setPermissionStreamKey(nextStreamKey)
      setItems(nextItems)
      setDrafts(Object.fromEntries(nextItems.map(item => {
        const previousItem = previousItems.get(item.id)
        const previousDraft = sameDraftStream ? previousDrafts[item.id] : undefined
        return [item.id, previousItem && previousDraft && itemDraftChanged(previousItem, previousDraft)
          ? previousDraft
          : initialDraft(item)]
      })))
      setReports(nextReports)
      setReportsError(nextReportsError)
      setPermission(canEdit.failed ? 'error' : canEdit.value ? 'allowed' : 'read-only')
      setPermissionError(canEdit.failed)
      setSaveStates({})
      setReadState('ready')
    } catch {
      if (generation !== requestGeneration.current) return
      setReadState('error')
      setPermission('read-only')
    }
  }, [catalogReady, stream])

  useEffect(() => {
    void loadStreamItems()
    return () => { requestGeneration.current += 1 }
  }, [loadStreamItems, retryKey])

  const canEdit = permission === 'allowed' && stream !== null
    && permissionStreamKey === streamKey(stream.branch.id, stream.activity)
  const changed = useMemo(() => {
    const result = new Set<string>()
    for (const item of items) {
      const draft = drafts[item.id]
      if (draft && itemDraftChanged(item, draft)) result.add(item.id)
    }
    return result
  }, [drafts, items])

  const applyStreamChange = useCallback((nextStream: ProductionStream) => {
    if (!stream || streamKey(stream.branch.id, stream.activity) !== streamKey(nextStream.branch.id, nextStream.activity)) {
      requestGeneration.current += 1
      draftStreamKey.current = null
      setDrafts({})
      setSaveStates({})
      setSavingIds(new Set())
    }
    setPendingStream(null)
    setStream(nextStream)
  }, [setStream, stream])

  const requestStreamChange = useCallback((nextStream: ProductionStream) => {
    if (stream && streamKey(stream.branch.id, stream.activity) === streamKey(nextStream.branch.id, nextStream.activity)) {
      setStream(nextStream)
      return
    }
    if (changed.size > 0) {
      setPendingStream(nextStream)
      return
    }
    applyStreamChange(nextStream)
  }, [applyStreamChange, changed, setStream, stream])

  const streamBar = {
    options: streamOptions,
    stream,
    onChange: requestStreamChange,
    homeStream,
    myStreamKeys,
    locationBranchId: branchId ?? undefined,
    disabled: readState === 'loading',
  }


  const setDraft = useCallback((itemId: string, update: (draft: ItemDraft) => ItemDraft) => {
    setDrafts(current => {
      const existing = current[itemId]
      if (!existing) return current
      return { ...current, [itemId]: update(existing) }
    })
    setSaveStates(current => ({ ...current, [itemId]: null }))
  }, [])

  const saveItem = useCallback(async (item: CafeItemSetting) => {
    const draft = drafts[item.id]
    if (!draft || !stream || !canEdit || !changed.has(item.id)) return
    const generation = requestGeneration.current
    setSavingIds(current => new Set(current).add(item.id))
    setSaveStates(current => ({ ...current, [item.id]: null }))
    try {
      const mosName = draft.mosName.trim()
      const defaultUnitId = item.units.some(unit => unit.id === draft.defaultUnitId)
        ? draft.defaultUnitId
        : null
      const shownUnitIds = defaultUnitId ? [defaultUnitId] : []
      await saveCafeItemSettings({
        stream,
        itemId: item.id,
        mosName,
        kind: draft.kind || null,
        isActive: draft.isActive,
        defaultUnitId,
        shownUnitIds,
        unitMultiples: draft.unitMultiples,
      })
      if (generation !== requestGeneration.current) return
      setItems(current => current.map(candidate => candidate.id !== item.id ? candidate : {
        ...candidate,
        mosName: mosName === candidate.erpName ? candidate.erpName : mosName,
        kind: draft.kind || null,
        isActive: draft.isActive,
        defaultUnitId,
        unitMultiples: [...draft.unitMultiples],
        units: candidate.units.map(unit => ({
          ...unit,
          isShown: unit.id === defaultUnitId,
          isDefault: unit.id === defaultUnitId,
        })),
      }))
      setDrafts(current => ({
        ...current,
        [item.id]: { mosName, kind: draft.kind, isActive: draft.isActive, defaultUnitId: defaultUnitId ?? '', unitMultiples: [...draft.unitMultiples] },
      }))
      setSaveStates(current => ({ ...current, [item.id]: { kind: 'saved' } }))
    } catch {
      if (generation !== requestGeneration.current) return
      setSaveStates(current => ({ ...current, [item.id]: { kind: 'error', message: t('cafe.items.saveError') } }))
    } finally {
      if (generation === requestGeneration.current) {
        setSavingIds(current => {
          const next = new Set(current)
          next.delete(item.id)
          return next
        })
      }
    }
  }, [canEdit, changed, drafts, requestGeneration, stream, t])

  const resolveReport = useCallback(async (report: CafeMissingItemReport) => {
    if (!stream || !canEdit || resolvingReportIds.has(report.id)) return
    const generation = requestGeneration.current
    setResolvingReportIds(current => new Set(current).add(report.id))
    try {
      await resolveCafeMissingItemReport(report.id)
      const nextReports = await listCafeMissingItemReports(stream)
      if (generation === requestGeneration.current) {
        setReports(nextReports)
        setReportsError(false)
      }
    } catch {
      if (generation === requestGeneration.current) setReportsError(true)
    } finally {
      setResolvingReportIds(current => {
        const next = new Set(current)
        next.delete(report.id)
        return next
      })
    }
  }, [canEdit, resolvingReportIds, stream])

  const retryReports = useCallback(async () => {
    if (!stream || !canEdit) return
    const generation = requestGeneration.current
    try {
      const nextReports = await listCafeMissingItemReports(stream)
      if (generation === requestGeneration.current) {
        setReports(nextReports)
        setReportsError(false)
      }
    } catch {
      if (generation === requestGeneration.current) setReportsError(true)
    }
  }, [canEdit, stream])

  const listRows = useMemo(() => toKitchenListRows(items, {
    kind: 'Unclassified',
    getId: item => item.id,
    getKind: item => item.kind ?? 'Unclassified',
    getName: item => `${item.erpName} ${drafts[item.id]?.mosName ?? item.mosName}`,
    getCategory: item => item.category,
    getGroupKey: item => groupByActive ? item.isActive ? 'active' : 'inactive' : 'all',
    getActive: item => item.isActive,
    getNeedsUnit: needsUnit,
  }), [drafts, groupByActive, items])
  const listSorting = useMemo(() => listSort
    ? [{ id: listSort.key, desc: listSort.dir === 'desc' }]
    : [], [listSort])
  const itemTable = useKitchenItemTable({
    data: listRows,
    search,
    kind: kindFilter,
    category: 'All',
    active: activeFilter,
    needsUnit: needsUnitFilter,
    sorting: listSorting,
  })
  const listGroups = readState === 'loading' ? [] : kitchenDataTableGroups(itemTable, groupKey => {
    if (groupKey === 'active') return t('cafe.items.group.active')
    if (groupKey === 'inactive') return t('cafe.items.group.inactive')
    return null
  }).sort((left, right) => left.key.localeCompare(right.key))
  const visibleItems = listGroups.flatMap(group => group.rows)
  const editorFor = (item: CafeItemListRow): ItemEditorProps => ({
    item,
    draft: drafts[item.id] ?? initialDraft(item),
    canEdit,
    saving: savingIds.has(item.id),
    changed: changed.has(item.id),
    saveState: saveStates[item.id] ?? null,
    onDraftChange: update => setDraft(item.id, update),
    onSave: () => void saveItem(item),
  })
  // One category for the whole stream is stated by the stream itself; the row names it only when categories differ.
  const mixedCategories = new Set(items.map(item => item.category).filter(Boolean)).size > 1
  const editProgress = (item: CafeItemListRow) => changed.has(item.id) ? t('cafe.items.unsaved') : savingIds.has(item.id) ? t('cafe.items.saving') : saveStates[item.id]?.kind === 'saved' ? t('cafe.items.saved') : undefined
  const columns: DataTableColumn<CafeItemListRow>[] = [
    { key: 'itemName', header: t('cafe.items.erpName'), sortable: true, render: item => <button type="button" className="cafe-items__master-link" aria-pressed={item.id === selectedItemId} onClick={() => setSelectedItemId(item.id)}><ItemIdentity item={item} showCategory={mixedCategories} progress={groupByActive ? editProgress(item) : undefined} /></button> },
    { key: 'mosName', header: t('cafe.items.mosName'), render: item => drafts[item.id]?.mosName ?? item.mosName },
    // Grouped by Active/Inactive, the group header already says it; a Status column would repeat it on every row.
    ...(groupByActive ? [] : [{ key: 'status', header: t('kitchen.log.col.status'), render: (item: CafeItemListRow) => <MasterStatus item={item} changed={changed.has(item.id)} saving={savingIds.has(item.id)} saveState={saveStates[item.id] ?? null} /> }]),
    { key: 'kind', className: 'cafe-items__col-nowrap', header: t('cafe.items.kind'), sortable:true, render: item => item.kind ? itemKindLabel(item.kind, t) : '—' },
    { key: 'unit', header: t('cafe.items.defaultUnit'), render: item => item.units.some(candidate => candidate.id === item.defaultUnitId) ? defaultUnitLabel(item, t) : '—' },
  ]
  const selectedItem = items.find(item => item.id === selectedItemId)
  const selectedRow = selectedItem ? listRows.find(row => row.id === selectedItem.id) : undefined
  const selectedEditor = selectedRow ? editorFor(selectedRow) : undefined
  useEffect(() => {
    // An item opens only when chosen (or linked): nothing opens unasked, at any width.
    if (readState !== 'ready') return
    if (selectedItemId && !items.some(item => item.id === selectedItemId)) setSelectedItemId(null)
  }, [items, readState, selectedItemId, setSelectedItemId])

  return (
    <CafePageFrame
      page="items"
      streamBar={streamBar}
      state={readState === 'loading' ? 'loading' : readState === 'error' ? 'error' : 'default'}
    >
      <RouteLeaveGuard when={changed.size > 0} message={t('cafe.items.unsaved.leave')} />
      {pendingStream && (
        <ConfirmDialog
          open
          title={t('cafe.items.unsaved.title')}
          body={t('cafe.items.unsaved.switchBody', {
            from: streamLabel(t, stream),
            to: streamLabel(t, pendingStream),
          })}
          confirmLabel={t('cafe.items.unsaved.switch')}
          cancelLabel={t('leaveGuard.stay')}
          tone="destructive"
          onConfirm={async () => applyStreamChange(pendingStream)}
          onCancel={() => setPendingStream(null)}
        />
      )}
      {!stream && readState === 'ready' && (
        <CafeStreamChoices
          options={locationOptions}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          onChoose={requestStreamChange}
        />
      )}

      {readState === 'loading' && <LoadingShell count={4} label={t('cafe.items.loading')} />}
      {readState === 'error' && (
        <ErrorState message={t('cafe.items.loadError')} onRetry={() => setRetryKey(key => key + 1)} />
      )}
      {readState === 'ready' && stream && permissionError && (
        <Notice tone="urgent" action={<button type="button" className="btn btn-ghost" onClick={() => setRetryKey(key => key + 1)}>{t('common.retry')}</button>}>
          {t('cafe.items.permissionError')}
        </Notice>
      )}
      {readState === 'ready' && stream && permission === 'read-only' && (
        <Notice tone="info">{t('cafe.items.readOnly')}</Notice>
      )}
      {readState === 'ready' && stream && permission === 'allowed' && (reports.length > 0 || reportsError) && (
        <details className="cafe-item-reports">
          <summary aria-label={t('cafe.items.reports.aria')}>
            {t('cafe.items.reports.title')} · {reportsError ? t('cafe.today.statusUnavailable') : reportCount}
          </summary>
          <div className="cafe-item-reports__heading">
            <div>
              <h2>{t('cafe.items.reports.title')}</h2>
              <p>{t('cafe.items.reports.scope', { stream: streamLabel(t, stream) })}</p>
            </div>
            {reportsError && (
              <button type="button" className="btn btn-ghost" onClick={() => void retryReports()}>
                {t('common.retry')}
              </button>
            )}
          </div>
          {reportsError ? (
            <Notice tone="urgent">{t('cafe.items.reports.error')}</Notice>
          ) : (
            <ul className="cafe-item-reports__list">
              {reports.map(report => (
                <li key={report.id}>
                  <strong>{report.itemName}</strong>
                  <span>{t('cafe.items.reports.needsAttention')}</span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={resolvingReportIds.has(report.id)}
                    onClick={() => void resolveReport(report)}
                  >
                    {resolvingReportIds.has(report.id) ? t('common.working') : t('cafe.items.reports.resolve')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {readState === 'ready' && stream && needsUnitCount > 0 && (
        <button type="button" className="cafe-items__needs-unit-summary" onClick={() => setNeedsUnitFilter('Needs unit')}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M10 2.5 18.5 17h-17z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 8v4m0 2.2h.01" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <span>{t(
            needsUnitCount === 1 ? 'cafe.items.needsSetupCount.one' : 'cafe.items.needsSetupCount.other',
            { count: needsUnitCount },
          )}</span>
        </button>
      )}
      {readState === 'ready' && stream && items.length === 0 && (
        <CafeItemsEmptyState stream={stream} esbItemCount={0} canManage={canEdit} />
      )}
      {readState === 'ready' && stream && items.length > 0 && (
        <section className="cafe-items" aria-label={t('cafe.items.listLabel')}>
          <div className={`cafe-items__workspace cafe-setup-workspace${selectedItemId ? ' cafe-items__workspace--selected cafe-setup-workspace--selected' : ''}`}>
            <section className="cafe-items__master" aria-label={t('cafe.items.listLabel')}>
              <KitchenToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder={t('kitchen.log.searchPlaceholder')}
                searchAriaLabel={t('cafe.items.searchPlaceholder')}
                ariaLabel={t('cafe.items.filtersAria')}
                filtersPanel={{
                  label: t('cafe.items.filtersPanel'),
                  summary: [
                    kindFilter === 'All' ? '' : kindFilter === 'RAW' ? t('cafe.items.kindRaw') : kindFilter === 'WIP' ? t('cafe.items.kindWip') : t('kitchen.filter.kind.notSet'),
                    activeFilter === 'All' ? '' : t(activeFilter === 'Active' ? 'kitchen.filter.active.active' : 'kitchen.filter.active.inactive'),
                    needsUnitFilter === 'All' ? '' : t('kitchen.filter.needsUnit.needs'),
                  ].filter(Boolean).join(', ') || t('cafe.items.filtersNone'),
                }}
                resultCount={{ shown: visibleItems.length, total: items.length }}
                sortLabel={listSort ? t(listSort.dir === 'asc' ? 'cafe.items.sorted.asc' : 'cafe.items.sorted.desc', { column: listSort.key === 'kind' ? t('cafe.items.kind') : t('cafe.items.erpName') }) : undefined}
                kinds={[...KITCHEN_KIND_FILTER_OPTIONS, 'Unclassified']}
                kind={kindFilter}
                onKindChange={setKindFilter}
                kindId="cafe-items-kind-filter"
                activeStates={KITCHEN_ACTIVE_FILTER_OPTIONS}
                active={activeFilter}
                onActiveChange={setActiveFilter}
                activeId="cafe-items-active-filter"
                needsUnitStates={KITCHEN_NEEDS_UNIT_FILTER_OPTIONS}
                needsUnit={needsUnitFilter}
                onNeedsUnitChange={setNeedsUnitFilter}
                needsUnitId="cafe-items-unit-filter"
                trailing={(
                  <label className="cafe-items__group-toggle">
                    <Checkbox
                      id="cafe-items-group-by-active"
                      checked={groupByActive}
                      onChange={setGroupByActive}
                    />
                    <span>{t('cafe.items.groupByActive')}</span>
                  </label>
                )}
              />
              <div className="record-collection-view cafe-items__collection">
                <DataTable
                  columns={columns}
                  rows={visibleItems}
                  groups={listGroups}
                  collapsedGroupKeys={collapsedGroups}
                  onToggleGroup={key => setCollapsedGroups(current => {
                    const next = new Set(current)
                    if (!next.delete(key)) next.add(key)
                    return next
                  })}
                  tableClassName={`record-collection-table collection-grammar-table cafe-items__table${groupByActive ? ' cafe-items__table--grouped' : ''}`}
                  rowClassName={item => `${item.needsUnit ? 'cafe-items__row--needs-unit' : ''}${item.id === selectedItemId ? ' cafe-items__row--selected' : ''}`}
                  sort={listSort}
                  onSortChange={next => setListSort(next)}
                  isDesktop={isWide}
                  state={visibleItems.length === 0 ? 'empty' : 'ready'}
                  emptyLabel={t('cafe.items.noMatches')}
                  caption={t('cafe.items.tableCaption')}
                  renderCard={item => <ItemMasterCard groupedByStatus={groupByActive} item={item} showCategory={mixedCategories} draftName={drafts[item.id]?.mosName ?? item.mosName} selected={item.id === selectedItemId} changed={changed.has(item.id)} saving={savingIds.has(item.id)} saveState={saveStates[item.id] ?? null} onSelect={() => setSelectedItemId(item.id)} />}
                  renderRowDetail={undefined}
                />
              </div>
            </section>
            {selectedRow && selectedEditor && <section className="cafe-item-editor" aria-label={selectedRow.erpName}>
              {!isWide && <button type="button" className="btn btn-ghost cafe-item-editor__back" onClick={() => setSelectedItemId(null)}>{t('cafe.items.backToItems')}</button>}
              <header className="cafe-item-editor__identity">
                <ItemIdentity item={selectedRow} />
                {isWide && canEdit && <div className="cafe-item-editor__head-action"><MasterStatus item={selectedRow} changed={selectedEditor.changed} saving={selectedEditor.saving} saveState={selectedEditor.saveState} /><SaveControl changed={selectedEditor.changed} validName={selectedEditor.draft.mosName.trim().length > 0} saving={selectedEditor.saving} state={selectedEditor.saveState} onSave={selectedEditor.onSave} /></div>}
              </header>
              <div className="cafe-item-editor__fields">
                <ItemNameEditor {...selectedEditor} view="card" />
                <ItemKindEditor {...selectedEditor} />
                <ItemActiveEditor {...selectedEditor} />
                <ItemDefaultUnitEditor {...selectedEditor} />
              </div>
              <details className="cafe-item-editor__extras" open={selectedEditor.changed && selectedEditor.draft.unitMultiples.length > 0}>
                <summary>{t('cafe.items.unitMultiples')}</summary>
                <ItemMultiplesEditor {...selectedEditor} />
              </details>
              <CafeItemRecipeSection itemId={selectedRow.id} erpName={selectedRow.erpName} />
              <details className="cafe-item-editor__policy"><summary>{t('cafe.items.catalogPolicy')}</summary><p>{t('cafe.items.inheritedName')}</p></details>
              {!isWide && canEdit && <ActionBar
                alert={selectedEditor.saveState?.kind === 'error' ? <span className="cafe-items__save-error" role="alert">{t('cafe.items.saveError')} <button type="button" className="btn btn-ghost" onClick={selectedEditor.onSave}>{t('common.retry')}</button></span> : undefined}
                summary={<MasterStatus item={selectedRow} changed={selectedEditor.changed} saving={selectedEditor.saving} saveState={selectedEditor.saveState} />}
                reason={saveReason(selectedEditor.changed, selectedEditor.draft.mosName.trim().length > 0, selectedEditor.saving, t) ?? undefined}
                primary={<Button variant="primary" disabled={!selectedEditor.changed || selectedEditor.saving || selectedEditor.draft.mosName.trim().length === 0} onClick={selectedEditor.onSave}>{selectedEditor.saving ? t('cafe.items.saving') : t('cafe.items.save')}</Button>}
              />}
            </section>}
          </div>
        </section>
      )}
    </CafePageFrame>
  )
}

function unitLabel(unit: CafeItemSettingUnit, t: ReturnType<typeof useT>): string {
  return unit.labelOrdinal === null
    ? unit.name
    : t('cafe.items.unitDisambiguated', { name: unit.name, number: unit.labelOrdinal })
}

function itemKindLabel(kind: CafeItemSetting['kind'], t: ReturnType<typeof useT>): string {
  if (kind === 'RAW') return t('cafe.items.kindRaw')
  if (kind === 'WIP') return t('cafe.items.kindWip')
  return t('cafe.items.unclassified')
}

function defaultUnitLabel(item: CafeItemSetting, t: ReturnType<typeof useT>): string {
  const unit = item.units.find(candidate => candidate.id === item.defaultUnitId)
  return unit ? unitLabel(unit, t) : t('cafe.items.noDefault')
}

/** The fields the ESB catalog refresh writes, shown as values: MOS cannot change them. */

function ItemIdentity({ item, showCategory = true, progress }: { item: CafeItemListRow; showCategory?: boolean; progress?: string }) {
  return (
    <div className="cafe-items__erp-cell">
      <span className="cafe-items__item-name">{item.erpName}</span>
      {showCategory && item.category && <span className="cafe-items__muted">{item.category}</span>}
      {item.needsUnit && <NeedsUnitStatus />}
      {progress && !item.needsUnit && <span className="cafe-items__muted" role="status">{progress}</span>}
    </div>
  )
}

function NeedsUnitStatus() {
  const t = useT()
  return <span className="cafe-items__needs-unit-status">{t('cafe.items.needsUnit')}</span>
}

function ItemNameEditor({ item, draft, canEdit, saving, onDraftChange, view }: ItemFieldProps & { view: 'table' | 'card' }) {
  const t = useT()
  if (!canEdit) return <span className="cafe-items__mos-value">{item.mosName}</span>
  const invalidName = draft.mosName.trim().length === 0
  const nameInputId = `cafe-item-name-${view}-${item.id}`
  return (
    <div className="cafe-items__name-editor">
      <TextInput
        id={nameInputId}
        label={t('cafe.items.mosName')}
        className="cafe-items__name-input"
        value={draft.mosName}
        maxLength={160}
        required
        error={invalidName}
        aria-describedby={invalidName ? `${nameInputId}-error` : undefined}
        disabled={saving}
        onChange={event => onDraftChange(current => ({ ...current, mosName: event.target.value }))}
      />
      {invalidName && <span id={`${nameInputId}-error`} className="cafe-items__name-error" role="alert">{t('cafe.items.nameRequired')}</span>}
    </div>
  )
}

function ItemKindEditor({ item, draft, canEdit, saving, onDraftChange }: ItemFieldProps) {
  const t = useT()
  if (!canEdit) return <span className="cafe-items__muted">{itemKindLabel(item.kind, t)}</span>
  return (
    <Select
      label={t('cafe.items.kind')}
      aria-label={t('cafe.items.kindFor', { item: draft.mosName })}
      value={draft.kind}
      disabled={saving}
      onChange={event => {
        const value = event.target.value
        if (isCafeItemDraftKind(value)) onDraftChange(current => ({ ...current, kind: value }))
      }}
    >
      <option value="">{t('cafe.items.unclassified')}</option>
      <option value="RAW">{t('cafe.items.kindRaw')}</option>
      <option value="WIP">{t('cafe.items.kindWip')}</option>
    </Select>
  )
}

function ItemActiveEditor({ item, draft, canEdit, saving, onDraftChange }: ItemFieldProps) {
  const t = useT()
  return (
    <label className="cafe-items__active-control">
      {canEdit && (
        <Checkbox
          checked={draft.isActive}
          disabled={saving}
          aria-label={t('cafe.items.activeFor', { item: draft.mosName })}
          onChange={isActive => onDraftChange(current => ({ ...current, isActive }))}
        />
      )}
      <span>{t(canEdit || item.isActive ? 'cafe.items.active' : 'cafe.items.inactive')}</span>
    </label>
  )
}

function ItemDefaultUnitEditor({ item, draft, canEdit, saving, onDraftChange }: ItemFieldProps) {
  const t = useT()
  if (!canEdit || item.units.length === 0) {
    return <span className="cafe-items__default-value">{defaultUnitLabel(item, t)}</span>
  }
  const selectedUnitId = item.units.some(unit => unit.id === draft.defaultUnitId) ? draft.defaultUnitId : ''
  return (
    <Select
      className="cafe-items__unit-select"
      label={t('cafe.items.defaultUnit')}
      value={selectedUnitId}
      disabled={saving || item.units.length === 0}
      onChange={event => onDraftChange(current => ({
        ...current,
        defaultUnitId: event.target.value,
        unitMultiples: event.target.value === current.defaultUnitId ? current.unitMultiples : [],
      }))}
    >
      <option value="">{t('cafe.items.noDefault')}</option>
      {item.units.map(unit => <option key={unit.id} value={unit.id}>{unitLabel(unit, t)}</option>)}
    </Select>
  )
}

function ItemMultiplesEditor({ item, draft, canEdit, saving, onDraftChange }: ItemFieldProps) {
  const t = useT()
  const defaultUnit = item.units.find(unit => unit.id === draft.defaultUnitId)
    ?? item.units.find(unit => unit.id === item.defaultUnitId)
  const unitName = defaultUnit ? unitLabel(defaultUnit, t) : ''
  const savedFactors = draft.defaultUnitId === item.defaultUnitId ? item.unitMultiples ?? [] : []
  const options = [...new Set([...savedFactors, ...draft.unitMultiples])]
    .map(factor => ({ value: String(factor), label: formatUnitMultiple(factor, unitName, document.documentElement.lang || undefined) }))
  if (!canEdit) {
    return draft.unitMultiples.length > 0
      ? <ul className="cafe-items__readonly-multiples">{draft.unitMultiples.map(factor => (
          <li key={factor}>{formatUnitMultiple(factor, unitName, document.documentElement.lang || undefined)}</li>
        ))}</ul>
      : <span className="cafe-items__muted">{t('cafe.items.noMultiples')}</span>
  }
  return (
    <MultiplesPickerEditor
      itemName={draft.mosName}
      unitName={unitName}
      factors={draft.unitMultiples}
      options={options}
      disabled={saving || !defaultUnit}
      maxedOut={draft.unitMultiples.length >= 12}
      onFactorsChange={factors => onDraftChange(current => ({ ...current, unitMultiples: factors }))}
    />
  )
}

function MasterStatus({ item, changed, saving, saveState, hideActive = false }: { item: CafeItemListRow; changed: boolean; saving: boolean; saveState: SaveState; hideActive?: boolean }) {
  const t = useT()
  return <span className="cafe-items__master-status">
    {needsUnit(item) ? <NeedsUnitStatus /> : changed ? t('cafe.items.unsaved') : saving ? t('cafe.items.saving') : saveState?.kind === 'saved' ? t('cafe.items.saved') : hideActive ? null : <StatusBadge status={item.isActive ? 'active' : 'disabled'} label={t(item.isActive ? 'cafe.items.active' : 'cafe.items.inactive')} />}
  </span>
}

function ItemMasterCard({ item, showCategory, draftName, selected, changed, saving, saveState, onSelect, groupedByStatus }: { groupedByStatus: boolean; item: CafeItemListRow; showCategory: boolean; draftName: string; selected: boolean; changed: boolean; saving: boolean; saveState: SaveState; onSelect: () => void }) {
  const t = useT()
  return <button type="button" className="cafe-items__master-card" aria-pressed={selected} onClick={onSelect}>
    <span className="cafe-items__master-card-main"><ItemIdentity item={item} showCategory={showCategory} />{draftName !== item.erpName && <small>{draftName}</small>}</span>
    <span>{itemKindLabel(item.kind, t)} · {defaultUnitLabel(item, t)}</span>
    <MasterStatus item={item} changed={changed} saving={saving} saveState={saveState} hideActive={groupedByStatus} />
  </button>
}

function MultiplesPickerEditor({
  itemName,
  unitName,
  factors,
  options,
  disabled,
  maxedOut,
  onFactorsChange,
}: {
  itemName: string
  unitName: string
  factors: number[]
  options: { value: string; label: string }[]
  disabled: boolean
  maxedOut: boolean
  onFactorsChange: (factors: number[]) => void
}) {
  const t = useT()
  const [factorInput, setFactorInput] = useState('')
  const factor = Number(factorInput)
  const fraction = factorInput.trim().split(/[eE]/)[0]?.split('.')[1] ?? ''
  const alreadySelected = factors.includes(factor)
  const validFactor = Number.isFinite(factor)
    && factor > 0
    && factor <= 10000
    && factor !== 1
    && fraction.length <= 6
    && !/[eE]/.test(factorInput)
  const alreadyDefined = options.some(option => option.value === String(factor))
  const addDisabled = disabled || !validFactor || alreadySelected || (maxedOut && !alreadyDefined)
  const label = t('cafe.items.unitMultiplesFor', { item: itemName })

  function addMultiple() {
    if (addDisabled) return
    onFactorsChange([...factors, factor])
    setFactorInput('')
  }

  return (
    <div className="cafe-items__multiples-editor">
      <MultiPicker
        label={label}
        values={factors.map(String)}
        options={options}
        onChange={values => onFactorsChange(values.map(Number).filter(Number.isFinite))}
        disabled={disabled}
        fullWidth
        hideLabel
        placeholder={t('cafe.items.multipleSelectPlaceholder')}
        footer={(
          <div className="cafe-items__multiple-add">
            <TextInput
              label={t('cafe.items.multipleFactorFor', { unit: unitName })}
              type="number"
              min={0.000001}
              max={10000}
              step="any"
              value={factorInput}
              placeholder={t('cafe.items.multiplePlaceholder')}
              disabled={disabled || (maxedOut && !alreadyDefined)}
              onChange={event => setFactorInput(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addMultiple() } }}
            />
            <Button
              variant="outline"
              className="cafe-items__multiple-add-button"
              disabled={addDisabled}
              aria-label={t('cafe.items.addMultipleAction', { item: itemName })}
              onClick={addMultiple}
            >
              {t('cafe.items.addMultiple')}
            </Button>
            <p className="cafe-items__multiple-help">{t('cafe.items.multipleHelp')}</p>
          </div>
        )}
      />
    </div>
  )
}

/** Why Save is unavailable, said next to the button (never in a tooltip). */
function saveReason(changed: boolean, validName: boolean, saving: boolean, t: ReturnType<typeof useT>): string | null {
  if (saving) return null
  if (!changed) return t('cafe.items.noChangesToSave')
  if (!validName) return t('cafe.items.nameRequired')
  return null
}

function SaveControl({
  changed,
  validName,
  saving,
  state,
  onSave,
}: {
  changed: boolean
  validName: boolean
  saving: boolean
  state: SaveState
  onSave: () => void
}) {
  const t = useT()
  const reason = saveReason(changed, validName, saving, t)
  return (
    <div className="cafe-items__save-control">
      {reason && <span className="cafe-items__save-reason">{reason}</span>}
      <Button
        variant="primary"
        disabled={!changed || saving || !validName}
        onClick={onSave}
      >
        {saving ? t('cafe.items.saving') : t('cafe.items.save')}
      </Button>
      {state?.kind === 'saved' && <span className="cafe-items__saved" role="status">{t('cafe.items.saved')}</span>}
      {state?.kind === 'error' && (
        <span className="cafe-items__save-error" role="alert">
          {t('cafe.items.saveError')}
          <button type="button" className="btn btn-ghost" onClick={onSave}>{t('common.retry')}</button>
        </span>
      )}
    </div>
  )
}
