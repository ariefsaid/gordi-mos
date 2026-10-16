// Café › Stock › Stock comparison (PREVIEW — ship state `preview`, dev launch only; see lib/ship-gate.ts).
// "Where does the latest physical Count differ from ESB's expected on-hand?" One row per stream / item / exact stored unit.
// ESB stock is NOT connected yet (reporting holds no replicated stock), so the real screen shows the real Counts under the
// viewer's own session (existing reads only) and leaves ESB expected, Difference and Difference % blank with the shared reason.
// "Preview the table with sample figures" opens an isolated, labelled in-memory sample (nothing real, nothing saved) so the filled
// table, the sort, the flags and the item panel can be judged. No stub is called. Count-review authority only; it widens nothing.
// Backend contract: R/handover/stock-comparison.md. Spec: work/design/future-stock-comparison-spec.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { RecordsPager } from '@/components/cafe-records/records-pager'
import { ComparisonPanel } from '@/components/cafe-stock-comparison/comparison-panel'
import { ComparisonSource } from '@/components/cafe-stock-comparison/comparison-source'
import {
  CountCell, DifferenceCell, ExpectedCell, FlagPills, KindTag, PercentCell, type CellContext,
} from '@/components/cafe-stock-comparison/comparison-cells'
import { DataTable, type DataTableColumn, type DataTableGroup } from '@/components/dashboard/data-table'
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
import { listCafeCountableItems } from '@/lib/db/cafe-count'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { formatWibShortDateTime, wibToday } from '@/lib/format/date'
import { streamLabel } from '@/lib/kitchen-action-label'
import {
  DEFAULT_DIR, NO_CATEGORY, PAGE_SIZE, buildRows, categoryToken, coverageOf, filterRows, pageCount, rowKey, sectionsOf, sortRows,
  type Bucket, type ComparisonRow, type ItemIdentity, type SortDir, type SortKey,
} from '@/lib/cafe-stock-comparison'
import { audienceOf, comparableStreams } from '@/lib/cafe-stock-comparison-access'
import { EMPTY_READ, readLatestCounts, recordsPageReader, type CountReadState } from '@/lib/cafe-stock-comparison-counts'
import { buildSample } from '@/lib/cafe-stock-comparison-sample'
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
const SECTION_KEY: Record<Bucket, MessageKey> = { gap: 'cafe.cmp.section.gap', unknown: 'cafe.cmp.section.unknown', zero: 'cafe.cmp.section.zero' }
/** Column key -> the sort it drives; a header click opens that sort in its own natural direction. */
const COLUMN_SORT: Record<string, SortKey> = { item: 'item', count: 'count-date', difference: 'quantity', percent: 'gap' }
const SORT_COLUMN: Record<SortKey, string> = { item: 'item', 'count-date': 'count', quantity: 'difference', gap: 'percent' }

type Load =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: ItemIdentity[]; reads: CountReadState; countsError: boolean; at: string }

