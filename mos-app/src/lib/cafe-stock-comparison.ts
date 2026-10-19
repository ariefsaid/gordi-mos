// Stock comparison — exact client formatting and filtering for the reviewer-scoped reporting read model.
// One row per stream/item/exact stored unit, using the latest physical Count beside ESB EOD stock.
// Everything here is exact (bigint decimals from lib/cafe-records/decimal), read-only and free of React.
// Difference is a dated comparison, not Count review Variance, and never a recipe-loss claim.
import { compareDec, formatDec, parseDecimal, type Dec } from '@/lib/cafe-records/decimal'
import { addDays } from '@/lib/cafe-records/period'
import type { ComparisonRow as StockComparisonRow, Flag, Missing } from '@/lib/db/cafe-stock-comparison'

const FRESH_HOURS = 24
export const PAGE_SIZE = 50
const HOUR_MS = 3_600_000
const PERCENT = 100n
const FACTOR = 10n ** 9n

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────────

type CountStatus = 'Submitted' | 'Confirmed'

/** One physical Count observation (a business date, not an instant: `submittedAt` is when it was entered). */
export interface CountObservation {
  id: string
  quantity: Dec
  unitId: string
  unitName: string | null
  countDate: string
  submittedAt: string
  status: CountStatus
}

/** ESB's expected on-hand for one exact product-detail/unit coordinate. */
interface ExpectedStock {
  quantity: Dec
  unitId: string
  unitName: string
  /** The source balance's effective instant (ISO, UTC). */
  asOf: string
  /** The business day the balance belongs to (WIB). */
  businessDate: string
  basis: 'intraday' | 'end_of_day'
  /** false = a partial snapshot row: its quantity is never compared. */
  complete: boolean
}

export type ExpectedSide =
  | { kind: 'not_connected' }
  | { kind: 'mapping_needed' }
  | { kind: 'value'; value: ExpectedStock }

export interface ItemIdentity {
  itemId: string
  itemName: string
  kind: 'RAW' | 'WIP'
  category: string | null
  /** The exact stored unit; '' when a historical Count recorded none. */
  unitId: string
  unitName: string | null
}

export const rowKey = (itemId: string, unitId: string) => `${itemId}:${unitId}`

// ── Latest Count ──────────────────────────────────────────────────────────────────────────────────

/** Newest first by count date, then when it was submitted, then id (descending on all three). */
export function compareCountsNewestFirst(a: CountObservation, b: CountObservation): number {
  return b.countDate.localeCompare(a.countDate) || b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id)
}

/**
 * The latest non-Rejected Count of one identity. A newer Submitted Count is never replaced by an older Confirmed one,
 * and Counts are never summed. Rejected Counts stay history-only (the caller never passes them here).
 */
export function pickLatestCount(observations: readonly CountObservation[]): CountObservation | null {
  let best: CountObservation | null = null
  for (const observation of observations) if (best === null || compareCountsNewestFirst(observation, best) < 0) best = observation
  return best
}

// ── Row ───────────────────────────────────────────────────────────────────────────────────────────

type Bucket = 'gap' | 'unknown' | 'zero'

export interface ComparisonRow extends ItemIdentity {
  key: string
  expectedSide: ExpectedSide
  /** The ESB figure when the row has one (also kept for an incomparable row so the panel can show both sources). */
  expected: ExpectedStock | null
  count: CountObservation | null
  /** Count − expected, exact. null = not comparable (never zero). */
  difference: Dec | null
  /** difference / abs(expected) × 100 at nine decimals; null when not comparable or expected is zero with a nonzero Count. */
  percent: Dec | null
  zeroExpected: boolean
  /** Why the gap is blank (the shared reason), or null when it is known. */
  missing: Missing | null
  flags: Flag[]
  /** Dates differ or the ESB snapshot is intraday: the gap is a dated indication, never "reconciled". */
  indicative: boolean
  bucket: Bucket
}

