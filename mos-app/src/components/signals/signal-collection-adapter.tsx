// Signal adapter for the V3 RecordCollection engine — PURE query contract portion (Issue 6, Task 3).
// Signals have no PIC, Supervisor, or Task Status; the schema never invents them to fit a Task table.
import type { Attention, SignalCategory } from '@/lib/db/signals.types'
import { SIGNAL_CATEGORIES } from '@/lib/db/signals.types'
import type {
  CollectionQueryIssue,
  CollectionQueryParse,
  CollectionQuerySchema,
  QueryKey,
} from '@/lib/record-collection/types'

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

export const SIGNAL_COLLECTION_NEUTRAL_QUERY: SignalCollectionQuery = {
  layout: 'feed',
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
