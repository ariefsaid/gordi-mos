// Café Records model: normalises the four sources (logs, Counts, receipt lines, request lines) into one
// entry shape and derives the three readings from it. Pure: no IO, no React. Every rule here is a
// "truthful quantity" rule from the spec — units never convert, unlike units never add, a missing
// Count is not zero, a rejected quantity never joins an accepted total, and names never substitute for ids.
import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'
import type { CafeRecordCount, CafeRecordLog } from '@/lib/db/cafe-records'
import type { CafeReceipt, CafeReceiptLine } from '@/lib/db/cafe-receipts'
import type { CafePurchaseRequest, CafePurchaseRequestLine } from '@/lib/db/cafe-purchase-requests'
import { ZERO, addDec, compareDec, parseDecimal, type Dec } from './decimal'
import type { Question, SortDir, SortKey } from './url-state'

type SourceKey = 'log' | 'count' | 'receipt' | 'request'
export type Movement = 'made' | 'transferred' | 'wasted' | 'received' | 'requested' | 'counted'
/** pending = Submitted; locked = a Counted receipt (quantities locked, not yet sent for approval). */
export type StatusBasis = 'pending' | 'approved' | 'rejected' | 'confirmed' | 'locked'

const MOVEMENT_ORDER: readonly Movement[] = ['made', 'transferred', 'wasted', 'received', 'requested', 'counted']
const STATUS_ORDER: Record<Movement, readonly StatusBasis[]> = {
  made: ['pending', 'approved', 'rejected'],
  transferred: ['pending', 'approved', 'rejected'],
  wasted: ['approved', 'pending', 'rejected'],
  received: ['locked', 'pending', 'approved', 'rejected'],
  requested: ['pending', 'approved', 'rejected'],
  counted: ['confirmed', 'pending', 'rejected'],
}

/** Which movements a question reads. */
export function movementsFor(question: Question): readonly Movement[] {
  return question === 'everything' ? MOVEMENT_ORDER : [question]
}

export interface UnitBasis {
  /** Equal keys are the same, summable unit; anything else is kept apart. */
  key: string
  /** Null = the unit is not known ("Unit unavailable"). */
  name: string | null
  /** An unknown historical unit: one entry per row, never summed. */
  unsummable: boolean
}

type EntryRaw =
  | { source: 'log'; log: CafeRecordLog }
  | { source: 'count'; count: CafeRecordCount }
  | { source: 'receipt'; receipt: CafeReceipt; line: CafeReceiptLine }
  | { source: 'request'; request: CafePurchaseRequest; line: CafePurchaseRequestLine }

export interface RecordEntry {
  /** `${source}:${id}` — id is the log / Count / receipt-line / request-line id; this is the `entry` URL value. */
  key: string
  source: SourceKey
  /** Receipt or request id for line sources. */
  parentId: string | null
  movement: Movement
  itemKey: string
  itemName: string
  streamKey: string
  branchId: string
  activity: ProductionActivity
  destinationBranchId: string | null
  status: StatusBasis
  rawStatus: string
  /** The business date: log_date, count_date, arrival_date, or the WIB date of requested_at. */
  date: string
  /** Tie-break time within a date. */
  at: string
  personId: string | null
  qty: Dec | null
  unit: UnitBasis
  /** As entered, when the unit was a manager-defined multiple. */
  entered: { quantity: Dec; unitName: string | null; factor: Dec } | null
  raw: EntryRaw
}

/** Lookups the model needs that are read separately (settings aliases, unit names, receipt unit → item). */
export interface BuildContext {
  itemName: (itemId: string, streamKey: string) => string | null
  unitName: (unitId: string) => string | null
  receiptItem: (unitId: string, streamKey: string) => { id: string; name: string } | null
  wibDateOf: (timestamp: string) => string
}

const streamKeyOf = (branchId: string, activity: ProductionActivity) => `${branchId}:${activity}`

const ONE: Dec = 1_000_000_000n

