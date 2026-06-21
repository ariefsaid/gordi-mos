// KitchenLogCards — the phone reflow (plan §4.1 N8, §8.2).
// Planned section: cards (each composing <WipItemStepper> + a status delta <Pill> +
// category caption). Off-plan section: "+ Add another dish" expander (collapsed by
// default when there are planned items; a search box reveals on expand). When there
// are NO planned items, off-plan expands as the primary content (AC-021 parity).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KitchenLogCards } from './kitchen-log-cards'
import type { WipItemOption, KitchenLogLine } from '@/lib/db/kitchen-logs.types'

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Nasi Putih', category: 'Rice' },
  { id: 'w2', name: 'Risoles', category: 'Snack' },
  { id: 'w3', name: 'Ayam Suwir', category: 'Main' }, // off-plan
]

function lines(planW1 = 50, planW2 = 30): Record<string, KitchenLogLine> {
  return {
    w1: { wip_item_id: 'w1', qty_porsi: 48, notes: '', plan_qty: planW1, stok: 30, tersedia: 30, dirty: true, error: '', capError: '' },
    w2: { wip_item_id: 'w2', qty_porsi: 36, notes: '', plan_qty: planW2, stok: 0, tersedia: 0, dirty: true, error: '', capError: '' },
    w3: { wip_item_id: 'w3', qty_porsi: 12, notes: 'extra', plan_qty: 0, stok: 0, tersedia: 0, dirty: true, error: '', capError: '' },
  }
}

function renderCards(over: Partial<Parameters<typeof KitchenLogCards>[0]> = {}) {
  return render(
    <KitchenLogCards
      items={ITEMS}
      lines={lines()}
      actionType="Production"
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

describe('KitchenLogCards — Planned section', () => {
  it('renders a card per planned dish (WipItemStepper qty inputs present)', () => {
    renderCards()
    // w1 + w2 are planned → their qty spinbuttons are visible
    expect(screen.getByRole('spinbutton', { name: /quantity for nasi putih/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /quantity for risoles/i })).toBeInTheDocument()
  })

  it('renders a status delta Pill per planned card', () => {
    renderCards() // Nasi 48/50 → Under −2; Risoles 36/30 → Over +6
    expect(screen.getByText('Under −2')).toBeInTheDocument()
    expect(screen.getByText('Over +6')).toBeInTheDocument()
  })

  it('renders the section header "Planned today"', () => {
    renderCards()
    expect(screen.getByText(/planned today/i)).toBeInTheDocument()
  })

  it('wires onQtyChange through the WipItemStepper', () => {
    const onQtyChange = vi.fn()
    renderCards({ onQtyChange })
    fireEvent.click(screen.getAllByRole('button', { name: /increase nasi putih quantity/i })[0])
    expect(onQtyChange).toHaveBeenCalledWith('w1', 49)
  })
})

describe('KitchenLogCards — Off-plan expander (collapsed by default when planned exist)', () => {
  it('off-plan items are NOT visible until the expander is opened (plannedDishCount > 0)', () => {
    renderCards()
    expect(screen.queryByRole('spinbutton', { name: /quantity for ayam suwir/i })).toBeNull()
    expect(screen.getByRole('button', { name: /add another dish/i })).toBeInTheDocument()
  })

  it('expanding reveals the off-plan card + a search box', () => {
    renderCards()
    fireEvent.click(screen.getByRole('button', { name: /add another dish/i }))
    expect(screen.getByRole('spinbutton', { name: /quantity for ayam suwir/i })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /find an off-plan dish/i })).toBeInTheDocument()
  })

  it('the off-plan search filters off-plan cards', () => {
    renderCards({ search: 'suw' }) // shared search filters off-plan once expanded
    fireEvent.click(screen.getByRole('button', { name: /add another dish/i }))
    expect(screen.getByRole('spinbutton', { name: /quantity for ayam suwir/i })).toBeInTheDocument()
  })

  it('renders the "Off-plan" section header', () => {
    renderCards()
    expect(screen.getByText(/off-plan/i)).toBeInTheDocument()
  })
})

describe('KitchenLogCards — no planned items → off-plan is the primary content', () => {
  it('when plannedDishCount === 0, off-plan items are visible WITHOUT expanding (AC-021 parity)', () => {
    // No plans → all items off-plan
    render(
      <KitchenLogCards
        items={ITEMS}
        lines={lines(0, 0)}
        actionType="Production"
        search=""
        category="All"
        collapsedGroups={new Set<string>()}
        onQtyChange={() => {}}
        onNotesChange={() => {}}
        onToggleGroup={() => {}}
        onSearchChange={() => {}}
        onCategoryChange={() => {}}
      />,
    )
    // all three off-plan items visible without expanding
    expect(screen.getByRole('spinbutton', { name: /quantity for nasi putih/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /quantity for ayam suwir/i })).toBeInTheDocument()
  })
})
