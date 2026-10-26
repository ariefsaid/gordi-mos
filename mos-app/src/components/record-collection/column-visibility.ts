import type { VisibilityState } from '@tanstack/react-table'

export interface ColumnVisibilityDefinition {
  id: string
  meta?: { field?: string }
}

/** One mapping for chooser preferences, table columns, and columns retained by current data. */
export function columnVisibilityState(
  columns: readonly ColumnVisibilityDefinition[],
  visibleFields: readonly string[],
  forcedVisibleIds: readonly string[] = [],
): VisibilityState {
  const visible = new Set(visibleFields)
  const forced = new Set(forcedVisibleIds)
  return Object.fromEntries(columns.map((column) => [
    column.id,
    column.meta?.field === undefined || visible.has(column.meta.field) || forced.has(column.id),
  ]))
}
