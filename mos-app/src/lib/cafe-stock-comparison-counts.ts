// The latest physical Count of every item identity, read newest-first with the existing Records Count read
// (lib/db/cafe-records.ts listCafeRecordCounts: session/RLS, SELECT only, keyset pages, no expected/variance).
// The read stops as soon as every currently countable item has its latest Count, and says so: Counts of items that are
// no longer countable may lie further back, so the caller offers "read older Counts" instead of silently ending the list.
// A failed page is reported, never turned into an empty or shorter result.
import { listCafeRecordCounts, type RecordCursor, type RecordPage } from '@/lib/db/cafe-records'
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'
import type { CountLine, CountObservation, ItemIdentity } from '@/lib/cafe-stock-comparison'
import { identityOfLine, observationOf, rowKey, compareCountsNewestFirst } from '@/lib/cafe-stock-comparison'

type LatestMap = Map<string, { identity: ItemIdentity; count: CountObservation }>

export interface CountReadState {
  latest: LatestMap
  cursor: RecordCursor | null
  /** true = the read reached the first Count ever recorded in this stream. */
  exhausted: boolean
  /** The oldest Count date read so far (null before any row). */
  oldest: string | null
  pages: number
}

export const EMPTY_READ: CountReadState = { latest: new Map(), cursor: null, exhausted: false, oldest: null, pages: 0 }
const MAX_PAGES_PER_READ = 30
const PAGE_LIMIT = 1000

type ReadPage = (after: RecordCursor | null) => Promise<RecordPage<CountLine>>

/** The real page reader: Submitted + Confirmed Counts of one stream, every date, newest first. */
export function recordsPageReader(stream: { branchId: string; activity: ProductionActivity }, today: string): ReadPage {
  return (after) => listCafeRecordCounts({ from: '2000-01-01', to: today, stream, statuses: ['Submitted', 'Confirmed'], after, limit: PAGE_LIMIT }) as Promise<RecordPage<CountLine>>
}

const sameCursor = (a: RecordCursor | null, b: RecordCursor | null) => a !== null && b !== null && a.length === b.length && a.every((value, index) => value === b[index])

/**
 * Read pages until every key in `needed` has a latest Count, the history is exhausted, or `maxPages` pages were read.
 * `resume` continues an earlier read from its cursor (the older-Counts button). Throws only before any state exists:
 * after a failure the pages already read stay in the returned state with `error` set.
 */
export async function readLatestCounts(options: {
  readPage: ReadPage
  needed: ReadonlySet<string>
  resume?: CountReadState
  maxPages?: number
  isStale?: () => boolean
  /** Keep reading to the first Count ever recorded (the older-Counts button). */
  all?: boolean
}): Promise<{ state: CountReadState; error: Error | null }> {
  const state: CountReadState = options.resume
    ? { ...options.resume, latest: new Map(options.resume.latest) }
    : { latest: new Map(), cursor: null, exhausted: false, oldest: null, pages: 0 }
  const maxPages = options.maxPages ?? MAX_PAGES_PER_READ
  const resolved = () => !options.all && [...options.needed].every((key) => state.latest.has(key))
  let read = 0
  try {
    while (!state.exhausted && read < maxPages) {
      if (options.isStale?.()) return { state, error: new Error('A newer read replaced this one.') }
      const page = await options.readPage(state.cursor)
      read += 1
      state.pages += 1
      if (page.rows.length === 0) { state.exhausted = true; break }
      for (const line of page.rows) {
        const observation = observationOf(line)
        if (!observation) continue
        const identity = identityOfLine(line)
        const key = rowKey(identity.itemId, identity.unitId)
        const held = state.latest.get(key)
        if (!held || compareCountsNewestFirst(observation, held.count) < 0) state.latest.set(key, { identity, count: observation })
      }
      for (const line of page.rows) state.oldest = state.oldest === null || line.count_date < state.oldest ? line.count_date : state.oldest
      if (!page.next || sameCursor(page.next, state.cursor)) return { state, error: new Error('The read did not advance, so the history may be incomplete.') }
      state.cursor = page.next
      if (resolved()) break
    }
    return { state, error: null }
  } catch (error) {
    return { state, error: error instanceof Error ? error : new Error(String(error)) }
  }
}