/** Convert exact server decimals without recomputing the authorized server comparison. */
export function comparisonRowFromStock(row: StockComparisonRow): ComparisonRow {
  const expectedQuantity = row.expected === null ? null : parseDecimal(row.expected.quantity)
  const countedQuantity = row.count === null ? null : parseDecimal(row.count.quantity)
  const difference = row.difference === null ? null : parseDecimal(row.difference)
  const percent = row.difference_pct === null ? null : parseDecimal(row.difference_pct)
  if ((row.expected !== null && expectedQuantity === null) || (row.count !== null && countedQuantity === null)
    || (row.difference !== null && difference === null) || (row.difference_pct !== null && percent === null)) {
    throw new Error('listStockComparison returned an invalid decimal')
  }
  const identity: ItemIdentity = {
    itemId: row.item_id,
    itemName: row.item_name,
    kind: row.kind,
    category: row.category,
    unitId: row.unit_id ?? '',
    unitName: row.unit_name,
  }
  const expected: ExpectedStock | null = row.expected && expectedQuantity !== null ? {
    quantity: expectedQuantity,
    unitId: row.missing === 'unit_mismatch' ? 'source-unit-mismatch' : row.unit_id ?? '',
    unitName: row.expected.unit_code,
    asOf: row.expected.as_of,
    businessDate: row.expected.business_date,
    basis: row.expected.basis,
    complete: row.expected.row_complete,
  } : null
  const count: CountObservation | null = row.count && countedQuantity !== null ? {
    id: row.count.id,
    quantity: countedQuantity,
    unitId: row.count.unit_id,
    unitName: row.count.unit_name,
    countDate: row.count.count_date,
    submittedAt: row.count.submitted_at,
    status: row.count.status,
  } : null
  const bucket: Bucket = difference === null ? 'unknown' : difference === 0n ? 'zero' : 'gap'
  return {
    ...identity,
    key: row.key,
    expectedSide: expected ? { kind: 'value', value: expected }
      : row.missing === 'mapping_needed' ? { kind: 'mapping_needed' } : { kind: 'not_connected' },
    expected,
    count,
    difference,
    percent,
    zeroExpected: row.flags.includes('zero_expected'),
    missing: row.missing,
    flags: [...row.flags],
    indicative: row.indicative,
    bucket,
  }
}

function wibEndOfDay(day: string): number {
  return Date.parse(`${addDays(day, 1)}T00:00:00+07:00`)
}

function hoursBetween(from: number, to: number): number {
  return (to - from) / HOUR_MS
}

/** Hours since the end of a Count's business day (WIB). Negative while that day is still running. */
export function countAgeHours(countDate: string, now: Date): number {
  return hoursBetween(wibEndOfDay(countDate), now.getTime())
}

function esbAgeHours(asOf: string, now: Date): number {
  return hoursBetween(Date.parse(asOf), now.getTime())
}

/** difference / abs(expected) × 100, scaled by 10^9 and truncated; the caller guarantees expected is nonzero. */
function percentOf(difference: Dec, expected: Dec): Dec {
  const magnitude = expected < 0n ? -expected : expected
  const scaled = (difference * PERCENT * FACTOR) / magnitude
  // A nonzero gap is never allowed to truncate to a percentage that reads as zero.
  return scaled === 0n && difference !== 0n ? (difference < 0n ? -1n : 1n) : scaled
}

/** Compare |d1|/|e1| with |d2|/|e2| exactly (cross-multiplication, no division). Both denominators must be nonzero. */
export function compareAbsRatio(d1: Dec, e1: Dec, d2: Dec, e2: Dec): number {
  const abs = (value: Dec) => (value < 0n ? -value : value)
  return compareDec(abs(d1) * abs(e2), abs(d2) * abs(e1))
}

export interface CompareInput {
  identity: ItemIdentity
  count: CountObservation | null
  expected: ExpectedSide
  now: Date
}

