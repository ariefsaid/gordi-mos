// CafeRecordsPage — /cafe/records — one read-only collection answering "what happened, when, and where"
// for production, transfers, waste, receipts, requests and Counts. A question, a period and a production
// stream pick the scope; three readings (Summary, Entries, Day summary) show it; an item or an entry opens
// in the shared record panel. Everything is a SELECT under the viewer's own access; nothing is written.
// Every view choice lives in the URL (lib/cafe-records/url-state.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { RecordDisclosure } from '@/components/record/record-page-layout'
import { RecordsPager } from '@/components/cafe-records/records-pager'
import { EntryPanel, ItemHistoryPanel } from '@/components/cafe-records/records-panel'
import { DayReading, EntriesReading, ReadingSkeleton, SummaryReading, type RecordsText } from '@/components/cafe-records/records-readings'
import { QUESTION_LABEL, QUESTION_SOURCE, SOURCE_LABEL } from '@/components/cafe-records/records-labels'
import { RecordsScope, type StreamChoice } from '@/components/cafe-records/records-scope'
import { LocationRecordsFilter } from '@/components/preview/location-preview-fields'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
import { Select } from '@/components/ui/select'
import { ViewTabs } from '@/components/ui/view-tabs'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import {
  buildDayRows, buildEntries, filterEntries, groupDayPage, matchesQuestion, pageSummary, paginate, sortDayRows, sortEntries,
  summarize, type BuildContext, type Movement,
} from '@/lib/cafe-records/model'
import { addDays, resolvePreset, type PeriodKey } from '@/lib/cafe-records/period'
import {
  ALL_STREAMS_PARAM, DEFAULT_DIR, READING_SORTS, applyPatch, parseRecordsUrl, parseStreamParam, writeRecordsUrl,
  type Reading, type RecordsUrlState, type SortDir, type SortKey,
} from '@/lib/cafe-records/url-state'
import { useRecordsLookups } from '@/lib/cafe-records/use-records-lookups'
import { useRecordsSources, type SourceId } from '@/lib/cafe-records/use-records-sources'
import { MOVEMENT_SOURCE, requiredSources } from '@/lib/cafe-records/sources'
import { BRANCH_DISPLAY_ALIAS, activityLabel, counterpartActivity, streamLabel } from '@/lib/kitchen-action-label'
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'
import { formatDayMonthYear, formatWibShortDateTime, wibToday } from '@/lib/format/date'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canReviewCafe } from '@/lib/kitchen-gates'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import './cafe-records-page.css'

const SORT_LABEL: Record<string, MessageKey> = {
  'item:asc': 'records.sort.itemAsc', 'item:desc': 'records.sort.itemDesc', 'stream:asc': 'records.sort.stream', 'stream:desc': 'records.sort.stream',
  'destination:asc': 'records.sort.destination', 'destination:desc': 'records.sort.destination',
  'quantity:desc': 'records.sort.quantityDesc', 'quantity:asc': 'records.sort.quantityAsc', 'entries:desc': 'records.sort.entriesDesc', 'entries:asc': 'records.sort.entriesDesc',
  'date:desc': 'records.sort.dateDesc', 'date:asc': 'records.sort.dateAsc',
}

export function CafeRecordsPage() {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : 'anonymous'
  // Records are viewer-scoped state: remount on an in-place account switch so no previous person's rows linger.
  return <CafeRecordsForViewer key={viewerId} viewerId={viewerId} />
}

