import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KitchenToolbar } from './kitchen-toolbar'

const viewport = vi.hoisted(() => ({ desktop: true }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => viewport.desktop }))
afterEach(cleanup)
beforeEach(() => { viewport.desktop = true })

describe('Café toolbar: search, filters and results', () => {
  it('exposes its filters as a named group, not a toolbar contract', () => {
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} ariaLabel="Kitchen item filters" />)
    expect(screen.getByRole('group', { name: 'Kitchen item filters' })).toBeInTheDocument()
  })

  it('names the search field and reports shown of total with the sort', () => {
    const onSearch = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={onSearch} searchPlaceholder="Find an item"
      resultCount={{ shown: 2, total: 15 }} sortLabel="Sorted A–Z" />)
    const field = screen.getByRole('searchbox', { name: 'Search items' })
    fireEvent.change(field, { target: { value: 'latte' } })
    expect(onSearch).toHaveBeenCalledWith('latte')
    expect(screen.getByRole('status')).toHaveTextContent('2 of 15 items · Sorted A–Z')
  })

  it('says the plain total when nothing is filtered out', () => {
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} resultCount={{ shown: 15, total: 15 }} />)
    expect(screen.getByRole('status')).toHaveTextContent('15 items')
  })

  it('clears a filter from its chip when phone filters are folded', () => {
    viewport.desktop = false
    const onCategory = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} filtersPanel={{ label: 'Filters', summary: 'Bar' }} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Bar' }))
    expect(onCategory).toHaveBeenCalledWith('All')
  })

  it('retains extra chip actions alongside visible desktop filters', () => {
    const onCategory = vi.fn(), onExtra = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory}
      extraChips={[{ key: 'day', label: 'Today', clear: onExtra }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Today' }))
    expect(onExtra).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onCategory).toHaveBeenCalledWith('All')
  })

  it('resets one visible desktop filter in one action', () => {
    const onCategory = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onCategory).toHaveBeenCalledWith('All')
  })

  it('uses the caller’s atomic reset when filters share URL state', () => {
    const onCategory = vi.fn(), onClearAll = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory} onClearAll={onClearAll} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).toHaveBeenCalledOnce()
    expect(onCategory).not.toHaveBeenCalled()
  })

  it('lets Café Records move its one sort control into the phone Filters panel', () => {
    viewport.desktop = false
    const onSort = vi.fn()
    const sort = <select aria-label="Sort" defaultValue="newest" onChange={event => onSort(event.target.value)}>
      <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
    </select>
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} filtersPanel={{ label: 'Filters', summary: '' }} sortControl={sort} sortControlIn="panel" />)
    fireEvent.click(screen.getByText('Filters'))
    const control = screen.getByRole('combobox', { name: 'Sort' })
    fireEvent.change(control, { target: { value: 'oldest' } })
    expect(onSort).toHaveBeenCalledOnce()
    expect(onSort).toHaveBeenCalledWith('oldest')
    expect(screen.getAllByRole('combobox', { name: 'Sort' })).toHaveLength(1)
  })

  it('keeps the existing phone sort row for callers using the default placement', () => {
    viewport.desktop = false
    const onSort = vi.fn()
    const sort = <select aria-label="Sort" defaultValue="newest" onChange={event => onSort(event.target.value)}>
      <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
    </select>
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} filtersPanel={{ label: 'Filters', summary: '' }} sortControl={sort} />)
    const control = screen.getByRole('combobox', { name: 'Sort' })
    fireEvent.change(control, { target: { value: 'oldest' } })
    expect(onSort).toHaveBeenCalledOnce()
    expect(onSort).toHaveBeenCalledWith('oldest')
  })

  it('clears visible desktop filters in one action', () => {
    const onCategory = vi.fn(), onKind = vi.fn()
    render(<KitchenToolbar search="" onSearchChange={vi.fn()} categories={['All', 'Bar']} category="Bar" onCategoryChange={onCategory}
      kinds={['All', 'WIP']} kind="WIP" onKindChange={onKind} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onCategory).toHaveBeenCalledWith('All')
    expect(onKind).toHaveBeenCalledWith('All')
  })
})