/** Build one comparison row. The only place where a difference, a percentage and the flags are decided. */
export function compareRow({ identity, count, expected, now }: CompareInput): ComparisonRow {
  const value = expected.kind === 'value' ? expected.value : null
  const unitMatches = value !== null && value.unitId === identity.unitId && identity.unitId !== ''
  // Only a complete ESB row in the exact same unit, beside a real Count, ever yields a gap.
  const pair = value !== null && value.complete && unitMatches && count !== null ? { value, count } : null
  const difference = pair ? pair.count.quantity - pair.value.quantity : null
  const zeroExpected = pair !== null && difference !== 0n && pair.value.quantity === 0n
  const percent = !pair || difference === null ? null : pair.value.quantity === 0n ? (difference === 0n ? 0n : null) : percentOf(difference, pair.value.quantity)
  const indicative = pair !== null && (pair.count.countDate !== pair.value.businessDate || pair.value.basis === 'intraday')

  let missing: Missing | null = null
  if (expected.kind === 'not_connected') missing = 'not_connected'
  else if (expected.kind === 'mapping_needed') missing = 'mapping_needed'
  else if (value && !value.complete) missing = 'partial'
  else if (value && !unitMatches) missing = 'unit_mismatch'
  else if (count === null) missing = 'not_counted'

  const flags: Flag[] = []
  if (count === null) flags.push('not_counted')
  if (expected.kind === 'mapping_needed') flags.push('mapping_needed')
  if (value && !value.complete) flags.push('partial')
  if (value && !unitMatches) flags.push('unit_mismatch')
  if (difference !== null) flags.push(difference < 0n ? 'shortage' : difference > 0n ? 'surplus' : 'no_difference')
  if (zeroExpected) flags.push('zero_expected')
  if (count?.status === 'Submitted') flags.push('pending_confirmation')
  if (indicative) flags.push('different_times')
  if (value && esbAgeHours(value.asOf, now) > FRESH_HOURS) flags.push('stale_esb')
  if (count && countAgeHours(count.countDate, now) > FRESH_HOURS) flags.push('old_count')

  const bucket: Bucket = difference === null ? 'unknown' : difference === 0n ? 'zero' : 'gap'
  return {
    ...identity, key: rowKey(identity.itemId, identity.unitId), expectedSide: expected, expected: value, count,
    difference, percent, zeroExpected, missing, flags, indicative, bucket,
  }
}

// ── Assembling rows ───────────────────────────────────────────────────────────────────────────────

/** A Count line as the existing Records read returns it (lib/db/cafe-records.ts CafeRecordCount), reduced to what is used. */
export interface CountLine {
  id: string
  wip_item_id: string
  item_name: string
  item_category: string | null
  item_kind: 'RAW' | 'WIP'
  item_unit_id: string | null
  unit_name: string | null
  counted_quantity: number | string
  recounted_quantity?: number | string | null
  count_date: string
  submitted_at: string
  status: 'Submitted' | 'Confirmed' | 'Rejected'
}

export function observationOf(line: CountLine): CountObservation | null {
  if (line.status === 'Rejected') return null
  // The final counted quantity: the Recount when there is one, else the first count.
  const quantity = parseDecimal(line.recounted_quantity ?? line.counted_quantity)
  if (quantity === null) return null
  return {
    id: line.id, quantity, unitId: line.item_unit_id ?? '', unitName: line.unit_name, countDate: line.count_date,
    submittedAt: line.submitted_at, status: line.status,
  }
}

export function identityOfLine(line: CountLine): ItemIdentity {
  return {
    itemId: line.wip_item_id, itemName: line.item_name, kind: line.item_kind,
    category: line.item_category?.trim() ? line.item_category.trim() : null,
    unitId: line.item_unit_id ?? '', unitName: line.unit_name,
  }
}

