// KitchenLogTable — the desktop <table> (plan §4.1 N7, §8.1).
// Sticky <thead> (5 cols), Planned/Off-plan <KitchenGroupHeader>s, <KitchenLogRow>
// per visible dish. Owns client-side search + category filter (props in → filtered rows).
// Loading = table-shape skeleton; empty filtered = <EmptyState>. Group collapse hides rows.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { KitchenLogTable } from './kitchen-log-table'
import type { WipItemOption, KitchenLogLine } from '@/lib/db/kitchen-logs.types'

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Nasi Putih', category: 'Rice' },
  { id: 'w2', name: 'Risoles', category: 'Snack' },
  { id: 'w3', name: 'Ayam Suwir', category: 'Main' }, // off-plan (no Production plan)
]

function lines(): Record<string, KitchenLogLine> {
  return {
    w1: { wip_item_id: 'w1', qty_porsi: 48, notes: '', plan_qty: 50, stok: 30, tersedia: 30, dirty: true, error: '', capError: '' },
    w2: { wip_item_id: 'w2', qty_porsi: 36, notes: '', plan_qty: 30, stok: 0, tersedia: 0, dirty: true, error: '', capError: '' },
    w3: { wip_item_id: 'w3', qty_porsi: 12, notes: 'extra', plan_qty: 0, stok: 0, tersedia: 0, dirty: true, error: '', capError: '' },
  }
}

function renderTable(over: Partial<Parameters<typeof KitchenLogTable>[0]> = {}) {
  return render(
    <KitchenLogTable
      items={ITEMS}
      lines={lines()}
      search=""
      category="All"
      collapsedGroups={new Set<string>()}
      onQtyChange={() => {}}
      onNotesChange={() => {}}
      onToggleGroup={() => {}}
      onSearchChange={() => {}}
      onCategoryChange={() => {}}
      {...over}
    />,
  )
}

describe('KitchenLogTable — structure', () => {
  it('renders a labelled <table> with 5 column headers', () => {
    renderTable()
    const table = screen.getByRole('table', { name: /kitchen production log/i })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map(h => h.textContent)).toEqual(['Dish', 'Plan', 'Stock', 'Made today', 'Status'])
  })

  it('renders both group headers (Planned today + Off-plan) with counts', () => {
    renderTable()
    expect(screen.getByRole('button', { name: /collapse planned today/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collapse off-plan/i })).toBeInTheDocument()
    // Planned = 2, Off-plan = 1
    const plannedHead = screen.getByRole('button', { name: /collapse planned today/i }).closest('tr')!
    expect(within(plannedHead).getByText('2')).toBeInTheDocument()
  })

  it('renders a KitchenLogRow per visible dish (3 dishes → 3 qty spinbuttons)', () => {
    renderTable()
    const inputs = screen.getAllByRole('spinbutton', { name: /quantity for/i })
    expect(inputs).toHaveLength(3)
  })

  it('renders dish names', () => {
    renderTable()
    expect(screen.getByText('Nasi Putih')).toBeInTheDocument()
    expect(screen.getByText('Risoles')).toBeInTheDocument()
    expect(screen.getByText('Ayam Suwir')).toBeInTheDocument()
  })
})

describe('KitchenLogTable — toolbar (search + category)', () => {
  it('renders the search-mini input', () => {
    renderTable()
    expect(screen.getByRole('searchbox', { name: /find a dish/i })).toBeInTheDocument()
  })

  it('renders the category filter select with "All" + the item categories', () => {
    renderTable()
    const select = screen.getByRole('combobox', { name: /category/i })
    expect(select).toBeInTheDocument()
    const options = within(select).getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual(expect.arrayContaining(['All', 'Rice', 'Snack', 'Main']))
  })

  it('onSearchChange fires when typing', () => {
    const onSearchChange = vi.fn()
    renderTable({ onSearchChange })
    fireEvent.change(screen.getByRole('searchbox', { name: /find a dish/i }), { target: { value: 'nas' } })
    expect(onSearchChange).toHaveBeenCalledWith('nas')
  })

  it('onCategoryChange fires when a category is chosen', () => {
    const onCategoryChange = vi.fn()
    renderTable({ onCategoryChange })
    fireEvent.change(screen.getByRole('combobox', { name: /category/i }), { target: { value: 'Rice' } })
    expect(onCategoryChange).toHaveBeenCalledWith('Rice')
  })

  it('search filters rows by name (only matching dishes get a spinbutton)', () => {
    renderTable({ search: 'nas' }) // matches "Nasi Putih"
    const inputs = screen.getAllByRole('spinbutton', { name: /quantity for/i })
    expect(inputs).toHaveLength(1)
    expect(screen.getByText('Nasi Putih')).toBeInTheDocument()
    expect(screen.queryByText('Risoles')).toBeNull()
  })

  it('category filter narrows rows to that category', () => {
    renderTable({ category: 'Snack' }) // Risoles only
    const inputs = screen.getAllByRole('spinbutton', { name: /quantity for/i })
    expect(inputs).toHaveLength(1)
    expect(screen.getByText('Risoles')).toBeInTheDocument()
  })
})

describe('KitchenLogTable — group collapse', () => {
  it('onToggleGroup fires when a group caret is clicked', () => {
    const onToggleGroup = vi.fn()
    renderTable({ onToggleGroup })
    fireEvent.click(screen.getByRole('button', { name: /collapse planned today/i }))
    expect(onToggleGroup).toHaveBeenCalled()
  })

  it('a collapsed Planned group hides its rows', () => {
    renderTable({ collapsedGroups: new Set(['planned']) })
    // Planned items (Nasi, Risoles) hidden; only off-plan (Ayam Suwir) visible
    expect(screen.queryByText('Nasi Putih')).toBeNull()
    expect(screen.queryByText('Risoles')).toBeNull()
    expect(screen.getByText('Ayam Suwir')).toBeInTheDocument()
  })
})

describe('KitchenLogTable — empty filtered result', () => {
  it('shows an empty message when no dish matches the search', () => {
    renderTable({ search: 'zzz' })
    expect(screen.getByText(/no dishes match/i)).toBeInTheDocument()
  })
})
