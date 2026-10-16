import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterChip } from '@/components/ui/filter-chip'
import { Notice } from '@/components/ui/notice'
import { Pill } from '@/components/ui/pill'
import { SearchField } from '@/components/ui/search-field'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { CHANGE_LOCATION_PATH, LOCATIONS_PATH } from '@/lib/cafe-locations-preview'
import { ContractError } from '@/lib/db/contract'
import { listActiveBranches } from '@/lib/db/branches'
import {
  archiveCafeLocation, createCafeLocation, listCafeLocations, updateCafeLocation,
  type CafeLocation, type LocationInput,
} from '@/lib/db/cafe-locations'
import type { BranchOption } from '@/lib/db/kitchen-logs.types'
import {
  NEW_LOCATION, applyLocationFilters, draftIsDirty, draftOf, parentChoices, parseLocationFilters, validateDraft,
  type LocationDraft, type LocationProblem, type LocationRow, type LocationUse,
} from '@/lib/cafe-locations-view'
import { formatWibShortDateTime } from '@/lib/format/date'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useCafeSetupWorkspace } from './use-cafe-setup-workspace'
import '@/components/record-collection/record-collection.css'
import '@/components/kitchen/cafe-setup-workspace.css'
import './cafe-locations-page.css'

type Loaded = { branches: BranchOption[]; locations: CafeLocation[]; at: string }

const USE_KEY: Record<LocationUse, MessageKey> = {
  production: 'cafe.locations.use.production',
  storage: 'cafe.locations.use.storage',
  both: 'cafe.locations.use.both',
}
const PROBLEM_KEY: Record<LocationProblem, MessageKey> = {
  nameBlank: 'cafe.locations.error.nameBlank',
  duplicate: 'cafe.locations.error.duplicate',
  cycle: 'cafe.locations.error.cycle',
  branchesOutsideParent: 'cafe.locations.error.branchesOutsideParent',
}
const USES: LocationUse[] = ['production', 'storage', 'both']

function toLocationRow(location: CafeLocation): LocationRow {
  return {
    id: location.id, name: location.name, use: location.use, parentId: location.parent_id,
    branchIds: location.branch_ids, archived: location.archived_at !== null, rowVersion: location.row_version,
  }
}

export function CafeLocationsPage() {
  const auth = useAuth()
  return <Locations key={auth.status === 'authenticated' ? auth.viewer.person.id : auth.status} />
}

