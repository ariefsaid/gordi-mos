import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KitchenToolbar } from './kitchen-toolbar'

vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => true }))
afterEach(cleanup)

describe('Café toolbar: search, count at the right, removable chips', () => {
  it('names the search field with a visible label and reports shown of total with the sort', () => {
    const onSearch = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={onSearch} searchPlaceholder="Find an item"
      resultCount={{ shown: 2, total: 15 }} sortLabel="Sorted A–Z" />)
    const field = screen.getByRole('searchbox', { name: 'Search items' })
    expect(document.querySelector('label.search-field__label')?.textContent).toBe('Search items')
    fireEvent.change(field, { target: { value: 'latte' } })
    expect(onSearch).toHaveBeenCalledWith('latte')
    expect(screen.getByRole('status')).toHaveTextContent('2 of 15 items · Sorted A–Z')
  })

  it('says the plain total when nothing is filtered out', () => {
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} resultCount={{ shown: 15, total: 15 }} />)
    expect(screen.getByRole('status')).toHaveTextContent('15 items')
  })

  it('shows each non-default filter as a removable chip and clears it', () => {
    const onCategory = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Bar' }))
    expect(onCategory).toHaveBeenCalledWith('All')
  })

  it('offers Clear all once two filters are active', () => {
    const onCategory = vi.fn(), onKind = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory}
      kinds={['All', 'WIP']} kind="WIP" onKindChange={onKind} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onCategory).toHaveBeenCalledWith('All')
    expect(onKind).toHaveBeenCalledWith('All')
  })
})
