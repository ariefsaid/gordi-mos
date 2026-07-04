// View-Composition Compiler. Adapted from the sibling internal project's ADR-0037. The untrusted-output
// validation boundary (sibling ADR-0039 decision 3): every spec — hand- or agent-composed — crosses
// compileCompositionSpec before it can render or save.
import {
  ENTITY_WHITELIST, VALID_FILTER_OPS, VALID_TOKENS, NUMERIC_AGGREGATE_FNS, ValidationError,
} from './types'
import type {
  QuerySpec, CompilerContext, CompiledQuery, CompositionSpec, CompiledPanel,
  FilterClause, ResolvedFilter, ResolvedAggregate, ResolvedTimeRange, TokenValue,
} from './types'
import { validatePrimitive } from './registry'

function startOfMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function endOfMonth(d: Date): string {
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`
}
function todayISO(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Resolves a $-token (scalar or array element). Throws UNKNOWN_TOKEN / UNRESOLVABLE_TOKEN. */
function resolveValue(raw: FilterClause['value'], ctx: CompilerContext): ResolvedFilter['value'] {
  if (typeof raw === 'string' && raw.startsWith('$')) {
    if (!VALID_TOKENS.has(raw)) throw new ValidationError('UNKNOWN_TOKEN', raw)
    const token = raw as TokenValue
    const now = new Date()
    switch (token) {
      case '$current_person': return ctx.personId
      case '$current_org': return ctx.orgId
      case '$today': return todayISO()
      case '$start_of_month': return startOfMonth(now)
      case '$end_of_month': return endOfMonth(now)
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      typeof item === 'string' && item.startsWith('$') ? (resolveValue(item, ctx) as string) : item
    ) as ResolvedFilter['value']
  }
  return raw as ResolvedFilter['value']
}

export function compileQuerySpec(spec: QuerySpec, ctx: CompilerContext): CompiledQuery {
  if (!Object.prototype.hasOwnProperty.call(ENTITY_WHITELIST, spec.entity)) {
    throw new ValidationError('UNKNOWN_ENTITY', String(spec.entity))
  }
  const e = ENTITY_WHITELIST[spec.entity]
  const { allowedColumns, numericColumns, groupableColumns, dateColumns, requiresTimeRange, requiredFilter } = e

  if (spec.limit !== undefined && (spec.limit < 1 || spec.limit > 500)) {
    throw new ValidationError('INVALID_LIMIT', String(spec.limit))
  }
  const effectiveLimit: number | undefined =
    spec.limit !== undefined ? spec.limit
    : (spec.aggregate !== undefined || spec.groupBy !== undefined ? 500 : undefined)

  for (const col of spec.select) if (!allowedColumns.has(col)) throw new ValidationError('UNKNOWN_COLUMN', col)

  const resolvedFilters: ResolvedFilter[] = []
  for (const f of spec.filters ?? []) {
    if (!allowedColumns.has(f.column)) throw new ValidationError('UNKNOWN_COLUMN', f.column)
    if (!VALID_FILTER_OPS.has(f.op)) throw new ValidationError('UNKNOWN_OP', String(f.op))
    resolvedFilters.push({ column: f.column, op: f.op, value: resolveValue(f.value, ctx) })
  }

  if (spec.groupBy !== undefined) {
    if (!allowedColumns.has(spec.groupBy)) throw new ValidationError('UNKNOWN_COLUMN', spec.groupBy)
    if (!groupableColumns.has(spec.groupBy)) throw new ValidationError('NOT_GROUPABLE_COLUMN', spec.groupBy)
  }
  if (spec.orderBy !== undefined && !allowedColumns.has(spec.orderBy.column)) {
    throw new ValidationError('UNKNOWN_COLUMN', spec.orderBy.column)
  }

  let resolvedAggregate: ResolvedAggregate | undefined
  if (spec.aggregate !== undefined) {
    const { fn, column, alias } = spec.aggregate
    if (!allowedColumns.has(column)) throw new ValidationError('UNKNOWN_COLUMN', column)
    if (NUMERIC_AGGREGATE_FNS.has(fn) && !numericColumns.has(column)) throw new ValidationError('NON_NUMERIC_AGGREGATE', column)
    resolvedAggregate = { fn, column, alias }
  }

  let resolvedTimeRange: ResolvedTimeRange | undefined
  if (spec.timeRange !== undefined) {
    const { column, from, to } = spec.timeRange
    if (!allowedColumns.has(column) || !dateColumns.has(column)) throw new ValidationError('UNKNOWN_COLUMN', column)
    const rFrom = resolveValue(from, ctx) as string
    const rTo = resolveValue(to, ctx) as string
    resolvedFilters.push({ column, op: 'date-range', value: [rFrom, rTo] })
    resolvedTimeRange = { column, from: rFrom, to: rTo }
  }

  // D7 ceiling — time-bearing entities require a time-range (MOS delta; catalog entities exempt).
  if (requiresTimeRange && resolvedTimeRange === undefined) {
    throw new ValidationError('MISSING_TIME_RANGE', `entity ${spec.entity} requires a timeRange`)
  }
  if (requiredFilter) {
    const has = resolvedFilters.some((f) => f.column === requiredFilter && (f.op === 'eq' || f.op === 'in'))
    if (!has) throw new ValidationError('MISSING_REQUIRED_FILTER', `entity ${spec.entity} requires a ${requiredFilter} filter (eq or in)`)
  }

  const compiled: CompiledQuery = {
    entity: spec.entity, schema: e.schema, table: e.table, resolvedFilters, resolvedSelect: spec.select,
    ...(spec.groupBy !== undefined && { resolvedGroupBy: spec.groupBy }),
    ...(resolvedAggregate !== undefined && { resolvedAggregate }),
    ...(resolvedTimeRange !== undefined && { resolvedTimeRange }),
    ...(spec.orderBy !== undefined && { resolvedOrderBy: spec.orderBy }),
    ...(effectiveLimit !== undefined && { limit: effectiveLimit }),
  }
  return compiled
}

/** The untrusted-output validation boundary (FR-UV-005/006). Fail-fast: throws on first invalid panel. */
export function compileCompositionSpec(spec: CompositionSpec, ctx: CompilerContext): CompiledPanel[] {
  const version = (spec as { version: unknown }).version
  if (version !== 1) throw new ValidationError('UNSUPPORTED_VERSION', String(version))
  if (spec.panels.length === 0) throw new ValidationError('UNSUPPORTED_VERSION', 'spec has no panels')
  if (spec.panels.length > 20) throw new ValidationError('UNSUPPORTED_VERSION', `spec has ${spec.panels.length} panels (max 20)`)

  return spec.panels.map((panel): CompiledPanel => {
    if (!validatePrimitive(panel.primitive)) throw new ValidationError('UNKNOWN_PRIMITIVE', panel.id)
    let compiledQuery: CompiledQuery
    try {
      compiledQuery = compileQuerySpec(panel.querySpec, ctx)
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ValidationError(err.code, err.detail != null ? `${err.detail} (panel: ${panel.id})` : `panel: ${panel.id}`)
      }
      throw err
    }
    return {
      id: panel.id, primitive: panel.primitive, compiledQuery,
      ...(panel.layout !== undefined && { layout: panel.layout }),
      ...(panel.props !== undefined && { props: panel.props }),
    }
  })
}