function Locations() {
  const {
    t, locale, isAdmin, isDesktop, offline, params, setParams, data, setData,
    error, setError, retry, setRetry, dirty, setDirty, listRef, lastOpened,
  } = useCafeSetupWorkspace<Loaded>()

  useEffect(() => {
    let active = true
    Promise.all([listActiveBranches(), listCafeLocations({ archived: false }), listCafeLocations({ archived: true })])
      .then(([branches, current, archived]) => {
        if (active) { setData({ branches, locations: [...current, ...archived], at: new Date().toISOString() }); setError(false) }
      })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [retry, setData, setError])

  useEffect(() => {
    if (!params.has('layout')) return
    const next = new URLSearchParams(params)
    next.delete('layout')
    setParams(next, { replace: true })
  }, [params, setParams])

  const filters = parseLocationFilters(params)
  const selected = params.get('location')
  const update = useCallback((change: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(change)) { if (value === null || value === '') next.delete(key); else next.set(key, value) }
    next.delete('layout')
    setParams(next, { replace })
  }, [params, setParams])

  const rows = useMemo(() => (data?.locations ?? []).map(toLocationRow), [data])
  const branchName = useCallback((id: string) => data?.branches.find((branch) => branch.id === id)?.name ?? t('cafe.locations.branchUnavailable'), [data, t])
  const nameOf = useCallback((row: LocationRow) => row.name, [])
  const parentOf = useCallback((row: LocationRow) => {
    const parent = row.parentId ? rows.find((candidate) => candidate.id === row.parentId) : undefined
    return parent ? nameOf(parent) : null
  }, [rows, nameOf])
  const branchesText = useCallback((row: LocationRow) => row.branchIds.map(branchName).join(', '), [branchName])
  const searchable = useCallback((row: LocationRow) => `${nameOf(row)} ${t(USE_KEY[row.use])} ${parentOf(row) ?? ''} ${branchesText(row)}`, [nameOf, t, parentOf, branchesText])
  const visible = useMemo(() => applyLocationFilters(rows, filters, searchable), [rows, filters, searchable])

  useEffect(() => {
    if (!data || selected) return
    if (lastOpened.current) {
      const opener = document.querySelector<HTMLElement>(`[data-location-open="${CSS.escape(lastOpened.current)}"]`)
      lastOpened.current = null
      if (opener) opener.focus(); else listRef.current?.focus()
    }
  }, [selected, data, lastOpened, listRef])

  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [
    ...(filters.branch !== 'all' ? [{ key: 'branch', label: `${t('cafe.locations.branch')}: ${branchName(filters.branch)}`, clear: { branch: null } }] : []),
    ...(filters.use !== 'all' ? [{ key: 'use', label: `${t('cafe.locations.use')}: ${t(USE_KEY[filters.use])}`, clear: { use: null } }] : []),
    ...(filters.status === 'archived' ? [{ key: 'status', label: `${t('cafe.locations.status')}: ${t('cafe.locations.status.archived')}`, clear: { status: null } }] : []),
    ...(filters.q ? [{ key: 'q', label: `${t('cafe.locations.search')}: ${filters.q}`, clear: { q: null } }] : []),
  ]
  const clearAll = () => update({ branch: null, use: null, status: null, q: null })
  const open = (id: string) => { lastOpened.current = id; update({ location: id }, false) }
  const hrefFor = (id: string) => { const next = new URLSearchParams(params); next.set('location', id); next.delete('layout'); return { pathname: LOCATIONS_PATH, search: next.toString() } }
  const sortState = (key: 'name' | 'use' | 'status') => filters.sort === key ? filters.dir : undefined
  const selectedRow = selected && selected !== NEW_LOCATION ? rows.find((row) => row.id === selected) ?? null : null
  const panelOpen = Boolean(selected) && Boolean(data)

  const columns: DataTableColumn<LocationRow>[] = [
    { key: 'name', header: t('cafe.locations.col.location'), sortable: true, render: (row) => <strong className="cafe-locs__name">{nameOf(row)}</strong> },
    { key: 'status', header: t('cafe.locations.col.status'), sortable: true, render: (row) => <LocationStatus row={row} /> },
    { key: 'use', header: t('cafe.locations.col.use'), sortable: true, render: (row) => t(USE_KEY[row.use]) },
    { key: 'branches', header: t('cafe.locations.col.branches'), render: (row) => row.branchIds.length ? branchesText(row) : <span className="cafe-locs__muted">{t('cafe.locations.none')}</span> },
    { key: 'parent', header: t('cafe.locations.col.parent'), render: (row) => parentOf(row) ?? <span className="cafe-locs__muted">{t('cafe.locations.none')}</span> },
    { key: 'actions', header: <span className="sr-only">{t('cafe.locations.col.actions')}</span>, render: (row) =>
      <Link className="cafe-locs__open" data-location-open={row.id} to={hrefFor(row.id)} aria-label={`${t('cafe.locations.view')}: ${nameOf(row)}`}>{t('cafe.locations.view')}</Link> },
  ]

  const addAction = isAdmin && !selected ? <Button variant="primary" disabled={offline} onClick={() => open(NEW_LOCATION)}>{t('cafe.locations.add')}</Button> : undefined
  const reasonNode = isAdmin && offline ? <span>{t('cafe.locations.offlineStale', { time: data ? formatWibShortDateTime(data.at, locale) : '' })}</span> : undefined
  const filterControls = (
    <>
      <Select label={t('cafe.locations.use')} value={filters.use} onChange={(event) => update({ use: event.target.value === 'all' ? null : event.target.value })}>
        <option value="all">{t('cafe.locations.use.all')}</option>
        {USES.map((use) => <option key={use} value={use}>{t(USE_KEY[use])}</option>)}
      </Select>
      <Select label={t('cafe.locations.status')} value={filters.status} onChange={(event) => update({ status: event.target.value === 'active' ? null : event.target.value })}>
        <option value="active">{t('cafe.locations.status.active')}</option>
        <option value="archived">{t('cafe.locations.status.archived')}</option>
      </Select>
    </>
  )
  const activeFilterCount = (filters.use !== 'all' ? 1 : 0) + (filters.status === 'archived' ? 1 : 0)
  const refresh = () => { setData(undefined); setRetry((count) => count + 1) }

  let body
  if (error) body = <ErrorState message={t('cafe.locations.loadError')} onRetry={() => { setError(false); refresh() }} />
  else if (!data) body = <LoadingShell count={4} label={t('cafe.locations.loading')} />
  else body = (
    <div className={`cafe-setup-workspace cafe-locs__workspace${panelOpen ? ' cafe-setup-workspace--selected' : ''}`}>
      <section ref={listRef} tabIndex={-1} className="cafe-locs" aria-label={t('cafe.locations.list')}>
        {offline && <Notice tone="attention">{t('cafe.locations.offlineStale', { time: formatWibShortDateTime(data.at, locale) })}</Notice>}
        <div className="cafe-locs__scope">
          <Select label={t('cafe.locations.branch')} value={filters.branch} onChange={(event) => update({ branch: event.target.value === 'all' ? null : event.target.value })} fullWidth>
            <option value="all">{t('cafe.locations.allBranches')}</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Link className="btn btn-outline btn-touch cafe-locs__change" to={CHANGE_LOCATION_PATH}>{t('cafe.locations.move')}</Link>
        </div>
        <div className="cafe-locs__toolbar">
          <SearchField label={t('cafe.locations.search')} placeholder={t('cafe.locations.searchHint')} value={filters.q} onChange={(value) => update({ q: value })} />
          {isDesktop ? filterControls : <details className="cafe-locs__filters"><summary>{t('cafe.locations.filters')}{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}</summary><div className="cafe-locs__filters-body">{filterControls}</div></details>}
          <span className="cafe-locs__count tabular" role="status">{t(visible.length === 1 ? 'cafe.locations.count.one' : 'cafe.locations.count.other', { count: visible.length })}</span>
        </div>
        {chips.length > 0 && <div className="cafe-locs__chips">
          {chips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={() => update(chip.clear)} />)}
          <Button variant="ghost" onClick={clearAll}>{t('common.clearFilters')}</Button>
        </div>}
        {rows.length === 0 && filters.status === 'active' ? (
          <EmptyState variant="blank" title={t('cafe.locations.emptyTitle')} copy={isAdmin ? t('cafe.locations.emptyBody') : t('cafe.locations.emptyOthers')}>
            {isAdmin ? <Button variant="primary" disabled={offline} onClick={() => open(NEW_LOCATION)}>{t('cafe.locations.add')}</Button> : null}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState variant="blank" title={t('cafe.locations.noMatch')}><Button onClick={clearAll}>{t('common.clearFilters')}</Button></EmptyState>
        ) : (
          <div className="record-collection-view">
            <DataTable<LocationRow>
              columns={columns} rows={visible} isDesktop={isDesktop && !panelOpen} caption={t('cafe.locations.list')}
              tableClassName="record-collection-table collection-grammar-table cafe-locs__table"
              sort={{ key: filters.sort, dir: sortState(filters.sort) ?? 'asc' }}
              onSortChange={(next) => update({ sort: next.key === 'name' ? null : next.key, dir: next.dir === 'asc' ? null : next.dir })}
              rowClassName={(row) => row.id === selected ? 'is-selected' : undefined}
              renderCard={(row) => <Link className="cafe-locs__card" aria-current={row.id === selected ? 'true' : undefined} data-location-open={row.id} to={hrefFor(row.id)} onClick={() => { lastOpened.current = row.id }}>
                <span className="cafe-locs__card-main"><span className="cafe-locs__card-title">{nameOf(row)}</span>
                  <span className="cafe-locs__card-meta">{[t(USE_KEY[row.use]), parentOf(row), row.branchIds.length ? branchesText(row) : null].filter(Boolean).join(' · ')}</span></span>
                <LocationStatus row={row} /><span className="cafe-locs__card-view">{t('cafe.locations.view')}</span>
              </Link>}
            />
          </div>
        )}
      </section>
      {panelOpen && <LocationPanel
        key={selected ?? 'none'} rows={rows} row={selectedRow} isNew={selected === NEW_LOCATION} isAdmin={isAdmin}
        invalid={selected !== NEW_LOCATION && !selectedRow} offline={offline} branches={data.branches}
        parentOf={parentOf} branchName={branchName}
        onClose={() => update({ location: null }, false)} onDirty={setDirty}
        onSaved={(location) => { refresh(); update({ location: location?.id ?? null, status: location?.archived_at ? 'archived' : filters.status }, false) }}
      />}
    </div>
  )

  return <CafePageFrame page="locations" state={error ? 'error' : !data ? 'loading' : 'default'}
    primaryAction={data && !error ? addAction : undefined} primaryActionReason={data && !error && addAction ? reasonNode : undefined}>
    <RouteLeaveGuard when={dirty} message={t('cafe.locations.leaveMessage')} includeSearch />
    {body}
  </CafePageFrame>
}

