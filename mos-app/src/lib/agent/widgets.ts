export type AgentWidgetCell = string | number | boolean | null

export interface DataTableWidgetColumn {
  key: string
  header: string
}

export interface DataTableWidget {
  kind: 'data_table'
  title: string
  columns: DataTableWidgetColumn[]
  rows: Record<string, AgentWidgetCell>[]
}

export interface DataInsightWidget {
  kind: 'data_insight'
  title: string
  value: AgentWidgetCell
  label?: string
  detail?: string
}

export interface DataChartWidget {
  kind: 'data_chart'
  title: string
  xKey: string
  yKey: string
  points: Record<string, AgentWidgetCell>[]
}

export type AgentWidget = DataTableWidget | DataInsightWidget | DataChartWidget

interface QueryEntityWidgetInput {
  entity?: unknown
  columns?: unknown
  as?: unknown
}

interface QueryEntityResult {
  rowCount?: unknown
  rows?: unknown
  error?: unknown
}

const MAX_WIDGET_COLUMNS = 12
const MAX_WIDGET_POINTS = 50

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrimitiveCell(value: unknown): value is AgentWidgetCell {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function coerceCell(value: unknown): AgentWidgetCell {
  if (isPrimitiveCell(value)) return value
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function titleFromEntity(entity: string): string {
  return humanizeKey(entity)
}

export function isAgentWidget(payload: unknown): payload is AgentWidget {
  if (!isRecord(payload) || typeof payload.kind !== 'string') return false

  if (payload.kind === 'data_table') {
    if (typeof payload.title !== 'string' || !payload.title.trim()) return false
    if (!Array.isArray(payload.columns) || payload.columns.length === 0) return false
    if (!Array.isArray(payload.rows)) return false

    const columns = payload.columns
    if (!columns.every((column) =>
      isRecord(column) &&
      typeof column.key === 'string' &&
      column.key.trim().length > 0 &&
      typeof column.header === 'string' &&
      column.header.trim().length > 0,
    )) return false

    const keys = new Set(columns.map((column) => (column as DataTableWidgetColumn).key))
    return payload.rows.every((row) =>
      isRecord(row) &&
      [...keys].every((key) => Object.prototype.hasOwnProperty.call(row, key) && isPrimitiveCell(row[key])),
    )
  }

  if (payload.kind === 'data_insight') {
    return (
      typeof payload.title === 'string' &&
      payload.title.trim().length > 0 &&
      isPrimitiveCell(payload.value) &&
      (payload.label === undefined || typeof payload.label === 'string') &&
      (payload.detail === undefined || typeof payload.detail === 'string')
    )
  }

  if (payload.kind === 'data_chart') {
    if (
      typeof payload.title !== 'string' ||
      !payload.title.trim() ||
      typeof payload.xKey !== 'string' ||
      typeof payload.yKey !== 'string' ||
      !Array.isArray(payload.points)
    ) return false
    const xKey = payload.xKey
    const yKey = payload.yKey
    return payload.points.every((point) =>
      isRecord(point) &&
      Object.prototype.hasOwnProperty.call(point, xKey) &&
      Object.prototype.hasOwnProperty.call(point, yKey) &&
      isPrimitiveCell(point[xKey]) &&
      isPrimitiveCell(point[yKey]),
    )
  }

  return false
}

export function buildDataTableWidgetFromQueryResult(
  input: QueryEntityWidgetInput,
  result: QueryEntityResult,
): DataTableWidget | null {
  if (input.as !== 'table' || result.error !== undefined || !Array.isArray(result.rows)) return null
  const sourceRows = result.rows.filter(isRecord)
  const requestedColumns = Array.isArray(input.columns)
    ? input.columns.filter((column): column is string => typeof column === 'string' && column.trim().length > 0)
    : []
  const fallbackColumns = sourceRows[0] ? Object.keys(sourceRows[0]) : []
  const keys = (requestedColumns.length > 0 ? requestedColumns : fallbackColumns).slice(0, MAX_WIDGET_COLUMNS)
  if (keys.length === 0) return null

  const widget: DataTableWidget = {
    kind: 'data_table',
    title: typeof input.entity === 'string' && input.entity ? titleFromEntity(input.entity) : 'Results',
    columns: keys.map((key) => ({ key, header: humanizeKey(key) })),
    rows: sourceRows.map((row) =>
      Object.fromEntries(keys.map((key) => [key, coerceCell(row[key])])) as Record<string, AgentWidgetCell>,
    ),
  }

  return isAgentWidget(widget) ? widget : null
}

/** Number guard (rejects NaN). */
function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/** Coerce a `query_entity` result into a single-headline insight widget, or null.
 *  Fail-closed: never throws; returns null unless as:'insight', no error, and >=1 row. */
export function buildInsightWidgetFromQueryResult(
  input: QueryEntityWidgetInput,
  result: QueryEntityResult,
): DataInsightWidget | null {
  if (input.as !== 'insight' || result.error !== undefined || !Array.isArray(result.rows)) return null
  const sourceRows = result.rows.filter(isRecord)
  if (sourceRows.length === 0) return null

  const firstRow = sourceRows[0]
  const requestedColumns = Array.isArray(input.columns)
    ? input.columns.filter((column): column is string => typeof column === 'string' && column.trim().length > 0)
    : []

  // Headline scalar = first requested column else the first numeric field of rows[0].
  let columnKey: string | null = null
  if (requestedColumns.length > 0) {
    columnKey = requestedColumns[0]
  } else {
    columnKey = Object.keys(firstRow).find((key) => isNumeric(firstRow[key])) ?? null
  }
  if (columnKey === null || !(columnKey in firstRow)) return null

  const rowCount = typeof result.rowCount === 'number' ? result.rowCount : sourceRows.length
  const widget: DataInsightWidget = {
    kind: 'data_insight',
    title: typeof input.entity === 'string' && input.entity ? titleFromEntity(input.entity) : 'Insight',
    value: coerceCell(firstRow[columnKey]),
    label: humanizeKey(columnKey),
    detail: `${rowCount} row${rowCount === 1 ? '' : 's'}`,
  }

  return isAgentWidget(widget) ? widget : null
}

/** Coerce a `query_entity` result into a short-series chart widget, or null.
 *  Fail-closed: never throws; returns null unless as:'chart', no error, >=1 row, and >=1 numeric y point. */
export function buildChartWidgetFromQueryResult(
  input: QueryEntityWidgetInput,
  result: QueryEntityResult,
): DataChartWidget | null {
  if (input.as !== 'chart' || result.error !== undefined || !Array.isArray(result.rows)) return null
  const sourceRows = result.rows.filter(isRecord)
  if (sourceRows.length === 0) return null

  const firstRow = sourceRows[0]
  const rowKeys = Object.keys(firstRow)
  const requestedColumns = Array.isArray(input.columns)
    ? input.columns.filter((column): column is string => typeof column === 'string' && column.trim().length > 0)
    : []

  // xKey = input.columns[0] else the first field; yKey = input.columns[1] else first numeric field != xKey.
  const xKey = requestedColumns[0] ?? rowKeys[0]
  if (xKey === undefined) return null
  let yKey: string | null = null
  if (requestedColumns.length > 1) {
    yKey = requestedColumns[1]
  } else {
    yKey = rowKeys.find((key) => key !== xKey && isNumeric(firstRow[key])) ?? null
  }
  if (yKey === null || yKey === xKey) return null

  // points = rows mapped to {xKey, yKey}; non-numeric y rows are dropped; fail closed if none numeric.
  const points: Record<string, AgentWidgetCell>[] = []
  for (const row of sourceRows) {
    const y = row[yKey]
    if (!isNumeric(y)) continue
    points.push({ [xKey]: coerceCell(row[xKey]), [yKey]: y })
  }
  if (points.length === 0) return null

  const widget: DataChartWidget = {
    kind: 'data_chart',
    title: typeof input.entity === 'string' && input.entity ? titleFromEntity(input.entity) : 'Chart',
    xKey,
    yKey,
    points: points.slice(0, MAX_WIDGET_POINTS),
  }

  return isAgentWidget(widget) ? widget : null
}
