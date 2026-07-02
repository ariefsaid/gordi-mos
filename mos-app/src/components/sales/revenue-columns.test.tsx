// revenueColumns — sales composition column defs fed to the general DataTable
// primitive (design-plan §2.3 "Data-contract"). Branch/Activity dimension label
// changes with the caller-supplied header only; IDR formatting lives here (never
// in the primitive).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataTable } from '@/components/dashboard/data-table'
import { revenueColumns } from './revenue-columns'
import type { RevenueTableRow } from '@/lib/sales-dashboard'

const ROWS: RevenueTableRow[] = [
  {
    id: 'Gordi Roastery-B2B',
    dimension: 'Gordi Roastery',
    channel: 'B2B',
    revenue: 4_500_000,
    transactions: 12,
    sharePct: 26.8,
    avgRevenuePerTxn: 375_000,
  },
]

describe('revenueColumns', () => {
  it('renders full grouped-rupiah revenue in the table cell (not compact)', () => {
    render(
      <DataTable columns={revenueColumns('Branch')} rows={ROWS} isDesktop caption="Revenue by branch" />,
    )
    expect(screen.getByText('Rp 4.500.000')).toBeInTheDocument()
  })

  it('renders share-of-total as a percentage', () => {
    render(
      <DataTable columns={revenueColumns('Branch')} rows={ROWS} isDesktop caption="Revenue by branch" />,
    )
    expect(screen.getByText('26.8%')).toBeInTheDocument()
  })

  it('renders avg revenue per transaction as full rupiah', () => {
    render(
      <DataTable columns={revenueColumns('Branch')} rows={ROWS} isDesktop caption="Revenue by branch" />,
    )
    expect(screen.getByText('Rp 375.000')).toBeInTheDocument()
  })

  it('labels the dimension column header by cut (Branch vs Activity)', () => {
    const { rerender } = render(
      <DataTable columns={revenueColumns('Branch')} rows={ROWS} isDesktop caption="Revenue by branch" />,
    )
    expect(screen.getByRole('columnheader', { name: /branch/i })).toBeInTheDocument()

    rerender(
      <DataTable columns={revenueColumns('Activity')} rows={ROWS} isDesktop caption="Revenue by activity" />,
    )
    expect(screen.getByRole('columnheader', { name: /activity/i })).toBeInTheDocument()
  })

  it('numeric cells carry the .tabular class', () => {
    render(
      <DataTable columns={revenueColumns('Branch')} rows={ROWS} isDesktop caption="Revenue by branch" />,
    )
    const cell = screen.getByText('Rp 4.500.000')
    expect(cell.closest('.tabular')).not.toBeNull()
  })
})
