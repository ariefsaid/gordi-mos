// E1 (OD-K-5 redesign §6.2 KS-1): KitchenStockTable — the desktop read-only stock table.
// Columns: Dish · Stok · Tersedia (both right-aligned tabular). Negatives → .kt-neg
// (AA-darkened tint), value NEVER clamped (FR-061/AC-032). Owns a search-mini via
// <KitchenToolbar>. Imports the shared kitchen-table.css grammar (.kt-*).
//
// PARITY NOTE (flagged): the plan §6.5 asks for category grouping + a category filter
// on Stock, but KitchenStockRow carries NO category (fetchKitchenStock drops it), and
// invariant #1 forbids touching the data layer. So this table is a flat list with a
// search-only toolbar (no category select/grouping). The fix — exposing the already-
// fetched category in fetchKitchenStock's return — is an owner/Director call.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { KitchenStockTable } from './kitchen-stock-table'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

const ROWS: KitchenStockRow[] = [
  { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', stok: 12, tersedia: 8 },
  { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', stok: -3, tersedia: -3 },
  { wip_item_id: 'w3', wip_item_name: 'Risoles', stok: 0, tersedia: 5 },
]

function renderTable(over: Partial<Parameters<typeof KitchenStockTable>[0]> = {}) {
  return render(
    <KitchenStockTable
      rows={ROWS}
      asOf="2026-06-22"
      search=""
      onSearchChange={() => {}}
      {...over}
    />,
  )
}

describe('KitchenStockTable — structure (read-only)', () => {
  it('renders a labelled semantic table naming the two cuts + the date', () => {
    renderTable()
    const table = screen.getByRole('table')
    expect(table).toHaveAccessibleName(/kitchen stock/i)
    expect(table).toHaveAccessibleName(/2026-06-22/)
  })

  it('renders Stok + Tersedia column headers (both right-aligned)', () => {
    renderTable()
    const stokTh = screen.getByRole('columnheader', { name: /stok/i })
    const tersediaTh = screen.getByRole('columnheader', { name: /tersedia/i })
    expect(stokTh.className).toContain('kt-th-num')
    expect(tersediaTh.className).toContain('kt-th-num')
  })

  it('renders one row per stock item with both numbers', () => {
    renderTable()
    const ayam = screen.getByText('Ayam Bakar').closest('tr')!
    expect(within(ayam).getByText('12')).toBeInTheDocument()
    expect(within(ayam).getByText('8')).toBeInTheDocument()
  })
})

describe('KitchenStockTable — AC-032: negatives preserved + tinted (never clamped)', () => {
  it('shows the literal negative value (not clamped to 0)', () => {
    renderTable()
    const nasi = screen.getByText('Nasi Goreng').closest('tr')!
    // stok=-3 AND tersedia=-3 → both shown literally (never clamped)
    expect(within(nasi).getAllByText('-3').length).toBe(2)
  })

  it('tints negative cells with .kt-neg (AA-darkened red, not base --destructive)', () => {
    renderTable()
    const nasi = screen.getByText('Nasi Goreng').closest('tr')!
    const negCells = within(nasi).getAllByText('-3')
    expect(negCells.length).toBeGreaterThan(0)
    // each negative cell carries the .kt-neg tint class
    negCells.forEach(cell => {
      expect((cell.closest('td') ?? cell).className).toContain('kt-neg')
    })
  })

  it('does NOT tint zero values as negative', () => {
    renderTable()
    const risoles = screen.getByText('Risoles').closest('tr')!
    const zeroCell = within(risoles).getByText('0')
    expect((zeroCell.closest('td') ?? zeroCell).className).not.toContain('kt-neg')
  })
})

describe('KitchenStockTable — search filter', () => {
  it('search filters items by name', () => {
    renderTable({ search: 'ayam' })
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
    expect(screen.queryByText('Risoles')).toBeNull()
  })

  it('shows an empty-filter message when nothing matches', () => {
    renderTable({ search: 'zzz' })
    expect(screen.queryByRole('row')).toBeNull()
    expect(screen.getByText(/no items match your filter/i)).toBeInTheDocument()
  })
})

describe('KitchenStockTable — read-only (FR-060/061)', () => {
  it('renders NO edit / save / transfer / produce control', () => {
    renderTable()
    expect(screen.queryByRole('button', { name: /save|edit|transfer|produce|approve|submit/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('does NOT render a category filter (KitchenStockRow has no category — parity)', () => {
    renderTable()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('KitchenStockTable — edge: empty rows', () => {
  it('renders the empty-filter message when there are no rows', () => {
    renderTable({ rows: [] })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/no items|no stock|nothing/i)).toBeInTheDocument()
  })

  it('onSearchChange fires on type', () => {
    const onSearchChange = vi.fn()
    renderTable({ onSearchChange })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'aya' } })
    expect(onSearchChange).toHaveBeenCalledWith('aya')
  })
})