function CafeRecordsForViewer({ viewerId }: { viewerId: string }) {
  const t = useT()
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const reviewer = canReviewCafe(roles)
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({ affiliated: auth.viewer.affiliated, accessRoles: auth.viewer.accessRoles })
  const online = !useIsOffline()
  const isDesktop = useIsDesktop()
  const split = useIsRecordSplit()
  const [params, setParams] = useSearchParams()
  const today = useMemo(() => wibToday(), [])
  const parsed = useMemo(() => parseRecordsUrl(params, today), [params, today])
  const state = parsed.state

  // ── Stream catalog (the enumerated streams, the viewer's default) ────────────────────────────────
  const cafeStream = useCafeStream()
  const { options, branches, stream: defaultStream, myStreamKeys, resolve, adopt } = cafeStream
  const [catalog, setCatalog] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogTry, setCatalogTry] = useState(0)
  useEffect(() => {
    let active = true
    setCatalog('loading')
    void resolve().then(next => { if (active) { adopt(next); setCatalog('ready') } }).catch(() => { if (active) setCatalog('error') })
    return () => { active = false }
  }, [resolve, adopt, catalogTry])

  const keyOf = (s: { branch: { id: string }; activity: ProductionActivity }) => `${s.branch.id}:${s.activity}`
  const defaultKey = defaultStream ? keyOf(defaultStream) : ALL_STREAMS_PARAM
  const streamValue = state.stream ?? defaultKey
  const knownStream = streamValue === ALL_STREAMS_PARAM || options.some(option => keyOf(option) === streamValue)
  const effectiveStream = streamValue === ALL_STREAMS_PARAM || !knownStream ? null : parseStreamParam(streamValue)

  // ── URL writes ───────────────────────────────────────────────────────────────────────────────────
  const [invalidNotice, setInvalidNotice] = useState(false)
  const update = useCallback((patch: Partial<RecordsUrlState> | ((current: RecordsUrlState) => Partial<RecordsUrlState>), mode: 'push' | 'replace' = 'push') => {
    setInvalidNotice(false)
    setParams(prev => {
      const current = parseRecordsUrl(prev, today).state
      return writeRecordsUrl(prev, applyPatch(current, typeof patch === 'function' ? patch(current) : patch))
    }, { replace: mode === 'replace' })
  }, [setParams, today])
  // A bad value is replaced by its default and said once, neutrally.
  const invalidKey = parsed.invalid.join(',')
  useEffect(() => {
    if (!invalidKey) return
    setInvalidNotice(true)
    setParams(prev => writeRecordsUrl(prev, parseRecordsUrl(prev, today).state), { replace: true })
  }, [invalidKey, setParams, today])
  useEffect(() => {
    if (catalog === 'ready' && options.length > 0 && state.stream && state.stream !== ALL_STREAMS_PARAM && !knownStream) {
      setInvalidNotice(true)
      setParams(prev => writeRecordsUrl(prev, { ...parseRecordsUrl(prev, today).state, stream: null, page: 1 }), { replace: true })
    }
  }, [catalog, options.length, state.stream, knownStream, setParams, today])

  // Search typing replaces the history entry; selects, tabs, sort and paging push.
  const [searchText, setSearchText] = useState(state.q)
  const wroteQ = useRef(state.q)
  useEffect(() => { if (state.q !== wroteQ.current) { wroteQ.current = state.q; setSearchText(state.q) } }, [state.q])
  const onSearch = (value: string) => { wroteQ.current = value; setSearchText(value); update({ q: value }, 'replace') }

  // ── Data ─────────────────────────────────────────────────────────────────────────────────────────
  const required = useMemo(() => (catalog === 'ready' ? requiredSources(state) : []), [catalog, state.question, state.reading, state.history, state.entry]) // eslint-disable-line react-hooks/exhaustive-deps
  const query = useMemo(() => ({ from: state.from, to: state.to, stream: effectiveStream, sources: required }),
    [state.from, state.to, effectiveStream?.branchId, effectiveStream?.activity, required]) // eslint-disable-line react-hooks/exhaustive-deps
  const { sources, retry, reload } = useRecordsSources(query, viewerId, online)
  const lookups = useRecordsLookups(sources, options, branches, viewerId)

  const ctx = useMemo<BuildContext>(() => ({
    itemName: lookups.itemName, unitName: lookups.unitName, receiptItem: lookups.receiptItem, wibDateOf: timestamp => wibToday(new Date(timestamp)),
  }), [lookups])
  const entries = useMemo(() => buildEntries({
    logs: sources.logs.rows, counts: sources.counts.rows, receipts: sources.receipts.rows, requests: sources.requests.rows,
  }, ctx), [sources, ctx])

  // ── Names ────────────────────────────────────────────────────────────────────────────────────────
  const streamByKey = useMemo(() => new Map(options.map(option => [keyOf(option), option])), [options])
  const text = useMemo<RecordsText>(() => {
    const stream = (key: string) => {
      const known = streamByKey.get(key)
      if (known) return streamLabel(t, known)
      const [branchId, activity] = key.split(':')
      const name = lookups.branchName(branchId)
      return name ? `${name} · ${activityLabel(t, activity as ProductionActivity)}` : t('records.stream.unknown')
    }
    const destination = (streamKey: string, branchId: string | null) => {
      if (!branchId) return ''
      const branch = branches.find(candidate => candidate.id === branchId)
      const name = branch ? BRANCH_DISPLAY_ALIAS[branch.code] ?? branch.name : lookups.branchName(branchId) ?? t('kitchen.actionType.transferTo.fallback')
      const [originBranch, activity] = streamKey.split(':')
      // A transfer inside the same books names its counterpart Activity (existing derivation), not a guessed place.
      return branchId === originBranch ? `${name} · ${activityLabel(t, counterpartActivity(activity as ProductionActivity))}` : name
    }
    const personById = (id: string) => lookups.personName(id) ?? t('records.person.unavailable')
    return {
      t, stream, destination, personById,
      person: entry => entry.personId ? personById(entry.personId) : t('records.who.notAvailable'),
    }
  }, [t, streamByKey, branches, lookups])

  // ── Filters, readings ────────────────────────────────────────────────────────────────────────────
  const sortCtx = useMemo(() => ({ streamLabel: text.stream, destinationLabel: text.destination }), [text])
  const relevant = useMemo(() => entries.filter(entry => matchesQuestion(entry, state.question)), [entries, state.question])
  const filtered = useMemo(() => filterEntries(entries, { question: state.question, q: state.q, item: state.item, destination: state.destination }),
    [entries, state.question, state.q, state.item, state.destination])
  const sourcesFor = (list: SourceId[]) => list.map(id => sources[id])
  const loading = catalog === 'loading' || required.some(id => sources[id].status === 'loading' || sources[id].status === 'idle') || (required.length > 0 && lookups.status === 'loading')
  const unavailable = required.some(id => sources[id].status === 'unavailable')
  const denied = required.some(id => sources[id].denied)
  const failed = required.filter(id => sources[id].status === 'done' && !sources[id].complete)
  const incompleteMovements = useMemo(() => new Set((Object.keys(MOVEMENT_SOURCE) as Movement[]).filter(movement => required.includes(MOVEMENT_SOURCE[movement]) && sources[MOVEMENT_SOURCE[movement]].status === 'done' && !sources[MOVEMENT_SOURCE[movement]].complete)), [required, sources])
  const dayHealth = { logs: sources.logs.complete || !required.includes('logs'), counts: sources.counts.complete || !required.includes('counts') }

  const showDestination = (state.question === 'transferred' || state.question === 'everything') && filtered.some(entry => entry.destinationBranchId !== null)
  const summaryGroups = useMemo(() => summarize(filtered, state.question), [filtered, state.question])
  const summaryPage = useMemo(() => pageSummary(summaryGroups, state.sort, state.dir, sortCtx, state.page), [summaryGroups, state.sort, state.dir, sortCtx, state.page])
  const entryRows = useMemo(() => sortEntries(filtered, state.sort, state.dir), [filtered, state.sort, state.dir])
  const entryPage = useMemo(() => paginate(entryRows, state.page), [entryRows, state.page])
  const dayRows = useMemo(() => sortDayRows(buildDayRows(
    filterEntries(entries, { question: 'everything', q: state.q, item: state.item, destination: state.destination }), state.question, dayHealth), state.dir),
    [entries, state.q, state.item, state.destination, state.question, state.dir, dayHealth.logs, dayHealth.counts]) // eslint-disable-line react-hooks/exhaustive-deps
  const dayPage = useMemo(() => paginate(dayRows, state.page), [dayRows, state.page])
  const dayGroups = useMemo(() => groupDayPage(dayRows, dayPage.slice, dayPage.start), [dayRows, dayPage])

  const reading = state.reading
  const total = reading === 'summary' ? summaryPage.totalRows : reading === 'entries' ? entryRows.length : dayRows.length
  const pageInfo = reading === 'summary'
    ? { page: summaryPage.page, pages: summaryPage.pages, start: summaryPage.start, shown: summaryPage.groups.reduce((n, g) => n + g.rows.length, 0) }
    : reading === 'entries'
      ? { page: Math.min(state.page, entryPage.pages), pages: entryPage.pages, start: entryPage.start, shown: entryPage.slice.length }
      : { page: Math.min(state.page, dayPage.pages), pages: dayPage.pages, start: dayPage.start, shown: dayPage.slice.length }

  // Item and destination choices come from what the question can show.
  const itemChoices = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of relevant) if (!map.has(entry.itemKey)) map.set(entry.itemKey, entry.itemName)
    if (state.item && !map.has(state.item)) map.set(state.item, entries.find(entry => entry.itemKey === state.item)?.itemName ?? state.item.replace(/^request-name:/, ''))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }) || a[0].localeCompare(b[0]))
  }, [relevant, entries, state.item])
  const destinationChoices = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of relevant) if (entry.destinationBranchId && !map.has(entry.destinationBranchId)) map.set(entry.destinationBranchId, text.destination(entry.streamKey, entry.destinationBranchId))
    if (state.destination && !map.has(state.destination)) map.set(state.destination, lookups.branchName(state.destination) ?? state.destination)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [relevant, text, state.destination, lookups])

  // ── Handlers ─────────────────────────────────────────────────────────────────────────────────────
  const periodRef = useRef<HTMLButtonElement>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [focusPeriodOnOpen, setFocusPeriodOnOpen] = useState(false)
  useEffect(() => {
    if (!scopeOpen || !focusPeriodOnOpen) return
    periodRef.current?.focus()
    setFocusPeriodOnOpen(false)
  }, [scopeOpen, focusPeriodOnOpen])
  const openScopeAtPeriod = () => {
    setFocusPeriodOnOpen(true)
    setScopeOpen(true)
  }
  const setPeriod = (period: PeriodKey) => {
    if (period === 'custom') update({ period: 'custom', from: state.from, to: state.to, datesInUrl: true, draftFrom: state.from, draftTo: state.to })
    else update({ period, ...resolvePreset(period, today), datesInUrl: true, draftFrom: '', draftTo: '' })
  }
  const setSort = (sort: SortKey, dir: SortDir) => update({ sort, dir })
  const setStream = (value: string) => update({ stream: value })
  const openHistory = (itemKey: string) => update({ history: itemKey })
  const openEntry = (key: string) => update({ entry: key })
  const closePanel = () => {
    const returning = state.history ? `history:${state.history}` : state.entry ? `entry:${state.entry}` : ''
    update({ entry: '', history: '' })
    if (returning) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rec-focus="${CSS.escape(returning)}"]`)?.focus())
  }
  const clearFilters = () => { setSearchText(''); wroteQ.current = ''; update({ q: '', item: '', destination: '' }) }

  const streamChoices: StreamChoice[] = useMemo(() => {
    const ranked = [...options].sort((a, b) => Number(myStreamKeys.has(keyOf(b))) - Number(myStreamKeys.has(keyOf(a))))
    return [{ value: ALL_STREAMS_PARAM, label: t('records.stream.all') }, ...ranked.map(option => ({ value: keyOf(option), label: streamLabel(t, option) }))]
  }, [options, myStreamKeys, t])

  const rangeText = state.from === state.to ? formatDayMonthYear(state.from) : t('records.range.exact', { from: formatDayMonthYear(state.from), to: formatDayMonthYear(state.to) })
  const streamText = streamValue === ALL_STREAMS_PARAM || !knownStream ? t('records.stream.all') : text.stream(streamValue)
  const filtersActive = Boolean(state.q || state.item || state.destination)
  const lastLoaded = Math.min(...sourcesFor(required).map(s => s.loadedAt ?? Infinity))
  const showCached = !online && Number.isFinite(lastLoaded) && sourcesFor(required).some(s => s.fromCache)
  const sourceName = (id: SourceId) => t(SOURCE_LABEL[id])

  // ── Sort control (phone) ─────────────────────────────────────────────────────────────────────────
  const sortOptions: SortKey[] = READING_SORTS[reading].filter(key => key !== 'destination' || showDestination)
  const sortValues = sortOptions.flatMap(key => key === 'item' || key === 'date' || key === 'quantity' ? [`${key}:asc`, `${key}:desc`] : [`${key}:${DEFAULT_DIR[key]}`])
  const selectedSortValue = `${state.sort}:${state.dir}`
  const selectedSortLabel = t(SORT_LABEL[selectedSortValue])
  const sortControl = (
    <Select label={t('records.sort.label')} fullWidth value={selectedSortValue} onChange={event => { const [sort, dir] = event.target.value.split(':'); setSort(sort as SortKey, dir as SortDir) }}>
      {sortValues.map(value => <option key={value} value={value}>{t(SORT_LABEL[value])}</option>)}
    </Select>
  )

  // ── Panel ────────────────────────────────────────────────────────────────────────────────────────
  const panelOpen = Boolean(state.entry || state.history)
  const selectedEntry = state.entry ? entries.find(entry => entry.key === state.entry) ?? null : null
  const panelReady = !loading
  const coverage = { logs: sources.logs.complete, counts: sources.counts.complete, receipts: sources.receipts.complete, requests: sources.requests.complete }
  const historyName = state.history ? entries.find(entry => entry.itemKey === state.history)?.itemName ?? state.history.replace(/^request-name:/, '') : ''
  const panel = panelOpen && panelReady ? (
    state.history
      ? <ItemHistoryPanel text={text} itemKey={state.history} itemName={historyName} entries={entries} coverage={coverage} rangeText={rangeText} streamText={streamText}
          reviewer={reviewer} onClose={closePanel} onOpenEntry={openEntry} />
      : <EntryPanel text={text} entry={selectedEntry} reviewer={reviewer} canCapture={canCapture} onClose={closePanel} onOpenHistory={openHistory} />
  ) : null

  // ── Body ─────────────────────────────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'summary', label: t('records.reading.summary') },
    { id: 'entries', label: t('records.reading.entries') },
    { id: 'day', label: t('records.reading.day') },
  ]
  const singleSource = state.question === 'everything' ? null : QUESTION_SOURCE[state.question]
  const dayNeedsNote = reading === 'day' && (state.question === 'requested')
  const noRows = total === 0

  let body: React.ReactNode
  if (catalog === 'error') {
    body = <ErrorState message={t('records.error.catalog')} onRetry={() => setCatalogTry(value => value + 1)} retryLabel={t('common.retry')} />
  } else if (denied) {
    body = (
      <EmptyState variant="blank" title={t('records.noAccess.title')} copy={t('records.noAccess.body')}>
        <Link className="btn btn-outline btn-touch" to="/cafe">{t('cafe.backToCafe')}</Link>
      </EmptyState>
    )
  } else if (unavailable && !sourcesFor(required).some(s => s.status === 'done')) {
    body = <Notice tone="attention">{t('records.offline.unavailable')}</Notice>
  } else if (loading) {
    body = <ReadingSkeleton t={t} reading={reading} isDesktop={isDesktop} />
  } else if (dayNeedsNote) {
    body = (
      <EmptyState variant="blank" title={t('records.day.requestedTitle')} copy={t('records.day.requestedBody')}>
        <Button variant="outline" className="btn-touch" onClick={() => update({ reading: 'entries' })}>{t('records.reading.entries')}</Button>
      </EmptyState>
    )
  } else if (noRows && filtersActive && relevant.length > 0) {
    body = <CafeNoMatch onClear={clearFilters} />
  } else if (noRows && failed.length === 0) {
    body = (
      <section className="rec-empty-answer" aria-live="polite">
        <h2>{singleSource ? t('records.empty.title', { source: sourceName(singleSource) }) : t('records.empty.everything')}</h2>
        <p>{t('records.empty.scopedBody', { question: t(QUESTION_LABEL[state.question]), stream: streamText, range: rangeText })}</p>
        <Button variant="outline" className="btn-touch" onClick={openScopeAtPeriod}>{t('records.empty.changePeriod')}</Button>
      </section>
    )
  } else if (reading === 'summary') {
    body = <SummaryReading text={text} question={state.question} incomplete={incompleteMovements} groups={summaryPage.groups} sort={state.sort} dir={state.dir} onSort={setSort}
      showDestination={showDestination} isDesktop={isDesktop} onOpenHistory={openHistory} onOpenEntry={openEntry} selectedHistory={state.history} selectedEntry={state.entry} />
  } else if (reading === 'entries') {
    body = <EntriesReading text={text} entries={entryPage.slice} sort={state.sort} dir={state.dir} onSort={setSort} showDestination={showDestination}
      isDesktop={isDesktop} onOpenHistory={openHistory} onOpenEntry={openEntry} selectedHistory={state.history} selectedEntry={state.entry} />
  } else {
    body = <DayReading text={text} groups={dayGroups} dir={state.dir} onSort={setSort} isDesktop={isDesktop}
      onOpenHistory={openHistory} onOpenEntry={openEntry} selectedHistory={state.history} selectedEntry={state.entry} />
  }

  const frameState = catalog === 'error' ? 'error' : loading ? 'loading' : denied ? 'permission' : noRows ? 'empty' : 'read-only'
  // Receipts and requests are scoped to the viewer's own records and the streams they review; say so wherever they can show.
  const scopeNotice = state.question === 'received' || state.question === 'requested' || (state.question === 'everything' && reading !== 'day')
  const failureNotices = failed.map(id => {
    const source = sources[id]
    const uncovered = source.uncovered
    const message = source.rows.length > 0 && uncovered
      ? t('records.error.partial', { source: sourceName(id), loaded: loadedText(t, uncovered, state.to), missing: uncoveredText(t, uncovered) })
      : t('records.error.source', { source: sourceName(id) })
    return (
      <Notice key={id} tone="urgent" action={<Button variant="outline" onClick={() => retry(id)}>{t('common.retry')}</Button>}>
        {message}{source.incompleteParents.length > 0 ? ` ${t('records.error.lines')}` : ''}
      </Notice>
    )
  })

  return (
    <CafePageFrame page="records" state={frameState}>
      <div className="rec-page">
        {invalidNotice && <Notice tone="info">{t('records.invalidLink')}</Notice>}
        <RecordsScope
          t={t} question={state.question} onQuestion={question => update({ question })} period={state.period} onPeriod={setPeriod} from={state.from} to={state.to} today={today}
          streamValue={knownStream ? streamValue : ALL_STREAMS_PARAM} streams={streamChoices} onStream={setStream} periodRef={periodRef}
          draftFrom={state.draftFrom} draftTo={state.draftTo} open={scopeOpen} onOpenChange={setScopeOpen}
          onDraft={(field, value) => update(current => field === 'from' ? { draftFrom: value, draftTo: current.draftTo || current.to } : { draftTo: value, draftFrom: current.draftFrom || current.from }, 'replace')}
          onApply={(from, to) => update({ period: 'custom', from, to, datesInUrl: true, draftFrom: '', draftTo: '' })}
          trailing={<span className="rec-refresh">
            <Button variant="ghost" onClick={reload} disabled={!online || loading} aria-describedby={online ? undefined : 'rec-refresh-reason'}>{t('records.refresh')}</Button>
            {!online && <span id="rec-refresh-reason" className="rec-refresh__reason">{t('records.offline.refreshDisabled')}</span>}
          </span>}
        />
        <ViewTabs tabs={tabs} active={reading} onChange={id => update({ reading: id as Reading })} ariaLabel={t('records.reading.label')} idPrefix="rec-tab" panelId="rec-panel" />
        <KitchenToolbar
          search={searchText}
          onSearchChange={onSearch}
          searchPlaceholder={t('kitchen.log.searchPlaceholder')}
          ariaLabel={t('records.toolbar.aria')}
          filtersPanel={{ label: t('workbench.records.options'), summary: [state.item && itemChoices.find(([k]) => k === state.item)?.[1], state.destination && destinationChoices.find(([k]) => k === state.destination)?.[1]].filter(Boolean).join(' · ') }}
          countLabel={!loading && !denied && !dayNeedsNote ? t(total === 1 ? 'records.count.one' : 'records.count.other', { count: total }) : undefined}
          sortLabel={selectedSortLabel}
          sortControl={sortControl}
          sortControlIn="panel"
          trailing={<>
            <Select label={t('kitchen.log.col.item')} value={state.item} onChange={event => update({ item: event.target.value })} className="ktb-category">
              <option value="">{t('records.item.all')}</option>
              {itemChoices.map(([key, name]) => <option key={key} value={key}>{name || '—'}</option>)}
            </Select>
            <LocationRecordsFilter />
            {state.question === 'transferred' && (
              <Select label={t('records.destination.label')} value={state.destination} onChange={event => update({ destination: event.target.value })} className="ktb-category">
                <option value="">{t('records.destination.all')}</option>
                {destinationChoices.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </Select>
            )}
          </>}
          extraChips={[
            ...(state.item ? [{ key: 'item', label: t('records.chip.item', { item: itemChoices.find(([k]) => k === state.item)?.[1] ?? state.item }), clear: () => update({ item: '' }) }] : []),
            ...(state.destination ? [{ key: 'destination', label: t('records.chip.destination', { destination: destinationChoices.find(([k]) => k === state.destination)?.[1] ?? state.destination }), clear: () => update({ destination: '' }) }] : []),
            ...(state.q ? [{ key: 'q', label: t('records.chip.search', { query: state.q }), clear: () => { setSearchText(''); wroteQ.current = ''; update({ q: '' }) } }] : []),
          ]}
        />
        <div className={`rec-split${split && panelOpen && panel ? ' record-split has-record' : ''}`}>
          <div className="rec-main">
            {showCached && <Notice tone="info">{t('records.offline.lastLoaded', { time: formatWibShortDateTime(new Date(lastLoaded)) })}</Notice>}
            {scopeNotice && <Notice tone="info">{t('records.scope.notice')}</Notice>}
            {failureNotices}
            <div id="rec-panel" role="tabpanel" aria-labelledby={`rec-tab-${reading}`} className="rec-content">{body}</div>
            {!loading && !denied && !dayNeedsNote && !noRows && (
              <RecordsPager t={t} page={pageInfo.page} pages={pageInfo.pages} start={pageInfo.start} shown={pageInfo.shown} total={total} onPage={page => update({ page })} />
            )}
            <div className="rec-about">
              <RecordDisclosure title={t('records.about.title')}>
                <p>{t('records.about.dates')}</p>
                <p>{t('records.day.basis')}</p>
                <p>{t('records.about.units')}</p>
                <p>{t('records.about.posting')}</p>
                <p>{t('records.about.limits')}</p>
              </RecordDisclosure>
            </div>
          </div>
          {panel}
        </div>
      </div>
    </CafePageFrame>
  )
}

/** Rows come newest first, so what was read is everything after the uncovered window, up to the end date. */
function loadedText(t: ReturnType<typeof useT>, uncovered: { from: string; to: string }, to: string): string {
  // The day the read stopped on may be partly loaded, so complete coverage starts the day after it.
  const start = addDays(uncovered.to, 1)
  if (start > to) return t('records.error.none')
  return start === to ? formatDayMonthYear(to) : t('records.range.exact', { from: formatDayMonthYear(start), to: formatDayMonthYear(to) })
}

function uncoveredText(t: ReturnType<typeof useT>, uncovered: { from: string; to: string }): string {
  return uncovered.from === uncovered.to ? formatDayMonthYear(uncovered.from) : t('records.range.exact', { from: formatDayMonthYear(uncovered.from), to: formatDayMonthYear(uncovered.to) })
}
