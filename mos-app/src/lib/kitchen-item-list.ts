import { useMemo } from 'react'
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  useReactTable,
  type ColumnDef,
  type GroupingState,
  type Table,
} from '@tanstack/react-table'
import type { DataTableGroup } from '@/components/dashboard/data-table'

export type KitchenItemKind = 'RAW' | 'WIP'
export type KitchenItemKindFilter = 'All' | KitchenItemKind

// #1287 adds the team-classified RAW stream items used by transfer capture.
export const RAW_ITEMS_ENABLED = true
export const KITCHEN_KIND_FILTER_OPTIONS: readonly KitchenItemKindFilter[] = RAW_ITEMS_ENABLED
  ? ['All', 'WIP', 'RAW']
  : ['All', 'WIP']
export const WIP_KIND_FILTER_OPTIONS: readonly KitchenItemKindFilter[] = ['All', 'WIP']

export interface KitchenListMetadata {
  rowId: string
  kind: KitchenItemKind
  itemName: string
  category: string | null
  groupKey: string
}

export type KitchenListRow<Row> = Row & KitchenListMetadata

export function kitchenItemLabel(kind: KitchenItemKind, name: string): string {
  return `${kind} - ${name}`
}

export function toKitchenListRows<Row>(
  rows: readonly Row[],
  metadata: {
    kind: KitchenItemKind
    getId: (row: Row, index: number) => string
    getKind?: (row: Row, index: number) => KitchenItemKind
    getName: (row: Row) => string
    getCategory: (row: Row) => string | null | undefined
    getGroupKey: (row: Row) => string
  },
): KitchenListRow<Row>[] {
  return rows.map((row, index) => ({
    ...row,
    rowId: metadata.getId(row, index),
    kind: metadata.getKind?.(row, index) ?? metadata.kind,
    itemName: metadata.getName(row),
    category: metadata.getCategory(row) ?? null,
    groupKey: metadata.getGroupKey(row),
  }))
}

export function useKitchenItemTable<Row extends KitchenListMetadata>({
  data,
  search,
  kind,
  category,
}: {
  data: Row[]
  search: string
  kind: KitchenItemKindFilter
  category: string
}): Table<Row> {
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'kind', id: 'kind', filterFn: 'equalsString' },
    { accessorKey: 'category', id: 'category', filterFn: 'equalsString' },
    { accessorKey: 'itemName', id: 'itemName' },
    { accessorKey: 'groupKey', id: 'groupKey' },
  ], [])
  const columnFilters = useMemo(
    () => [
      ...(kind === 'All' ? [] : [{ id: 'kind', value: kind }]),
      ...(category === 'All' ? [] : [{ id: 'category', value: category }]),
    ],
    [category, kind],
  )
  const grouping = useMemo<GroupingState>(() => ['groupKey'], [])

  return useReactTable({
    data,
    columns,
    state: { globalFilter: search.trim(), columnFilters, grouping },
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLocaleLowerCase()
      return !query || row.original.itemName.toLocaleLowerCase().includes(query)
    },
    getRowId: row => row.rowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })
}

export function kitchenDataTableGroups<Row extends KitchenListMetadata>(
  table: Table<Row>,
  labelFor: (groupKey: string) => string | null,
  optionsFor?: (groupKey: string) => Pick<DataTableGroup<Row>, 'hint'> | undefined,
): DataTableGroup<Row>[] {
  return table.getGroupedRowModel().rows.map(group => {
    const groupKey = String(group.getValue('groupKey'))
    return {
      key: groupKey,
      label: labelFor(groupKey),
      count: group.getLeafRows().length,
      rows: group.getLeafRows().map(row => row.original),
      ...optionsFor?.(groupKey),
    }
  })
}
