import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import type { CafeItemSetting, CafeItemSettingUnit } from '@/lib/db/cafe-item-settings'
import {
  canManageCafeItemSettings,
  listCafeItemSettings,
  saveCafeItemSettings,
} from '@/lib/db/cafe-item-settings'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import './cafe-item-settings-page.css'

type ItemDraft = {
  mosName: string
  defaultUnitId: string
  shownUnitIds: string[]
}

type ReadState = 'loading' | 'ready' | 'error'
type EditPermission = 'checking' | 'allowed' | 'read-only' | 'error'

type SaveState = { kind: 'saved' } | { kind: 'error'; message: string } | null

function initialDraft(item: CafeItemSetting): ItemDraft {
  return {
    mosName: item.mosName,
    defaultUnitId: item.defaultUnitId ?? '',
    shownUnitIds: item.units.filter(unit => unit.isShown).map(unit => unit.id),
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, index) => id === sortedB[index])
}

function hasDefault(item: CafeItemSetting): boolean {
  return item.defaultUnitId !== null && item.units.some(unit =>
    unit.id === item.defaultUnitId && unit.isDefault && unit.isShown,
  )
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
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [readState, setReadState] = useState<ReadState>('loading')
  const [catalogReady, setCatalogReady] = useState(false)
  const [permission, setPermission] = useState<EditPermission>('checking')
  const [permissionError, setPermissionError] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [retryKey, setRetryKey] = useState(0)
  const requestGeneration = useRef(0)

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
      setItems([])
      setDrafts({})
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
        canManageCafeItemSettings().then(
          value => ({ value, failed: false as const }),
          () => ({ value: false, failed: true as const }),
        ),
      ])
      if (generation !== requestGeneration.current) return
      setItems(nextItems)
      setDrafts(Object.fromEntries(nextItems.map(item => [item.id, initialDraft(item)])))
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

  const canEdit = permission === 'allowed'
  const streamPicker = (
    <CafeStreamBar
      options={streamOptions}
      stream={stream}
      onChange={setStream}
      homeStream={homeStream}
      myStreamKeys={myStreamKeys}
      locationBranchId={branchId ?? undefined}
      disabled={readState === 'loading'}
    />
  )

  const changed = useMemo(() => {
    const result = new Set<string>()
    for (const item of items) {
      const draft = drafts[item.id]
      if (!draft) continue
      const shown = item.units.filter(unit => unit.isShown).map(unit => unit.id)
      if (
        draft.mosName.trim() !== item.mosName
        || draft.defaultUnitId !== (item.defaultUnitId ?? '')
        || !sameIds(draft.shownUnitIds, shown)
      ) result.add(item.id)
    }
    return result
  }, [drafts, items])

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
    setSavingIds(current => new Set(current).add(item.id))
    setSaveStates(current => ({ ...current, [item.id]: null }))
    try {
      const mosName = draft.mosName.trim()
      const shownUnitIds = item.units.filter(unit => draft.shownUnitIds.includes(unit.id)).map(unit => unit.id)
      const defaultUnitId = draft.defaultUnitId && shownUnitIds.includes(draft.defaultUnitId)
        ? draft.defaultUnitId
        : null
      await saveCafeItemSettings({
        stream,
        itemId: item.id,
        mosName,
        defaultUnitId,
        shownUnitIds,
      })
      setItems(current => current.map(candidate => candidate.id !== item.id ? candidate : {
        ...candidate,
        mosName: mosName === candidate.erpName ? candidate.erpName : mosName,
        defaultUnitId,
        units: candidate.units.map(unit => ({
          ...unit,
          isShown: shownUnitIds.includes(unit.id),
          isDefault: unit.id === defaultUnitId,
        })),
      }))
      setDrafts(current => ({
        ...current,
        [item.id]: { mosName, defaultUnitId: defaultUnitId ?? '', shownUnitIds },
      }))
      setSaveStates(current => ({ ...current, [item.id]: { kind: 'saved' } }))
    } catch {
      setSaveStates(current => ({ ...current, [item.id]: { kind: 'error', message: t('cafe.items.saveError') } }))
    } finally {
      setSavingIds(current => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }, [canEdit, changed, drafts, stream, t])

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
      {!stream && readState === 'ready' && (
        <section className="cafe-items__stream-choice" aria-label={t('cafe.items.chooseStream')}>
          <h2>{t('cafe.items.chooseStream')}</h2>
          <CafeStreamChoices
            options={locationOptions}
            homeStream={homeStream}
            myStreamKeys={myStreamKeys}
            onChoose={setStream}
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
      {readState === 'ready' && stream && items.length > 0 && (
        <p className="cafe-items__read-only">{t('cafe.items.inheritedName')}</p>
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
          <div className="cafe-items__table-wrap">
            <table className="cafe-items__table">
              <caption className="sr-only">{t('cafe.items.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('cafe.items.erpName')}</th>
                  <th scope="col">{t('cafe.items.mosName')}</th>
                  <th scope="col">{t('cafe.items.defaultUnit')}</th>
                  <th scope="col">{t('cafe.items.shownUnits')}</th>
                  {canEdit && <th scope="col"><span className="sr-only">{t('cafe.items.actions')}</span></th>}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    draft={drafts[item.id] ?? initialDraft(item)}
                    canEdit={canEdit}
                    saving={savingIds.has(item.id)}
                    changed={changed.has(item.id)}
                    saveState={saveStates[item.id] ?? null}
                    onDraftChange={update => setDraft(item.id, update)}
                    onSave={() => void saveItem(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="cafe-items__cards">
            {items.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                draft={drafts[item.id] ?? initialDraft(item)}
                canEdit={canEdit}
                saving={savingIds.has(item.id)}
                changed={changed.has(item.id)}
                saveState={saveStates[item.id] ?? null}
                onDraftChange={update => setDraft(item.id, update)}
                onSave={() => void saveItem(item)}
              />
            ))}
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

function defaultUnitLabel(item: CafeItemSetting, t: ReturnType<typeof useT>): string {
  const unit = item.units.find(candidate => candidate.id === item.defaultUnitId)
  return unit ? unitLabel(unit, t) : t('cafe.items.noDefault')
}

function ItemRow({
  item,
  draft,
  canEdit,
  saving,
  changed,
  saveState,
  onDraftChange,
  onSave,
}: {
  item: CafeItemSetting
  draft: ItemDraft
  canEdit: boolean
  saving: boolean
  changed: boolean
  saveState: SaveState
  onDraftChange: (update: (draft: ItemDraft) => ItemDraft) => void
  onSave: () => void
}) {
  const t = useT()
  const invalidName = draft.mosName.trim().length === 0
  const nameInputId = `cafe-item-name-table-${item.id}`
  const unsetDefault = item.units.length > 0 && !hasDefault(item)
  return (
    <tr>
      <th scope="row" className="cafe-items__erp-cell">
        <span className="cafe-items__item-name">{item.erpName}</span>
        <span className="cafe-items__item-meta">
          {item.category ? `${item.category} · ` : ''}{t(item.kind === 'RAW' ? 'cafe.items.kindRaw' : 'cafe.items.kindWip')}
        </span>
      </th>
      <td data-label={t('cafe.items.mosName')}>
        {canEdit ? (
          <>
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
          </>
        ) : <span className="cafe-items__mos-value">{item.mosName}</span>}
      </td>
      <td data-label={t('cafe.items.defaultUnit')}>
        {canEdit ? (
          <Select
            label={t('cafe.items.defaultUnit')}
            value={draft.defaultUnitId}
            disabled={saving || item.units.length === 0}
            onChange={event => {
              const nextId = event.target.value
              onDraftChange(current => ({
                ...current,
                defaultUnitId: nextId,
                shownUnitIds: nextId && !current.shownUnitIds.includes(nextId)
                  ? [...current.shownUnitIds, nextId]
                  : current.shownUnitIds,
              }))
            }}
          >
            <option value="">{t('cafe.items.noDefault')}</option>
            {item.units.map(unit => <option key={unit.id} value={unit.id}>{unitLabel(unit, t)}</option>)}
          </Select>
        ) : (
          <span className="cafe-items__default-value">{defaultUnitLabel(item, t)}</span>
        )}
        {unsetDefault && <span className="cafe-items__setup-note">{t('cafe.items.needsSetup')}</span>}
      </td>
      <td data-label={t('cafe.items.shownUnits')}>
        {item.units.length === 0 ? (
          <span className="cafe-items__muted">{t('cafe.items.noErpUnits')}</span>
        ) : canEdit ? (
          <ShownUnits
            item={item}
            draft={draft}
            disabled={saving}
            onDraftChange={onDraftChange}
          />
        ) : (
          <ReadOnlyUnits item={item} />
        )}
      </td>
      {canEdit && (
        <td className="cafe-items__action-cell">
          <SaveControl
            item={item}
            changed={changed}
            validName={!invalidName}
            saving={saving}
            state={saveState}
            onSave={onSave}
          />
        </td>
      )}
    </tr>
  )
}

function ItemCard({
  item,
  draft,
  canEdit,
  saving,
  changed,
  saveState,
  onDraftChange,
  onSave,
}: {
  item: CafeItemSetting
  draft: ItemDraft
  canEdit: boolean
  saving: boolean
  changed: boolean
  saveState: SaveState
  onDraftChange: (update: (draft: ItemDraft) => ItemDraft) => void
  onSave: () => void
}) {
  const t = useT()
  const invalidName = draft.mosName.trim().length === 0
  const nameInputId = `cafe-item-name-card-${item.id}`
  const unsetDefault = item.units.length > 0 && !hasDefault(item)
  return (
    <article className="cafe-items__card" aria-labelledby={`cafe-item-${item.id}`}>
      <header className="cafe-items__card-header">
        <span className="cafe-items__field-label">{t('cafe.items.erpName')}</span>
        <h2 id={`cafe-item-${item.id}`} className="cafe-items__item-name">{item.erpName}</h2>
        <p className="cafe-items__item-meta">
          {item.category ? `${item.category} · ` : ''}{t(item.kind === 'RAW' ? 'cafe.items.kindRaw' : 'cafe.items.kindWip')}
        </p>
      </header>
      <div className="cafe-items__card-field">
        {canEdit ? (
          <>
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
          </>
        ) : (
          <>
            <span className="cafe-items__field-label">{t('cafe.items.mosName')}</span>
            <span className="cafe-items__mos-value">{item.mosName}</span>
          </>
        )}
      </div>
      <div className="cafe-items__card-field">
        {canEdit && item.units.length > 0 ? (
          <Select
            label={t('cafe.items.defaultUnit')}
            value={draft.defaultUnitId}
            disabled={saving}
            onChange={event => {
              const nextId = event.target.value
              onDraftChange(current => ({
                ...current,
                defaultUnitId: nextId,
                shownUnitIds: nextId && !current.shownUnitIds.includes(nextId)
                  ? [...current.shownUnitIds, nextId]
                  : current.shownUnitIds,
              }))
            }}
          >
            <option value="">{t('cafe.items.noDefault')}</option>
            {item.units.map(unit => <option key={unit.id} value={unit.id}>{unitLabel(unit, t)}</option>)}
          </Select>
        ) : (
          <>
            <span className="cafe-items__field-label">{t('cafe.items.defaultUnit')}</span>
            <span className="cafe-items__default-value">{defaultUnitLabel(item, t)}</span>
          </>
        )}
        {unsetDefault && <span className="cafe-items__setup-note">{t('cafe.items.needsSetup')}</span>}
      </div>
      <div className="cafe-items__card-field">
        <span className="cafe-items__field-label">{t('cafe.items.shownUnits')}</span>
        {item.units.length === 0 ? (
          <span className="cafe-items__muted">{t('cafe.items.noErpUnits')}</span>
        ) : canEdit ? (
          <ShownUnits item={item} draft={draft} disabled={saving} onDraftChange={onDraftChange} />
        ) : (
          <ReadOnlyUnits item={item} />
        )}
      </div>
      {canEdit && (
        <div className="cafe-items__card-action">
          <SaveControl item={item} changed={changed} validName={!invalidName} saving={saving} state={saveState} onSave={onSave} />
        </div>
      )}
    </article>
  )
}

function ShownUnits({
  item,
  draft,
  disabled,
  onDraftChange,
}: {
  item: CafeItemSetting
  draft: ItemDraft
  disabled: boolean
  onDraftChange: (update: (draft: ItemDraft) => ItemDraft) => void
}) {
  const t = useT()
  return (
    <fieldset className="cafe-items__unit-fieldset" disabled={disabled}>
      <legend className="sr-only">{t('cafe.items.shownUnitsFor', { item: item.mosName })}</legend>
      <div className="cafe-items__unit-list">
        {item.units.map(unit => {
          const label = unitLabel(unit, t)
          const checked = draft.shownUnitIds.includes(unit.id)
          return (
            <label key={unit.id} className="cafe-items__unit-choice">
              <Checkbox
                checked={checked}
                disabled={disabled}
                aria-label={t('cafe.items.showUnitAction', { unit: label })}
                onChange={next => onDraftChange(current => ({
                  ...current,
                  shownUnitIds: next
                    ? [...current.shownUnitIds, unit.id]
                    : current.shownUnitIds.filter(id => id !== unit.id),
                  defaultUnitId: next || current.defaultUnitId !== unit.id ? current.defaultUnitId : '',
                }))}
              />
              <span>{label}</span>
              {unit.id === draft.defaultUnitId && <span className="cafe-items__default-tag">{t('cafe.items.defaultTag')}</span>}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function ReadOnlyUnits({ item }: { item: CafeItemSetting }) {
  const t = useT()
  if (!item.units.some(unit => unit.isShown)) {
    return <span className="cafe-items__muted">{t('cafe.items.noneShown')}</span>
  }
  return (
    <ul className="cafe-items__readonly-units">
      {item.units.filter(unit => unit.isShown).map(unit => (
        <li key={unit.id}>
          {unitLabel(unit, t)}
          {unit.isDefault && <span className="cafe-items__default-tag">{t('cafe.items.defaultTag')}</span>}
        </li>
      ))}
    </ul>
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
