// C3b (OD-K-5 redesign §4.2 PE-2): KitchenPlanCards — the phone reflow for the plan editor.
// One card per dish (name + category + PlanQtyStepper), grouped by category via
// <KitchenGroupHeader variant=cards>. Owns client search + category filter via
// <KitchenToolbar>. NO off-plan expander (Plan has no planned/off-plan split — every
// item is plannable). Empty-filter message. Token-only (DESIGN.md); .kpc-* namespace.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KitchenPlanCards } from './kitchen-plan-cards'
import type { WipItemOption } from '@/lib/db/kitchen-logs.types'

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Gulai', category: 'Chicken' },
  { id: 'w2', name: 'Ayam Woku', category: 'Chicken' },
  { id: 'w3', name: 'Nasi Putih', category: 'Rice/Staple' },
  { id: 'w4', name: 'Cumi Cabe Ijo', category: 'Seafood' },
]

function renderCards(over: Partial<Parameters<typeof KitchenPlanCards>[0]> = {}) {
  return render(
    <KitchenPlanCards
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

describe('KitchenPlanCards — structure', () => {
  it('renders one PlanQtyStepper (spinbutton) per dish', () => {
    renderCards()
    expect(screen.getAllByRole('spinbutton').length).toBe(ITEMS.length)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
  })

  it('renders the dish name + its category on each card', () => {
    renderCards()
    expect(screen.getByText('Ayam Gulai')).toBeInTheDocument()
    expect(screen.getByText('Nasi Putih')).toBeInTheDocument()
  })

  it('groups cards by category (group headers present)', () => {
    const { container } = renderCards()
    const labels = Array.from(container.querySelectorAll('.kgh-label')).map(el => el.textContent)
    expect(labels).toEqual(['Chicken', 'Rice/Staple', 'Seafood'])
  })
})

describe('KitchenPlanCards — NO off-plan expander (Plan has no planned/off-plan split)', () => {
  it('does NOT render an "+ Add another dish" expander', () => {
    renderCards()
    expect(screen.queryByRole('button', { name: /add another dish/i })).toBeNull()
  })

  it('every dish is editable from first render (no expand step)', () => {
    renderCards()
    // all four dishes' steppers visible immediately
    ITEMS.forEach(it => {
      expect(screen.getByRole('spinbutton', { name: new RegExp(it.name, 'i') })).toBeInTheDocument()
    })
  })
})

describe('KitchenPlanCards — search + category filter', () => {
  it('search filters cards by name', () => {
    renderCards({ search: 'ayam' })
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeNull()
  })

  it('category filter narrows to one category', () => {
    renderCards({ category: 'Seafood' })
    expect(screen.getByRole('spinbutton', { name: /planned quantity for cumi cabe ijo/i })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeNull()
  })

  it('shows an empty-filter message when nothing matches', () => {
    renderCards({ search: 'zzz' })
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByText(/no dishes match your filter/i)).toBeInTheDocument()
  })
})

describe('KitchenPlanCards — null-category (staging/prod data has no categories)', () => {
  const NULL_CAT_ITEMS: WipItemOption[] = [
    { id: 'w1', name: 'Ayam Gulai', category: null },
    { id: 'w2', name: 'Nasi Putih', category: null },
    { id: 'w3', name: 'Cumi Cabe Ijo', category: null },
  ]

  it('renders all dish cards when every item has category=null (no silent drop)', () => {
    renderCards({ items: NULL_CAT_ITEMS, category: 'All' })
    // All three spinbuttons must render
    expect(screen.getAllByRole('spinbutton').length).toBe(3)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for cumi cabe ijo/i })).toBeInTheDocument()
  })

  it('does NOT show the empty-filter message when items exist but all have category=null', () => {
    renderCards({ items: NULL_CAT_ITEMS, category: 'All' })
    expect(screen.queryByText(/no dishes match your filter/i)).toBeNull()
  })

  it('mixed: items with and without category both render (no drop of uncategorized)', () => {
    const MIXED: WipItemOption[] = [
      { id: 'w1', name: 'Ayam Gulai', category: 'Chicken' },
      { id: 'w2', name: 'Nasi Putih', category: null },
    ]
    renderCards({ items: MIXED, category: 'All' })
    expect(screen.getAllByRole('spinbutton').length).toBe(2)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam gulai/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for nasi putih/i })).toBeInTheDocument()
  })
})

describe('KitchenPlanCards — onSave wiring', () => {
  it('increasing a qty calls onSave(itemId, qty+1)', () => {
    const onSave = vi.fn()
    const qtyOf = (id: string) => (id === 'w1' ? 10 : 0)
    renderCards({ onSave, qtyOf })
    fireEvent.click(screen.getByRole('button', { name: /increase ayam gulai planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith('w1', 11)
  })

  it('marks the saving card with an inline "Saving…" status', () => {
    renderCards({ savingId: 'w1' })
    expect(screen.getByText(/saving/i)).toBeInTheDocument()
  })

  it('disables every stepper when disabled=true', () => {
    renderCards({ disabled: true })
    screen.getAllByRole('spinbutton').forEach(input => expect(input).toBeDisabled())
  })
})