function logUnit(log: CafeRecordLog, ctx: BuildContext): { unit: UnitBasis; qty: Dec | null; entered: RecordEntry['entered'] } {
  const stored = log.item_unit_id
  const storedName = stored ? ctx.unitName(stored) : null
  const normalized = parseDecimal(log.qty_porsi)
  const enteredQty = parseDecimal(log.entry_quantity)
  const factor = parseDecimal(log.entry_unit_factor)
  if (!stored) {
    return { unit: { key: `unknown:${log.id}`, name: null, unsummable: true }, qty: enteredQty ?? normalized, entered: null }
  }
  if (enteredQty !== null && factor !== null && factor > 0n && factor !== ONE) {
    // A manager-defined multiple: the entered amount is in its own unit, and a different factor is a different unit.
    const name = log.entry_unit_name?.trim() || (storedName ? `${storedName} ×${factor / 1_000_000n / 1000n}` : null)
    return { unit: { key: `${stored}|x${factor}`, name, unsummable: false }, qty: enteredQty, entered: { quantity: enteredQty, unitName: name, factor } }
  }
  return { unit: { key: stored, name: storedName ?? log.entry_unit_name?.trim() ?? null, unsummable: false }, qty: normalized, entered: null }
}

function logStatus(status: CafeRecordLog['status']): StatusBasis {
  return status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : 'pending'
}

function fromLog(log: CafeRecordLog, ctx: BuildContext): RecordEntry {
  // HANDOVER: R/handover/records-gaps.md §1. Waste value in rupiah — a waste entry has quantity only; no value_rp is read or shown.
  const streamKey = streamKeyOf(log.branch_id, log.activity)
  const { unit, qty, entered } = logUnit(log, ctx)
  return {
    key: `log:${log.id}`, source: 'log', parentId: null,
    movement: log.action === 'produce' ? 'made' : log.action === 'transfer' ? 'transferred' : 'wasted',
    itemKey: log.wip_item_id, itemName: ctx.itemName(log.wip_item_id, streamKey) ?? log.item_name ?? '',
    streamKey, branchId: log.branch_id, activity: log.activity,
    destinationBranchId: log.action === 'transfer' ? log.destination_branch_id : null,
    status: logStatus(log.status), rawStatus: log.status, date: log.log_date, at: log.created_at,
    personId: log.submitted_by, qty, unit, entered, raw: { source: 'log', log },
  }
}

function fromCount(count: CafeRecordCount, ctx: BuildContext): RecordEntry {
  const streamKey = streamKeyOf(count.branch_id, count.activity)
  const unitId = count.item_unit_id
  return {
    key: `count:${count.id}`, source: 'count', parentId: null, movement: 'counted',
    itemKey: count.wip_item_id, itemName: ctx.itemName(count.wip_item_id, streamKey) ?? count.item_name ?? '',
    streamKey, branchId: count.branch_id, activity: count.activity, destinationBranchId: null,
    status: count.status === 'Confirmed' ? 'confirmed' : count.status === 'Rejected' ? 'rejected' : 'pending',
    rawStatus: count.status, date: count.count_date, at: count.submitted_at,
    personId: count.submitted_by, qty: parseDecimal(count.counted_quantity),
    unit: unitId
      ? { key: unitId, name: count.unit_name?.trim() || ctx.unitName(unitId), unsummable: false }
      : { key: `unknown:${count.id}`, name: count.unit_name?.trim() || null, unsummable: !count.unit_name },
    entered: null, raw: { source: 'count', count },
  }
}

function receiptStatus(status: CafeReceipt['status']): StatusBasis {
  return status === 'Counted' ? 'locked' : status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : 'pending'
}