function LocationStatus({ row }: { row: LocationRow }) {
  const t = useT()
  return row.archived ? <Pill tone="neutral">{t('cafe.locations.status.archived')}</Pill> : <Pill tone="success">{t('cafe.locations.status.active')}</Pill>
}

interface PanelProps {
  rows: LocationRow[]; row: LocationRow | null; isNew: boolean; isAdmin: boolean; invalid: boolean; offline: boolean
  branches: BranchOption[]; parentOf: (row: LocationRow) => string | null; branchName: (id: string) => string
  onClose: () => void; onDirty: (dirty: boolean) => void; onSaved: (location: CafeLocation | null) => void
}

function LocationPanel({ rows, row, isNew, isAdmin, invalid, offline, branches, parentOf, branchName, onClose, onDirty, onSaved }: PanelProps) {
  const t = useT()
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<MessageKey | null>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const initial = useMemo(() => draftOf(row), [row])
  const [draft, setDraft] = useState<LocationDraft>(initial)
  const dirty = draftIsDirty(draft, initial)
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  const problems = validateDraft(draft, rows, row?.id ?? null)
  const parents = useMemo(() => parentChoices(row?.id ?? null, rows), [row, rows])
  const disabled = !isAdmin || offline || busy
  const backLabel = t('record.backToCollection', { collection: t('cafe.pageTitle.locations') })
  const title = invalid || (isNew && !isAdmin) ? t('cafe.locations.notFound') : isNew ? t('cafe.locations.add') : row?.name ?? t('cafe.locations.notFound')
  const hidden = invalid || (isNew && !isAdmin)
  const serverErrorKey = (error: unknown): MessageKey => {
    if (!(error instanceof ContractError)) return 'cafe.locations.error.save'
    if (error.code === 'CONFLICT') return 'cafe.locations.error.conflict'
    if (error.code === 'IN_USE') return 'cafe.locations.error.inUse'
    if (error.code === 'FORBIDDEN') return 'cafe.locations.error.forbidden'
    if (error.message.includes('DUPLICATE')) return 'cafe.locations.error.duplicate'
    if (error.message.includes('CYCLE')) return 'cafe.locations.error.cycle'
    if (error.message.includes('PARENT_BRANCH')) return 'cafe.locations.error.branchesOutsideParent'
    return 'cafe.locations.error.save'
  }
  const save = async () => {
    setBusy(true); setServerError(null)
    const input: LocationInput = { name: draft.name, use: draft.use, parent_id: draft.parentId, branch_ids: draft.branchIds }
    try {
      const saved = isNew
        ? await createCafeLocation(input, { client_request_id: crypto.randomUUID() })
        : await updateCafeLocation(row!.id, row!.rowVersion, input, { client_request_id: crypto.randomUUID() })
      onSaved(saved)
    } catch (error) { setServerError(serverErrorKey(error)) }
    finally { setBusy(false) }
  }
  const archive = async () => {
    if (!row) return
    setBusy(true); setServerError(null)
    try {
      const saved = await archiveCafeLocation(row.id, row.rowVersion, { client_request_id: crypto.randomUUID() })
      setConfirmArchive(false); onSaved(saved)
    } catch (error) { setServerError(serverErrorKey(error)); throw error }
    finally { setBusy(false) }
  }

  return <section className="cafe-locs__panel" aria-label={t('cafe.locations.panel')} onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose() }}>
    <Button variant="ghost" className="cafe-locs__back" onClick={onClose}>{backLabel}</Button>
    <h2 ref={heading} tabIndex={-1} className="cafe-locs__panel-title">{title}</h2>
    {hidden ? <p className="cafe-locs__note">{t('cafe.locations.notFoundBody')}</p> : <>
      <p className="cafe-locs__panel-badges">{row && <LocationStatus row={row} />}</p>
      {isAdmin ? <div className="cafe-locs__form" role="group" aria-label={t('cafe.locations.panel')}>
        <p className="cafe-locs__note">{t('cafe.locations.explain')}</p>
        <div className="cafe-locs__field">
          <TextInput label={t('cafe.locations.name')} value={draft.name} fullWidth autoComplete="off" disabled={disabled}
            error={(problems.includes('nameBlank') && dirty) || problems.includes('duplicate')}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          {problems.includes('nameBlank') && dirty && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.nameBlank)}</p>}
          {problems.includes('duplicate') && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.duplicate)}</p>}
        </div>
        <Select label={t('cafe.locations.use')} value={draft.use} fullWidth disabled={disabled} onChange={(event) => setDraft({ ...draft, use: event.target.value as LocationUse })}>
          {USES.map((use) => <option key={use} value={use}>{t(USE_KEY[use])}</option>)}
        </Select>
        <div className="cafe-locs__field">
          <Select label={t('cafe.locations.parent')} value={draft.parentId ?? ''} fullWidth disabled={disabled} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || null })}>
            <option value="">{t('cafe.locations.parentNone')}</option>
            {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
          </Select>
          {problems.includes('cycle') && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.cycle)}</p>}
          {problems.includes('branchesOutsideParent') && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.branchesOutsideParent)}</p>}
        </div>
        <BranchChecklist branches={branches} value={draft.branchIds} disabled={disabled} onChange={(branchIds) => setDraft({ ...draft, branchIds })} />
        <p className="cafe-locs__note">{t('cafe.locations.archiveNote')}</p>
        {serverError && <p className="cafe-locs__field-error" role="alert">{t(serverError)}</p>}
      </div> : row && <dl className="cafe-locs__facts">
        <div><dt>{t('cafe.locations.use')}</dt><dd>{t(USE_KEY[row.use])}</dd></div>
        <div><dt>{t('cafe.locations.parent')}</dt><dd>{parentOf(row) ?? t('cafe.locations.none')}</dd></div>
        <div><dt>{t('cafe.locations.branchesField')}</dt><dd>{row.branchIds.length ? row.branchIds.map(branchName).join(', ') : t('cafe.locations.none')}</dd></div>
      </dl>}
      {isAdmin && <ActionBar className="cafe-locs__actions" reason={offline ? t('cafe.locations.offlineStale', { time: '' }) : undefined}
        secondary={row && !row.archived ? <Button variant="destructive" disabled={disabled} onClick={() => setConfirmArchive(true)}>{t('cafe.locations.archive')}</Button> : undefined}
        primary={<Button variant="primary" disabled={disabled || problems.length > 0 || !dirty} onClick={() => void save()}>{t('cafe.locations.save')}</Button>}
        aria-label={t('cafe.locations.save')} />}
    </>}
    <ConfirmDialog open={confirmArchive} title={t('cafe.locations.archive.confirmTitle')} body={t('cafe.locations.archive.confirmBody')}
      confirmLabel={t('cafe.locations.archive.confirmButton')} tone="destructive" onConfirm={archive} onCancel={() => setConfirmArchive(false)} />
  </section>
}

