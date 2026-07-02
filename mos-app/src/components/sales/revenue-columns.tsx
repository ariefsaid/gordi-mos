// revenueColumns — sales composition column defs for the general DataTable primitive
// (design-plan §2.3 "Data-contract" — a future ops table reuses DataTable with
// different columns; this one supplies the branch/activity/channel/revenue/txns/
// share/avg column defs + IDR formatting). FR-009. Full grouped rupiah in table
// cells (Q3 resolved — compact only in the KPI headline).
import type { DataTableColumn } from '@/components/dashboard/data-table'
import type { RevenueTableRow } from '@/lib/sales-dashboard'
import { formatIDRFull } from '@/lib/sales-dashboard'
import type { DashboardCut } from '@/lib/sales-dashboard'

export function revenueColumns(cut: DashboardCut): DataTableColumn<RevenueTableRow>[] {
  return [
    { key: 'dimension', header: cut, cardLabel: '' },
    { key: 'channel', header: 'Channel' },
    {
      key: 'revenue',
      header: 'Revenue',
      numeric: true,
      sortable: true,
      render: row => formatIDRFull(row.revenue),
    },
    {
      key: 'transactions',
      header: 'Transactions',
      numeric: true,
      sortable: true,
    },
    {
      key: 'sharePct',
      header: 'Share',
      numeric: true,
      sortable: true,
      render: row => `${row.sharePct}%`,
    },
    {
      key: 'avgRevenuePerTxn',
      header: 'Avg rev/txn',
      numeric: true,
      sortable: true,
      render: row => formatIDRFull(row.avgRevenuePerTxn),
    },
  ]
}