function fromReceiptLine(receipt: CafeReceipt, line: CafeReceiptLine, ctx: BuildContext): RecordEntry {
  // HANDOVER: R/handover/records-gaps.md §3. Supplier history — receipts expose no supplier, so no supplier is shown or inferred from text.
  const streamKey = streamKeyOf(receipt.branch_id, receipt.activity)
  const item = line.item_unit_id ? ctx.receiptItem(line.item_unit_id, streamKey) : null
  const name = item ? ctx.itemName(item.id, streamKey) ?? item.name : line.item_name
  return {
    key: `receipt:${line.id}`, source: 'receipt', parentId: receipt.id, movement: 'received',
    // Receipt units resolve to an item only where the existing item settings expose that exact unit id.
    itemKey: item ? item.id : `receipt-unit:${line.item_unit_id || line.id}`, itemName: name,
    streamKey, branchId: receipt.branch_id, activity: receipt.activity, destinationBranchId: null,
    status: receiptStatus(receipt.status), rawStatus: receipt.status, date: receipt.arrival_date, at: receipt.received_at,
    personId: receipt.received_by, qty: parseDecimal(line.received_quantity),
    unit: line.item_unit_id
      ? { key: line.item_unit_id, name: line.unit_name?.trim() || ctx.unitName(line.item_unit_id), unsummable: false }
      : { key: `unknown:${line.id}`, name: line.unit_name?.trim() || null, unsummable: true },
    entered: null, raw: { source: 'receipt', receipt, line },
  }
}

function fromRequestLine(request: CafePurchaseRequest, line: CafePurchaseRequestLine, ctx: BuildContext): RecordEntry {
  const streamKey = streamKeyOf(request.branch_id, request.activity)
  const itemId = line.wip_item_id ?? null
  const unitId = line.item_unit_id ?? null
  const name = line.item_name ?? ''
  const unit = line.unit_name?.trim() || (unitId ? ctx.unitName(unitId) : null)
  return {
    key: `request:${line.id}`, source: 'request', parentId: request.id, movement: 'requested',
    // Link only with the identity stored on the request line; a matching name is not an item id.
    itemKey: itemId ?? `request-name:${name}`, itemName: itemId ? ctx.itemName(itemId, streamKey) ?? name : name,
    streamKey, branchId: request.branch_id, activity: request.activity, destinationBranchId: null,
    status: request.status === 'Approved' ? 'approved' : request.status === 'Rejected' ? 'rejected' : 'pending',
    rawStatus: request.status, date: ctx.wibDateOf(request.requested_at), at: request.requested_at,
    personId: request.requested_by, qty: parseDecimal(line.quantity),
    unit: unitId
      ? { key: unitId, name: unit, unsummable: false }
      : unit ? { key: `name:${unit}`, name: unit, unsummable: false } : { key: `unknown:${line.id}`, name: null, unsummable: true },
    entered: null, raw: { source: 'request', request, line },
  }
}

export interface SourceRows {
  logs?: readonly CafeRecordLog[]
  counts?: readonly CafeRecordCount[]
  receipts?: readonly CafeReceipt[]
  requests?: readonly CafePurchaseRequest[]
}

/** All entries from the loaded source rows, ids de-duplicated (a cursor overlap never doubles a row). */
export function buildEntries(rows: SourceRows, ctx: BuildContext): RecordEntry[] {
  const seen = new Set<string>()
  const out: RecordEntry[] = []
  const push = (entry: RecordEntry) => { if (!seen.has(entry.key)) { seen.add(entry.key); out.push(entry) } }
  for (const log of rows.logs ?? []) push(fromLog(log, ctx))
  for (const count of rows.counts ?? []) push(fromCount(count, ctx))
  for (const receipt of rows.receipts ?? []) for (const line of receipt.lines) push(fromReceiptLine(receipt, line, ctx))
  for (const request of rows.requests ?? []) for (const line of request.lines) push(fromRequestLine(request, line, ctx))
  return out
}

// ── Filtering ─────────────────────────────────────────────────────────────────────────────────────

export interface EntryFilter { question: Question; q: string; item: string; destination: string }

const fold = (text: string) => text.toLocaleLowerCase()

export function matchesQuestion(entry: RecordEntry, question: Question): boolean {
  return question === 'everything' || entry.movement === question
}

