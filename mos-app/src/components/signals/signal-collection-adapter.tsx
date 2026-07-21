// Signal adapter for the V3 RecordCollection engine (Issue 6, Tasks 3 + 13).
// Signals have no PIC, Supervisor, or Task Status; the schema/descriptor never invents them to fit a
// Task table. This module owns the typed Signal query <-> URL schema AND the full collection
// descriptor (load / project / feed+table presentations / typed saved views / record-opening seam).
import type { Attention, SignalCategory, SignalRow } from '@/lib/db/signals.types'
import { SIGNAL_CATEGORIES } from '@/lib/db/signals.types'
import { listReadableSignals, listAllTeams, orderSignalsForFeed } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import type { OverlayEntry } from '@/shell/overlay-host'
import {
  archiveCollectionView,
  createCollectionView,
  getCollectionView,
  listCollectionViews,
  renameCollectionView,
} from '@/lib/db/user-views-collection'
import {
  parseCollectionViewSpec,
  type CollectionViewSpec,
} from '@/lib/record-collection/collection-view-spec'
import type {
  CollectionAccess,
  CollectionData,
  CollectionProjection,
  CollectionQueryIssue,
  CollectionQueryParse,
  CollectionQuerySchema,
  CollectionSavedViewDescriptor,
  CollectionViewStore,
  QueryKey,
  RecordCollectionDescriptor,
  RecordViewerOpenSource,
  RecordViewerOpeningContract,
} from '@/lib/record-collection/types'
import { SignalRecordHost } from './signal-record-host'
import { SignalTablePresentation } from './signal-table-presentation'
import { SignalFeedPresentation } from './signal-feed-presentation'

export type SignalCollectionPresentation = 'feed' | 'table'
export type SignalCollectionGroup = 'none' | 'team' | 'attention' | 'category'
export type SignalCollectionSort = 'occurredAt' | 'attention'
export type SignalCollectionAction = never

export type SignalCollectionView = 'all' | 'needs-attention' | 'retracted'

export interface SignalCollectionQuery {
  layout: SignalCollectionPresentation
  view: SignalCollectionView
  q: string
  attention: Attention | null
  category: SignalCategory | null
  teamId: string | null
  groupBy: SignalCollectionGroup
  sort: SignalCollectionSort
  direction: 'ascending' | 'descending'
  showRetracted: boolean
  savedViewId: string | null
}

const LAYOUTS: readonly SignalCollectionPresentation[] = ['feed', 'table']
const VIEWS: readonly SignalCollectionView[] = ['all', 'needs-attention', 'retracted']
const GROUPS: readonly SignalCollectionGroup[] = ['none', 'team', 'attention', 'category']
const SORTS: readonly SignalCollectionSort[] = ['occurredAt', 'attention']
const ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']

// The Signals COLLECTION default is the dense, linkable archive Table (the primary full surface, and
// the one that preserves FR-416 shareable per-row canonical links). The Home ambient embed asks for
// Feed explicitly via a fixed query, so it is unaffected by this default.
export const SIGNAL_COLLECTION_NEUTRAL_QUERY: SignalCollectionQuery = {
  layout: 'table',
  view: 'all',
  q: '',
  attention: null,
  category: null,
  teamId: null,
  groupBy: 'none',
  sort: 'occurredAt',
  direction: 'descending',
  showRetracted: false,
  savedViewId: null,
}

const SIGNAL_QUERY_KEYS: readonly QueryKey<SignalCollectionQuery>[] = [
  'layout', 'view', 'q', 'attention', 'category', 'teamId',
  'groupBy', 'sort', 'direction', 'showRetracted', 'savedViewId',
]

