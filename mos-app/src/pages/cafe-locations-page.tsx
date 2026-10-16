// Café › Setup › Locations (PREVIEW — ship state `preview`, dev launch only; see lib/ship-gate.ts).
// A location is a physical place (kitchen, chiller, store room), never a branch, Site or stream. No location
// catalog exists yet, so the default is the honest "Locations are not connected yet"; real branch choices load
// from the existing branch catalog. "Preview layout" opens an isolated, labelled SAMPLE catalogue that lives in
// memory only: no stub is called, nothing is saved, nothing joins real records or balances.
// Backend contract: R/handover/locations.md. Spec: work/design/future-locations-spec.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { PreviewBadge } from '@/components/preview/preview-badge'
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
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { CHANGE_LOCATION_PATH } from '@/lib/cafe-locations-preview'
import { listActiveBranches } from '@/lib/db/branches'
import type { BranchOption } from '@/lib/db/kitchen-logs.types'
import {
  NEW_LOCATION, applyLocationFilters, draftIsDirty, draftOf, parentChoices, parseLocationFilters, sampleLocations, validateDraft,
  type LocationDraft, type LocationProblem, type LocationRow, type LocationUse,
} from '@/lib/cafe-locations-view'
import { formatWibShortDateTime } from '@/lib/format/date'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import '@/components/record-collection/record-collection.css'
import '@/components/kitchen/cafe-setup-workspace.css'
import './cafe-locations-page.css'

interface Loaded { branches: BranchOption[]; at: string }

const USE_KEY: Record<LocationUse, MessageKey> = {
  production: 'cafe.locations.use.production',
  storage: 'cafe.locations.use.storage',
  both: 'cafe.locations.use.both',
}
const SAMPLE_NAME_KEY: Record<string, MessageKey> = {
  'sample-kitchen': 'cafe.locations.sample.kitchen',
  'sample-chiller': 'cafe.locations.sample.chiller',
  'sample-store-room': 'cafe.locations.sample.storeRoom',
  'sample-bar-fridge': 'cafe.locations.sample.barFridge',
  'sample-dry-store': 'cafe.locations.sample.dryStore',
}
const PROBLEM_KEY: Record<LocationProblem, MessageKey> = {
  nameBlank: 'cafe.locations.error.nameBlank',
  duplicate: 'cafe.locations.error.duplicate',
  cycle: 'cafe.locations.error.cycle',
  branchesOutsideParent: 'cafe.locations.error.branchesOutsideParent',
}
const USES: LocationUse[] = ['production', 'storage', 'both']

export function CafeLocationsPage() {
  const auth = useAuth()
  // A new viewer starts from a clean read: no rows or labels from the previous person.
  return <Locations key={auth.status === 'authenticated' ? auth.viewer.person.id : auth.status} />
}

