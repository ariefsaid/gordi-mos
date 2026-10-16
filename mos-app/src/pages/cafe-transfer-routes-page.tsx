// Café › Setup › Transfer routes (PREVIEW — ship state `preview`, dev launch only; see lib/ship-gate.ts).
// Real reads: the stored cross-branch routes (ops.cafe_destinations), the stream Teams and the branch
// catalog. Editing is designed but NOT connected: an admin can open a Preview route form that lives in
// memory; Save/Add/Remove stay disabled with the reason, nothing is written, no stub is called.
// Backend contract: R/handover/transfer-routes.md. Spec: work/design/future-transfer-routes-spec.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { PreviewBadge } from '@/components/preview/preview-badge'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { FilterChip } from '@/components/ui/filter-chip'
import { Notice } from '@/components/ui/notice'
import { Pill } from '@/components/ui/pill'
import { SearchField } from '@/components/ui/search-field'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { listActiveBranches, listBranchesByIds } from '@/lib/db/branches'
import { listCafeDestinations, listStreamPairs } from '@/lib/db/kitchen-logs'
import type { BranchOption, CafeDestination, ProductionActivity, StreamPair } from '@/lib/db/kitchen-logs.types'
import { formatWibShortDateTime } from '@/lib/format/date'
import { activityLabel } from '@/lib/kitchen-action-label'
import {
  applyRouteFilters, buildRouteRows, derivedMovements, eligibleDestinations, parseRouteFilters, routeKey,
  type RouteProblem, type RouteRow,
} from '@/lib/cafe-transfer-routes-view'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useCafeSetupWorkspace } from './use-cafe-setup-workspace'
import '@/components/record-collection/record-collection.css'
import '@/components/kitchen/cafe-setup-workspace.css'
import './cafe-transfer-routes-page.css'

interface Loaded {
  destinations: CafeDestination[]
  pairs: StreamPair[]
  branches: BranchOption[]
  extra: Pick<BranchOption, 'id' | 'name'>[]
  /** A catalog read failed: raw routes stay, labels may be unresolved, the form is disabled. */
  partial: boolean
  at: string
}

const PROBLEM_KEY: Record<RouteProblem, MessageKey> = {
  originUnknown: 'cafe.routes.problem.originUnknown',
  originNotProducing: 'cafe.routes.problem.originNotProducing',
  destinationUnknown: 'cafe.routes.problem.destinationUnknown',
  sameBranch: 'cafe.routes.problem.sameBranch',
  noDestinationBar: 'cafe.routes.problem.noDestinationBar',
}

const ONE_STREAM = (branchId: string, activity: ProductionActivity) => `${branchId}:${activity}`

export function CafeTransferRoutesPage() {
  const auth = useAuth()
  // A new viewer starts from a clean read: no rows or labels from the previous person.
  return <TransferRoutes key={auth.status === 'authenticated' ? auth.viewer.person.id : auth.status} />
}

