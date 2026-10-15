// useRecordsSources — loads the period sources a Records view needs, completely, off the main path of
// the page: bounded concurrency across sources, a generation counter that drops stale answers, a
// per-source retry, and a same-session cache so an offline reload still shows what was last loaded.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listCafeRecordCounts, listCafeRecordLogs, listCafeRecordReceiptLines, listCafeRecordReceipts, listCafeRecordRequestLines,
  listCafeRecordRequests, type CafeRecordCount, type CafeRecordLog,
} from '@/lib/db/cafe-records'
import { parseCafeReceiptLine, type CafeReceipt } from '@/lib/db/cafe-receipts'
import type { CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'
import { completeNestedLines, exhaustPages, isAccessDenied, mapLimit, StaleReadError, uncoveredRange, type SourceId } from './load'

export type { SourceId } from './load'

export interface RecordsQuery {
  from: string
  to: string
  stream: { branchId: string; activity: ProductionActivity } | null
  sources: readonly SourceId[]
}

interface SourceState<Row> {
  status: 'idle' | 'loading' | 'done' | 'unavailable'
  rows: Row[]
  /** true = every page (and every nested line list) was read. */
  complete: boolean
  error: Error | null
  denied: boolean
  loadedAt: number | null
  fromCache: boolean
  /** The dates a failed read did not cover, when it loaded part of the period. */
  uncovered: { from: string; to: string } | null
  incompleteParents: string[]
}

export interface RecordsSources {
  logs: SourceState<CafeRecordLog>
  counts: SourceState<CafeRecordCount>
  receipts: SourceState<CafeReceipt>
  requests: SourceState<CafePurchaseRequest>
}

const FETCH_PAGE = 500
const CACHE_FRESH_MS = 60_000
const idle = <Row,>(): SourceState<Row> => ({ status: 'idle', rows: [], complete: false, error: null, denied: false, loadedAt: null, fromCache: false, uncovered: null, incompleteParents: [] })
const INITIAL: RecordsSources = { logs: idle(), counts: idle(), receipts: idle(), requests: idle() }

interface CacheEntry { state: SourceState<unknown>; at: number }
const cache = new Map<string, CacheEntry>()

export function clearRecordsCache(): void { cache.clear() }

const cacheKey = (viewerId: string, source: SourceId, q: RecordsQuery) =>
  `${viewerId}|${source}|${q.from}|${q.to}|${q.stream ? `${q.stream.branchId}:${q.stream.activity}` : 'all'}`

const dateOfCursor = (cursor: readonly string[]) => cursor[0].slice(0, 10)

async function readSource(source: SourceId, q: RecordsQuery, isStale: () => boolean): Promise<SourceState<unknown>> {
  const base = { from: q.from, to: q.to, stream: q.stream, limit: FETCH_PAGE }
  const range = { from: q.from, to: q.to }
  let result: Awaited<ReturnType<typeof exhaustPages<unknown>>>
  let incompleteParents: string[] = []
  if (source === 'logs') result = await exhaustPages(after => listCafeRecordLogs({ ...base, after }), { isStale })
  else if (source === 'counts') result = await exhaustPages(after => listCafeRecordCounts({ ...base, after }), { isStale })
  else if (source === 'receipts') {
    result = await exhaustPages(after => listCafeRecordReceipts({ ...base, after }), { isStale })
    if (result.rows.length) {
      const verified = await completeNestedLines(
        result.rows as CafeReceipt[], r => r.lines, (r, lines) => ({ ...r, lines }),
        async (id, after) => (await listCafeRecordReceiptLines(id, after)).map(line => parseCafeReceiptLine(line as unknown as Record<string, unknown>)),
        { isStale },
      ).catch(error => { if (error instanceof StaleReadError) throw error; return { parents: result.rows as CafeReceipt[], incomplete: (result.rows as CafeReceipt[]).map(r => r.id) } })
      result = { ...result, rows: verified.parents }; incompleteParents = verified.incomplete
    }
  } else {
    result = await exhaustPages(after => listCafeRecordRequests({ ...base, after }), { isStale })
    if (result.rows.length) {
      const verified = await completeNestedLines(
        result.rows as CafePurchaseRequest[], r => r.lines, (r, lines) => ({ ...r, lines }),
        async (id, after) => (await listCafeRecordRequestLines(id, after)).map(line => ({ ...line, quantity: String(line.quantity) })),
        { isStale },
      ).catch(error => { if (error instanceof StaleReadError) throw error; return { parents: result.rows as CafePurchaseRequest[], incomplete: (result.rows as CafePurchaseRequest[]).map(r => r.id) } })
      result = { ...result, rows: verified.parents }; incompleteParents = verified.incomplete
    }
  }
  if (result.error instanceof StaleReadError) throw result.error
  const complete = result.complete && incompleteParents.length === 0
  return {
    status: 'done', rows: result.rows, complete, error: result.error, denied: !!result.error && isAccessDenied(result.error),
    loadedAt: Date.now(), fromCache: false,
    uncovered: result.complete ? null : uncoveredRange(range, result.lastCursor, dateOfCursor),
    incompleteParents,
  }
}

export function useRecordsSources(query: RecordsQuery, viewerId: string, online: boolean): {
  sources: RecordsSources
  retry: (source: SourceId) => void
  reload: () => void
} {
  const [sources, setSources] = useState<RecordsSources>(INITIAL)
  const [nonce, setNonce] = useState(0)
  const generations = useRef<Record<SourceId, number>>({ logs: 0, counts: 0, receipts: 0, requests: 0 })
  const queryRef = useRef(query)
  queryRef.current = query
  const onlineRef = useRef(online)
  onlineRef.current = online
  const key = `${query.from}|${query.to}|${query.stream?.branchId ?? ''}:${query.stream?.activity ?? ''}|${[...query.sources].sort().join(',')}|${viewerId}|${nonce}`

  const run = useCallback(async (source: SourceId, force: boolean) => {
    const q = queryRef.current
    const generation = ++generations.current[source]
    const isStale = () => generation !== generations.current[source]
    const set = (state: SourceState<unknown>) => { if (!isStale()) setSources(current => ({ ...current, [source]: state })) }
    const ck = cacheKey(viewerId, source, q)
    const cached = cache.get(ck)
    if (cached && !force && (!onlineRef.current || Date.now() - cached.at < CACHE_FRESH_MS)) {
      set({ ...cached.state, fromCache: true })
      return
    }
    if (!onlineRef.current) {
      set({ ...idle(), status: 'unavailable' })
      return
    }
    set({ ...idle(), status: 'loading' })
    try {
      const state = await readSource(source, q, isStale)
      if (state.complete) cache.set(ck, { state, at: Date.now() })
      set(state)
    } catch (error) {
      if (error instanceof StaleReadError) return
      set({ ...idle(), status: 'done', error: error instanceof Error ? error : new Error(String(error)), denied: isAccessDenied(error), uncovered: { from: q.from, to: q.to } })
    }
  }, [viewerId])

  useEffect(() => {
    const wanted = new Set(query.sources)
    for (const source of ['logs', 'counts', 'receipts', 'requests'] as const) {
      if (!wanted.has(source)) {
        generations.current[source] += 1
        setSources(current => current[source].status === 'idle' ? current : { ...current, [source]: idle() })
      }
    }
    void mapLimit([...wanted], 4, source => run(source, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already covers every input
  }, [key, run])

  return {
    sources,
    retry: useCallback((source: SourceId) => { void run(source, true) }, [run]),
    reload: useCallback(() => { cache.clear(); setNonce(value => value + 1) }, []),
  }
}