function Locations() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const isAdmin = auth.status === 'authenticated' && auth.viewer.accessRoles.includes('admin')
  const isDesktop = useIsDesktop()
  const offline = useIsOffline()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Loaded>()
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [dirty, setDirty] = useState(false)
  const listRef = useRef<HTMLElement>(null)
  const lastOpened = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    listActiveBranches()
      .then((branches) => { if (active) { setData({ branches, at: new Date().toISOString() }); setError(false) } })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [retry])

  const filters = parseLocationFilters(params)
  const layout = params.get('layout') === 'preview'
  const selected = layout ? params.get('location') : null
  const update = useCallback((change: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(change)) { if (value === null || value === '') next.delete(key); else next.set(key, value) }
    setParams(next, { replace })
  }, [params, setParams])

  const branchName = useCallback((id: string) => data?.branches.find((b) => b.id === id)?.name ?? t('cafe.locations.branchUnavailable'), [data, t])
  const rows = useMemo(() => layout && data ? sampleLocations(data.branches.map((b) => b.id)) : [], [layout, data])
  const nameOf = useCallback((row: LocationRow) => t(SAMPLE_NAME_KEY[row.id] ?? 'cafe.locations.panel'), [t])
  const parentOf = useCallback((row: LocationRow) => {
    const parent = row.parentId ? rows.find((r) => r.id === row.parentId) : undefined
    return parent ? nameOf(parent) : null
  }, [rows, nameOf])
  const branchesText = useCallback((row: LocationRow) => row.branchIds.map(branchName).join(', '), [branchName])
  const searchable = useCallback((row: LocationRow) => `${nameOf(row)} ${t(USE_KEY[row.use])} ${parentOf(row) ?? ''} ${branchesText(row)}`, [nameOf, t, parentOf, branchesText])
  const visible = useMemo(() => applyLocationFilters(rows, filters, searchable), [rows, filters, searchable])

  // Focus returns to the row that opened the record, or the list.
  useEffect(() => {
    if (!data || selected) return
    if (lastOpened.current) {
      const opener = document.querySelector<HTMLElement>(`[data-location-open="${CSS.escape(lastOpened.current)}"]`)
      lastOpened.current = null
      if (opener) opener.focus(); else listRef.current?.focus()
    }
  }, [selected, data])

  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [
    ...(filters.branch !== 'all' ? [{ key: 'branch', label: `${t('cafe.locations.branch')}: ${branchName(filters.branch)}`, clear: { branch: null } }] : []),
    ...(filters.use !== 'all' ? [{ key: 'use', label: `${t('cafe.locations.use')}: ${t(USE_KEY[filters.use])}`, clear: { use: null } }] : []),
    ...(filters.status === 'archived' ? [{ key: 'status', label: `${t('cafe.locations.status')}: ${t('cafe.locations.status.archived')}`, clear: { status: null } }] : []),
    ...(filters.q ? [{ key: 'q', label: `${t('cafe.locations.search')}: ${filters.q}`, clear: { q: null } }] : []),
  ]
  const clearAll = () => update({ branch: null, use: null, status: null, q: null })

  const open = (id: string) => { lastOpened.current = id; update({ location: id }, false) }
  const hrefFor = (id: string) => { const next = new URLSearchParams(params); next.set('location', id); return { pathname: '/cafe/locations', search: next.toString() } }
  const sortState = (key: 'name' | 'use' | 'status') => filters.sort === key ? filters.dir : undefined

  const reasonId = 'cafe-locations-reason'
  const columns: DataTableColumn<LocationRow>[] = [
    { key: 'name', header: t('cafe.locations.col.location'), sortable: true, render: (row) => (
      <span className="cafe-locs__name-cell"><strong className="cafe-locs__name">{nameOf(row)}</strong><Pill tone="violet" dot={false}>{t('cafe.locations.sampleBadge')}</Pill></span>) },
    { key: 'status', header: t('cafe.locations.col.status'), sortable: true, render: (row) => <LocationStatus row={row} /> },
    { key: 'use', header: t('cafe.locations.col.use'), sortable: true, render: (row) => t(USE_KEY[row.use]) },
    { key: 'branches', header: t('cafe.locations.col.branches'), render: (row) => row.branchIds.length ? branchesText(row) : <span className="cafe-locs__muted">{t('cafe.locations.none')}</span> },
    { key: 'parent', header: t('cafe.locations.col.parent'), render: (row) => parentOf(row) ?? <span className="cafe-locs__muted">{t('cafe.locations.none')}</span> },
    { key: 'actions', header: <span className="sr-only">{t('cafe.locations.col.actions')}</span>, render: (row) =>
      <Link className="cafe-locs__open" data-location-open={row.id} to={hrefFor(row.id)} aria-label={`${t('cafe.locations.view')}: ${nameOf(row)}`}>{t('cafe.locations.view')}</Link> },
  ]

  const addAction = isAdmin && !selected ? <Button variant="primary" disabled aria-describedby={reasonId}>{t('cafe.locations.add')}</Button> : undefined
  const reasonNode = isAdmin ? <span id={reasonId}>{t('cafe.locations.notConnected')}</span> : undefined

  const selectedRow = selected && selected !== NEW_LOCATION ? rows.find((row) => row.id === selected) ?? null : null
  const panelOpen = Boolean(selected) && Boolean(data) && layout

  const filterControls = (
    <>
      <Select label={t('cafe.locations.use')} value={filters.use} onChange={(e) => update({ use: e.target.value === 'all' ? null : e.target.value })}>
        <option value="all">{t('cafe.locations.use.all')}</option>
        {USES.map((use) => <option key={use} value={use}>{t(USE_KEY[use])}</option>)}
      </Select>
      <Select label={t('cafe.locations.status')} value={filters.status} onChange={(e) => update({ status: e.target.value === 'active' ? null : e.target.value })}>
        <option value="active">{t('cafe.locations.status.active')}</option>
        <option value="archived">{t('cafe.locations.status.archived')}</option>
      </Select>
    </>
  )
  const activeFilterCount = (filters.use !== 'all' ? 1 : 0) + (filters.status === 'archived' ? 1 : 0)

  let body
  if (error) body = <ErrorState message={t('cafe.locations.loadError')} onRetry={() => { setError(false); setData(undefined); setRetry(retry + 1) }} />
  else if (!data) body = <LoadingShell count={4} label={t('cafe.locations.loading')} />
  else body = (
    <>
    {layout && (isDesktop || !selected) && (
      <Notice tone="info">
        <span className="cafe-locs__notice">
          <span>{t('cafe.locations.sampleNotice')}</span>
          <Button variant="outline" onClick={() => update({ layout: null, location: null, q: null, use: null, status: null, sort: null, dir: null }, false)}>{t('cafe.locations.leaveLayout')}</Button>
        </span>
      </Notice>
    )}
    <div className={`cafe-setup-workspace cafe-locs__workspace${panelOpen ? ' cafe-setup-workspace--selected' : ''}`}>
      <section ref={listRef} tabIndex={-1} className="cafe-locs" aria-label={t('cafe.locations.list')}>
        {offline && <Notice tone="attention">{t('cafe.locations.offlineStale', { time: formatWibShortDateTime(data.at, locale) })}</Notice>}
        <div className="cafe-locs__scope">
          <Select label={t('cafe.locations.branch')} value={filters.branch} onChange={(e) => update({ branch: e.target.value === 'all' ? null : e.target.value })} fullWidth>
            <option value="all">{t('cafe.locations.allBranches')}</option>
            {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Link className="btn btn-outline btn-touch cafe-locs__change" to={CHANGE_LOCATION_PATH}>{t('cafe.locations.move')}</Link>
        </div>
        {!layout ? (
          <EmptyState variant="blank" title={t('cafe.locations.emptyTitle')} copy={isAdmin ? t('cafe.locations.emptyBody') : t('cafe.locations.emptyOthers')}>
            <Button variant="outline" onClick={() => update({ layout: 'preview' }, false)}>{t('cafe.locations.previewLayout')}</Button>
            <span className="cafe-locs__reason">{isAdmin ? t('cafe.locations.notConnected') : t('cafe.locations.askAdmin')}</span>
          </EmptyState>
        ) : <>
          <div className="cafe-locs__toolbar">
            <SearchField label={t('cafe.locations.search')} placeholder={t('cafe.locations.searchHint')} value={filters.q} onChange={(value) => update({ q: value })} />
            {isDesktop
              ? filterControls
              : (
                <details className="cafe-locs__filters">
                  <summary>{t('cafe.locations.filters')}{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}</summary>
                  <div className="cafe-locs__filters-body">{filterControls}</div>
                </details>
              )}
            {isAdmin && <Button variant="outline" className="cafe-locs__preview" onClick={() => open(NEW_LOCATION)}>{t('cafe.locations.previewForm')}</Button>}
            <span className="cafe-locs__count tabular" role="status">{t(visible.length === 1 ? 'cafe.locations.count.one' : 'cafe.locations.count.other', { count: visible.length })}</span>
          </div>
          {chips.length > 0 && (
            <div className="cafe-locs__chips">
              {chips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={() => update(chip.clear)} />)}
              <Button variant="ghost" onClick={clearAll}>{t('common.clearFilters')}</Button>
            </div>
          )}
          {visible.length === 0 ? (
            <EmptyState variant="blank" title={t('cafe.locations.noMatch')}>
              <Button onClick={clearAll}>{t('common.clearFilters')}</Button>
            </EmptyState>
          ) : (
            <div className="record-collection-view">
              <DataTable<LocationRow>
                columns={columns}
                rows={visible}
                isDesktop={isDesktop && !panelOpen}
                caption={t('cafe.locations.list')}
                tableClassName="record-collection-table collection-grammar-table cafe-locs__table"
                sort={{ key: filters.sort, dir: sortState(filters.sort) ?? 'asc' }}
                onSortChange={(next) => update({ sort: next.key === 'name' ? null : next.key, dir: next.dir === 'asc' ? null : next.dir })}
                rowClassName={(row) => (row.id === selected ? 'is-selected' : undefined)}
                renderCard={(row) => (
                  <Link className="cafe-locs__card" aria-current={row.id === selected ? 'true' : undefined} data-location-open={row.id} to={hrefFor(row.id)} onClick={() => { lastOpened.current = row.id }}>
                    <span className="cafe-locs__card-main">
                      <span className="cafe-locs__card-title">{nameOf(row)}</span>
                      <span className="cafe-locs__card-meta">
                        {[t(USE_KEY[row.use]), parentOf(row), row.branchIds.length ? branchesText(row) : null].filter(Boolean).join(' · ')}
                      </span>
                      <Pill tone="violet" dot={false}>{t('cafe.locations.sampleBadge')}</Pill>
                    </span>
                    <LocationStatus row={row} />
                    <span className="cafe-locs__card-view">{t('cafe.locations.view')}</span>
                  </Link>
                )}
              />
            </div>
          )}
        </>}
      </section>
      {panelOpen && (
        <LocationPanel
          key={selected ?? 'none'}
          rows={rows}
          row={selectedRow}
          isNew={selected === NEW_LOCATION}
          isAdmin={isAdmin}
          invalid={selected !== NEW_LOCATION && !selectedRow}
          branches={data.branches}
          nameOf={nameOf}
          parentOf={parentOf}
          branchName={branchName}
          onClose={() => update({ location: null }, false)}
          onDirty={setDirty}
        />
      )}
    </div>
    </>
  )

  return (
    <CafePageFrame page="locations" state={error ? 'error' : !data ? 'loading' : 'default'}
      primaryAction={data && !error ? addAction : undefined} primaryActionReason={data && !error && addAction ? reasonNode : undefined}>
      <RouteLeaveGuard when={dirty} message={t('cafe.locations.leaveMessage')} includeSearch />
      {body}
    </CafePageFrame>
  )
}