function TransferRoutes() {
  const {
    t, locale, isAdmin, isDesktop, offline, params, setParams, data, setData,
    error, setError, retry, setRetry, dirty, setDirty, listRef, lastOpened,
  } = useCafeSetupWorkspace<Loaded>()

  useEffect(() => {
    let active = true
    void (async () => {
      let destinations: CafeDestination[]
      try { destinations = await listCafeDestinations() } catch { if (active) setError(true); return }
      let partial = false
      const [pairs, branches] = await Promise.all([
        listStreamPairs().catch(() => { partial = true; return [] as StreamPair[] }),
        listActiveBranches().catch(() => { partial = true; return [] as BranchOption[] }),
      ])
      const known = new Set(branches.map((branch) => branch.id))
      const missing = [...new Set(destinations.flatMap((r) => [r.origin_branch_id, r.destination_branch_id]))].filter((id) => !known.has(id))
      const extra = await listBranchesByIds(missing).catch(() => { partial = true; return [] })
      if (active) { setData({ destinations, pairs, branches, extra, partial, at: new Date().toISOString() }); setError(false) }
    })()
    return () => { active = false }
  }, [retry, setData, setError])

  const filters = parseRouteFilters(params)
  const selected = params.get('route')
  const update = useCallback((change: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(change)) { if (value === null || value === '') next.delete(key); else next.set(key, value) }
    setParams(next, { replace })
  }, [params, setParams])

  const rows = useMemo(() => data ? buildRouteRows(data.destinations, { activeBranches: data.branches, extraBranches: data.extra, pairs: data.pairs }) : [], [data])
  const unresolved = t('cafe.routes.unresolved')
  const originText = useCallback((row: RouteRow) => `${row.originBranchName ?? unresolved} · ${activityLabel(t, row.originActivity)}`, [t, unresolved])
  const destinationText = useCallback((row: RouteRow) => row.destinationAlias ?? row.destinationName ?? unresolved, [unresolved])
  const searchable = useCallback((row: RouteRow) => `${originText(row)} ${destinationText(row)} ${row.destinationName ?? ''}`, [originText, destinationText])
  const visible = useMemo(() => applyRouteFilters(rows, filters, searchable), [rows, filters, searchable])
  const derived = useMemo(() => data ? derivedMovements(data.pairs, data.branches) : [], [data])

  // Origin scope options: producing streams plus any origin a stored route already uses.
  const originOptions = useMemo(() => {
    if (!data) return []
    const seen = new Map<string, string>()
    for (const pair of data.pairs) {
      const branch = data.branches.find((b) => b.id === pair.branch_id)
      if (branch && pair.produces === true) seen.set(ONE_STREAM(branch.id, pair.activity), `${branch.name} · ${activityLabel(t, pair.activity)}`)
    }
    for (const row of rows) seen.set(ONE_STREAM(row.originBranchId, row.originActivity), originText(row))
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [data, rows, t, originText])
  const destinationOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of rows) seen.set(row.destinationBranchId, destinationText(row))
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows, destinationText])

  // Focus returns to the row that opened the record, or the list.
  useEffect(() => {
    if (!data || selected) return
    if (lastOpened.current) {
      const opener = document.querySelector<HTMLElement>(`[data-route-open="${CSS.escape(lastOpened.current)}"]`)
      lastOpened.current = null
      if (opener) opener.focus(); else listRef.current?.focus()
    }
  }, [selected, data, lastOpened, listRef])

  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [
    ...(filters.origin !== 'all' ? [{ key: 'origin', label: `${t('cafe.routes.origin')}: ${originOptions.find(([k]) => k === filters.origin)?.[1] ?? filters.origin}`, clear: { origin: null } }] : []),
    ...(filters.destination !== 'all' ? [{ key: 'destination', label: `${t('cafe.routes.destination')}: ${destinationOptions.find(([k]) => k === filters.destination)?.[1] ?? unresolved}`, clear: { destination: null } }] : []),
    ...(filters.q ? [{ key: 'q', label: `${t('cafe.routes.search')}: ${filters.q}`, clear: { q: null } }] : []),
  ]
  const clearAll = () => update({ origin: null, destination: null, q: null })

  const sortState = (key: 'origin' | 'destination') => filters.sort === key ? filters.dir : undefined
  const open = (key: string) => { lastOpened.current = key; update({ route: key }, false) }
  const hrefFor = (key: string) => { const next = new URLSearchParams(params); next.set('route', key); return { pathname: '/cafe/transfer-routes', search: next.toString() } }
  const columns: DataTableColumn<RouteRow & { id: string }>[] = [
    { key: 'origin', header: t('cafe.routes.col.origin'), sortable: true, render: (row) => originText(row) },
    { key: 'status', header: t('cafe.routes.col.status'), render: (row) => <RouteStatus row={row} withReason /> },
    { key: 'destination', header: t('cafe.routes.col.destination'), sortable: true, render: (row) => destinationText(row) },
    { key: 'actions', header: <span className="sr-only">{t('cafe.routes.col.actions')}</span>, render: (row) =>
      <Link className="cafe-routes__open" data-route-open={row.key} to={hrefFor(row.key)} aria-label={`${t('cafe.routes.view')}: ${originText(row)} → ${destinationText(row)}`}>{t('cafe.routes.view')}</Link> },
  ]
  const tableRows = visible.map((row) => ({ ...row, id: row.key }))

  const addAction = isAdmin && !selected ? <Button variant="primary" disabled aria-describedby="cafe-routes-reason">{t('cafe.routes.add')}</Button> : undefined
  const reasonId = 'cafe-routes-reason'
  const reasonNode = isAdmin ? <span id={reasonId}>{t('cafe.routes.notConnected')}</span> : undefined

  const selectedRow = selected && selected !== 'new' ? rows.find((row) => row.key === selected) ?? null : null
  const panelOpen = Boolean(selected) && Boolean(data)

  let body
  if (error) body = <ErrorState message={t('cafe.routes.loadError')} onRetry={() => { setError(false); setData(undefined); setRetry(retry + 1) }} />
  else if (!data) body = <LoadingShell count={4} label={t('cafe.routes.loading')} />
  else body = (
    <div className={`cafe-setup-workspace cafe-routes__workspace${panelOpen ? ' cafe-setup-workspace--selected' : ''}`}>
      <section ref={listRef} tabIndex={-1} className="cafe-routes" aria-label={t('cafe.routes.list')}>
        {offline && <Notice tone="attention">{t('cafe.routes.offlineStale', { time: formatWibShortDateTime(data.at, locale) })}</Notice>}
        {data.partial && <Notice tone="attention">{t('cafe.routes.partial')}</Notice>}
        <div className="cafe-routes__scope">
          <Select label={t('cafe.routes.origin')} value={filters.origin} onChange={(e) => update({ origin: e.target.value === 'all' ? null : e.target.value })} fullWidth>
            <option value="all">{t('cafe.routes.allStreams')}</option>
            {originOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </div>
        {rows.length > 0 && <>
          <div className="cafe-routes__toolbar">
            <SearchField label={t('cafe.routes.search')} placeholder={t('cafe.routes.searchHint')} value={filters.q} onChange={(value) => update({ q: value })} />
            <Select label={t('cafe.routes.destination')} value={filters.destination} onChange={(e) => update({ destination: e.target.value === 'all' ? null : e.target.value })}>
              <option value="all">{t('cafe.routes.allDestinations')}</option>
              {destinationOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
            {isAdmin && <Button variant="outline" className="cafe-routes__preview" onClick={() => open('new')}>{t('cafe.routes.previewForm')}</Button>}
            <span className="cafe-routes__count tabular" role="status">{t(visible.length === 1 ? 'cafe.routes.count.one' : 'cafe.routes.count.other', { count: visible.length })}</span>
          </div>
          {chips.length > 0 && <div className="cafe-routes__chips">
            {chips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={() => update(chip.clear)} />)}
          </div>}
        </>}
        {rows.length === 0 ? (
          <EmptyState variant="blank" title={t('cafe.routes.empty')} copy={isAdmin ? t('cafe.routes.emptyAdmin') : t('cafe.routes.emptyOthers')}>
            {isAdmin
              ? <><Button variant="primary" disabled aria-describedby={reasonId}>{t('cafe.routes.add')}</Button><span className="cafe-routes__reason">{t('cafe.routes.notConnected')}</span></>
              : <span className="cafe-routes__reason">{t('cafe.routes.askAdmin')}</span>}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState variant="blank" title={t('cafe.routes.noMatch')}>
            <Button onClick={clearAll}>{t('common.clearFilters')}</Button>
          </EmptyState>
        ) : (
          <div className="record-collection-view">
            <DataTable<RouteRow & { id: string }>
              columns={columns}
              rows={tableRows}
              isDesktop={isDesktop}
              caption={t('cafe.routes.list')}
              tableClassName="record-collection-table collection-grammar-table cafe-routes__table"
              sort={{ key: filters.sort, dir: sortState(filters.sort) ?? 'asc' }}
              onSortChange={(next) => update({ sort: next.key === 'origin' ? null : next.key, dir: next.dir === 'asc' ? null : next.dir })}
              rowClassName={(row) => (row.key === selected ? 'is-selected' : undefined)}
              renderCard={(row) => (
                <Link className="cafe-routes__card" data-route-open={row.key} to={hrefFor(row.key)} onClick={() => { lastOpened.current = row.key }}>
                  <span className="cafe-routes__card-main">
                    <span className="cafe-routes__card-title">{originText(row)}</span>
                    <span className="cafe-routes__card-meta">{t('cafe.routes.col.destination')}: {destinationText(row)}</span>
                  </span>
                  <RouteStatus row={row} />
                  <span className="cafe-routes__card-view">{t('cafe.routes.view')}</span>
                </Link>
              )}
            />
          </div>
        )}
        {rows.length > 0 && <p className="cafe-routes__note">{t('cafe.routes.configuredNote')}</p>}
        <section className="cafe-routes__derived" aria-labelledby="cafe-routes-derived-title">
          <h2 id="cafe-routes-derived-title" className="cafe-routes__section-title">{t('cafe.routes.derived.title')}</h2>
          <p className="cafe-routes__note">{t('cafe.routes.derived.body')}</p>
          {derived.length === 0 ? <p className="cafe-routes__note">{t('cafe.routes.derived.none')}</p> : (
            <ul className="cafe-routes__derived-list">
              {derived.map((row) => (
                <li key={row.key}>
                  <span>{row.branchName} · {activityLabel(t, 'bar')} → {activityLabel(t, 'kitchen')}</span>
                  <Pill tone="neutral">{t('cafe.routes.builtIn')}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
      {panelOpen && (
        <RoutePanel
          key={selected ?? 'none'}
          data={data}
          row={selectedRow}
          isNew={selected === 'new'}
          isAdmin={isAdmin}
          invalid={Boolean(selected) && selected !== 'new' && !selectedRow}
          originText={originText}
          destinationText={destinationText}
          onClose={() => update({ route: null }, false)}
          onDirty={setDirty}
        />
      )}
    </div>
  )

  return (
    <CafePageFrame page="transferRoutes" state={error ? 'error' : !data ? 'loading' : 'default'}
      primaryAction={data && !error ? addAction : undefined} primaryActionReason={data && !error && addAction ? reasonNode : undefined}>
      <RouteLeaveGuard when={dirty} message={t('cafe.routes.leaveMessage')} includeSearch />
      {body}
    </CafePageFrame>
  )
}

function RouteStatus({ row, withReason = false }: { row: RouteRow; withReason?: boolean }) {
  const t = useT()
  if (!row.problem) return <Pill tone="success">{t('cafe.routes.configured')}</Pill>
  return (
    <span className="cafe-routes__status">
      <Pill tone="warning">{t('cafe.routes.needsAttention')}</Pill>
      {withReason && <span className="cafe-routes__reason">{t(PROBLEM_KEY[row.problem])}</span>}
    </span>
  )
}

interface PanelProps {
  data: Loaded
  row: RouteRow | null
  isNew: boolean
  isAdmin: boolean
  invalid: boolean
  originText: (row: RouteRow) => string
  destinationText: (row: RouteRow) => string
  onClose: () => void
  onDirty: (dirty: boolean) => void
}

/** The route record. Read-only for everyone; an admin also gets the in-memory Preview form with writes disabled. */
function RoutePanel({ data, row, isNew, isAdmin, invalid, originText, destinationText, onClose, onDirty }: PanelProps) {
  const t = useT()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const initial = row ? ONE_STREAM(row.originBranchId, row.originActivity) : ''
  const [origin, setOrigin] = useState(initial)
  const [destination, setDestination] = useState(row?.destinationBranchId ?? '')
  const dirty = origin !== initial || destination !== (row?.destinationBranchId ?? '')
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])

  const [originBranchId, originActivity] = origin.split(':') as [string, ProductionActivity | undefined]
  const originBranch = data.branches.find((branch) => branch.id === originBranchId) ?? null
  const eligible = useMemo(
    () => (originBranch && originActivity ? eligibleDestinations({ branch: originBranch, activity: originActivity }, data.branches, data.pairs) : []),
    [originBranch, originActivity, data.branches, data.pairs],
  )
  const originStreams = useMemo(() => data.pairs
    .filter((pair) => pair.produces === true && data.branches.some((branch) => branch.id === pair.branch_id))
    .map((pair) => ({ key: ONE_STREAM(pair.branch_id, pair.activity), label: `${data.branches.find((b) => b.id === pair.branch_id)!.name} · ${activityLabel(t, pair.activity)}` }))
    .sort((a, b) => a.label.localeCompare(b.label)), [data, t])
  const candidate = origin && destination && originActivity ? { origin_branch_id: originBranchId, origin_activity: originActivity, destination_branch_id: destination } : null
  const duplicate = candidate !== null && data.destinations.some((r) => routeKey(r) === routeKey(candidate)) && (!row || routeKey(candidate) !== row.key)
  const formDisabled = data.partial
  const reason = t('cafe.routes.notConnected')
  const backLabel = t('record.backToCollection', { collection: t('cafe.pageTitle.transferRoutes') })

  const title = invalid ? t('cafe.routes.notFound') : isNew ? t('cafe.routes.previewRoute') : `${originText(row!)} → ${destinationText(row!)}`
  return (
    <section className="cafe-routes__panel" aria-label={t('cafe.routes.panel')}
      onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose() }}>
      <Button variant="ghost" className="cafe-routes__back" onClick={onClose}>{backLabel}</Button>
      <h2 ref={heading} tabIndex={-1} className="cafe-routes__panel-title">{title}</h2>
      {invalid ? <p className="cafe-routes__note">{t('cafe.routes.notFoundBody')}</p> : <>
        <p className="cafe-routes__panel-badges">
          {row && <RouteStatus row={row} />}
          {isAdmin && <PreviewBadge />}
        </p>
        {row?.problem && <Notice tone="attention">{t(PROBLEM_KEY[row.problem])}</Notice>}
        {isAdmin ? (
          <div className="cafe-routes__form" role="group" aria-label={t('cafe.routes.previewRoute')}>
            <Select label={t('cafe.routes.origin')} value={origin} disabled={formDisabled} fullWidth
              onChange={(e) => { setOrigin(e.target.value); setDestination('') }}>
              <option value="" disabled>{t('cafe.routes.choose')}</option>
              {originStreams.map((stream) => <option key={stream.key} value={stream.key}>{stream.label}</option>)}
              {row && !originStreams.some((s) => s.key === initial) && <option value={initial}>{originText(row)}</option>}
            </Select>
            <Select label={t('cafe.routes.destination')} value={destination} disabled={formDisabled || !originBranch} fullWidth
              onChange={(e) => setDestination(e.target.value)}>
              <option value="" disabled>{t('cafe.routes.choose')}</option>
              {eligible.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              {row && destination === row.destinationBranchId && !eligible.some((b) => b.id === destination) && <option value={destination}>{destinationText(row)}</option>}
            </Select>
            {originBranch && eligible.length === 0 && <p className="cafe-routes__field-note">{t('cafe.routes.noEligible')}</p>}
            {duplicate && <p className="cafe-routes__field-error" role="alert">{t('cafe.routes.duplicate')}</p>}
            <p className="cafe-routes__field-note">{t('cafe.routes.removeNote')}</p>
          </div>
        ) : row && (
          <dl className="cafe-routes__facts">
            <div><dt>{t('cafe.routes.origin')}</dt><dd>{originText(row)}</dd></div>
            <div><dt>{t('cafe.routes.destination')}</dt><dd>{row.destinationName ?? t('cafe.routes.unresolved')}</dd></div>
            {row.destinationAlias && row.destinationAlias !== row.destinationName && <div><dt>{t('cafe.routes.alias')}</dt><dd>{row.destinationAlias}</dd></div>}
          </dl>
        )}
        {isAdmin && (
          <ActionBar
            className="cafe-routes__actions"
            reason={reason}
            secondary={row ? <Button variant="destructive" disabled>{t('cafe.routes.remove')}</Button> : undefined}
            primary={<Button variant="primary" disabled>{t('cafe.routes.save')}</Button>}
            aria-label={t('cafe.routes.save')}
          />
        )}
      </>}
    </section>
  )
}
