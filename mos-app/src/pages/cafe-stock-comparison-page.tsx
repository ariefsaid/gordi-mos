// Café › Stock › Stock comparison. Nightly ESB EOD copies and reviewer-scoped Count comparisons are read from reporting RPCs.
// One row per authorized stream, countable item and stored unit; comparison remains read-only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { RecordsPager } from '@/components/cafe-records/records-pager'
import { ComparisonPanel } from '@/components/cafe-stock-comparison/comparison-panel'
import { ComparisonSource } from '@/components/cafe-stock-comparison/comparison-source'
import {
  CountCell, DifferenceCell, ExpectedCell, FlagPills, KindTag, PercentCell, type CellContext,
} from '@/components/cafe-stock-comparison/comparison-cells'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Notice } from '@/components/ui/notice'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { ContractError } from '@/lib/db/contract'
import { listCafeCountableItems } from '@/lib/db/cafe-count'
import { getStockComparisonItem, listStockComparison } from '@/lib/db/cafe-stock-comparison'
import type { ComparisonPage } from '@/lib/db/cafe-stock-comparison'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { formatWibShortDateTime, wibToday } from '@/lib/format/date'
import { streamLabel } from '@/lib/kitchen-action-label'
import {
  DEFAULT_DIR, NO_CATEGORY, PAGE_SIZE, categoryToken, comparisonRowFromStock, coverageOf, pageCount, rowKey,
  type ComparisonRow, type ItemIdentity, type SortDir, type SortKey,
} from '@/lib/cafe-stock-comparison'
import { audienceOf, comparableStreams } from '@/lib/cafe-stock-comparison-access'
import { EMPTY_READ, readLatestCounts, recordsPageReader, type CountReadState } from '@/lib/cafe-stock-comparison-counts'
import { applyPatch, parseComparisonUrl, parseStream, streamToken, writeComparisonUrl, type ComparisonUrl } from '@/lib/cafe-stock-comparison-url'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import './cafe-stock-comparison-page.css'

const SORT_KEY: Record<string, MessageKey> = {
  'gap:desc': 'cafe.cmp.sort.gap.desc', 'gap:asc': 'cafe.cmp.sort.gap.asc',
  'quantity:desc': 'cafe.cmp.sort.quantity.desc', 'quantity:asc': 'cafe.cmp.sort.quantity.asc',
  'item:asc': 'cafe.cmp.sort.item.asc', 'item:desc': 'cafe.cmp.sort.item.desc',
  'count-date:desc': 'cafe.cmp.sort.count-date.desc', 'count-date:asc': 'cafe.cmp.sort.count-date.asc',
}
/** Column key -> the sort it drives; a header click opens that sort in its own natural direction. */
const COLUMN_SORT: Record<string, SortKey> = { item: 'item', count: 'count-date', difference: 'quantity', percent: 'gap' }
const SORT_COLUMN: Record<SortKey, string> = { item: 'item', 'count-date': 'count', quantity: 'difference', gap: 'percent' }

type Load =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: ItemIdentity[]; page: ComparisonPage; reads: CountReadState; countsError: boolean; at: string }

type TableRow = ComparisonRow & { id: string }

const COUNT_ONLY_FLAGS = new Set(['not_counted', 'pending_confirmation', 'shortage', 'surplus', 'no_difference', 'different_times', 'old_count', 'zero_expected'])
function hideCountData(row: ComparisonRow): ComparisonRow {
  return {
    ...row,
    count: null,
    difference: null,
    percent: null,
    zeroExpected: false,
    missing: 'unavailable',
    flags: [...row.flags.filter((flag) => !COUNT_ONLY_FLAGS.has(flag)), 'unavailable'],
    bucket: 'unknown',
  }
}

export function CafeStockComparisonPage() {
  const auth = useAuth()
  // A new viewer starts from a clean read: no rows or labels from the previous person.
  return <StockComparison key={auth.status === 'authenticated' ? auth.viewer.person.id : auth.status} />
}

