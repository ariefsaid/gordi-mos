import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/dashboard/data-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { MultiPicker } from '@/components/ui/picker'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
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
import { useCafeItemSettingsSorting } from './cafe-item-settings-sorting'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
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
import { useCafeStream } from '@/lib/use-cafe-stream'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import '@/components/record-collection/record-collection.css'
import './cafe-item-settings-page.css'

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

function itemDraftChanged(item: CafeItemSetting, draft: ItemDraft): boolean {
  return draft.mosName.trim() !== item.mosName
    || draft.kind !== (item.kind ?? '')
    || draft.isActive !== item.isActive
    || draft.defaultUnitId !== (item.defaultUnitId ?? '')
    || !sameFactors(draft.unitMultiples, item.unitMultiples ?? [])
}

function sameFactors(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((left, right) => left - right)
  const sortedB = [...b].sort((left, right) => left - right)
  return sortedA.every((factor, index) => factor === sortedB[index])
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

function CafeItemSettingsPageForViewer() {
  const t = useT()
  const pageTitle = t('cafe.items.title')
  useDocumentTitle(t('common.docTitle', { page: `${pageTitle} · ${t('nav.cafe')}` }))

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
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KitchenItemKindFilter>('All')
  const [activeFilter, setActiveFilter] = useState<KitchenItemActiveFilter>('All')
  const [needsUnitFilter, setNeedsUnitFilter] = useState<KitchenItemNeedsUnitFilter>('All')
  const [listSort, setListSort] = useState<DataTableSort>()
  const isDesktop = useIsDesktop()
  const [readState, setReadState] = useState<ReadState>('loading')
  const [catalogReady, setCatalogReady] = useState(false)
  const [permission, setPermission] = useState<EditPermission>('checking')
  const [permissionStreamKey, setPermissionStreamKey] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [reports, setReports] = useState<CafeMissingItemReport[]>([])
  const [reportsError, setReportsError] = useState(false)
  const [resolvingReportIds, setResolvingReportIds] = useState<Set<string>>(() => new Set())
  const [retryKey, setRetryKey] = useState(0)
  const requestGeneration = useRef(0)

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { draftsRef.current = drafts }, [drafts])

  // One CafeStream bootstrap preserves the module's stream choice and location rules.
  useEffect(() => {
    let active = true
    setReadState('loading')
    setCatalogReady(false)
    void resolveStream().then(catalog => {
      if (active) {
        adoptStream(catalog)
        setCatalogReady(true)
      }
    }).catch(() => {
      if (active) setReadState('error')
    })
    return () => { active = false }
  }, [adoptStream, resolveStream, retryKey])

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
      if (!draft) continue
      if (itemDraftChanged(item, draft)) result.add(item.id)
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

  const streamPicker = (
    <CafeStreamBar
      options={streamOptions}
      stream={stream}
      onChange={requestStreamChange}
      homeStream={homeStream}
      myStreamKeys={myStreamKeys}
      locationBranchId={branchId ?? undefined}
      disabled={readState === 'loading'}
    />
  )

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
    getGroupKey: () => 'all',
    getActive: item => item.isActive,
    getNeedsUnit: needsUnit,
  }), [drafts, items])
  const listSorting = useCafeItemSettingsSorting(listSort)
  const itemTable = useKitchenItemTable({
    data: listRows,
    search,
    kind: kindFilter,
    category: 'All',
    active: activeFilter,
    needsUnit: needsUnitFilter,
    sorting: listSorting,
  })
  const listGroups = readState === 'loading' ? [] : kitchenDataTableGroups(itemTable, () => null)
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
  const columns: DataTableColumn<CafeItemListRow>[] = [
    {
      key: 'itemName',
      header: t('cafe.items.erpName'),
      sortable: true,
      render: item => <ItemIdentity item={item} />,
    },
    {
      key: 'mosName',
      header: t('cafe.items.mosName'),
      render: item => <ItemNameEditor {...editorFor(item)} view="table" />,
    },
    {
      key: 'kind',
      header: t('cafe.items.kind'),
      sortable: true,
      render: item => <ItemKindEditor {...editorFor(item)} />,
    },
    {
      key: 'isActive',
      header: t('cafe.items.activeQuestion'),
      render: item => <ItemActiveEditor {...editorFor(item)} />,
    },
    {
      key: 'defaultUnit',
      header: t('cafe.items.defaultUnit'),
      render: item => <ItemDefaultUnitEditor {...editorFor(item)} />,
    },
    {
      key: 'unitMultiples',
      header: t('cafe.items.unitMultiples'),
      render: item => <ItemMultiplesEditor {...editorFor(item)} />,
    },
    ...(canEdit ? [{
      key: 'actions',
      header: t('cafe.items.actions'),
      render: (item: CafeItemListRow) => {
        const editor = editorFor(item)
        return (
          <SaveControl
            item={item}
            changed={editor.changed}
            validName={editor.draft.mosName.trim().length > 0}
            saving={editor.saving}
            state={editor.saveState}
            onSave={editor.onSave}
          />
        )
      },
    }] : []),
  ]

  const pageMeta = readState === 'ready' && stream
    ? items.length === 1 ? t('cafe.items.countOne') : t('cafe.items.count', { count: items.length })
    : undefined

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('cafe.items.job')}
      statusRow={streamPicker}
      meta={pageMeta}
      state={readState === 'loading' ? 'loading' : readState === 'error' ? 'error' : 'default'}
    >
      <RouteLeaveGuard when={changed.size > 0} message={t('cafe.items.unsaved.copy')} />
      {pendingStream && (
        <ConfirmDialog
          open
          title={t('cafe.items.unsaved.title')}
          body={t('cafe.items.unsaved.copy')}
          confirmLabel={t('cafe.items.unsaved.switch')}
          cancelLabel={t('leaveGuard.stay')}
          tone="destructive"
          onConfirm={async () => applyStreamChange(pendingStream)}
          onCancel={() => setPendingStream(null)}
        />
      )}
      {!stream && readState === 'ready' && (
        <section className="cafe-items__stream-choice" aria-label={t('cafe.items.chooseStream')}>
          <h2>{t('cafe.items.chooseStream')}</h2>
          <CafeStreamChoices
            options={locationOptions}
            homeStream={homeStream}
            myStreamKeys={myStreamKeys}
            onChoose={requestStreamChange}
          />
        </section>
      )}

      {readState === 'loading' && <LoadingShell count={4} label={t('cafe.items.loading')} />}
      {readState === 'error' && (
        <ErrorState message={t('cafe.items.loadError')} onRetry={() => setRetryKey(key => key + 1)} />
      )}
      {readState === 'ready' && stream && permissionError && (
        <p className="cafe-items__permission-error" role="alert">
          {t('cafe.items.permissionError')}
          <button type="button" className="btn btn-ghost" onClick={() => setRetryKey(key => key + 1)}>
            {t('common.retry')}
          </button>
        </p>
      )}
      {readState === 'ready' && stream && permission === 'read-only' && (
        <p className="cafe-items__read-only" role="note">{t('cafe.items.readOnly')}</p>
      )}
      {readState === 'ready' && stream && permission === 'allowed' && (reports.length > 0 || reportsError) && (
        <section className="cafe-item-reports" aria-label={t('cafe.items.reports.aria')}>
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
            <p role="alert">{t('cafe.items.reports.error')}</p>
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
        </section>
      )}
      {readState === 'ready' && stream && items.length > 0 && (
        <p className="cafe-items__read-only cafe-items__inherited-name-note">{t('cafe.items.inheritedName')}</p>
      )}
      {readState === 'ready' && stream && needsUnitCount > 0 && (
        <p className="cafe-items__needs-unit-summary" role="status">
          {t(
            needsUnitCount === 1 ? 'cafe.items.needsSetupCount.one' : 'cafe.items.needsSetupCount.other',
            { count: needsUnitCount },
          )}
        </p>
      )}
      {readState === 'ready' && stream && items.length === 0 && (
        <EmptyState
          variant="awaiting"
          title={t('cafe.items.emptyTitle')}
          copy={t('cafe.items.emptyCopy')}
        />
      )}
      {readState === 'ready' && stream && items.length > 0 && (
        <section className="cafe-items" aria-label={t('cafe.items.listLabel')}>
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('cafe.items.searchPlaceholder')}
            ariaLabel={t('cafe.items.filtersAria')}
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
          />
          <div className="record-collection-view cafe-items__collection">
            <DataTable
              columns={columns}
              rows={visibleItems}
              groups={listGroups}
              tableClassName={`record-collection-table collection-grammar-table cafe-items__table${canEdit ? ' cafe-items__table--editable' : ''}`}
              rowClassName={item => item.needsUnit ? 'cafe-items__row--needs-unit' : undefined}
              sort={listSort}
              onSortChange={next => setListSort(next)}
              isDesktop={isDesktop}
              state={visibleItems.length === 0 ? 'empty' : 'ready'}
              emptyLabel={t('cafe.items.noMatches')}
              caption={t('cafe.items.tableCaption')}
              renderCard={item => <ItemCard {...editorFor(item)} />}
            />
          </div>
        </section>
      )}
    </PageFamilyFrame>
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