/** The latest Count per identity from any set of lines (Rejected ignored, newest wins). */
export function latestCounts(lines: readonly CountLine[]): Map<string, { identity: ItemIdentity; count: CountObservation }> {
  const out = new Map<string, { identity: ItemIdentity; count: CountObservation }>()
  for (const line of lines) {
    const observation = observationOf(line)
    if (!observation) continue
    const identity = identityOfLine(line)
    const key = rowKey(identity.itemId, identity.unitId)
    const held = out.get(key)
    if (!held || compareCountsNewestFirst(observation, held.count) < 0) out.set(key, { identity, count: observation })
  }
  return out
}

/**
 * Union of the current countable items and every Count identity read: an item with Counts that is no longer countable
 * stays, an item never counted shows as Not counted, and neither side is ever dropped.
 */
export function buildRows(input: {
  items: readonly ItemIdentity[]
  counts: ReadonlyMap<string, { identity: ItemIdentity; count: CountObservation }>
  expectedFor: (identity: ItemIdentity) => ExpectedSide
  now: Date
}): ComparisonRow[] {
  const identities = new Map<string, ItemIdentity>()
  for (const item of input.items) identities.set(rowKey(item.itemId, item.unitId), item)
  for (const [key, held] of input.counts) {
    const current = identities.get(key)
    // A catalogue entry wins on the name; a Count still supplies the category/kind it was recorded with when the catalogue lacks one.
    identities.set(key, current ?? held.identity)
  }
  return [...identities.entries()].map(([key, identity]) => compareRow({
    identity, count: input.counts.get(key)?.count ?? null, expected: input.expectedFor(identity), now: input.now,
  }))
}

// ── Filtering ─────────────────────────────────────────────────────────────────────────────────────

export type SortKey = 'gap' | 'quantity' | 'item' | 'count-date'
export type SortDir = 'asc' | 'desc'

export const NO_CATEGORY = 'none'
export const DEFAULT_DIR: Record<SortKey, SortDir> = { gap: 'desc', quantity: 'desc', item: 'asc', 'count-date': 'desc' }

/** URL token for a category: the text itself, except the two words the URL reserves. */
export const categoryToken = (category: string | null): string =>
  category === null ? NO_CATEGORY : category === 'all' || category === NO_CATEGORY || category.startsWith('~') ? `~${category}` : category

export interface RowFilters { q: string; kind: 'all' | 'RAW' | 'WIP'; category: string; differences: boolean }

export function filterRows(rows: readonly ComparisonRow[], filters: RowFilters): ComparisonRow[] {
  const needle = filters.q.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (filters.kind !== 'all' && row.kind !== filters.kind) return false
    if (filters.category !== 'all' && categoryToken(row.category) !== filters.category) return false
    // Only differences removes known exact-zero rows. Unknown, partial and unit-mismatch rows stay.
    if (filters.differences && row.bucket === 'zero') return false
    if (needle && !`${row.itemName} ${row.category ?? ''}`.toLocaleLowerCase().includes(needle)) return false
    return true
  })
}

// ── Sorting ───────────────────────────────────────────────────────────────────────────────────────

const byName = (a: ComparisonRow, b: ComparisonRow) =>
  a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' }) || a.itemId.localeCompare(b.itemId) || a.unitId.localeCompare(b.unitId)

const BUCKET_ORDER: Record<Bucket, number> = { gap: 0, unknown: 1, zero: 2 }

function gapOrder(a: ComparisonRow, b: ComparisonRow): number {
  // Zero-expected with a nonzero Count first, then the biggest relative gap, then A–Z.
  if (a.zeroExpected !== b.zeroExpected) return a.zeroExpected ? -1 : 1
  if (!a.zeroExpected && a.percent !== null && b.percent !== null && a.expected && b.expected) {
    const order = compareAbsRatio(b.difference!, b.expected.quantity, a.difference!, a.expected.quantity)
    if (order !== 0) return order
  }
  return byName(a, b)
}

/**
 * The whole filtered scope in order — never a page-local sort. `gap` keeps its fixed sections (gaps, Needs data, zero gaps)
 * whatever the direction; the direction flips the order inside a section. `quantity` groups by exact unit identity (kg is
 * never ranked against portions) and puts rows with no known gap last.
 */