function StockComparison() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const audience = audienceOf(roles)
  const canOpenCount = auth.status === 'authenticated' && canCaptureCafe({ affiliated: auth.viewer.affiliated, accessRoles: auth.viewer.accessRoles })
  const online = !useIsOffline()
  const isDesktop = useIsDesktop()
  const split = useIsRecordSplit()
  const [params, setParams] = useSearchParams()
  const today = useMemo(() => wibToday(), [])
  const parsed = useMemo(() => parseComparisonUrl(params, today), [params, today])
  const url = parsed.state

  // ── URL writes: filters and selection push; search typing replaces. ──────────────────────────────
  const cursorStarts = useRef(new Map<number, string | null>([[1, null]]))
  const update = useCallback((patch: Partial<ComparisonUrl>, mode: 'push' | 'replace' = 'push') => {
    if (['stream', 'q', 'kind', 'category', 'differences', 'sort', 'dir'].some((key) => key in patch)) {
      cursorStarts.current = new Map([[1, null]])
    }
    setParams((prev) => writeComparisonUrl(prev, applyPatch(parseComparisonUrl(prev, today).state, patch)), { replace: mode === 'replace' })
  }, [setParams, today])
  const invalidKey = parsed.invalid.join(',')
  useEffect(() => {
    if (invalidKey) setParams((prev) => writeComparisonUrl(prev, parseComparisonUrl(prev, today).state), { replace: true })
  }, [invalidKey, setParams, today])
  const [searchText, setSearchText] = useState(url.q)
  const wroteQ = useRef(url.q)
  useEffect(() => { if (url.q !== wroteQ.current) { wroteQ.current = url.q; setSearchText(url.q) } }, [url.q])
  const onSearch = (value: string) => { wroteQ.current = value; setSearchText(value); update({ q: value }, 'replace') }

  // ── Streams: only the ones this viewer reviews; the page never changes the module's remembered stream. ─
  const cafeStream = useCafeStream()
  const { options, stream: defaultStream, homeStream, myStreamKeys, resolve, adopt } = cafeStream
  const [catalog, setCatalog] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogTry, setCatalogTry] = useState(0)
  useEffect(() => {
    if (!audience.admitted) return
    let active = true
    setCatalog('loading')
    void resolve().then((next) => { if (active) { adopt(next); setCatalog('ready') } }).catch(() => { if (active) setCatalog('error') })
    return () => { active = false }
  }, [resolve, adopt, catalogTry, audience.admitted])
  const allowed = useMemo(() => comparableStreams(audience, myStreamKeys, options), [audience, myStreamKeys, options])
  const sameStream = (a: ProductionStream, branchId: string, activity: string) => a.branch.id === branchId && a.activity === activity
  const urlStream = parseStream(url.stream)
  const requested = urlStream ? options.find((option) => sameStream(option, urlStream.branchId, urlStream.activity)) ?? null : null
  const forbidden = requested !== null && !allowed.some((option) => sameStream(option, requested.branch.id, requested.activity))
  // Valid remembered / home stream when the address names none; otherwise ask (never the first catalogue row).
  const stream: ProductionStream | null = requested
    ? (forbidden ? null : requested)
    : !urlStream && defaultStream ? allowed.find((option) => sameStream(option, defaultStream.branch.id, defaultStream.activity)) ?? null : null
  const streamKeyText = stream ? streamToken(stream.branch.id, stream.activity) : ''

  // ── Reads: the curated comparison plus session/RLS Count coverage for its source strip. ───────────
  const [load, setLoad] = useState<Load>({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [readingOlder, setReadingOlder] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    if (!audience.admitted || !stream) { setLoad({ kind: 'idle' }); return }
    if (url.page > 1 && !url.cursor) {
      update({ page: 1, cursor: '' }, 'replace')
      return
    }
    const mine = ++generation.current
    const requestPage = url.page
    const requestCursor = url.cursor || undefined
    cursorStarts.current.set(requestPage, requestCursor ?? null)
    setLoad({ kind: 'loading' })
    void (async () => {
      try {
        const [countable, page] = await Promise.all([
          listCafeCountableItems(stream),
          listStockComparison({
            stream: { branch_id: stream.branch.id, activity: stream.activity },
            q: url.q,
            kind: url.kind === 'all' ? undefined : url.kind,
            category: url.category === 'all' ? null : url.category,
            only_differences: url.differences,
            sort: url.sort,
            dir: url.dir,
            cursor: requestCursor,
            limit: PAGE_SIZE,
          }),
        ])
        const items = countable.map((item) => ({
          itemId: item.id, itemName: item.name, kind: item.kind,
          category: item.category?.trim() ? item.category.trim() : null,
          unitId: item.unitId, unitName: item.unitName,
        }))
        const needed = new Set(items.map((item) => rowKey(item.itemId, item.unitId)))
        const { state, error } = await readLatestCounts({
          readPage: recordsPageReader({ branchId: stream.branch.id, activity: stream.activity }, today),
          needed,
          isStale: () => mine !== generation.current,
        })
        if (mine !== generation.current) return
        if (requestPage > pageCount(page.counts.shown_scope)) {
          update({ page: 1, cursor: '' }, 'replace')
          return
        }
        if (page.next) cursorStarts.current.set(requestPage + 1, page.next)
        setLoad({ kind: 'ready', items, page, reads: state, countsError: error !== null, at: new Date().toISOString() })
      } catch (error) {
        if (mine !== generation.current) return
        if (error instanceof ContractError && error.code === 'CONFLICT') {
          update({ page: 1, cursor: '' }, 'replace')
          return
        }
        setLoad({ kind: 'error' })
      }
    })()
    return () => { generation.current += 1 }
    // The stream and URL scope are the fetch key; the cursor binds the server page to its generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience.admitted, streamKeyText, url.q, url.kind, url.category, url.differences, url.sort, url.dir, url.page, url.cursor, attempt, today])

  const readOlder = useCallback(async () => {
    if (load.kind !== 'ready' || !stream) return
    const mine = generation.current
    setReadingOlder(true)
    const needed = new Set(load.items.map((item) => rowKey(item.itemId, item.unitId)))
    const { state, error } = await readLatestCounts({
      readPage: recordsPageReader({ branchId: stream.branch.id, activity: stream.activity }, today), needed, resume: load.reads, all: true, isStale: () => mine !== generation.current,
    })
    if (mine === generation.current) setLoad({ ...load, reads: state, countsError: error !== null, at: new Date().toISOString() })
    setReadingOlder(false)
  }, [load, stream, today])

  // ── Rows ──────────────────────────────────────────────────────────────────────────────────────────
  const reads = load.kind === 'ready' ? load.reads : EMPTY_READ
  const rows = useMemo<ComparisonRow[]>(() => {
    if (load.kind !== 'ready') return []
    return load.page.rows.map((contractRow) => {
      const row = comparisonRowFromStock(contractRow)
      return load.countsError ? hideCountData(row) : row
    })
  }, [load])
  const connected = load.kind === 'ready' && load.page.source.connection === 'connected'
  const countsUnavailable = useCallback((row: ComparisonRow) => row.count === null && (load.kind === 'ready' && load.countsError || !reads.exhausted), [load, reads.exhausted])
  const cell = useMemo<CellContext>(() => ({ t, locale, countsUnavailable }), [t, locale, countsUnavailable])
  const hideNotCounted = (row: ComparisonRow) => (countsUnavailable(row) ? (['not_counted'] as const) : undefined)

  // ── Server-filtered, whole-scope keyset pages ──────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const names = new Map<string, string>()
    let uncategorised = false
    const identities = load.kind === 'ready' ? [...load.items, ...rows.map((row) => ({
      itemId: row.itemId, itemName: row.itemName, kind: row.kind, category: row.category, unitId: row.unitId, unitName: row.unitName,
    }))] : []
    for (const item of identities) { if (item.category) names.set(categoryToken(item.category), item.category); else uncategorised = true }
    return { tokens: [...names.keys()].sort((a, b) => names.get(a)!.localeCompare(names.get(b)!)), names, uncategorised }
  }, [load, rows])
  const categoryText = useCallback((token: string) => token === NO_CATEGORY ? t('cafe.cmp.uncategorised') : categories.names.get(token) ?? token, [categories, t])
  const effective: { sort: SortKey; dir: SortDir } = { sort: url.sort, dir: url.dir }
  const sorted = rows
  const pages = pageCount(load.kind === 'ready' ? load.page.counts.shown_scope : 0)
  const page = Math.min(url.page, pages)
  const start = (page - 1) * PAGE_SIZE
  const slice = sorted
  const coverage = load.kind === 'ready' ? {
    total: load.page.counts.shown_scope,
    counted: load.page.counts.counted,
    gaps: load.page.counts.gaps,
    needsData: load.page.counts.needs_data,
    zero: load.page.counts.zero,
  } : coverageOf([])
  const visibleNeeds = load.kind === 'ready' ? load.page.counts.needs_data : 0

  // ── Selection ─────────────────────────────────────────────────────────────────────────────────────
  const [detailRow, setDetailRow] = useState<ComparisonRow | null>(null)
  useEffect(() => {
    if (!url.item || !url.unit || !stream || load.kind !== 'ready') { setDetailRow(null); return }
    let active = true
    setDetailRow(null)
    void getStockComparisonItem({
      stream: { branch_id: stream.branch.id, activity: stream.activity },
      item_id: url.item,
      unit_id: url.unit,
      generation: load.page.generation,
    }).then((result) => {
      if (!active) return
      const row = comparisonRowFromStock(result.row)
      setDetailRow(load.countsError ? hideCountData(row) : row)
    }).catch(() => { if (active) setDetailRow(null) })
    return () => { active = false }
  }, [url.item, url.unit, stream, streamKeyText, load, rows])
  const selectedRow = url.item
    ? detailRow ?? rows.find((row) => row.itemId === url.item && (!url.unit || row.unitId === url.unit)) ?? null
    : null
  const lastOpened = useRef<string | null>(null)
  const open = (row: ComparisonRow) => { lastOpened.current = row.key; update({ item: row.itemId, unit: row.unitId }) }
  const closePanel = () => {
    const returning = lastOpened.current ?? selectedRow?.key ?? ''
    update({ item: '', unit: '' })
    if (returning) window.setTimeout(() => document.querySelector<HTMLElement>(`[data-scmp-focus="${CSS.escape(returning)}"]`)?.focus(), 60)
  }

  // ── Frame bits ────────────────────────────────────────────────────────────────────────────────────
  const onStream = useCallback((next: ProductionStream) => update({ stream: streamToken(next.branch.id, next.activity) }), [update])
  const streamBar = { options: allowed, stream, homeStream, myStreamKeys, onChange: onStream }
  const noAccess = !audience.admitted || forbidden || (catalog === 'ready' && allowed.length === 0)
  const workspaceReady = load.kind === 'ready'
  const showWorkspace = !noAccess && catalog !== 'error' && workspaceReady && stream !== null
  const frameState = noAccess ? 'permission' : catalog === 'error' || load.kind === 'error' ? 'error'
    : catalog === 'loading' || load.kind === 'loading' ? 'loading' : showWorkspace && rows.length > 0 ? 'read-only' : 'empty'

  const sortValues: string[] = ['gap:desc', 'gap:asc', 'quantity:desc', 'quantity:asc', 'item:asc', 'item:desc', 'count-date:desc', 'count-date:asc']
  const sortControl = (
    <Select label={t('cafe.cmp.sort.label')} fullWidth value={`${effective.sort}:${effective.dir}`}
      onChange={(event) => { const [sort, dir] = event.target.value.split(':') as [SortKey, SortDir]; update({ sort, dir }) }}>
      {sortValues.map((value) => <option key={value} value={value}>{t(SORT_KEY[value])}</option>)}
    </Select>
  )

  const streamText = stream ? streamLabel(t, stream) : t('cafe.stream.none')
  const tableMode = isDesktop && !(split && Boolean(url.item))
  const hasCountRows = load.kind === 'ready' && load.page.counts.total > 0

  // ── Table ─────────────────────────────────────────────────────────────────────────────────────────
  const columns: DataTableColumn<TableRow>[] = [
    { key: 'item', header: t('kitchen.log.col.item'), sortable: true, className: 'scmp-col-item', render: (row) => (
      <>
        <button type="button" className="scmp-item" data-scmp-focus={row.key} aria-label={t('cafe.cmp.open', { item: row.itemName, unit: row.unitName ?? t('cafe.cmp.noUnit') })} onClick={() => open(row)}>{row.itemName}</button>
        {row.category && <span className="scmp-meta">{row.category}</span>}
      </>) },
    { key: 'kind', header: t('cafe.cmp.col.kind'), render: (row) => <KindTag kind={row.kind} /> },
    { key: 'unit', header: t('cafe.cmp.col.unit'), render: (row) => row.unitName ?? t('cafe.cmp.noUnit') },
    { key: 'expected', header: t('cafe.cmp.col.expected'), numeric: true, render: (row) => <ExpectedCell ctx={cell} row={row} /> },
    { key: 'count', header: t('cafe.cmp.col.count'), numeric: true, sortable: true, render: (row) => <CountCell ctx={cell} row={row} /> },
    { key: 'difference', header: t('cafe.cmp.col.difference'), numeric: true, sortable: true, render: (row) => <DifferenceCell t={t} row={row} /> },
    { key: 'percent', header: t('cafe.cmp.col.percent'), numeric: true, sortable: true, render: (row) => <PercentCell t={t} row={row} /> },
    { key: 'flag', header: t('cafe.cmp.col.flag'), className: 'scmp-col-flag', render: (row) => <FlagPills t={t} row={row} hide={hideNotCounted(row)} /> },
  ]
  const asTable = (list: readonly ComparisonRow[]): TableRow[] => list.map((row) => ({ ...row, id: row.key }))
  const card = (row: TableRow) => (
    <button type="button" className="scmp-card" data-scmp-focus={row.key} onClick={() => open(row)}>
      <span className="scmp-card__top">
        <span className="scmp-card__name">{row.itemName}</span>
        <KindTag kind={row.kind} />
      </span>
      <span className="scmp-card__meta">{[row.category, row.unitName ?? t('cafe.cmp.noUnit')].filter(Boolean).join(' · ')}</span>
      <FlagPills t={t} row={row} hide={hideNotCounted(row)} />
      <span className="scmp-card__figures">
        <span className="scmp-card__fig"><span className="sr-only">{t('cafe.cmp.col.expected')}: </span><ExpectedCell ctx={cell} row={row} /></span>
        <span className="scmp-card__fig"><span className="sr-only">{t('cafe.cmp.col.count')}: </span><CountCell ctx={cell} row={row} /></span>
        <span className="scmp-card__fig">
          <span className="sr-only">{t('cafe.cmp.col.difference')}: </span><DifferenceCell t={t} row={row} />
          <span className="scmp-meta"><span className="sr-only">{t('cafe.cmp.col.percent')}: </span><PercentCell t={t} row={row} /></span>
        </span>
      </span>
    </button>
  )

  // ── Chips and toolbar ─────────────────────────────────────────────────────────────────────────────
  const categoryChoices = ['All', ...categories.tokens, ...(categories.uncategorised ? [NO_CATEGORY] : [])]
  const filterSummary = [url.kind !== 'all' ? url.kind : null, url.category !== 'all' ? categoryText(url.category) : null, url.differences ? t('cafe.cmp.chip.differences') : null].filter(Boolean).join(' · ')
  const resultCount = load.kind === 'ready' ? load.page.counts.shown_scope : 0
  const totalCount = load.kind === 'ready' ? load.page.counts.total : 0
  const countLabel = (resultCount === totalCount ? t('cafe.cmp.count.all', { total: totalCount }) : t('cafe.cmp.count', { shown: resultCount, total: totalCount }))
    + (connected && visibleNeeds > 0 ? ` · ${t('cafe.cmp.count.needs', { count: visibleNeeds })}` : '')
  const clearAll = () => { setSearchText(''); wroteQ.current = ''; update({ q: '', kind: 'all', category: 'all', differences: false }) }
  const differencesToggle = (
    <label className={`scmp-toggle${connected ? '' : ' is-disabled'}`}>
      <Checkbox checked={url.differences} disabled={!connected} onChange={(on) => update({ differences: on })} />
      <span>{t('cafe.cmp.onlyDifferences')}{connected ? '' : <span className="scmp-meta">{t('cafe.cmp.onlyDifferences.reason')}</span>}</span>
    </label>
  )

  // ── Body ──────────────────────────────────────────────────────────────────────────────────────────
  let body: React.ReactNode
  if (noAccess) {
    body = (
      <EmptyState variant="blank" title={t('cafe.cmp.noAccess.title')} copy={t('cafe.cmp.noAccess.body')}>
        <Link className="btn btn-outline btn-touch" to="/cafe">{t('cafe.backToCafe')}</Link>
      </EmptyState>
    )
  } else if (catalog === 'error') {
    body = <ErrorState message={t('common.loadFailed', { what: t('common.what.items') })} onRetry={() => setCatalogTry((value) => value + 1)} />
  } else if (catalog === 'loading') {
    body = <LoadingShell count={3} label={t('cafe.cmp.loading')} />
  } else if (!stream) {
    body = (
      <>
        <p className="scmp-note">{t('cafe.cmp.noStream.body')}</p>
        <CafeStreamChoices options={allowed} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={onStream} />
      </>
    )
  } else if (load.kind === 'error') {
    body = <ErrorState message={t('cafe.cmp.loadError')} onRetry={() => setAttempt((value) => value + 1)} />
  } else if (load.kind !== 'ready') {
    body = <LoadingShell count={4} label={t('cafe.cmp.loading')} />
  } else if (load.page.counts.total === 0 && stream) {
    body = <CafeItemsEmptyState stream={stream} requiresStockUnit />
  } else {
    const countsFailed = load.kind === 'ready' && load.countsError
    const offlineAt = load.kind === 'ready' ? formatWibShortDateTime(load.at, locale) : ''
    const panel = url.item ? (
      <ComparisonPanel
        row={selectedRow} streamText={streamText} stream={stream ? { branchId: stream.branch.id, activity: stream.activity } : null}
        today={today} from={url.from} to={url.to}
        onRange={(from, to) => update({ from, to, datesInUrl: true }, 'replace')} onClose={closePanel}
        canOpenCount={canOpenCount} countsUnavailable={selectedRow ? countsUnavailable(selectedRow) : false}
      />
    ) : null
    body = (
      <div className={`scmp-page${panel ? ' scmp-page--selected' : ''}`}>
        {!online && load.kind === 'ready' && <Notice tone="attention">{t('cafe.cmp.offline', { time: offlineAt })}</Notice>}
        {!connected && load.page.source.connection !== 'connected' && (
          <Notice tone="info">
            <strong>{t('cafe.cmp.notConnected.title')}.</strong> {t('cafe.cmp.notConnected.body')}
          </Notice>
        )}
        {countsFailed && (
          <Notice tone="urgent" action={<Button variant="outline" onClick={() => setAttempt((value) => value + 1)} disabled={!online}>{t('cafe.cmp.retryCounts')}</Button>}>
            {t('cafe.cmp.countsError')}
          </Notice>
        )}
        <ComparisonSource
          locale={locale} source={load.page.source} coverage={coverage} countsComplete={reads.exhausted} countsOldest={reads.oldest}
          readingOlder={readingOlder} onReadOlder={() => void readOlder()} onRefresh={() => setAttempt((value) => value + 1)}
          refreshDisabled={!online} refreshReason={!online ? t('records.offline.refreshDisabled') : null} canOpenCount={canOpenCount} loading={false}
        />
        <KitchenToolbar
          search={searchText}
          onSearchChange={onSearch}
          searchAriaLabel={t('cafe.toolbar.searchLabel')}
          ariaLabel={t('cafe.cmp.toolbar.aria')}
          kinds={['All', 'RAW', 'WIP']}
          kind={url.kind === 'all' ? 'All' : url.kind}
          onKindChange={(kind) => update({ kind: kind === 'All' ? 'all' : kind === 'RAW' ? 'RAW' : 'WIP' })}
          kindLabel={(kind) => kind}
          categories={categoryChoices}
          category={url.category === 'all' ? 'All' : url.category}
          onCategoryChange={(value) => update({ category: value === 'All' ? 'all' : value })}
          categoryLabel={categoryText}
          filtersPanel={{ label: t('cafe.toolbar.filters'), summary: filterSummary }}
          countLabel={countLabel}
          sortControl={sortControl}
          trailing={differencesToggle}
          extraChips={[
            ...(url.differences ? [{ key: 'differences', label: t('cafe.cmp.chip.differences'), clear: () => update({ differences: false }) }] : []),
            ...(url.q ? [{ key: 'q', label: t('cafe.cmp.chip.search', { query: url.q }), clear: () => { setSearchText(''); wroteQ.current = ''; update({ q: '' }) } }] : []),
          ]}
        />
        <div className={`scmp-split${split && panel ? ' record-split has-record' : ''}`}>
          <div className="scmp-main">
            {sorted.length === 0 ? (
              hasCountRows ? <CafeNoMatch onClear={clearAll} /> : null
            ) : (
              <>
                {!tableMode && (
                  <div className="scmp-phone-head" aria-hidden="true">
                    <span>{t('cafe.cmp.col.expected')}</span><span>{t('cafe.cmp.col.count')}</span><span>{t('cafe.cmp.col.difference')}</span>
                  </div>
                )}
                <div className="scmp-scroll">
                <DataTable<TableRow>
                  columns={columns}
                  rows={asTable(slice)}
                  isDesktop={tableMode}
                  caption={t('cafe.cmp.caption')}
                  tableClassName="scmp-table"
                  sort={{ key: SORT_COLUMN[effective.sort], dir: effective.dir }}
                  onSortChange={(next) => {
                    const sort = COLUMN_SORT[next.key]
                    if (!sort) return
                    if (sort === effective.sort) update({ sort, dir: next.dir })
                    else update({ sort, dir: DEFAULT_DIR[sort] })
                  }}
                  rowClassName={(row) => (selectedRow && row.key === selectedRow.key ? 'scmp-row is-selected' : 'scmp-row')}
                  renderCard={card}
                />
                </div>
              </>
            )}
            {sorted.length > 0 && (
              <RecordsPager t={t} label={t('cafe.cmp.pager.label')} showingKey="cafe.cmp.pager.showing" page={page} pages={pages} start={start} shown={slice.length} total={resultCount} onPage={(next) => {
                const cursor = next === page + 1 ? load.page.next : cursorStarts.current.get(next) ?? null
                if (next > page && !cursor) return
                update({ page: next, cursor: cursor ?? '' })
              }} />
            )}
          </div>
          {panel}
        </div>
      </div>
    )
  }

  return (
    <CafePageFrame page="stockComparison" description={t('cafe.cmp.description')} streamBar={streamBar} state={frameState}>
      {body}
    </CafePageFrame>
  )
}
