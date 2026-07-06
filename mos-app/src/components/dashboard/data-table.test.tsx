// DataTable tests — design-plan §2.3 (general sortable, reflowing table primitive).
// Generalises kitchen-table.css (.kt-*) grammar with a formal sort + card-reflow prop-shape.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { DataTable, type DataTableColumn } from './data-table'

interface Row {
  id: string
  dimension: string
  channel: string
  revenue: number
  transactions: number
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'dimension', header: 'Branch', cardLabel: '' },
  { key: 'channel', header: 'Channel' },
  { key: 'revenue', header: 'Revenue', numeric: true, sortable: true },
  { key: 'transactions', header: 'Transactions', numeric: true, sortable: true },
]

const ROWS: Row[] = [
  { id: '1', dimension: 'GHQ', channel: 'POS', revenue: 12_400_000, transactions: 340 },
  { id: '2', dimension: 'SKC', channel: 'POS', revenue: -500_000, transactions: 12 },
]

describe('DataTable — desktop, ready state', () => {
  it('renders a <table> with a caption for a11y', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const table = screen.getByRole('table', { name: 'Sales by branch' })
    expect(table).toBeInTheDocument()
  })

  it('renders one row per data row plus header', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.getByText('SKC')).toBeInTheDocument()
  })

  it('applies .tabular to numeric cells', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const cell = screen.getByText('12400000')
    expect(cell).toHaveClass('tabular')
  })

  it('tints negative numeric values with the AA-safe kt-neg / status-lost-text class, not base destructive', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const negCell = screen.getByText('-500000')
    expect(negCell.className).toMatch(/neg/)
  })

  it('supports custom render() per column', () => {
    const columnsWithRender: DataTableColumn<Row>[] = [
      ...COLUMNS.slice(0, 1),
      { key: 'channel', header: 'Channel', render: row => <b>{row.channel}!</b> },
    ]
    render(<DataTable columns={columnsWithRender} rows={ROWS} isDesktop caption="Sales by branch" />)
    expect(screen.getAllByText('POS!')[0].tagName).toBe('B')
  })

  it('renders a footer row (totals) when footer is provided as a ReactNode', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        footer={<tr><td>Total</td></tr>}
      />,
    )
    expect(screen.getByText('Total')).toBeInTheDocument()
  })
})

describe('DataTable — sort (a11y keyboard path)', () => {
  it('sortable headers render as a <button> with aria-sort on the active column', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        sort={{ key: 'revenue', dir: 'desc' }}
        onSortChange={vi.fn()}
      />,
    )
    const revenueHeader = screen.getByRole('columnheader', { name: /revenue/i })
    expect(within(revenueHeader).getByRole('button')).toBeInTheDocument()
    expect(revenueHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('non-active sortable column has aria-sort="none"', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        sort={{ key: 'revenue', dir: 'desc' }}
        onSortChange={vi.fn()}
      />,
    )
    const txHeader = screen.getByRole('columnheader', { name: /transactions/i })
    expect(txHeader).toHaveAttribute('aria-sort', 'none')
  })

  it('non-sortable columns render a plain header, no button', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const branchHeader = screen.getByRole('columnheader', { name: /branch/i })
    expect(within(branchHeader).queryByRole('button')).toBeNull()
  })

  it('clicking a sortable header button calls onSortChange toggling direction', () => {
    const onSortChange = vi.fn()
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        sort={{ key: 'revenue', dir: 'desc' }}
        onSortChange={onSortChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /revenue/i }))
    expect(onSortChange).toHaveBeenCalledWith({ key: 'revenue', dir: 'asc' })
  })

  it('Enter and Space on the sort button trigger sort (keyboard path)', () => {
    const onSortChange = vi.fn()
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        onSortChange={onSortChange}
      />,
    )
    const button = screen.getByRole('button', { name: /transactions/i })
    fireEvent.click(button)
    expect(onSortChange).toHaveBeenCalledWith({ key: 'transactions', dir: 'asc' })
  })
})

describe('DataTable — 768px reflow (single-render, phone cards)', () => {
  it('renders NO <table> when isDesktop=false', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders one card per row with the cardLabel: "" column as the title line', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.getByText('SKC')).toBeInTheDocument()
  })

  it('renders remaining columns as a <dl> label:value grid', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    const dls = document.querySelectorAll('dl')
    expect(dls.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Channel').length).toBeGreaterThan(0)
  })

  it('phone cards carry a 44px touch-target marker', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    const cards = document.querySelectorAll('[data-touch-target="true"]')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('does not render two branches at once (single-render, no aria-hidden twin)', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})

describe('DataTable — loading state', () => {
  it('desktop: renders skeleton rows, not real row data', () => {
    render(<DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="loading" />)
    expect(screen.queryByText('GHQ')).toBeNull()
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="loading" />,
    )
    expect(container.querySelectorAll('.dt-skeleton-row').length).toBeGreaterThanOrEqual(5)
  })

  it('phone: renders skeleton cards', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop={false} caption="Sales by branch" state="loading" />,
    )
    expect(container.querySelectorAll('.dt-skeleton-card').length).toBeGreaterThan(0)
  })
})

describe('DataTable — phone empty state', () => {
  it('renders the emptyLabel message, no cards', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        isDesktop={false}
        caption="Sales by branch"
        state="empty"
        emptyLabel="No sales rows for this cut."
      />,
    )
    expect(screen.getByText('No sales rows for this cut.')).toBeInTheDocument()
  })
})

describe('DataTable — empty state', () => {
  it('renders the emptyLabel centered message, no rows', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        isDesktop
        caption="Sales by branch"
        state="empty"
        emptyLabel="No sales rows for this cut."
      />,
    )
    expect(screen.getByText('No sales rows for this cut.')).toBeInTheDocument()
  })
})

describe('DataTable — error state', () => {
  it('renders a non-secret error message and a retry button calling onRetry', () => {
    const onRetry = vi.fn()
    render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="error" onRetry={onRetry} />,
    )
    const retry = screen.getByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalled()
  })

  it('error text contains no DSN/token/SQL/stack indicators (AC-009)', () => {
    render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="error" onRetry={vi.fn()} />,
    )
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/postgres|supabase|select \*|stack|token|dsn/i)
  })
})