function LocationStatus({ row }: { row: LocationRow }) {
  const t = useT()
  return row.archived
    ? <Pill tone="neutral">{t('cafe.locations.status.archived')}</Pill>
    : <Pill tone="success">{t('cafe.locations.status.active')}</Pill>
}

interface PanelProps {
  rows: LocationRow[]
  row: LocationRow | null
  isNew: boolean
  isAdmin: boolean
  invalid: boolean
  branches: BranchOption[]
  nameOf: (row: LocationRow) => string
  parentOf: (row: LocationRow) => string | null
  branchName: (id: string) => string
  onClose: () => void
  onDirty: (dirty: boolean) => void
}

/** The location record. Read-only for everyone; an admin also gets the in-memory form with every write disabled. */
function LocationPanel({ rows, row, isNew, isAdmin, invalid, branches, nameOf, parentOf, branchName, onClose, onDirty }: PanelProps) {
  const t = useT()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const initial = useMemo(() => draftOf(row), [row])
  const [draft, setDraft] = useState<LocationDraft>(() => ({ ...initial, name: row ? nameOf(row) : '' }))
  const baseline = useMemo(() => ({ ...initial, name: row ? nameOf(row) : '' }), [initial, row, nameOf])
  const dirty = draftIsDirty(draft, baseline)
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])

  // Sample names are display text; validate duplicates against what the viewer reads.
  const named = useMemo(() => rows.map((r) => ({ ...r, name: nameOf(r) })), [rows, nameOf])
  const problems = validateDraft(draft, named, row?.id ?? null)
  const parents = useMemo(() => parentChoices(row?.id ?? null, rows), [row, rows])
  const reason = t('cafe.locations.notConnected')
  const backLabel = t('record.backToCollection', { collection: t('cafe.pageTitle.locations') })
  const title = invalid || (isNew && !isAdmin) ? t('cafe.locations.notFound') : isNew ? t('cafe.locations.previewLocation') : nameOf(row!)
  const hidden = invalid || (isNew && !isAdmin)

  return (
    <section className="cafe-locs__panel" aria-label={t('cafe.locations.panel')}
      onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose() }}>
      <Button variant="ghost" className="cafe-locs__back" onClick={onClose}>{backLabel}</Button>
      <h2 ref={heading} tabIndex={-1} className="cafe-locs__panel-title">{title}</h2>
      {hidden ? <p className="cafe-locs__note">{t('cafe.locations.notFoundBody')}</p> : <>
        <p className="cafe-locs__panel-badges">
          {row && <LocationStatus row={row} />}
          <Pill tone="violet" dot={false}>{t('cafe.locations.sampleBadge')}</Pill>
          {isAdmin && <PreviewBadge />}
        </p>
        {isAdmin ? (
          <div className="cafe-locs__form" role="group" aria-label={t('cafe.locations.previewLocation')}>
            <p className="cafe-locs__note">{t('cafe.locations.explain')}</p>
            <div className="cafe-locs__field">
              <TextInput label={t('cafe.locations.name')} value={draft.name} fullWidth autoComplete="off"
                error={problems.includes('nameBlank') && dirty || problems.includes('duplicate')}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              {problems.includes('nameBlank') && dirty && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.nameBlank)}</p>}
              {problems.includes('duplicate') && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.duplicate)}</p>}
            </div>
            <Select label={t('cafe.locations.use')} value={draft.use} fullWidth onChange={(e) => setDraft({ ...draft, use: e.target.value as LocationUse })}>
              {USES.map((use) => <option key={use} value={use}>{t(USE_KEY[use])}</option>)}
            </Select>
            <div className="cafe-locs__field">
              <Select label={t('cafe.locations.parent')} value={draft.parentId ?? ''} fullWidth onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}>
                <option value="">{t('cafe.locations.parentNone')}</option>
                {parents.map((parent) => <option key={parent.id} value={parent.id}>{nameOf(parent)}</option>)}
              </Select>
              {problems.includes('cycle') && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.cycle)}</p>}
              {problems.includes('branchesOutsideParent') && <p className="cafe-locs__field-error" role="alert">{t(PROBLEM_KEY.branchesOutsideParent)}</p>}
            </div>
            <BranchChecklist branches={branches} value={draft.branchIds} onChange={(branchIds) => setDraft({ ...draft, branchIds })} />
            <p className="cafe-locs__note">{t('cafe.locations.archiveNote')}</p>
          </div>
        ) : row && (
          <dl className="cafe-locs__facts">
            <div><dt>{t('cafe.locations.use')}</dt><dd>{t(USE_KEY[row.use])}</dd></div>
            <div><dt>{t('cafe.locations.parent')}</dt><dd>{parentOf(row) ?? t('cafe.locations.none')}</dd></div>
            <div><dt>{t('cafe.locations.branchesField')}</dt><dd>{row.branchIds.length ? row.branchIds.map(branchName).join(', ') : t('cafe.locations.none')}</dd></div>
          </dl>
        )}
        {isAdmin && (
          <ActionBar
            className="cafe-locs__actions"
            reason={reason}
            secondary={row && !row.archived ? <Button variant="destructive" disabled>{t('cafe.locations.archive')}</Button> : undefined}
            primary={<Button variant="primary" disabled>{t('cafe.locations.save')}</Button>}
            aria-label={t('cafe.locations.save')}
          />
        )}
      </>}
    </section>
  )
}

