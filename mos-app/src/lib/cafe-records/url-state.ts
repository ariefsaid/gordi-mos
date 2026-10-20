// The Records URL contract (spec: "URL contract"): every view choice lives in the query string, so a
// reload, Back and a shared link reproduce the same screen. Parsing is total: a bad value is replaced
// by its default and reported in `invalid`, never thrown. Unrelated params (shell state) pass through.
import { isIsoDate, PERIOD_KEYS, resolvePreset, type PeriodKey } from './period'
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'

export const QUESTIONS = ['made', 'transferred', 'sent', 'wasted', 'received', 'requested', 'counted', 'everything'] as const
export type Question = (typeof QUESTIONS)[number]
const READINGS = ['summary', 'entries', 'day'] as const
export type Reading = (typeof READINGS)[number]
export const SORT_KEYS = ['item', 'stream', 'destination', 'quantity', 'entries', 'date'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

/** Sorts each reading offers; the first is its default. Day summary keeps its fixed order. */
export const READING_SORTS: Record<Reading, readonly SortKey[]> = {
  summary: ['item', 'stream', 'destination', 'quantity', 'entries'],
  entries: ['date', 'item', 'quantity'],
  day: ['item'],
}
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  item: 'asc', stream: 'asc', destination: 'asc', quantity: 'desc', entries: 'desc', date: 'desc',
}

export const ALL_STREAMS_PARAM = 'all'
const STREAM_PARAM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(kitchen|bar)$/i

export interface RecordsUrlState {
  question: Question
  reading: Reading
  period: PeriodKey
  /** Resolved inclusive range; always set (presets without dates in the URL resolve against today). */
  from: string
  to: string
  /** True when the URL itself carries the dates (so they stay put across midnight). */
  datesInUrl: boolean
  /** `all`, `<branch-id>:<activity>`, or null = the viewer's default stream. */
  stream: string | null
  q: string
  item: string
  destination: string
  sort: SortKey
  dir: SortDir
  page: number
  history: string
  entry: string
  draftFrom: string
  draftTo: string
}

export interface ParsedRecordsUrl { state: RecordsUrlState; invalid: string[] }

export function defaultSort(reading: Reading): { sort: SortKey; dir: SortDir } {
  const sort = READING_SORTS[reading][0]
  return { sort, dir: DEFAULT_DIR[sort] }
}

export function parseStreamParam(value: string): { branchId: string; activity: ProductionActivity } | null {
  if (!STREAM_PARAM.test(value)) return null
  const [branchId, activity] = value.split(':')
  return { branchId: branchId.toLowerCase(), activity: activity as ProductionActivity }
}

function streamParam(branchId: string, activity: ProductionActivity): string { return `${branchId}:${activity}` }

const ENTRY_PARAM = /^(log|count|receipt|request):[A-Za-z0-9_-]{1,64}$/

export function parseRecordsUrl(params: URLSearchParams, today: string): ParsedRecordsUrl {
  const invalid: string[] = []
  const get = (key: string) => params.get(key)
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const raw = get(key)
    if (raw === null || raw === '') return fallback
    if ((allowed as readonly string[]).includes(raw)) return raw as T
    invalid.push(key)
    return fallback
  }
  const question = pick('question', QUESTIONS, 'everything')
  const reading = pick('reading', READINGS, 'day')
  const period = pick('period', PERIOD_KEYS, 'today')

  // Dates: the URL's own win when valid, so a shared link keeps its days. Otherwise a preset resolves today's.
  const rawFrom = get('from')
  const rawTo = get('to')
  let datesInUrl = false
  let from: string
  let to: string
  if (rawFrom !== null || rawTo !== null) {
    const ok = isIsoDate(rawFrom) && isIsoDate(rawTo) && rawFrom <= rawTo && rawTo <= today
    if (ok) { from = rawFrom!; to = rawTo!; datesInUrl = true } else {
      if (rawFrom !== null) invalid.push('from')
      if (rawTo !== null) invalid.push('to')
      const fallback = period === 'custom' ? resolvePreset('today', today) : resolvePreset(period, today)
      from = fallback.from; to = fallback.to
    }
  } else if (period === 'custom') {
    // A custom period with no dates has nothing to show: fall back to today and say so.
    invalid.push('period')
    from = to = today
  } else {
    const range = resolvePreset(period, today)
    from = range.from; to = range.to
  }
  const effectivePeriod: PeriodKey = invalid.includes('period') ? 'today' : period

  let stream: string | null = null
  const rawStream = get('stream')
  if (rawStream) {
    if (rawStream === ALL_STREAMS_PARAM || STREAM_PARAM.test(rawStream)) stream = rawStream === ALL_STREAMS_PARAM ? rawStream : rawStream.toLowerCase()
    else invalid.push('stream')
  }

  const sorts = READING_SORTS[reading]
  let { sort, dir } = defaultSort(reading)
  const rawSort = get('sort')
  if (rawSort) {
    if ((sorts as readonly string[]).includes(rawSort)) { sort = rawSort as SortKey; dir = DEFAULT_DIR[sort] } else invalid.push('sort')
  }
  const rawDir = get('dir')
  if (rawDir) {
    if (rawDir === 'asc' || rawDir === 'desc') dir = rawDir; else invalid.push('dir')
  }

  let page = 1
  const rawPage = get('page')
  if (rawPage !== null && rawPage !== '') {
    const n = Number(rawPage)
    if (Number.isInteger(n) && n >= 1 && n <= 10000) page = n; else invalid.push('page')
  }

  const rawEntry = get('entry') ?? ''
  let entry = ''
  if (rawEntry) { if (ENTRY_PARAM.test(rawEntry)) entry = rawEntry; else invalid.push('entry') }

  const rawDestination = get('destination') ?? ''
  let destination = ''
  if (rawDestination) {
    if (/^[0-9a-f-]{36}$/i.test(rawDestination)) destination = rawDestination.toLowerCase(); else invalid.push('destination')
  }

  const rawDraftFrom = get('draftFrom') ?? ''
  const rawDraftTo = get('draftTo') ?? ''
  // Drafts are kept even when invalid: the page shows the error beside them rather than discarding the typing.
  return {
    state: {
      question, reading, period: effectivePeriod, from, to, datesInUrl, stream,
      q: (get('q') ?? '').slice(0, 200), item: (get('item') ?? '').slice(0, 300), destination,
      sort, dir, page, history: (get('history') ?? '').slice(0, 300), entry,
      draftFrom: rawDraftFrom, draftTo: rawDraftTo,
    },
    invalid,
  }
}

