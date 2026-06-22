// B2 (OD-K-5 redesign plan §2.3): KitchenToolbar — the shared search-mini + category
// filter, lifted from Log's .klt-toolbar so Plan + Stock (and optionally Review) share
// it. Flat utility surface (no --shadow-rest); --card bg + --border bottom. One
// search-mini (role="search") + an optional category <select> + an optional children
// slot (e.g. ActionTypeSeg on the Plan editor). Token-only (DESIGN.md).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KitchenToolbar } from './kitchen-toolbar'

describe('KitchenToolbar — search-mini', () => {
  it('renders a searchbox with the default placeholder "Find a dish"', () => {
    render(<KitchenToolbar search="" onSearchChange={() => {}} />)
    const input = screen.getByRole('searchbox')
    expect(input).toHaveAttribute('placeholder', 'Find a dish')
  })

  it('honours a custom searchPlaceholder', () => {
    render(<KitchenToolbar search="" onSearchChange={() => {}} searchPlaceholder="Find a dish to plan" />)
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Find a dish to plan')
  })

  it('fires onSearchChange on type', () => {
    const onSearchChange = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={onSearchChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'aya' } })
    expect(onSearchChange).toHaveBeenCalledWith('aya')
  })

  it('wraps the search in a role="search" landmark (a11y)', () => {
    const { container } = render(<KitchenToolbar search="" onSearchChange={() => {}} />)
    expect(container.querySelector('[role="search"]')).not.toBeNull()
  })
})

describe('KitchenToolbar — category filter', () => {
  it('renders a category <select> when categories are provided', () => {
    render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        categories={['All', 'Chicken', 'Seafood']}
        category="All"
        onCategoryChange={() => {}}
      />,
    )
    const select = screen.getByRole('combobox', { name: /category/i })
    expect(select).toBeInTheDocument()
    // options reflect the provided list
    expect(screen.getByRole('option', { name: 'Chicken' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Seafood' })).toBeInTheDocument()
  })

  it('fires onCategoryChange on selection', () => {
    const onCategoryChange = vi.fn()
    render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        categories={['All', 'Chicken']}
        category="All"
        onCategoryChange={onCategoryChange}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: /category/i }), { target: { value: 'Chicken' } })
    expect(onCategoryChange).toHaveBeenCalledWith('Chicken')
  })

  it('omits the category select when categories are not provided', () => {
    render(<KitchenToolbar search="" onSearchChange={() => {}} />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('reflects the current category value', () => {
    render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        categories={['All', 'Chicken']}
        category="Chicken"
        onCategoryChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveValue('Chicken')
  })
})

describe('KitchenToolbar — children slot + a11y', () => {
  it('renders the children slot (e.g. the ActionTypeSeg on the Plan editor)', () => {
    render(
      <KitchenToolbar search="" onSearchChange={() => {}}>
        <button type="button">Action</button>
      </KitchenToolbar>,
    )
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('the toolbar carries a label (default "Filter")', () => {
    render(<KitchenToolbar search="" onSearchChange={() => {}} ariaLabel="Plan filters" />)
    // the labelled region — the toolbar root carries the aria-label
    const region = screen.getByLabelText('Plan filters')
    expect(region).toBeInTheDocument()
  })
})
