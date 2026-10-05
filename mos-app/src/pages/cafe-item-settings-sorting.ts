import { useMemo } from 'react'
import type { SortingState } from '@tanstack/react-table'
import type { DataTableSort } from '@/components/dashboard/data-table'

export function useCafeItemSettingsSorting(listSort: DataTableSort | undefined): SortingState {
  return useMemo(() => listSort
    ? [{ id: listSort.key, desc: listSort.dir === 'desc' }]
    : [], [listSort])
}
