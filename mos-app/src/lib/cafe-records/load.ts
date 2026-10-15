// Loading a Records source completely. Each source is read page by page with the stable keyset cursor
// until a page comes back EMPTY; a non-advancing cursor, a failed page or a stale generation is reported
// as incomplete coverage, never as a smaller total. Nested receipt/request lines are verified separately,
// because a parent page proves nothing about how many lines were embedded under it.
import type { RecordCursor, RecordPage } from '@/lib/db/cafe-records'
import { RECORDS_PAGE_LIMIT } from '@/lib/db/cafe-records'

export type SourceId = 'logs' | 'counts' | 'receipts' | 'requests'

export interface ExhaustResult<Row> {
  rows: Row[]
  complete: boolean
  error: Error | null
  /** Pages read, including the final empty one. */
  pages: number
  /** The last cursor read; with `error`, the dates at and below it are not fully covered. */
  lastCursor: RecordCursor | null
}

export class NonAdvancingCursorError extends Error {
  constructor() { super('The read did not advance, so the period may be incomplete.') }
}

export class StaleReadError extends Error {
  constructor() { super('A newer read replaced this one.') }
}

const sameCursor = (a: RecordCursor | null, b: RecordCursor | null) => a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i])

/** Read every page until an empty one. Rows already collected survive a later failure (`complete: false`). */
export async function exhaustPages<Row>(
  readPage: (after: RecordCursor | null) => Promise<RecordPage<Row>>,
  options: { isStale?: () => boolean; maxPages?: number } = {},
): Promise<ExhaustResult<Row>> {
  const rows: Row[] = []
  let after: RecordCursor | null = null
  let pages = 0
  const maxPages = options.maxPages ?? 2000
  try {
    for (;;) {
      if (options.isStale?.()) throw new StaleReadError()
      if (pages >= maxPages) throw new NonAdvancingCursorError()
      const page = await readPage(after)
      pages += 1
      if (page.rows.length === 0) return { rows, complete: true, error: null, pages, lastCursor: after }
      rows.push(...page.rows)
      if (!page.next || sameCursor(page.next, after)) throw new NonAdvancingCursorError()
      after = page.next
    }
  } catch (error) {
    return { rows, complete: false, error: error instanceof Error ? error : new Error(String(error)), pages, lastCursor: after }
  }
}

/** Parents with at least this many embedded lines are re-read through the line pager to prove completeness. */
const NESTED_LINE_CAP = RECORDS_PAGE_LIMIT

/**
 * Verify and complete nested lines. A parent whose embedded list reached the cap is re-read page by page
 * (lines merged by id); if that fails the parent is reported in `incomplete` and the caller must withhold
 * complete totals. Parents below the cap are trusted as complete.
 */
export async function completeNestedLines<Parent extends { id: string }, Line extends { id: string }>(
  parents: readonly Parent[],
  linesOf: (parent: Parent) => readonly Line[],
  withLines: (parent: Parent, lines: Line[]) => Parent,
  readLines: (parentId: string, after: string | null) => Promise<Line[]>,
  options: { isStale?: () => boolean; cap?: number } = {},
): Promise<{ parents: Parent[]; incomplete: string[] }> {
  const cap = options.cap ?? NESTED_LINE_CAP
  const incomplete: string[] = []
  const out: Parent[] = []
  for (const parent of parents) {
    const embedded = linesOf(parent)
    if (embedded.length < cap) { out.push(parent); continue }
    if (options.isStale?.()) throw new StaleReadError()
    const merged = new Map<string, Line>(embedded.map(line => [line.id, line]))
    let after: string | null = null
    try {
      for (let guard = 0; guard < 1000; guard += 1) {
        const page = await readLines(parent.id, after)
        if (page.length === 0) { after = null; break }
        const last: string = page.at(-1)!.id
        if (after !== null && last <= after) throw new NonAdvancingCursorError()
        for (const line of page) merged.set(line.id, line)
        after = last
        if (guard === 999) throw new NonAdvancingCursorError()
      }
      out.push(withLines(parent, [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))))
    } catch {
      incomplete.push(parent.id)
      out.push(parent)
    }
  }
  return { parents: out, incomplete }
}

/** Run `task` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

/** Dates not fully covered after a failed read (rows come newest first, so the cursor date and older are uncertain). */
export function uncoveredRange(range: { from: string; to: string }, lastCursor: RecordCursor | null, dateOfCursor: (cursor: RecordCursor) => string): { from: string; to: string } {
  if (!lastCursor) return range
  const covered = dateOfCursor(lastCursor)
  return { from: range.from, to: covered < range.to ? covered : range.to }
}

/** Does this error mean the account may not read the data (never inferred from an empty result)? */
export function isAccessDenied(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  const status = (error as { status?: number } | null)?.status
  const message = error instanceof Error ? error.message : ''
  return code === '42501' || status === 401 || status === 403 || /permission denied|not authorized|row-level security/i.test(message)
}