/** Search is name-only (item name), never person or status. */
export function filterEntries(entries: readonly RecordEntry[], filter: EntryFilter): RecordEntry[] {
  const needle = fold(filter.q.trim())
  return entries.filter(entry => matchesQuestion(entry, filter.question)
    && (!filter.item || entry.itemKey === filter.item)
    && (!filter.destination || entry.destinationBranchId === filter.destination)
    && (!needle || fold(entry.itemName).includes(needle)))
}

// ── Summary ───────────────────────────────────────────────────────────────────────────────────────

export interface SummaryRow {
  id: string
  movement: Movement
  status: StatusBasis
  itemKey: string
  itemName: string
  streamKey: string
  destinationBranchId: string | null
  unit: UnitBasis
  qty: Dec | null
  /** Entries behind this row (for Counted: observations in the period). */
  entries: number
  /** Counted only: the date of the latest observation shown. */
  latestDate: string | null
}

export interface SummaryGroup { key: string; movement: Movement; status: StatusBasis; rows: SummaryRow[] }

function addQty(total: Dec | null, qty: Dec | null): Dec | null {
  return qty === null ? total : addDec(total ?? ZERO, qty)
}

export function summarize(entries: readonly RecordEntry[], question: Question): SummaryGroup[] {
  const groups: SummaryGroup[] = []
  for (const movement of movementsFor(question)) {
    for (const status of STATUS_ORDER[movement]) {
      const pool = entries.filter(entry => entry.movement === movement && entry.status === status)
      if (pool.length === 0) continue
      const rows = new Map<string, SummaryRow & { _best?: RecordEntry }>()
      for (const entry of pool) {
        const key = entry.unit.unsummable
          ? `${movement}|${status}|${entry.key}`
          : `${movement}|${status}|${entry.itemKey}|${entry.streamKey}|${entry.destinationBranchId ?? ''}|${entry.unit.key}`
        const existing = rows.get(key)
        if (!existing) {
          rows.set(key, {
            id: key, movement, status, itemKey: entry.itemKey, itemName: entry.itemName, streamKey: entry.streamKey,
            destinationBranchId: entry.destinationBranchId, unit: entry.unit, qty: null, entries: 0, latestDate: null,
          })
        }
        const row = rows.get(key)!
        row.entries += 1
        if (movement === 'counted') {
          // Latest observation only (count date, then submitted time, then id) — repeated counts never add up.
          const best = row._best
          if (!best || compareObservation(entry, best) > 0) { row._best = entry; row.qty = entry.qty; row.latestDate = entry.date }
        } else row.qty = addQty(row.qty, entry.qty)
      }
      groups.push({ key: `${movement}:${status}`, movement, status, rows: [...rows.values()].map(({ _best, ...row }) => { void _best; return row }) })
    }
  }
  return groups
}

function compareObservation(a: RecordEntry, b: RecordEntry): number {
  return a.date.localeCompare(b.date) || a.at.localeCompare(b.at) || a.key.localeCompare(b.key)
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

export interface SortContext { streamLabel: (key: string) => string; destinationLabel: (streamKey: string, branchId: string | null) => string }

export function sortSummaryRows(rows: readonly SummaryRow[], sort: SortKey, dir: SortDir, ctx: SortContext): SummaryRow[] {
  const sign = dir === 'asc' ? 1 : -1
  const tie = (a: SummaryRow, b: SummaryRow) => byText(a.itemName, b.itemName) || a.id.localeCompare(b.id)
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'stream': return sign * byText(ctx.streamLabel(a.streamKey), ctx.streamLabel(b.streamKey)) || tie(a, b)
      case 'destination': return sign * byText(ctx.destinationLabel(a.streamKey, a.destinationBranchId), ctx.destinationLabel(b.streamKey, b.destinationBranchId)) || tie(a, b)
      case 'quantity': {
        // Unlike units never compare: unit groups stay in a fixed (A–Z) order and the sort works inside each.
        const unit = byText(a.unit.name ?? '￿', b.unit.name ?? '￿') || a.unit.key.localeCompare(b.unit.key)
        if (unit !== 0) return unit
        return sign * compareDec(a.qty ?? ZERO, b.qty ?? ZERO) || tie(a, b)
      }
      case 'entries': return sign * (a.entries - b.entries) || tie(a, b)
      default: return sign * byText(a.itemName, b.itemName) || a.id.localeCompare(b.id)
    }
  })
}

