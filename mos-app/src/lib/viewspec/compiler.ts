// View-Composition Compiler. Adapted from the sibling internal project's ADR-0037. The untrusted-output
// validation boundary (sibling ADR-0039 decision 3): every spec — hand- or agent-composed — crosses
// compileCompositionSpec before it can render or save.
// Explicit `.ts` extensions on every relative import (Deno-strict compat, P1-debt fix):
// `deno check` (the edge-function pre-deploy gate, T1/AC-CF-*) requires extension-ful relative
// specifiers — Node's extensionless resolution never worked in Deno without `--sloppy-imports`.
// Vite/Vitest resolve `.ts`-suffixed relative imports identically to extensionless ones, so this
// is a zero-behavior-change addition for the existing (Node/Vitest) consumers.
import {
  ENTITY_WHITELIST, VALID_FILTER_OPS, VALID_TOKENS, NUMERIC_AGGREGATE_FNS, ValidationError,
  MAX_PANELS_PER_VIEW, MAX_IN_FILTER_LIST_LENGTH,
} from './types.ts'
import type {
  QuerySpec, CompilerContext, CompiledQuery, CompositionSpec, CompiledPanel, PanelSpec,
  FilterClause, ResolvedFilter, ResolvedAggregate, ResolvedTimeRange, TokenValue,
} from './types.ts'
// Imports the PURE registry-manifest (not registry.ts, which pulls in React component types
// via `@/components/dashboard/kpi-tile` — compiler.ts is called from Deno edge functions via
// compileCompositionSpec, T8/FR-P2-CV-002, so its import graph must stay React/CSS-free too;
// Director build-note, 2026-07-04, pre-ADR-0018-P2-T7).
import { validatePrimitiveInManifest } from './registry-manifest.ts'

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
    // P1 review fix-wave item 3 — an unbounded `in` list is a resource-abuse vector (D7 intent);
    // cap it before resolving tokens (a $-token can only expand to one scalar, so checking the
    // raw array length here is equivalent to checking the resolved length).
    if (f.op === 'in' && Array.isArray(f.value) && f.value.length > MAX_IN_FILTER_LIST_LENGTH) {
      throw new ValidationError('FILTER_LIST_TOO_LONG', `${f.column}: ${f.value.length} values (max ${MAX_IN_FILTER_LIST_LENGTH})`)
    }
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
    /* c8 ignore next 2 -- UNREACHABLE IN P1: no MOS entity in the frozen ENTITY_WHITELIST sets
       requiredFilter (plan §1.4 — MOS tasks are org-scoped by RLS, not project-scoped like the
       sibling port). The whitelist's WhitelistedEntity union + Object.freeze make it impossible
       to construct a real entity entry with requiredFilter set from a test without bypassing the
       type system; a fake/injected entity would test a different code path than production takes.
       The branch is ported machinery (future-proof for a later entity that IS project/work-line
       scoped) — exercised for real the day a MOS entity sets requiredFilter: true. */
    if (!has) throw new ValidationError('MISSING_REQUIRED_FILTER', `entity ${spec.entity} requires a ${requiredFilter} filter (eq or in)`)
  }

  // P1 review fix-wave item 1 — union the groupBy column + the aggregate column into
  // resolvedSelect when present. Without this, a spec that only selects display columns but
  // groups/aggregates on an un-selected column would fetch rows lacking that column, and the
  // executor's in-memory groupBy/aggregate (executor.ts) would silently reduce over `undefined`
  // (Number(undefined ?? 0) === 0) — a silent-zeros bug, not a thrown error.
  const resolvedSelect = Array.from(new Set([
    ...spec.select,
    ...(spec.groupBy !== undefined ? [spec.groupBy] : []),
    ...(spec.aggregate !== undefined ? [spec.aggregate.column] : []),
  ]))

  const compiled: CompiledQuery = {
    entity: spec.entity, schema: e.schema, table: e.table, resolvedFilters, resolvedSelect,
    ...(spec.groupBy !== undefined && { resolvedGroupBy: spec.groupBy }),
    ...(resolvedAggregate !== undefined && { resolvedAggregate }),
    ...(resolvedTimeRange !== undefined && { resolvedTimeRange }),
    ...(spec.orderBy !== undefined && { resolvedOrderBy: spec.orderBy }),
    ...(effectiveLimit !== undefined && { limit: effectiveLimit }),
  }
  return compiled
}

/**
 * The untrusted-output validation boundary (FR-UV-005/006). Fail-fast: throws on first invalid
 * panel. Top-level + per-panel SHAPE guards (P1 review fix-wave item 4) run before anything else
 * touches the spec — a malformed spec (wrong type, missing/non-array panels, a panel's querySpec
 * with a non-array `select`) degrades to a proper ValidationError (INVALID_SPEC_SHAPE), never a
 * raw TypeError reaching the renderer (ADR-0017 D5: never crash, never render unvalidated).
 */
export function compileCompositionSpec(spec: CompositionSpec, ctx: CompilerContext): CompiledPanel[] {
  if (spec === null || typeof spec !== 'object') {
    throw new ValidationError('INVALID_SPEC_SHAPE', `spec must be an object, got ${spec === null ? 'null' : typeof spec}`)
  }
  const version = (spec as { version: unknown }).version
  if (version !== 1) throw new ValidationError('UNSUPPORTED_VERSION', String(version))
  if (!Array.isArray(spec.panels)) {
    throw new ValidationError('INVALID_SPEC_SHAPE', 'spec.panels must be an array')
  }
  if (spec.panels.length === 0) throw new ValidationError('UNSUPPORTED_VERSION', 'spec has no panels')
  if (spec.panels.length > MAX_PANELS_PER_VIEW) {
    throw new ValidationError('UNSUPPORTED_VERSION', `spec has ${spec.panels.length} panels (max ${MAX_PANELS_PER_VIEW})`)
  }

  return spec.panels.map((panel: PanelSpec): CompiledPanel => {
    if (!validatePrimitiveInManifest(panel.primitive)) throw new ValidationError('UNKNOWN_PRIMITIVE', panel.id)
    if (!Array.isArray(panel.querySpec?.select)) {
      throw new ValidationError('INVALID_SPEC_SHAPE', `panel ${panel.id}: querySpec.select must be an array`)
    }
    let compiledQuery: CompiledQuery
    try {
      compiledQuery = compileQuerySpec(panel.querySpec, ctx)
    } catch (err: unknown) {
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
