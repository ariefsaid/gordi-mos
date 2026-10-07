import { useMemo } from 'react'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type GroupingState,
  type Row as TanStackRow,
  type SortingState,
  type Table,
} from '@tanstack/react-table'
import type { DataTableGroup } from '@/components/dashboard/data-table'

export type KitchenItemKind = 'RAW' | 'WIP' | 'Unclassified'
export type KitchenItemKindFilter = 'All' | KitchenItemKind
export type KitchenItemActiveFilter = 'All' | 'Active' | 'Inactive'
export type KitchenItemNeedsUnitFilter = 'All' | 'Needs unit'

// #1287 adds the team-classified RAW stream items used by transfer capture.
export const RAW_ITEMS_ENABLED = true
export const KITCHEN_KIND_FILTER_OPTIONS: readonly KitchenItemKindFilter[] = RAW_ITEMS_ENABLED
  ? ['All', 'WIP', 'RAW']
  : ['All', 'WIP']
export const WIP_KIND_FILTER_OPTIONS: readonly KitchenItemKindFilter[] = ['All', 'WIP']
export const KITCHEN_ACTIVE_FILTER_OPTIONS: readonly KitchenItemActiveFilter[] = ['All', 'Active', 'Inactive']
export const KITCHEN_NEEDS_UNIT_FILTER_OPTIONS: readonly KitchenItemNeedsUnitFilter[] = ['All', 'Needs unit']

export interface KitchenListMetadata {
  rowId: string
  kind: KitchenItemKind
  itemName: string
  category: string | null
  groupKey: string
  isActive?: boolean
  needsUnit?: boolean
}

export type KitchenListRow<Row> = Row & KitchenListMetadata

export function toKitchenListRows<Row>(
  rows: readonly Row[],
  metadata: {
    kind: KitchenItemKind
    getId: (row: Row, index: number) => string
    getKind?: (row: Row, index: number) => KitchenItemKind
    getName: (row: Row) => string
    getCategory: (row: Row) => string | null | undefined
    getGroupKey: (row: Row) => string
    getActive?: (row: Row) => boolean
    getNeedsUnit?: (row: Row) => boolean
  },
): KitchenListRow<Row>[] {
  return rows.map((row, index) => ({
    ...row,
    rowId: metadata.getId(row, index),
    kind: metadata.getKind?.(row, index) ?? metadata.kind,
    itemName: metadata.getName(row),
    category: metadata.getCategory(row) ?? null,
    groupKey: metadata.getGroupKey(row),
    ...(metadata.getActive ? { isActive: metadata.getActive(row) } : {}),
    ...(metadata.getNeedsUnit ? { needsUnit: metadata.getNeedsUnit(row) } : {}),
  }))
}

export function useKitchenItemTable<Row extends KitchenListMetadata>({
  data,
  search,
  kind,
  category,
  active = 'All',
  needsUnit = 'All',
  sorting,
  onSortingChange,
}: {
  data: Row[]
  search: string
  kind: KitchenItemKindFilter
  category: string
  active?: KitchenItemActiveFilter
  needsUnit?: KitchenItemNeedsUnitFilter
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
}): Table<Row> {
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'kind', id: 'kind', filterFn: 'equalsString' },
    { accessorKey: 'category', id: 'category', filterFn: 'equalsString' },
    { accessorKey: 'isActive', id: 'isActive', filterFn: 'equals' },
    { accessorKey: 'needsUnit', id: 'needsUnit', filterFn: 'equals' },
    { accessorKey: 'itemName', id: 'itemName' },
    { accessorKey: 'groupKey', id: 'groupKey' },
  ], [])
  const columnFilters = useMemo(
    () => [
      ...(kind === 'All' ? [] : [{ id: 'kind', value: kind }]),
      ...(category === 'All' ? [] : [{ id: 'category', value: category }]),
      ...(active === 'All' ? [] : [{ id: 'isActive', value: active === 'Active' }]),
      ...(needsUnit === 'All' ? [] : [{ id: 'needsUnit', value: true }]),
    ],
    [active, category, kind, needsUnit],
  )
  const grouping = useMemo<GroupingState>(() => ['groupKey'], [])

  return useReactTable({
    data,
    columns,
    state: {
      globalFilter: search.trim(),
      columnFilters,
      grouping,
      ...(sorting !== undefined ? { sorting } : {}),
    },
    onSortingChange: onSortingChange
      ? updater => onSortingChange(typeof updater === 'function' ? updater(sorting ?? []) : updater)
      : undefined,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLocaleLowerCase()
      return !query || row.original.itemName.toLocaleLowerCase().includes(query)
    },
    getRowId: row => row.rowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })
}

export function kitchenDataTableGroups<Row extends KitchenListMetadata>(
  table: Table<Row>,
  labelFor: (groupKey: string) => string | null,
  optionsFor?: (groupKey: string) => Pick<DataTableGroup<Row>, 'hint'> | undefined,
): DataTableGroup<Row>[] {
  const leafRows = (rows: TanStackRow<Row>[]): TanStackRow<Row>[] => rows.flatMap(row =>
    row.subRows.length > 0 ? leafRows(row.subRows) : [row],
  )

  return table.getRowModel().rows.map(group => {
    const groupKey = String(group.getValue('groupKey'))
    const rows = leafRows(group.subRows)
    return {
      key: groupKey,
      label: labelFor(groupKey),
      count: rows.length,
      rows: rows.map(row => row.original),
      ...optionsFor?.(groupKey),
    }
  })
}