export function sortEntries(entries: readonly RecordEntry[], sort: SortKey, dir: SortDir): RecordEntry[] {
  const sign = dir === 'asc' ? 1 : -1
  const dateDesc = (a: RecordEntry, b: RecordEntry) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at) || a.key.localeCompare(b.key)
  return [...entries].sort((a, b) => {
    switch (sort) {
      case 'item': return sign * byText(a.itemName, b.itemName) || dateDesc(a, b)
      case 'quantity': {
        const unit = byText(a.unit.name ?? '￿', b.unit.name ?? '￿') || a.unit.key.localeCompare(b.unit.key)
        if (unit !== 0) return unit
        return sign * compareDec(a.qty ?? ZERO, b.qty ?? ZERO) || dateDesc(a, b)
      }
      default: return sign * (a.date.localeCompare(b.date) || a.at.localeCompare(b.at)) || a.key.localeCompare(b.key)
    }
  })
}

// ── Day summary ───────────────────────────────────────────────────────────────────────────────────

export type DayColumn = 'made' | 'transferred' | 'wasted' | 'counted'
type DayCell = { value: Dec | null; reason: 'none' | 'source' | null; entries: number }

export interface DayRow {
  id: string
  date: string
  itemKey: string
  itemName: string
  streamKey: string
  unit: UnitBasis
  cells: Record<DayColumn, DayCell>
}

export interface SourceHealth {
  /** false = that source failed or only partly loaded: its cells read "—" with a reason, never a smaller number. */
  logs: boolean
  counts: boolean
}

const DAY_COLUMN_OF: Partial<Record<Movement, DayColumn>> = { made: 'made', transferred: 'transferred', wasted: 'wasted', counted: 'counted' }

/**
 * Day basis: made and transferred = pending + approved; waste = approved; Count = latest Confirmed that day.
 * HANDOVER: R/handover/records-gaps.md §2. Ingredient use / waste rate — the Waste column is a quantity, never a rate; no actual ingredient consumption is read.
 * Pass entries filtered by item / destination / search but NOT by question: every row keeps all four columns,
 * and the question only decides which rows are selected.
 */
