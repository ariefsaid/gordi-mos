// Partial port of the Signals side of the shared RecordCollection engine's generic
// (tasks | signals) contract (`lib/record-collection/collection-view-spec.ts`,
// `lib/record-collection/query-state.ts`).
//
// #192 ports the TASKS surface only. Signals is its own ticket (#193) and is not ported by this
// PR — porting the FULL `signal-collection-adapter.tsx` here would pull in `lib/db/signals.ts`'s
// network calls plus `SignalRecordHost`, `SignalTablePresentation` and `SignalFeedPresentation`
// (none of which exist on this line yet), which is exactly the scope creep the port's
// surface-by-surface staging forbids (docs/specs/v4-port.spec.md "Staging and merge shape").
//
// What IS carried here is the pure, side-effect-free URL query codec — `signalCollectionQuery`
// and `signalPresentationCompatibleKeys` — copied verbatim (same names, same behaviour) from
// v4-redesign's real adapter. Two things need it and neither is a Signals product decision:
//
// 1. `lib/record-collection/collection-view-spec.ts` — the persisted-view validator — has a
//    `collectionId: 'tasks' | 'signals'` branch because `mos.user_views` was squashed with both
//    kinds in its check constraint (20260805000005_mos_structure.sql). Tasks' own saved-view
//    feature never constructs a `collectionId: 'signals'` spec, but the type checker needs the
//    Signal branch's shape to exist for that module to compile.
// 2. `lib/record-collection/query-state.test.ts` is the GENERIC engine's own conformance test,
//    ported alongside the engine (not a Tasks-only file) — it deliberately exercises the codec
//    against TWO real collection shapes to prove the shared URL-sync logic generalises. Trimming
//    it to Task-only would weaken a test that already exists and was authored to prove exactly
//    this, and DD-WAY-21 wants zero test debt at merge, not a narrowed assertion.
//
// No React, no DB, no presentation choice (table vs feed layout, empty states, record host) lives
// here — those are #193's to design. #193 replaces this file outright with the real adapter; the
// exported codec shape is expected to be byte-identical, so nothing downstream should need to
// change when it does.
import type { Attention, SignalCategory } from '@/lib/db/signals.types'
import { SIGNAL_CATEGORIES } from '@/lib/db/signals.types'
import type { CollectionQueryIssue, CollectionQueryParse, CollectionQuerySchema, QueryKey } from '@/lib/record-collection/types'

export type SignalCollectionPresentation = 'feed' | 'table'
export type SignalCollectionGroup = 'none' | 'team' | 'attention' | 'category'
export type SignalCollectionSort = 'occurredAt' | 'attention'
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