function parseSignalQuery(params: URLSearchParams): CollectionQueryParse<SignalCollectionQuery> {
  const issues: CollectionQueryIssue[] = []
  const query: SignalCollectionQuery = { ...SIGNAL_COLLECTION_NEUTRAL_QUERY }

  const layout = params.get('layout')
  if (layout !== null) {
    if (LAYOUTS.includes(layout as SignalCollectionPresentation)) query.layout = layout as SignalCollectionPresentation
    else issues.push({ key: 'layout', code: 'invalid-value', value: layout })
  }

  const view = params.get('view')
  if (view !== null) {
    if (VIEWS.includes(view as SignalCollectionView)) query.view = view as SignalCollectionView
    else issues.push({ key: 'view', code: 'invalid-value', value: view })
  }

  const q = params.get('q')
  if (q !== null) query.q = q

  query.teamId = params.get('team')
  query.savedViewId = params.get('saved')

  const attention = params.get('attention')
  if (attention !== null) {
    if (ATTENTIONS.includes(attention as Attention)) query.attention = attention as Attention
    else issues.push({ key: 'attention', code: 'invalid-value', value: attention })
  }

  const category = params.get('category')
  if (category !== null) {
    if ((SIGNAL_CATEGORIES as readonly string[]).includes(category)) query.category = category as SignalCategory
    else issues.push({ key: 'category', code: 'invalid-value', value: category })
  }

  const group = params.get('group')
  if (group !== null) {
    if (GROUPS.includes(group as SignalCollectionGroup)) query.groupBy = group as SignalCollectionGroup
    else issues.push({ key: 'group', code: 'invalid-value', value: group })
  }

  const sort = params.get('sort')
  if (sort !== null) {
    if (SORTS.includes(sort as SignalCollectionSort)) query.sort = sort as SignalCollectionSort
    else issues.push({ key: 'sort', code: 'invalid-value', value: sort })
  }

  const dir = params.get('dir')
  if (dir !== null) {
    if (dir === 'ascending' || dir === 'descending') query.direction = dir
    else issues.push({ key: 'direction', code: 'invalid-value', value: dir })
  }

  if (params.get('retracted') === '1') query.showRetracted = true

  if (issues.length > 0) return { ok: false, query, issues }
  return { ok: true, query }
}

function serializeSignalQuery(query: SignalCollectionQuery): URLSearchParams {
  const p = new URLSearchParams()
  p.set('layout', query.layout)
  if (query.view !== 'all') p.set('view', query.view)
  if (query.q) p.set('q', query.q)
  if (query.attention) p.set('attention', query.attention)
  if (query.category) p.set('category', query.category)
  if (query.teamId) p.set('team', query.teamId)
  if (query.groupBy !== 'none') p.set('group', query.groupBy)
  if (query.sort !== SIGNAL_COLLECTION_NEUTRAL_QUERY.sort) p.set('sort', query.sort)
  if (query.direction !== SIGNAL_COLLECTION_NEUTRAL_QUERY.direction) p.set('dir', query.direction)
  if (query.showRetracted) p.set('retracted', '1')
  if (query.savedViewId) p.set('saved', query.savedViewId)
  return p
}

export const signalCollectionQuery: CollectionQuerySchema<SignalCollectionQuery> = {
  keys: SIGNAL_QUERY_KEYS,
  neutral: SIGNAL_COLLECTION_NEUTRAL_QUERY,
  parse: (params) => parseSignalQuery(params),
  serialize: serializeSignalQuery,
  normalize: (query) => query,
}

// Feed is chronological occurred-at with no grouping and all meaningful filters; Table supports
// every Signal query key. Switching to Feed with a populated attention-sort or Team-group is a typed
// rejection — never a silent reset to chronological/flat.
export const signalPresentationCompatibleKeys: Readonly<
  Record<SignalCollectionPresentation, readonly QueryKey<SignalCollectionQuery>[]>
> = {
  feed: ['layout', 'view', 'q', 'attention', 'category', 'teamId', 'direction', 'showRetracted', 'savedViewId'],
  table: SIGNAL_QUERY_KEYS,
}

// ── Full descriptor (load / project / presentations / saved views / opening seam) ────────────────

/** Display context the presentations read — resolved author/Team/site names + the viewer id. */
export interface SignalCollectionContext {
  authorNamesById: ReadonlyMap<string, string>
  teamNamesById: ReadonlyMap<string, string>
  siteNamesByTeamId: ReadonlyMap<string, string>
  viewerId: string | null
}

/** A typed projection group — never the old raw-row group shape. Null label = flat/uncategorised. */
export interface SignalRenderGroup {
  key: string
  label: string | null
  rows: readonly SignalRow[]
}

const ATTENTION_WEIGHT: Readonly<Record<Attention, number>> = { Urgent: 3, 'Needs attention': 2, FYI: 1 }

/** A retracted Signal is a tombstone hidden by default — visible only when the typed query asks. */
function isRetractedVisible(signal: SignalRow, query: SignalCollectionQuery): boolean {
  if (!signal.retracted_at) return true
  return query.showRetracted || query.view === 'retracted'
}

function matchesText(signal: SignalRow, term: string, context: SignalCollectionContext): boolean {
  if (!term) return true
  const author = context.authorNamesById.get(signal.author_id) ?? ''
  const team = context.teamNamesById.get(signal.owning_team_id) ?? ''
  return `${signal.body} ${author} ${team}`.toLowerCase().includes(term)
}

