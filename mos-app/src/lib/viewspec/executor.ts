// View-renderer executor. Adapted from the sibling internal project's ADR-0038. MOS delta: dispatch
// is SCHEMA-SCOPED (supabase.schema(entry.schema).from(entry.table)) — MOS is multi-schema; the
// sibling was single-schema. Uses the caller-JWT client; never service_role.
import { supabase } from '@/lib/supabase'
import { ENTITY_WHITELIST } from './types'
import type { CompiledQuery, ResolvedFilter } from './types'

type Row = Record<string, unknown>

function applyGroupByAggregate(rows: Row[], groupBy: string | undefined, aggregate: { fn: string; column: string; alias: string } | undefined): Row[] {
  if (!aggregate) return rows
  if (!groupBy) return [{ [aggregate.alias]: reduceAggregate(rows, aggregate) }]
  const groups = new Map<unknown, Row[]>()
  for (const row of rows) {
    const key = row[groupBy]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  return Array.from(groups.entries()).map(([key, g]) => ({ [groupBy]: key, [aggregate.alias]: reduceAggregate(g, aggregate) }))
}
function reduceAggregate(rows: Row[], agg: { fn: string; column: string; alias: string }): number {
  const vals = rows.map((r) => Number(r[agg.column] ?? 0))
  switch (agg.fn) {
    case 'count': return rows.length
    case 'sum': return vals.reduce((a, b) => a + b, 0)
    case 'avg': return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length
    case 'min': return vals.length === 0 ? 0 : Math.min(...vals)
    case 'max': return vals.length === 0 ? 0 : Math.max(...vals)
    default: return 0
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(chain: any, filter: ResolvedFilter): any {
  const { column, op, value } = filter
  switch (op) {
    case 'eq': return chain.eq(column, value)
    case 'neq': return chain.neq(column, value)
    case 'in': return chain.in(column, value as (string | number)[])
    case 'gt': return chain.gt(column, value)
    case 'gte': return chain.gte(column, value)
    case 'lt': return chain.lt(column, value)
    case 'lte': return chain.lte(column, value)
    case 'between':
    case 'date-range': {
      const [from, to] = value as [string | number, string | number]
      return chain.gte(column, from).lte(column, to)
    }
    default: return chain
  }
}

export interface ExecutedQueryResult {
  rows: unknown[]
  /** true when rows.length === the effective row cap — the fetch MAY have been cut off. */
  truncated: boolean
}

/**
 * Executes a CompiledQuery under the current viewer's JWT (the same RLS-scoped client the DAL uses).
 * Dispatch is SCHEMA-SCOPED (MOS delta). Never service_role. Row cap (≤500) applied as .limit().
 * Throws Error on PostgREST failure (MOS DAL convention). In-memory groupBy/aggregate when present.
 *
 * CAVEAT (P1 review fix-wave item 6) — when `truncated` is true, any `resolvedAggregate` in the
 * returned rows is a LOWER BOUND, not the true total: the aggregate is computed in-memory over
 * only the capped fetch (≤ limit raw rows), not the full matching set. A DB-side aggregate (real
 * SQL sum/count/avg over the full predicate, uncapped by the row limit) is the P2 fix — this
 * executor's in-memory reduction is a P1 stopgap that trades correctness-at-scale for shipping
 * without a Postgres RPC/view per aggregate shape.
 *
 * CAVEAT (item 7) — `resolvedOrderBy` is applied to the PostgREST query BEFORE the in-memory
 * groupBy/aggregate reduction runs, so when both are present the order is discarded by the
 * reduction (the reduced rows come out in Map-insertion order, not the requested order). orderBy
 * is only meaningful for a non-aggregated query in P1; ordering the aggregated output is a P2
 * concern (DB-side aggregation would let ORDER BY apply to the real reduced rows).
 */
export async function executeCompiledQuery(compiled: CompiledQuery): Promise<ExecutedQueryResult> {
  const entry = ENTITY_WHITELIST[compiled.entity]
  // The supabase client is schema-pinned to `shared` by default; .schema() re-points it per call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { schema: (s: string) => { from: (t: string) => any } }
  const effectiveLimit = compiled.limit ?? 500
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chain: any = db.schema(entry.schema).from(entry.table).select(compiled.resolvedSelect.join(','))
  for (const f of compiled.resolvedFilters) chain = applyFilter(chain, f)
  if (compiled.resolvedOrderBy) chain = chain.order(compiled.resolvedOrderBy.column, { ascending: compiled.resolvedOrderBy.dir === 'asc' })
  chain = chain.limit(effectiveLimit)
  const { data, error } = await chain
  if (error) throw new Error(`executeCompiledQuery failed — ${error.message}`)
  const rows: Row[] = (data as Row[]) ?? []
  const truncated = rows.length === effectiveLimit
  const outRows = (compiled.resolvedAggregate || compiled.resolvedGroupBy)
    ? applyGroupByAggregate(rows, compiled.resolvedGroupBy, compiled.resolvedAggregate)
    : rows
  return { rows: outRows, truncated }
}
