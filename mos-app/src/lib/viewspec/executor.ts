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
  /**
   * Present ONLY when an aggregate query degraded to the in-memory fallback because the
   * `aggregate_compiled` RPC rejected. On this path the aggregate is a LOWER BOUND over the capped
   * fetch (not the true total) and `truncated` will be true. The renderer badges this distinctly
   * from a clean cap so a finance surface never renders a plausible-but-wrong total as a clean one.
   * Undefined on the happy path (RPC succeeded → true total) and on non-aggregate queries.
   */
  degraded?: 'aggregate-fallback'
}

/**
 * The DB-side aggregate RPC row: { group_key, agg_value }. group_key is null when there is no
 * groupBy (single-row aggregate); otherwise it is the group's key value as jsonb.
 */
interface AggregateRpcRow {
  group_key: unknown
  agg_value: number | null
}

/**
 * Runs the DB-side aggregate path (T34 / P2.1, AC-P2-RT-006). Calls the `mos.aggregate_compiled`
 * SECURITY INVOKER RPC, which computes the real SQL aggregate over the FULL predicate — uncapped by
 * the row limit — so a wide reporting window returns the true total, not a lower bound over the
 * first 500 rows. The RPC re-validates entity/column/op against its own hard-coded whitelist (the
 * second trust boundary; the client-side ENTITY_WHITELIST is the first). RLS fires under INVOKER.
 *
 * Maps the RPC's generic `{group_key, agg_value}` rows back to the shape the renderer expects:
 * `{ [groupBy]: ..., [alias]: ... }` per group, or `{ [alias]: ... }` for a single-row aggregate.
 * Returns `truncated: false` — the aggregate is computed over the full set, so there is no cap.
 */
async function executeAggregateViaRpc(compiled: CompiledQuery): Promise<ExecutedQueryResult> {
  // The supabase client is schema-pinned to `shared` by default; .schema() re-points it per call.
  const db = supabase as unknown as { schema: (s: string) => { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: AggregateRpcRow[] | null; error: { message?: string } | null }> } }
  const { data, error } = await db
    .schema('mos')
    .rpc('aggregate_compiled', { p_compiled: compiled as unknown as Record<string, unknown> })

  if (error) throw new Error(`aggregate_compiled failed — ${error.message}`)
  const rows = data ?? []
  const groupBy = compiled.resolvedGroupBy
  const alias = compiled.resolvedAggregate?.alias ?? 'value'
  const out: Row[] = rows.map((r) => {
    if (groupBy) {
      // group_key arrives as the JSON value of the group; the renderer treats it as the group value.
      return { [groupBy]: r.group_key, [alias]: r.agg_value ?? 0 }
    }
    return { [alias]: r.agg_value ?? 0 }
  })
  return { rows: out, truncated: false }
}

/**
 * Executes a CompiledQuery under the current viewer's JWT (the same RLS-scoped client the DAL uses).
 * Dispatch is SCHEMA-SCOPED (MOS delta). Never service_role. Row cap (≤500) applied as .limit().
 * Throws Error on PostgREST failure (MOS DAL convention).
 *
 * AGGREGATE PATH (T34 / P2.1, AC-P2-RT-006 — RESOLVED): when `resolvedAggregate || resolvedGroupBy`
 * is present, the work runs DB-side via `mos.aggregate_compiled` (SECURITY INVOKER RPC) over the
 * full predicate — uncapped by the row limit — so the aggregate is the true total, not a lower bound.
 * The earlier P1 in-memory reduction (`applyGroupByAggregate`) is retained ONLY as a defensive
 * fallback when the RPC call rejects: on RPC failure the in-memory reduction runs over the capped
 * fetch and `truncated` is set honestly, preserving the P1 lower-bound + truncation contract. The
 * happy path is now correct. Item 7 (orderBy-on-aggregate) is also resolved: the RPC applies
 * ORDER BY to the real reduced rows.
 */
export async function executeCompiledQuery(compiled: CompiledQuery): Promise<ExecutedQueryResult> {
  const isAggregateQuery = !!(compiled.resolvedAggregate || compiled.resolvedGroupBy)

  if (isAggregateQuery) {
    try {
      return await executeAggregateViaRpc(compiled)
    } catch (rpcError) {
      // Defensive fallback: the RPC is the happy path; if it is unavailable or errors, fall back to
      // the P1 in-memory reduction over a capped fetch and report `truncated` honestly. This keeps
      // the renderer working (with the documented lower-bound semantics) instead of failing hard.
      // The error is swallowed intentionally — surfaced only via the truncation signal + the
      // agg-value being a lower bound — but logged for observability.
      console.warn('[viewspec] aggregate_compiled RPC failed; falling back to in-memory (lower-bound)', rpcError)
    }
  }

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
  const outRows = isAggregateQuery
    ? applyGroupByAggregate(rows, compiled.resolvedGroupBy, compiled.resolvedAggregate)
    : rows
  // On the aggregate fallback path the result is a lower bound over the capped fetch — flag it so
  // the renderer can badge "partial data" distinctly from a clean cap.
  return isAggregateQuery
    ? { rows: outRows, truncated, degraded: 'aggregate-fallback' }
    : { rows: outRows, truncated }
}
