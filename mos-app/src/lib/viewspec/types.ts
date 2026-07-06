// View-Composition Trusted Core — DSL types, entity whitelist, ValidationError. Adapted from the
// sibling internal project's ADR-0037 (compiler/DSL + ENTITY_WHITELIST). ADR-0018 D6 P1 port. Pure
// TypeScript; no Supabase client import; no React import.

// ── Token values (FR-UV-004; pruned + MOS-renamed vs the sibling port) ──────────
export type TokenValue =
  | '$current_person'
  | '$current_org'
  | '$today'
  | '$start_of_month'
  | '$end_of_month'

export const VALID_TOKENS = new Set<string>([
  '$current_person', '$current_org', '$today', '$start_of_month', '$end_of_month',
])

// ── Filter operator ────────────────────────────────────────────────────────────
export type FilterOp =
  | 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'date-range'
export const VALID_FILTER_OPS = new Set<string>([
  'eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'date-range',
])

// ── Aggregate ──────────────────────────────────────────────────────────────────
export type AggregateFn = 'count' | 'sum' | 'avg' | 'min' | 'max'
export const NUMERIC_AGGREGATE_FNS = new Set<AggregateFn>(['sum', 'avg', 'min', 'max'])
export interface AggregateSpec { fn: AggregateFn; column: string; alias: string }

// ── Filter / TimeRange ─────────────────────────────────────────────────────────
export interface FilterClause {
  column: string
  op: FilterOp
  value: string | number | boolean | string[] | number[]
}
export interface TimeRangeSpec { column: string; from: string; to: string }

// ── Whitelisted entity key (the 7 MOS entities, both planes) ───────────────────
export type ViewSchema = 'mos' | 'ops' | 'shared' | 'reporting'
export type WhitelistedEntity =
  | 'tasks' | 'weekly_updates' | 'objectives' | 'work_lines' | 'people'
  | 'sales_daily_revenue' | 'sales_margin_daily'

// ── QuerySpec ──────────────────────────────────────────────────────────────────
export interface QuerySpec {
  entity: WhitelistedEntity
  select: string[]
  filters?: FilterClause[]
  groupBy?: string
  aggregate?: AggregateSpec
  timeRange?: TimeRangeSpec
  limit?: number
  orderBy?: { column: string; dir: 'asc' | 'desc' }
}

// ── Panel / CompositionSpec (FR-UV-001) ────────────────────────────────────────
export interface LayoutHint { colSpan?: number; rowSpan?: number }
export interface PanelSpec {
  id: string
  primitive: string
  querySpec: QuerySpec
  layout?: LayoutHint
  props?: Record<string, unknown>
}
export interface CompositionSpec { version: 1; panels: PanelSpec[] }

// ── Compiler context (FR-UV-004) ───────────────────────────────────────────────
export interface CompilerContext { personId: string; orgId: string }

// ── Compiled output ────────────────────────────────────────────────────────────
export interface ResolvedFilter {
  column: string; op: FilterOp
  value: string | number | boolean | string[] | number[]
}
export interface ResolvedAggregate { fn: AggregateFn; column: string; alias: string }
export interface ResolvedTimeRange { column: string; from: string; to: string }
export interface CompiledQuery {
  entity: WhitelistedEntity
  schema: ViewSchema
  table: string
  resolvedFilters: ResolvedFilter[]
  resolvedSelect: string[]
  resolvedGroupBy?: string
  resolvedAggregate?: ResolvedAggregate
  resolvedTimeRange?: ResolvedTimeRange
  resolvedOrderBy?: { column: string; dir: 'asc' | 'desc' }
  limit?: number
}
export interface CompiledPanel {
  id: string
  primitive: string
  compiledQuery: CompiledQuery
  layout?: LayoutHint
  props?: Record<string, unknown>
}

// ── Entity whitelist entry ─────────────────────────────────────────────────────
export interface EntityWhitelistEntry {
  schema: ViewSchema
  table: string
  /** Informational only — the executor dispatches by schema+table, not via a repository method. */
  repositoryMethod: string
  allowedColumns: ReadonlySet<string>
  numericColumns: ReadonlySet<string>
  dateColumns: ReadonlySet<string>
  groupableColumns: ReadonlySet<string>
  /** D7 ceiling: a time-range is required for time-bearing entities. Catalog entities set false. */
  requiresTimeRange?: boolean
  /** Ported mechanism; no MOS entity sets it in P1 (tasks are org-scoped by RLS, not project-scoped). */
  requiredFilter?: string
}

/**
 * The trust boundary (FR-UV-003). Columns audited verbatim from the live MOS migrations.
 * `org_id` is DELIBERATELY ABSENT from every allowedColumns — the client never sends org_id
 * (RLS is the authority); exposing it would invite redundant + misleading filters.
 */