export function sortRows(rows: readonly ComparisonRow[], sort: SortKey, dir: SortDir): ComparisonRow[] {
  const flip = dir === DEFAULT_DIR[sort] ? 1 : -1
  const copy = [...rows]
  switch (sort) {
    case 'gap':
      return copy.sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || (a.bucket === 'gap' ? flip * gapOrder(a, b) : byName(a, b)))
    case 'quantity':
      return copy.sort((a, b) => {
        if ((a.difference === null) !== (b.difference === null)) return a.difference === null ? 1 : -1
        if (a.difference === null || b.difference === null) return byName(a, b)
        const unit = (a.unitName ?? '').localeCompare(b.unitName ?? '', undefined, { sensitivity: 'base' }) || a.unitId.localeCompare(b.unitId)
        if (unit !== 0) return unit
        const abs = (value: Dec) => (value < 0n ? -value : value)
        return flip * compareDec(abs(b.difference), abs(a.difference)) || byName(a, b)
      })
    case 'count-date':
      return copy.sort((a, b) => {
        if ((a.count === null) !== (b.count === null)) return a.count === null ? 1 : -1
        if (a.count && b.count) {
          const order = compareCountsNewestFirst(a.count, b.count)
          if (order !== 0) return flip * order
        }
        return byName(a, b)
      })
    case 'item':
      return copy.sort((a, b) => flip * byName(a, b))
  }
}

export interface Section { bucket: Bucket; total: number; rows: ComparisonRow[]; continued: boolean }

/** Group a page slice into its gap sections, remembering whether a section began on an earlier page. */
export function sectionsOf(sorted: readonly ComparisonRow[], start: number, end: number): Section[] {
  const totals: Record<Bucket, number> = { gap: 0, unknown: 0, zero: 0 }
  const firstIndex: Partial<Record<Bucket, number>> = {}
  sorted.forEach((row, index) => { totals[row.bucket] += 1; if (firstIndex[row.bucket] === undefined) firstIndex[row.bucket] = index })
  const out: Section[] = []
  for (const row of sorted.slice(start, end)) {
    const last = out.at(-1)
    if (last && last.bucket === row.bucket) last.rows.push(row)
    else out.push({ bucket: row.bucket, total: totals[row.bucket], rows: [row], continued: (firstIndex[row.bucket] ?? 0) < start })
  }
  return out
}

export function pageCount(total: number): number { return Math.max(1, Math.ceil(total / PAGE_SIZE)) }

export interface CoverageCounts { total: number; counted: number; gaps: number; needsData: number; zero: number }

export function coverageOf(rows: readonly ComparisonRow[]): CoverageCounts {
  return {
    total: rows.length,
    counted: rows.filter((row) => row.count !== null).length,
    gaps: rows.filter((row) => row.bucket === 'gap').length,
    needsData: rows.filter((row) => row.bucket === 'unknown').length,
    zero: rows.filter((row) => row.bucket === 'zero').length,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────────────────────────

/** Signed exact quantity: "+2,5", "0", "-8". Full precision, id-ID separators in both locales. */
export function formatSigned(value: Dec): string {
  return value > 0n ? `+${formatDec(value)}` : formatDec(value)
}

/** A percentage to two decimals (display rounding only, half away from zero); a tiny nonzero gap never reads as 0. */
export function formatPercent(value: Dec): string {
  const hundredth = FACTOR / 100n
  const magnitude = value < 0n ? -value : value
  const rounded = (magnitude + hundredth / 2n) / hundredth
  if (rounded === 0n) return value === 0n ? '0%' : `${value < 0n ? '-' : '+'}<0,01%`
  const whole = (rounded / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = (rounded % 100n).toString().padStart(2, '0').replace(/0+$/, '')
  return `${value < 0n ? '-' : '+'}${whole}${fraction ? `,${fraction}` : ''}%`
}