type TableRow = ComparisonRow & { id: string }

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
  const update = useCallback((patch: Partial<ComparisonUrl>, mode: 'push' | 'replace' = 'push') => {
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
  const sample = url.sample

  // ── Reads: the stream's countable items, then its latest Counts (existing reads, session/RLS). ────
  const [load, setLoad] = useState<Load>({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [readingOlder, setReadingOlder] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    if (!audience.admitted || !stream || sample) { setLoad({ kind: 'idle' }); return }
    const mine = ++generation.current
    setLoad({ kind: 'loading' })
    void (async () => {
      let items: ItemIdentity[]
      try {
        items = (await listCafeCountableItems(stream)).map((item) => ({
          itemId: item.id, itemName: item.name, kind: item.kind, category: item.category?.trim() ? item.category.trim() : null, unitId: item.unitId, unitName: item.unitName,
        }))
      } catch {
        if (mine === generation.current) setLoad({ kind: 'error' })
        return
      }
      const needed = new Set(items.map((item) => rowKey(item.itemId, item.unitId)))
      const { state, error } = await readLatestCounts({
        readPage: recordsPageReader({ branchId: stream.branch.id, activity: stream.activity }, today), needed, isStale: () => mine !== generation.current,
      })
      if (mine === generation.current) setLoad({ kind: 'ready', items, reads: state, countsError: error !== null, at: new Date().toISOString() })
    })()
    return () => { generation.current += 1 }
    // The stream's identity (not its object) is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience.admitted, streamKeyText, sample, attempt, today])

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
  const sampleBuilt = useMemo(() => (sample ? buildSample(today, new Date()) : null), [sample, today])
  const rows = useMemo<ComparisonRow[]>(() => {
    if (sampleBuilt) return sampleBuilt.rows
    if (load.kind !== 'ready') return []
    return buildRows({ items: load.items, counts: load.reads.latest, expectedFor: () => ({ kind: 'not_connected' }), now: new Date(load.at) })
  }, [sampleBuilt, load])
  const connected = sample // the sample is the only place ESB figures exist
  const reads = load.kind === 'ready' ? load.reads : EMPTY_READ
  // A Count that could not be read is a blank (en dash), never "Not counted": the read must have reached the first Count ever recorded.
  const countsUnavailable = useCallback((row: ComparisonRow) => !sample && row.count === null && !reads.exhausted, [sample, reads.exhausted])
  const cell = useMemo<CellContext>(() => ({ t, locale, countsUnavailable }), [t, locale, countsUnavailable])
  const hideNotCounted = (row: ComparisonRow) => (countsUnavailable(row) ? (['not_counted'] as const) : undefined)

  // ── Filter, sort, page over the whole scope ───────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const names = new Map<string, string>()
    let uncategorised = false
    for (const row of rows) { if (row.category) names.set(categoryToken(row.category), row.category); else uncategorised = true }
    return { tokens: [...names.keys()].sort((a, b) => names.get(a)!.localeCompare(names.get(b)!)), names, uncategorised }
  }, [rows])
  const categoryText = useCallback((token: string) => token === NO_CATEGORY ? t('cafe.cmp.uncategorised') : categories.names.get(token) ?? token, [categories, t])
  const visible = useMemo(() => filterRows(rows, { q: url.q, kind: url.kind, category: url.category, differences: url.differences }), [rows, url.q, url.kind, url.category, url.differences])
  // Without ESB figures there is no gap to rank: the list follows the item name or the Count date.
  const effective: { sort: SortKey; dir: SortDir } = connected || url.sort === 'item' || url.sort === 'count-date' ? { sort: url.sort, dir: url.dir } : { sort: 'item', dir: 'asc' }
  const sorted = useMemo(() => sortRows(visible, effective.sort, effective.dir), [visible, effective.sort, effective.dir])
  const pages = pageCount(sorted.length)
  const page = Math.min(url.page, pages)
  const start = (page - 1) * PAGE_SIZE
  const slice = sorted.slice(start, start + PAGE_SIZE)
  const grouped = connected && effective.sort === 'gap'
  const sections = useMemo(() => (grouped ? sectionsOf(sorted, start, start + PAGE_SIZE) : []), [grouped, sorted, start])
  const coverage = useMemo(() => coverageOf(rows), [rows])
  const visibleNeeds = visible.filter((row) => row.bucket === 'unknown').length

  // ── Selection ─────────────────────────────────────────────────────────────────────────────────────
  const selectedRow = url.item
    ? rows.find((row) => row.itemId === url.item && row.unitId === url.unit) ?? (url.unit === '' ? rows.find((row) => row.itemId === url.item) : undefined) ?? null
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
  const workspaceReady = sample || load.kind === 'ready'
  const showWorkspace = !noAccess && catalog !== 'error' && workspaceReady && (sample || stream !== null)
  const frameState = noAccess ? 'permission' : catalog === 'error' || load.kind === 'error' ? 'error'
    : catalog === 'loading' || load.kind === 'loading' ? 'loading' : showWorkspace && rows.length > 0 ? 'read-only' : 'empty'

  const sortValues: string[] = connected
    ? ['gap:desc', 'gap:asc', 'quantity:desc', 'quantity:asc', 'item:asc', 'item:desc', 'count-date:desc', 'count-date:asc']
    : ['item:asc', 'item:desc', 'count-date:desc', 'count-date:asc']
  const sortControl = (
    <Select label={t('cafe.cmp.sort.label')} fullWidth value={`${effective.sort}:${effective.dir}`}
      onChange={(event) => { const [sort, dir] = event.target.value.split(':') as [SortKey, SortDir]; update({ sort, dir }) }}>
      {sortValues.map((value) => <option key={value} value={value}>{t(SORT_KEY[value])}</option>)}
    </Select>
  )

  const streamText = stream ? streamLabel(t, stream) : t('cafe.cmp.sampleBadge')
  const tableMode = isDesktop && !(split && Boolean(url.item))
  const hasCountRows = rows.length > 0

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
    { key: 'difference', header: t('cafe.cmp.col.difference'), numeric: true, sortable: connected, render: (row) => <DifferenceCell t={t} row={row} /> },
    { key: 'percent', header: t('cafe.cmp.col.percent'), numeric: true, sortable: connected, render: (row) => <PercentCell t={t} row={row} /> },
    { key: 'flag', header: t('cafe.cmp.col.flag'), className: 'scmp-col-flag', render: (row) => <FlagPills t={t} row={row} hide={hideNotCounted(row)} /> },
  ]
  const asTable = (list: readonly ComparisonRow[]): TableRow[] => list.map((row) => ({ ...row, id: row.key }))
  const groups: DataTableGroup<TableRow>[] | undefined = grouped
    ? sections.map((section) => ({ key: section.bucket, label: t(SECTION_KEY[section.bucket]), count: section.total, hint: section.continued ? t('cafe.cmp.section.continued') : undefined, rows: asTable(section.rows) }))
    : undefined

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
  const countLabel = (visible.length === rows.length ? t('cafe.cmp.count.all', { total: rows.length }) : t('cafe.cmp.count', { shown: visible.length, total: rows.length }))
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
  } else if (!sample && catalog === 'loading') {
    body = <LoadingShell count={3} label={t('cafe.cmp.loading')} />
  } else if (!sample && !stream) {
    body = (
      <>
        <p className="scmp-note">{t('cafe.cmp.noStream.body')}</p>
        <CafeStreamChoices options={allowed} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={onStream} />
      </>
    )
  } else if (load.kind === 'error') {
    body = <ErrorState message={t('cafe.cmp.loadError')} onRetry={() => setAttempt((value) => value + 1)} />
  } else if (!sample && load.kind !== 'ready') {
    body = <LoadingShell count={4} label={t('cafe.cmp.loading')} />
  } else if (rows.length === 0 && stream) {
    body = <CafeItemsEmptyState stream={stream} requiresStockUnit />
  } else {
    const countsFailed = load.kind === 'ready' && load.countsError
    const offlineAt = load.kind === 'ready' ? formatWibShortDateTime(load.at, locale) : ''
    const panel = url.item ? (
      <ComparisonPanel
        row={selectedRow} streamText={streamText} stream={stream ? { branchId: stream.branch.id, activity: stream.activity } : null}
        sample={sample} today={today} from={url.from} to={url.to}
        onRange={(from, to) => update({ from, to, datesInUrl: true }, 'replace')} onClose={closePanel}
        canOpenCount={canOpenCount} countsUnavailable={selectedRow ? countsUnavailable(selectedRow) : false}
      />
    ) : null
    body = (
      <div className={`scmp-page${panel ? ' scmp-page--selected' : ''}`}>
        {!online && load.kind === 'ready' && <Notice tone="attention">{t('cafe.cmp.offline', { time: offlineAt })}</Notice>}
        {sample ? (
          <Notice tone="info" action={<Button variant="outline" onClick={() => update({ sample: false, item: '', unit: '' })}>{t('cafe.cmp.leaveSample')}</Button>}>
            {t('cafe.cmp.sampleNotice')}
          </Notice>
        ) : (
          <Notice tone="info" action={<Button variant="outline" onClick={() => update({ sample: true, item: '', unit: '' })}>{t('cafe.cmp.previewSample')}</Button>}>
            <strong>{t('cafe.cmp.notConnected.title')}.</strong> {t('cafe.cmp.notConnected.body')}
          </Notice>
        )}
        {countsFailed && (
          <Notice tone="urgent" action={<Button variant="outline" onClick={() => setAttempt((value) => value + 1)} disabled={!online}>{t('cafe.cmp.retryCounts')}</Button>}>
            {t('cafe.cmp.countsError')}
          </Notice>
        )}
        <ComparisonSource
          locale={locale} coverage={coverage} sample={sampleBuilt?.source ?? null} countsComplete={sample || reads.exhausted} countsOldest={reads.oldest}
          readingOlder={readingOlder} onReadOlder={() => void readOlder()} onRefresh={() => setAttempt((value) => value + 1)}
          refreshDisabled={!online || sample} refreshReason={!online ? t('records.offline.refreshDisabled') : null} canOpenCount={canOpenCount && !sample} loading={false}
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
                  rows={grouped ? [] : asTable(slice)}
                  groups={groups}
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
              <RecordsPager t={t} label={t('cafe.cmp.pager.label')} showingKey="cafe.cmp.pager.showing" page={page} pages={pages} start={start} shown={slice.length} total={sorted.length} onPage={(next) => update({ page: next })} />
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