export const ENTITY_WHITELIST: Readonly<Record<WhitelistedEntity, EntityWhitelistEntry>> =
  Object.freeze({
    tasks: {
      schema: 'mos', table: 'tasks', repositoryMethod: 'tasks.list',
      allowedColumns: new Set([
        'id', 'title', 'business_unit_id', 'status', 'responsible_person_id',
        'accountable_person_id', 'due_date', 'last_activity_at', 'archived_at',
        'created_at', 'updated_at', 'objective_id', 'work_line_id',
      ]),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['due_date', 'last_activity_at', 'created_at', 'updated_at']),
      groupableColumns: new Set(['status', 'business_unit_id', 'responsible_person_id', 'objective_id', 'work_line_id']),
      requiresTimeRange: true,
    },
    weekly_updates: {
      schema: 'mos', table: 'weekly_updates', repositoryMethod: 'weeklyUpdates.list',
      allowedColumns: new Set(['id', 'person_id', 'week_start', 'status', 'submitted_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['week_start', 'submitted_at', 'created_at', 'updated_at']),
      groupableColumns: new Set(['status', 'person_id']),
      requiresTimeRange: true,
    },
    objectives: {
      schema: 'mos', table: 'objectives', repositoryMethod: 'objectives.list',
      allowedColumns: new Set(['id', 'name', 'archived_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['created_at', 'updated_at']),
      groupableColumns: new Set<string>(),
      requiresTimeRange: false,
    },
    work_lines: {
      schema: 'mos', table: 'work_lines', repositoryMethod: 'workLines.list',
      allowedColumns: new Set(['id', 'name', 'type', 'archived_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['created_at', 'updated_at']),
      groupableColumns: new Set(['type']),
      requiresTimeRange: false,
    },
    people: {
      schema: 'shared', table: 'people', repositoryMethod: 'directory.list',
      allowedColumns: new Set(['id', 'full_name', 'email', 'archived_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['created_at', 'updated_at']),
      groupableColumns: new Set<string>(),
      requiresTimeRange: false,
    },
    sales_daily_revenue: {
      schema: 'reporting', table: 'sales_daily_revenue', repositoryMethod: 'reporting.listSalesDailyRevenue',
      allowedColumns: new Set([
        'revenue_date', 'channel', 'esb_code', 'branch_code', 'branch_name',
        'transactions', 'clean_revenue', 'snapshot_as_of',
      ]),
      numericColumns: new Set(['transactions', 'clean_revenue']),
      dateColumns: new Set(['revenue_date', 'snapshot_as_of']),
      groupableColumns: new Set(['channel', 'esb_code', 'branch_code']),
      requiresTimeRange: true,
    },
    sales_margin_daily: {
      schema: 'reporting', table: 'sales_margin_daily', repositoryMethod: 'reporting.listSalesMarginDaily',
      allowedColumns: new Set([
        'margin_date', 'esb_code', 'branch_code', 'branch_name', 'revenue',
        'cogs_interim_sm', 'cogs_budget_bom', 'margin_interim', 'margin_interim_pct',
        'bom_coverage_pct', 'snapshot_as_of',
      ]),
      numericColumns: new Set(['revenue', 'cogs_interim_sm', 'cogs_budget_bom', 'margin_interim', 'margin_interim_pct']),
      dateColumns: new Set(['margin_date', 'snapshot_as_of']),
      groupableColumns: new Set(['esb_code', 'branch_code']),
      requiresTimeRange: true,
    },
  })

export const MAX_PANELS_PER_VIEW = 20

/** P1 review fix-wave item 3 — caps an `in` filter's value array (bounds an unbounded IN-list scan). */
export const MAX_IN_FILTER_LIST_LENGTH = 500

// ── ValidationError (FR-UV-004/005) ────────────────────────────────────────────
export type ValidationErrorCode =
  | 'UNKNOWN_ENTITY' | 'UNKNOWN_COLUMN' | 'UNKNOWN_OP' | 'NON_NUMERIC_AGGREGATE'
  | 'INVALID_LIMIT' | 'UNKNOWN_TOKEN' | 'UNRESOLVABLE_TOKEN' | 'MISSING_REQUIRED_FILTER'
  | 'MISSING_TIME_RANGE'   // MOS delta (D7 ceiling) — not in the sibling port
  | 'NOT_GROUPABLE_COLUMN' | 'UNKNOWN_PRIMITIVE' | 'UNSUPPORTED_VERSION'
  | 'FILTER_LIST_TOO_LONG' // P1 review fix-wave item 3 — caps an `in` filter's array at 500
  | 'INVALID_SPEC_SHAPE'   // P1 review fix-wave item 4 — malformed top-level/panel shape

export class ValidationError extends Error {
  readonly code: ValidationErrorCode
  readonly detail?: string
  constructor(code: ValidationErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ValidationError'
    this.code = code
    this.detail = detail
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}
