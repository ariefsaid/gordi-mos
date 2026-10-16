// The Stock comparison URL contract (spec: "URL ..."): every view choice lives in the query string so Back, reload and a
// shared link reproduce the same screen. Parsing is total: a bad value is replaced by its default and listed in `invalid`.
// Shell keys and unrelated params pass through untouched.
import { addDays, isIsoDate } from '@/lib/cafe-records/period'
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'
import { DEFAULT_DIR, type SortDir, type SortKey } from '@/lib/cafe-stock-comparison'

export const STOCK_COMPARISON_PATH = '/cafe/stock-comparison'
const HISTORY_DAYS = 30
const SORTS: readonly SortKey[] = ['gap', 'quantity', 'item', 'count-date']
const STREAM = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(kitchen|bar)$/i
const ID = /^[A-Za-z0-9_-]{1,64}$/

export interface ComparisonUrl {
  /** `<branch-id>:<activity>` or null = the viewer's own default stream (never the first catalogue row). */
  stream: string | null
  q: string
  kind: 'all' | 'RAW' | 'WIP'
  category: string
  differences: boolean
  sort: SortKey
  dir: SortDir
  page: number
  item: string
  unit: string
  /** The item panel's Count history range; always set. */
  from: string
  to: string
  datesInUrl: boolean
  /** The labelled in-memory sample (never real data). */
  sample: boolean
}

export function parseStream(value: string | null): { branchId: string; activity: ProductionActivity } | null {
  const match = value ? STREAM.exec(value) : null
  return match ? { branchId: match[1].toLowerCase(), activity: match[2] as ProductionActivity } : null
}

export const streamToken = (branchId: string, activity: ProductionActivity) => `${branchId}:${activity}`

export function parseComparisonUrl(params: URLSearchParams, today: string): { state: ComparisonUrl; invalid: string[] } {
  const invalid: string[] = []
  const get = (key: string) => params.get(key)

  const rawStream = get('stream')
  const parsedStream = parseStream(rawStream)
  if (rawStream && !parsedStream) invalid.push('stream')
  const stream = parsedStream ? streamToken(parsedStream.branchId, parsedStream.activity) : null

  const rawKind = get('kind')
  let kind: ComparisonUrl['kind'] = 'all'
  if (rawKind) { if (rawKind === 'RAW' || rawKind === 'WIP' || rawKind === 'all') kind = rawKind; else invalid.push('kind') }

  const category = (get('category') ?? '') || 'all'

  const rawDifferences = get('differences')
  if (rawDifferences && rawDifferences !== '0' && rawDifferences !== '1') invalid.push('differences')

  let sort: SortKey = 'gap'
  const rawSort = get('sort')
  if (rawSort) { if ((SORTS as readonly string[]).includes(rawSort)) sort = rawSort as SortKey; else invalid.push('sort') }
  let dir: SortDir = DEFAULT_DIR[sort]
  const rawDir = get('dir')
  if (rawDir) { if (rawDir === 'asc' || rawDir === 'desc') dir = rawDir; else invalid.push('dir') }

  let page = 1
  const rawPage = get('page')
  if (rawPage) { const n = Number(rawPage); if (Number.isInteger(n) && n >= 1 && n <= 100000) page = n; else invalid.push('page') }

  const rawItem = get('item') ?? ''
  const rawUnit = get('unit') ?? ''
  let item = ''
  let unit = ''
  if (rawItem) { if (ID.test(rawItem)) item = rawItem; else invalid.push('item') }
  if (rawUnit) { if (ID.test(rawUnit)) unit = rawUnit; else invalid.push('unit') }

  const rawFrom = get('from')
  const rawTo = get('to')
  let from = addDays(today, -(HISTORY_DAYS - 1))
  let to = today
  let datesInUrl = false
  if (rawFrom || rawTo) {
    if (isIsoDate(rawFrom) && isIsoDate(rawTo) && rawFrom <= rawTo && rawTo <= today) { from = rawFrom; to = rawTo; datesInUrl = true } else invalid.push('from')
  }

  return {
    state: {
      stream, q: (get('q') ?? '').slice(0, 200), kind, category, differences: rawDifferences === '1', sort, dir, page, item, unit, from, to, datesInUrl,
      sample: get('layout') === 'preview',
    },
    invalid,
  }
}

/** The keys this page owns; everything else belongs to the shell. */
const COMPARISON_KEYS = ['stream', 'q', 'kind', 'category', 'differences', 'sort', 'dir', 'page', 'item', 'unit', 'from', 'to', 'layout'] as const

/** Write a state back onto existing params, omitting defaults so a reset URL stays clean. */
export function writeComparisonUrl(existing: URLSearchParams, state: ComparisonUrl): URLSearchParams {
  const next = new URLSearchParams(existing)
  for (const key of COMPARISON_KEYS) next.delete(key)
  if (state.stream) next.set('stream', state.stream)
  if (state.q) next.set('q', state.q)
  if (state.kind !== 'all') next.set('kind', state.kind)
  if (state.category !== 'all') next.set('category', state.category)
  if (state.differences) next.set('differences', '1')
  if (state.sort !== 'gap') next.set('sort', state.sort)
  if (state.dir !== DEFAULT_DIR[state.sort]) next.set('dir', state.dir)
  if (state.page > 1) next.set('page', String(state.page))
  if (state.item) next.set('item', state.item)
  if (state.unit) next.set('unit', state.unit)
  if (state.datesInUrl) { next.set('from', state.from); next.set('to', state.to) }
  if (state.sample) next.set('layout', 'preview')
  return next
}

const DATA_KEYS: ReadonlySet<keyof ComparisonUrl> = new Set(['stream', 'q', 'kind', 'category', 'differences'])

/** A filter change resets the page and any open item; a sort change resets the page only. Changing sort alone restores that sort's own direction. */
export function applyPatch(state: ComparisonUrl, patch: Partial<ComparisonUrl>): ComparisonUrl {
  const next: ComparisonUrl = { ...state, ...patch }
  const keys = Object.keys(patch) as (keyof ComparisonUrl)[]
  if (keys.some((key) => DATA_KEYS.has(key))) {
    next.page = 1
    if (!('item' in patch)) { next.item = ''; next.unit = '' }
  } else if ((keys.includes('sort') || keys.includes('dir')) && !('page' in patch)) next.page = 1
  if (patch.sort && patch.sort !== state.sort && !('dir' in patch)) next.dir = DEFAULT_DIR[patch.sort]
  if (patch.item === '') next.unit = ''
  return next
}

/** A link into Stock comparison from Count scope / Available to transfer: stream (and optionally one item) only. */
export function stockComparisonHref(options: { stream: { branchId: string; activity: ProductionActivity } | null; itemId?: string; unitId?: string }): string {
  const params = new URLSearchParams()
  if (options.stream) params.set('stream', streamToken(options.stream.branchId, options.stream.activity))
  if (options.itemId) { params.set('item', options.itemId); if (options.unitId) params.set('unit', options.unitId) }
  const text = params.toString()
  return text ? `${STOCK_COMPARISON_PATH}?${text}` : STOCK_COMPARISON_PATH
}