/** Available to branches: a searchable multi-select of check rows. Nothing is preselected or inferred from a Site or Team. */
function BranchChecklist({ branches, value, onChange }: { branches: BranchOption[]; value: string[]; onChange: (next: string[]) => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = branches.filter((branch) => !needle || branch.name.toLowerCase().includes(needle))
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id))
  return (
    <fieldset className="cafe-locs__branches">
      <legend>{t('cafe.locations.branchesField')}</legend>
      {branches.length === 0 ? <p className="cafe-locs__note">{t('cafe.locations.noBranchChoices')}</p> : <>
        <SearchField label={t('cafe.locations.branchSearch')} value={q} onChange={setQ} />
        <p className="cafe-locs__note" role="status">
          {value.length === 0 ? t('cafe.locations.branchesNone') : t(value.length === 1 ? 'cafe.locations.branchesSelected.one' : 'cafe.locations.branchesSelected.other', { count: value.length })}
        </p>
        {shown.length === 0 ? <p className="cafe-locs__note">{t('cafe.locations.noBranchMatch')}</p> : (
          <ul className="cafe-locs__branch-list">
            {shown.map((branch) => (
              <li key={branch.id}>
                <label className="cafe-locs__branch-row">
                  <Checkbox checked={value.includes(branch.id)} onChange={(on) => toggle(branch.id, on)} />
                  <span>{branch.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </>}
    </fieldset>
  )
}
