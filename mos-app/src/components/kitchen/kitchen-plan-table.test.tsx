// C2 (OD-K-5 redesign §4.2/§4.6): KitchenPlanTable — the desktop editable plan <table>.
// Columns: Dish (name + category sub-label) · Plan (PlanQtyCell, right-aligned tabular).
// Groups by category (F2 populates categories) via <KitchenGroupHeader variant=table>.
// Owns client search + category filter via <KitchenToolbar>. Empty-filter message.
// Imports the shared kitchen-table.css grammar (.kt-*). One-Blue: only the focused
// qty-cell input. Token-only (DESIGN.md).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { KitchenPlanTable } from './kitchen-plan-table'
import type { WipItemOption } from '@/lib/db/kitchen-logs.types'

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Gulai', category: 'Chicken' },
  { id: 'w2', name: 'Ayam Woku', category: 'Chicken' },
  { id: 'w3', name: 'Nasi Putih', category: 'Rice/Staple' },
  { id: 'w4', name: 'Cumi Cabe Ijo', category: 'Seafood' },
]

function renderTable(over: Partial<Parameters<typeof KitchenPlanTable>[0]> = {}) {
  return render(
    <KitchenPlanTable
      items={ITEMS}
      qtyOf={() => 0}
      savingId={null}
      disabled={false}
      onSave={() => {}}
      search=""
      onSearchChange={() => {}}
      category="All"
      onCategoryChange={() => {}}
      {...over}
    />,
  )
}

describe('KitchenPlanTable — structure', () => {
  it('renders a labelled semantic table with Dish + Plan column headers', () => {
    renderTable()
    const table = screen.getByRole('table')
    expect(table).toHaveAccessibleName(/kitchen plan/i)
    expect(within(table).getByRole('columnheader', { name: /dish/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /plan/i })).toBeInTheDocument()
  })

  it('renders one editable PlanQtyCell (spinbutton) per dish', () => {
    renderTable()
    expect(screen.getAllByRole('spinbutton').length).toBe(ITEMS.length)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeInTheDocument()
  })

  it('the Plan column header is right-aligned (numeric)', () => {
    renderTable()
    const planTh = screen.getByRole('columnheader', { name: /plan/i })
    expect(planTh.className).toContain('kt-th-num')
  })
})

describe('KitchenPlanTable — groups by category', () => {
  it('renders a group header per category with its dish count', () => {
    const { container } = renderTable()
    // the three group-header labels (structural-navy), distinct from the <option>s
    const groupLabels = container.querySelectorAll('.kgh-label')
    const labelTexts = Array.from(groupLabels).map(el => el.textContent)
    expect(labelTexts).toEqual(['Chicken', 'Rice/Staple', 'Seafood'])
    // each group header carries a tabular count of its dishes
    const counts = Array.from(container.querySelectorAll('.kgh-count')).map(el => el.textContent)
    expect(counts).toContain('2') // Chicken has 2
  })

  it('shows the category as a sub-label on each dish row', () => {
    renderTable()
    // the dish's category caption renders (F2 populates categories)
    expect(screen.getByText('Ayam Gulai')).toBeInTheDocument()
  })
})

describe('KitchenPlanTable — search + category filter', () => {
  it('search filters dishes by name (toolbar owns the searchbox)', () => {
    renderTable({ search: 'ayam' })
    // both Ayam dishes match; Cumi + Nasi do not
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam woku/i })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: /planned quantity for cumi cabe ijo/i })).toBeNull()
  })

  it("category filter narrows to one category's dishes", () => {
    renderTable({ category: 'Seafood' })
    expect(screen.getByRole('spinbutton', { name: /planned quantity for cumi cabe ijo/i })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeNull()
  })

  it('shows an empty-filter message when nothing matches', () => {
    renderTable({ search: 'zzz' })
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByText(/no dishes match your filter/i)).toBeInTheDocument()
  })

  it('the category <select> lists All + the unique sorted categories', () => {
    renderTable()
    const select = screen.getByRole('combobox', { name: /category/i })
    const options = within(select).getAllByRole('option').map(o => o.textContent)
    expect(options[0]).toBe('All')
    expect(options).toEqual(['All', 'Chicken', 'Rice/Staple', 'Seafood'])
  })
})

describe('KitchenPlanTable — null-category (staging/prod data has no categories)', () => {
  const NULL_CAT_ITEMS: WipItemOption[] = [
    { id: 'w1', name: 'Ayam Gulai', category: null },
    { id: 'w2', name: 'Nasi Putih', category: null },
    { id: 'w3', name: 'Cumi Cabe Ijo', category: null },
  ]

  it('renders all dish rows when every item has category=null (no silent drop)', () => {
    renderTable({ items: NULL_CAT_ITEMS, category: 'All' })
    // All three spinbuttons must render — not silently dropped by the group filter
    expect(screen.getAllByRole('spinbutton').length).toBe(3)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for cumi cabe ijo/i })).toBeInTheDocument()
  })

  it('does NOT show the empty-filter message when items exist but all have category=null', () => {
    renderTable({ items: NULL_CAT_ITEMS, category: 'All' })
    expect(screen.queryByText(/no dishes match your filter/i)).toBeNull()
  })

  it('category dropdown shows only "All" when no item has a category', () => {
    renderTable({ items: NULL_CAT_ITEMS, category: 'All' })
    const select = screen.getByRole('combobox', { name: /category/i })
    const options = within(select).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['All'])
  })

  it('mixed: items with and without category both render (no drop of uncategorized)', () => {
    const MIXED: WipItemOption[] = [
      { id: 'w1', name: 'Ayam Gulai', category: 'Chicken' },
      { id: 'w2', name: 'Nasi Putih', category: null },
    ]
    renderTable({ items: MIXED, category: 'All' })
    expect(screen.getAllByRole('spinbutton').length).toBe(2)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeInTheDocument()
  })
})

describe('KitchenPlanTable — onSave wiring (per-cell)', () => {
  it('increasing a qty calls onSave(itemId, qty+1)', () => {
    const onSave = vi.fn()
    const qtyOf = (id: string) => (id === 'w1' ? 10 : 0)
    renderTable({ onSave, qtyOf })
    fireEvent.click(screen.getByRole('button', { name: /increase ayam gulai planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith('w1', 11)
  })

  it('reflects the committed qty from qtyOf in each cell', () => {
    const qtyOf = (id: string) => (id === 'w3' ? 50 : 0)
    renderTable({ qtyOf })
    expect(screen.getByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toHaveValue(50)
  })

  it('marks the saving cell with an inline "Saving…" status', () => {
    renderTable({ savingId: 'w1' })
    expect(screen.getByText(/saving/i)).toBeInTheDocument()
  })

  it('disables every cell when disabled=true', () => {
    renderTable({ disabled: true })
    screen.getAllByRole('spinbutton').forEach(input => expect(input).toBeDisabled())
  })
})
