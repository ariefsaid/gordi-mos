// The catalog list's one column list (Projects & Processes and Objectives). The header row comes
// from table.getHeaderGroups() and each row's metadata cells from getVisibleLeafColumns(); both
// read this list, so the two cannot disagree on which columns exist or their order.
import type { ColumnDef, RowData } from '@tanstack/react-table'
import type { MessageKey } from '@/i18n/messages'
import type { CatalogRow } from './catalog-collection-adapter'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TanStack's interface shape fixes the generics; the augmentation carries only data.
  interface ColumnMeta<TData extends RowData, TValue> {
    // Header label on an Objectives list, where it differs from `labelKey`.
    objectiveLabelKey?: MessageKey
  }
}

export type CatalogColumnId = 'name' | 'relation' | 'owner' | 'cadence' | 'progress' | 'activity'
export type CatalogColumnDef = ColumnDef<CatalogRow> & { id: CatalogColumnId }

// `tdClass` is the row cell's hook class; the Name cell is the row's identity, not a metadata cell.
export const CATALOG_COLUMN_DEFS: CatalogColumnDef[] = [
  { id: 'name', meta: { labelKey: 'catalog.column.name', thClass: '', tdClass: '' } },
  {
    id: 'relation',
    meta: {
      labelKey: 'catalog.column.objective', objectiveLabelKey: 'catalog.column.businessUnit',
      thClass: 'catalog-collection__header-cell--relation', tdClass: 'catalog-collection__cell--relation',
    },
  },
  {
    id: 'owner',
    meta: {
      labelKey: 'catalog.column.accountable',
      thClass: 'catalog-collection__header-cell--owner', tdClass: 'catalog-collection__cell--owner',
    },
  },
  {
    id: 'cadence',
    meta: {
      labelKey: 'catalog.column.cadenceDue', objectiveLabelKey: 'catalog.column.work',
      thClass: 'catalog-collection__header-cell--cadence', tdClass: 'catalog-collection__cell--cadence',
    },
  },
  {
    id: 'progress',
    meta: {
      labelKey: 'catalog.column.progress',
      thClass: 'catalog-collection__header-cell--progress', tdClass: 'catalog-collection__cell--progress',
    },
  },
  {
    id: 'activity',
    meta: {
      labelKey: 'catalog.column.activity',
      thClass: 'catalog-collection__header-cell--activity', tdClass: 'catalog-collection__cell--activity',
    },
  },
]