function filterSignals(
  records: readonly SignalRow[],
  query: SignalCollectionQuery,
  context: SignalCollectionContext,
): SignalRow[] {
  const term = query.q.trim().toLowerCase()
  return records.filter((signal) => {
    if (query.view === 'retracted') {
      if (!signal.retracted_at) return false
    } else if (!isRetractedVisible(signal, query)) {
      return false
    }
    if (query.view === 'needs-attention' && signal.attention === 'FYI') return false
    if (query.attention && signal.attention !== query.attention) return false
    if (query.category && signal.category !== query.category) return false
    if (query.teamId && signal.owning_team_id !== query.teamId) return false
    if (!matchesText(signal, term, context)) return false
    return true
  })
}

function sortSignals(rows: readonly SignalRow[], query: SignalCollectionQuery): SignalRow[] {
  const dir = query.direction === 'ascending' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (query.sort === 'attention') {
      const byWeight = ATTENTION_WEIGHT[a.attention] - ATTENTION_WEIGHT[b.attention]
      if (byWeight !== 0) return byWeight * dir
    }
    return (Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) * dir
  })
}

function groupLabel(field: SignalCollectionGroup, key: string, context: SignalCollectionContext): string | null {
  if (field === 'team') return context.teamNamesById.get(key) ?? 'Unknown team'
  if (field === 'attention') return key
  if (field === 'category') return key === '' ? 'Uncategorized' : key
  return null
}

function groupSignals(
  rows: readonly SignalRow[],
  query: SignalCollectionQuery,
  context: SignalCollectionContext,
): SignalRenderGroup[] {
  if (query.groupBy === 'none') return [{ key: 'all', label: null, rows }]
  const buckets = new Map<string, SignalRow[]>()
  for (const signal of rows) {
    const key =
      query.groupBy === 'team'
        ? signal.owning_team_id
        : query.groupBy === 'attention'
          ? signal.attention
          : signal.category ?? ''
    const bucket = buckets.get(key) ?? []
    bucket.push(signal)
    buckets.set(key, bucket)
  }
  return [...buckets.entries()].map(([key, groupRows]) => ({
    key,
    label: groupLabel(query.groupBy, key, context),
    rows: groupRows,
  }))
}

/** A populated query filter (not the retracted baseline) — empty vs filtered-empty derive from this. */
function isFiltered(query: SignalCollectionQuery): boolean {
  return (
    query.q.trim() !== '' ||
    query.attention !== null ||
    query.category !== null ||
    query.teamId !== null ||
    query.view !== 'all'
  )
}

function projectSignals(
  data: CollectionData<SignalRow, SignalCollectionContext>,
  query: SignalCollectionQuery,
  presentation: SignalCollectionPresentation,
): CollectionProjection<SignalRow, SignalRenderGroup> {
  const filtered = filterSignals(data.records, query, data.context)
  let visibleRecords: SignalRow[]
  let groups: SignalRenderGroup[]
  if (presentation === 'feed') {
    visibleRecords = orderSignalsForFeed([...filtered])
    groups = [{ key: 'all', label: null, rows: visibleRecords }]
  } else {
    visibleRecords = sortSignals(filtered, query)
    groups = groupSignals(visibleRecords, query, data.context)
  }
  return {
    visibleRecords,
    groups,
    totalRecords: data.records.length,
    visibleRecordsAreFiltered: isFiltered(query),
  }
}

