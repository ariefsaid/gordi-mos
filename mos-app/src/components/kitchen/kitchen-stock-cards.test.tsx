// E2 (OD-K-5 redesign §6.2 KS-2): KitchenStockCards — the phone reflow for stock.
// One card per dish (name + two big tabular numbers Stok/Tersedia). Negatives tinted
// (.kt-neg), zero muted. Owns a search-mini via <KitchenToolbar>. Read-only (no
// affordance). Token-only (DESIGN.md); .ksc-* namespace.
// (No category grouping — KitchenStockRow carries no category; parity, flagged.)

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KitchenStockCards } from './kitchen-stock-cards'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

const ROWS: KitchenStockRow[] = [
  { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', stok: 12, tersedia: 8 },
  { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', stok: -3, tersedia: -3 },
  { wip_item_id: 'w3', wip_item_name: 'Risoles', stok: 0, tersedia: 5 },
]

function renderCards(over: Partial<Parameters<typeof KitchenStockCards>[0]> = {}) {
  return render(
    <KitchenStockCards
      rows={ROWS}
      search=""
      onSearchChange={() => {}}
      {...over}
    />,
  )
}

describe('KitchenStockCards — structure (read-only)', () => {
  it('renders one card per dish with both cuts', () => {
    renderCards()
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.getByText('Risoles')).toBeInTheDocument()
  })

  it('labels the two cuts (Stok + Tersedia) on each card', () => {
    renderCards()
    // the cut labels appear (per-card or as a shared legend)
    expect(screen.getAllByText(/stok/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/tersedia/i).length).toBeGreaterThan(0)
  })

  it('shows both numbers per dish (tabular)', () => {
    renderCards()
    const ayamCard = screen.getByText('Ayam Bakar').closest('.ksc-card') as HTMLElement
    expect(within(ayamCard).getByText('12')).toBeInTheDocument()
    expect(within(ayamCard).getByText('8')).toBeInTheDocument()
  })
})

describe('KitchenStockCards — AC-032: negatives tinted, never clamped', () => {
  it('shows the literal negative value', () => {
    renderCards()
    const nasiCard = screen.getByText('Nasi Goreng').closest('.ksc-card') as HTMLElement
    expect(within(nasiCard).getAllByText('-3').length).toBe(2)
  })

  it('tints negative numbers with .kt-neg', () => {
    const { container } = renderCards()
    const negVals = container.querySelectorAll('.kt-neg')
    expect(negVals.length).toBe(2) // stok + tersedia both -3 for Nasi
  })

  it('does NOT tint zero or positive values as negative', () => {
    const { container } = renderCards()
    // Ayam (12, 8), Risoles (0, 5) — none negative; only Nasi's two -3s are .kt-neg
    expect(container.querySelectorAll('.kt-neg').length).toBe(2)
  })
})

describe('KitchenStockCards — search filter', () => {
  it('search filters cards by name', () => {
    renderCards({ search: 'ayam' })
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
  })

  it('shows an empty-filter message when nothing matches', () => {
    renderCards({ search: 'zzz' })
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    expect(screen.getByText(/no items match your filter/i)).toBeInTheDocument()
  })
})

describe('KitchenStockCards — read-only', () => {
  it('renders NO edit / save / transfer / produce control + NO table', () => {
    renderCards()
    expect(screen.queryByRole('button', { name: /save|edit|transfer|produce|approve|submit/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