export function buildDayRows(entries: readonly RecordEntry[], question: Question, health: SourceHealth): DayRow[] {
  type Work = DayRow & { _count?: RecordEntry; _received: boolean }
  const rows = new Map<string, Work>()
  const blank = (): DayCell => ({ value: null, reason: null, entries: 0 })
  for (const entry of entries) {
    const column = DAY_COLUMN_OF[entry.movement]
    const contributes = column
      ? column === 'counted' ? entry.status === 'confirmed'
        : column === 'wasted' ? entry.status === 'approved' : entry.status === 'pending' || entry.status === 'approved'
      : false
    // Received rows come from receipts whose unit resolves to an item; request names never become items.
    const receivedRow = entry.movement === 'received' && entry.status !== 'rejected' && !entry.itemKey.startsWith('receipt-unit:')
    if (!contributes && !receivedRow) continue
    const key = entry.unit.unsummable ? `${entry.date}|${entry.key}` : `${entry.date}|${entry.itemKey}|${entry.streamKey}|${entry.unit.key}`
    let row = rows.get(key)
    if (!row) {
      row = {
        id: key, date: entry.date, itemKey: entry.itemKey, itemName: entry.itemName, streamKey: entry.streamKey, unit: entry.unit,
        cells: { made: blank(), transferred: blank(), wasted: blank(), counted: blank() }, _received: false,
      }
      rows.set(key, row)
    }
    if (receivedRow) row._received = true
    if (!contributes || !column) continue
    const cell = row.cells[column]
    cell.entries += 1
    if (column === 'counted') {
      if (!row._count || compareObservation(entry, row._count) > 0) { row._count = entry; cell.value = entry.qty }
    } else if (entry.qty !== null) cell.value = addDec(cell.value ?? ZERO, entry.qty)
  }
  const out: DayRow[] = []
  for (const work of rows.values()) {
    const { _count, _received, ...row } = work
    void _count
    const selected = question === 'everything' ? true
      : question === 'received' ? _received
        : question === 'requested' ? false
          : row.cells[question].entries > 0
    if (!selected) continue
    // Complete source + no movement on an existing row = 0. Failed/partial source (or an unreadable quantity) = "—".
    for (const column of ['made', 'transferred', 'wasted'] as const) {
      const cell = row.cells[column]
      if (!health.logs || (cell.entries > 0 && cell.value === null)) row.cells[column] = { value: null, reason: 'source', entries: cell.entries }
      else if (cell.entries === 0) row.cells[column] = { value: ZERO, reason: 'none', entries: 0 }
    }
    if (!health.counts) row.cells.counted = { value: null, reason: 'source', entries: row.cells.counted.entries }
    out.push(row)
  }
  return out
}

export function sortDayRows(rows: readonly DayRow[], dir: SortDir): DayRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || sign * byText(a.itemName, b.itemName) || a.id.localeCompare(b.id))
}

export interface DayGroup { date: string; rows: DayRow[]; total: number; continued: boolean }

export function paginate<T>(items: readonly T[], page: number, size = 50): { slice: T[]; pages: number; start: number } {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  return { slice: items.slice(start, start + size), pages, start }
}

/** Day groups for one page of rows; a group that began on an earlier page is marked Continued. */
export function groupDayPage(all: readonly DayRow[], slice: readonly DayRow[], start: number): DayGroup[] {
  const totals = new Map<string, number>()
  for (const row of all) totals.set(row.date, (totals.get(row.date) ?? 0) + 1)
  const groups: DayGroup[] = []
  slice.forEach((row, index) => {
    const last = groups.at(-1)
    if (last && last.date === row.date) last.rows.push(row)
    else groups.push({ date: row.date, rows: [row], total: totals.get(row.date) ?? 1, continued: index === 0 && start > 0 && all[start - 1]?.date === row.date })
  })
  return groups
}

// ── Paged summary ─────────────────────────────────────────────────────────────────────────────────

export interface PagedGroup { key: string; movement: Movement; status: StatusBasis; rows: SummaryRow[]; total: number; continued: boolean }

/**
 * Sort rows inside each status group (groups keep their fixed order), then take one URL page of 50 rows
 * across the whole list. A group that began on an earlier page is marked continued. The totals the groups
 * were built from are the complete scope, never the visible page.
 */
export function pageSummary(groups: readonly SummaryGroup[], sort: SortKey, dir: SortDir, ctx: SortContext, page: number, size = 50): {
  groups: PagedGroup[]; totalRows: number; pages: number; start: number; page: number
} {
  const sorted = groups.map(group => ({ group, rows: sortSummaryRows(group.rows, sort, dir, ctx) }))
  const flat = sorted.flatMap(({ group, rows }) => rows.map((row, index) => ({ group, row, index })))
  const { slice, pages, start } = paginate(flat, page, size)
  const out: PagedGroup[] = []
  for (const { group, row, index } of slice) {
    const last = out.at(-1)
    if (last && last.key === group.key) last.rows.push(row)
    else out.push({ key: group.key, movement: group.movement, status: group.status, rows: [row], total: group.rows.length, continued: index > 0 })
  }
  return { groups: out, totalRows: flat.length, pages, start, page: Math.min(Math.max(1, page), pages) }
}