/** The query string keys Records owns; everything else belongs to the shell and is left alone. */
const RECORDS_KEYS = ['question', 'reading', 'period', 'from', 'to', 'stream', 'q', 'item', 'destination', 'sort', 'dir',
  'page', 'history', 'entry', 'draftFrom', 'draftTo'] as const

/** Write a state back onto existing params, omitting defaults so a reset URL stays clean. */
export function writeRecordsUrl(existing: URLSearchParams, state: RecordsUrlState): URLSearchParams {
  const next = new URLSearchParams(existing)
  for (const key of RECORDS_KEYS) next.delete(key)
  if (state.question !== 'everything') next.set('question', state.question)
  if (state.reading !== 'day') next.set('reading', state.reading)
  if (state.period !== 'today' || state.datesInUrl) next.set('period', state.period)
  if (state.datesInUrl) { next.set('from', state.from); next.set('to', state.to) }
  if (state.stream) next.set('stream', state.stream)
  if (state.q) next.set('q', state.q)
  if (state.item) next.set('item', state.item)
  if (state.destination) next.set('destination', state.destination)
  const defaults = defaultSort(state.reading)
  if (state.sort !== defaults.sort) next.set('sort', state.sort)
  if (state.dir !== (state.sort === defaults.sort ? defaults.dir : DEFAULT_DIR[state.sort])) next.set('dir', state.dir)
  if (state.page > 1) next.set('page', String(state.page))
  if (state.history) next.set('history', state.history)
  if (state.entry) next.set('entry', state.entry)
  if (state.draftFrom) next.set('draftFrom', state.draftFrom)
  if (state.draftTo) next.set('draftTo', state.draftTo)
  return next
}

/** Data filters reset the page and any open selection; sort and reading reset only the page. */
const DATA_KEYS: ReadonlySet<keyof RecordsUrlState> = new Set(['question', 'period', 'from', 'to', 'datesInUrl', 'stream', 'q', 'item', 'destination'])
const VIEW_KEYS: ReadonlySet<keyof RecordsUrlState> = new Set(['reading', 'sort', 'dir'])

export function applyPatch(state: RecordsUrlState, patch: Partial<RecordsUrlState>): RecordsUrlState {
  const next: RecordsUrlState = { ...state, ...patch }
  const keys = Object.keys(patch) as (keyof RecordsUrlState)[]
  if (keys.some(key => DATA_KEYS.has(key))) { next.page = 1; if (!('entry' in patch)) next.entry = ''; if (!('history' in patch)) next.history = '' }
  else if (keys.some(key => VIEW_KEYS.has(key)) && !('page' in patch)) next.page = 1
  if (patch.reading && patch.reading !== state.reading && !('sort' in patch)) Object.assign(next, defaultSort(patch.reading))
  if (patch.entry) next.history = ''
  if (patch.history) next.entry = ''
  return next
}

/** A link into Records: used by the capture pages' "View records" and Café home. */
export function recordsHref(options: {
  question?: Question
  reading?: Reading
  period?: PeriodKey
  from?: string
  to?: string
  stream?: { branchId: string; activity: ProductionActivity } | 'all' | null
  destination?: string | null
  today: string
}): string {
  const params = new URLSearchParams()
  if (options.question && options.question !== 'everything') params.set('question', options.question)
  if (options.reading && options.reading !== 'day') params.set('reading', options.reading)
  const hasDays = Boolean(options.from && options.to)
  const period: PeriodKey = options.period ?? (hasDays && !(options.from === options.today && options.to === options.today) ? 'custom' : 'today')
  const range = hasDays ? { from: options.from!, to: options.to! } : period === 'custom' ? null : resolvePreset(period, options.today)
  // Links always carry the exact days, so the page they open does not drift across midnight.
  if (range) { params.set('period', period); params.set('from', range.from); params.set('to', range.to) }
  if (options.stream === 'all') params.set('stream', 'all')
  else if (options.stream) params.set('stream', streamParam(options.stream.branchId, options.stream.activity))
  if (options.destination) params.set('destination', options.destination)
  const text = params.toString()
  return text ? `/cafe/records?${text}` : '/cafe/records'
}