function BranchChecklist({ branches, value, disabled, onChange }: { branches: BranchOption[]; value: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = branches.filter((branch) => !needle || branch.name.toLowerCase().includes(needle))
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((candidate) => candidate !== id))
  return <fieldset className="cafe-locs__branches" disabled={disabled}>
    <legend>{t('cafe.locations.branchesField')}</legend>
    {branches.length === 0 ? <p className="cafe-locs__note">{t('cafe.locations.noBranchChoices')}</p> : <>
      <SearchField label={t('cafe.locations.branchSearch')} value={q} onChange={setQ} />
      <p className="cafe-locs__note" role="status">{value.length === 0 ? t('cafe.locations.branchesNone') : t(value.length === 1 ? 'cafe.locations.branchesSelected.one' : 'cafe.locations.branchesSelected.other', { count: value.length })}</p>
      {shown.length === 0 ? <p className="cafe-locs__note">{t('cafe.locations.noBranchMatch')}</p> : <ul className="cafe-locs__branch-list">
        {shown.map((branch) => <li key={branch.id}><label className="cafe-locs__branch-row"><Checkbox checked={value.includes(branch.id)} onChange={(on) => toggle(branch.id, on)} /><span>{branch.name}</span></label></li>)}
      </ul>}
    </>}
  </fieldset>
}