function ItemIdentity({ item }: { item: CafeItemListRow }) {
  return (
    <div className="cafe-items__erp-cell">
      <span className="cafe-items__item-name">{item.erpName}</span>
      {item.category && <span className="cafe-items__item-meta">{item.category}</span>}
      {item.needsUnit && <NeedsUnitStatus />}
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
    <div className="cafe-items__active-control">
      {canEdit && (
        <Checkbox
          checked={draft.isActive}
          disabled={saving}
          aria-label={t('cafe.items.activeFor', { item: draft.mosName })}
          onChange={isActive => onDraftChange(current => ({ ...current, isActive }))}
        />
      )}
      <span>{t((canEdit ? draft.isActive : item.isActive) ? 'cafe.items.active' : 'cafe.items.inactive')}</span>
    </div>
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

function ItemCard({ item, draft, canEdit, saving, changed, saveState, onDraftChange, onSave }: ItemEditorProps) {
  const t = useT()
  const invalidName = draft.mosName.trim().length === 0
  return (
    <article className="cafe-items__card-body" aria-labelledby={`cafe-item-${item.id}`}>
      <header className="cafe-items__card-header">
        <span className="cafe-items__field-label">{t('cafe.items.erpName')}</span>
        <h2 id={`cafe-item-${item.id}`} className="cafe-items__item-name">
          {item.erpName}{item.needsUnit && <NeedsUnitStatus />}
        </h2>
        {item.category && <p className="cafe-items__item-meta">{item.category}</p>}
      </header>
      <div className="cafe-items__card-field">
        {!canEdit && <span className="cafe-items__field-label">{t('cafe.items.mosName')}</span>}
        <ItemNameEditor item={item} draft={draft} canEdit={canEdit} saving={saving} onDraftChange={onDraftChange} view="card" />
      </div>
      <div className="cafe-items__card-fields--split">
        <div className="cafe-items__card-field">
          {!canEdit && <span className="cafe-items__field-label">{t('cafe.items.kind')}</span>}
          <ItemKindEditor item={item} draft={draft} canEdit={canEdit} saving={saving} onDraftChange={onDraftChange} />
        </div>
        <div className="cafe-items__card-field">
          <span className="cafe-items__field-label">{t('cafe.items.activeQuestion')}</span>
          <ItemActiveEditor item={item} draft={draft} canEdit={canEdit} saving={saving} onDraftChange={onDraftChange} />
        </div>
      </div>
      <div className="cafe-items__card-field">
        {!canEdit && <span className="cafe-items__field-label">{t('cafe.items.defaultUnit')}</span>}
        <ItemDefaultUnitEditor item={item} draft={draft} canEdit={canEdit} saving={saving} onDraftChange={onDraftChange} />
      </div>
      <div className="cafe-items__card-field">
        <span className="cafe-items__field-label">{t('cafe.items.unitMultiples')}</span>
        <ItemMultiplesEditor item={item} draft={draft} canEdit={canEdit} saving={saving} onDraftChange={onDraftChange} />
      </div>
      {canEdit && (
        <div className="cafe-items__card-action">
          <SaveControl item={item} changed={changed} validName={!invalidName} saving={saving} state={saveState} onSave={onSave} />
        </div>
      )}
    </article>
  )
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

function SaveControl({
  item,
  changed,
  validName,
  saving,
  state,
  onSave,
}: {
  item: CafeItemSetting
  changed: boolean
  validName: boolean
  saving: boolean
  state: SaveState
  onSave: () => void
}) {
  const t = useT()
  return (
    <div className="cafe-items__save-control">
      <Button
        variant="primary"
        disabled={!changed || saving || !validName}
        aria-label={t('cafe.items.saveAction', { item: item.mosName })}
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