/** Drop the transient `?record=` panel key when escalating to a canonical page. */
function searchWithoutRecord(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('record')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

// The Signal record-opening contract (Issue-5 grammar): turn one Signal + its source location into an
// Issue-4 OverlayEntry and a canonical page target. In Option A this seam is DORMANT for the archive
// (record-opening still runs through the existing `?record=` RecordPanelHost); a later R-T-4 follow-up
// wires the overlay host and this is its ready opening contract.
const signalViewer: RecordViewerOpeningContract<SignalRow> = {
  recordType: 'signal',
  buildPanelEntry(signal: SignalRow, source: RecordViewerOpenSource): OverlayEntry {
    return {
      key: `signal:${signal.id}`,
      owner: 'signals',
      tenant: 'record',
      label: 'Signal',
      pageTo: { pathname: `/work/signals/${signal.id}`, search: searchWithoutRecord(source.search) },
      content: <SignalRecordHost signalId={signal.id} mode="panel" />,
    }
  },
  toCanonicalPage(recordId: string, source: RecordViewerOpenSource) {
    return { pathname: `/work/signals/${recordId}`, search: searchWithoutRecord(source.search) }
  },
}

const SIGNAL_VISIBLE_FIELDS = [
  'message', 'author', 'team', 'occurredAt', 'attention', 'category', 'retracted',
] as const

const signalCollectionViewStore: CollectionViewStore = {
  list: (collectionId) => listCollectionViews(collectionId),
  get: (id) => getCollectionView(id),
  create: (input) => createCollectionView(input),
  rename: (id, name) => renameCollectionView(id, name),
  archive: (id) => archiveCollectionView(id),
}

export const signalCollectionSavedViews: CollectionSavedViewDescriptor<
  SignalCollectionQuery,
  SignalCollectionPresentation
> = {
  enabled: true,
  store: signalCollectionViewStore,
  operations: ['save', 'apply', 'rename', 'archive'],
  buildSpec({ query, presentation }): CollectionViewSpec {
    return {
      kind: 'collection',
      version: 1,
      collectionId: 'signals',
      domain: 'signals',
      presentation,
      visibleFields: [...SIGNAL_VISIBLE_FIELDS],
      query: {
        view: query.view,
        q: query.q,
        attention: query.attention,
        category: query.category,
        teamId: query.teamId,
        showRetracted: query.showRetracted,
      },
      sort: { field: query.sort, direction: query.direction },
      grouping: query.groupBy === 'none' ? null : { field: query.groupBy },
      layout: { density: 'comfortable' },
    }
  },
  parseAndValidate: (input) => parseCollectionViewSpec(input),
  applySpec(spec): { query: SignalCollectionQuery; presentation: SignalCollectionPresentation } {
    if (spec.collectionId !== 'signals') {
      throw new Error('signalCollectionSavedViews.applySpec received a non-signals spec')
    }
    return {
      presentation: spec.presentation,
      query: {
        ...SIGNAL_COLLECTION_NEUTRAL_QUERY,
        layout: spec.presentation,
        view: spec.query.view,
        q: spec.query.q,
        attention: spec.query.attention,
        category: spec.query.category,
        teamId: spec.query.teamId,
        showRetracted: spec.query.showRetracted,
        groupBy: spec.grouping?.field ?? 'none',
        sort: spec.sort.field,
        direction: spec.sort.direction,
      },
    }
  },
}

const SIGNAL_FILTER_KEYS: readonly QueryKey<SignalCollectionQuery>[] = ['attention', 'category', 'teamId']

export const signalCollectionDescriptor: RecordCollectionDescriptor<
  SignalRow,
  string,
  SignalCollectionQuery,
  SignalCollectionContext,
  SignalRenderGroup,
  SignalCollectionAction,
  SignalCollectionPresentation
> = {
  id: 'signals',
  defaultPresentation: 'table',
  query: signalCollectionQuery,
  savedViews: signalCollectionSavedViews,
  presentations: {
    feed: {
      id: 'feed',
      label: 'Feed',
      compatibleQueryKeys: signalPresentationCompatibleKeys.feed,
      capabilities: {
        search: true,
        filterKeys: SIGNAL_FILTER_KEYS,
        sortKeys: [],
        groupKeys: [],
        savedViews: true,
        selection: false,
        recordOpening: true,
        bulkActions: [],
      },
      render: (props) => <SignalFeedPresentation {...props} />,
    },
    table: {
      id: 'table',
      label: 'Table',
      compatibleQueryKeys: signalPresentationCompatibleKeys.table,
      capabilities: {
        search: true,
        filterKeys: SIGNAL_FILTER_KEYS,
        sortKeys: ['sort'],
        groupKeys: ['groupBy'],
        savedViews: true,
        selection: true,
        recordOpening: true,
        bulkActions: [],
      },
      render: (props) => <SignalTablePresentation {...props} />,
    },
  },
  async load({ query, viewerId }): Promise<CollectionData<SignalRow, SignalCollectionContext>> {
    void query // load fetches every readable Signal; the typed query is applied in `project`.
    const [signals, people, teams] = await Promise.all([
      listReadableSignals({ includeRetracted: true }),
      getPeople(),
      listAllTeams(),
    ])
    return {
      records: signals,
      context: {
        authorNamesById: new Map(people.map((person) => [person.id, person.full_name])),
        teamNamesById: new Map(teams.map((team) => [team.id, team.name])),
        siteNamesByTeamId: new Map(),
        viewerId,
      },
    }
  },
  project: (data, query, presentation) => projectSignals(data, query, presentation),
  getId: (signal) => signal.id,
  getAccess: (): CollectionAccess<SignalCollectionAction> => ({ mode: 'full', visibleActions: [] }),
  viewer: signalViewer,
}
