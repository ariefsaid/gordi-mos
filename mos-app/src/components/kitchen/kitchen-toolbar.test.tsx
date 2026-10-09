// B2 (OD-K-5 redesign plan §2.3): KitchenToolbar — the shared search-mini + category
// filter, lifted from Log's .klt-toolbar so Plan + Stock (and optionally Review) share
// it. Flat utility surface (no --shadow-rest); --card bg + --border bottom. One
// search-mini (role="search") + an optional category dropdown + an optional children
// slot (e.g. ActionTypeSeg on the Plan editor). Token-only (DESIGN.md).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { KitchenToolbar } from './kitchen-toolbar'

describe('KitchenToolbar — search-mini', () => {
  it('renders a searchbox with the default placeholder "Find an item"', () => {
    render(<KitchenToolbar search="" onSearchChange={() => {}} />)
    const input = screen.getByRole('searchbox')
    expect(input).toHaveAttribute('placeholder', 'Find an item')
  })

  it('honours a custom searchPlaceholder', () => {
    render(<KitchenToolbar search="" onSearchChange={() => {}} searchPlaceholder="Find an item to plan" />)
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Find an item to plan')
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

  it('places a trailing capture action beside the search in the shared filter row', () => {
    const { container } = render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        trailing={<button type="button">Report missing item</button>}
      />,
    )
    const filters = container.querySelector('.ktb-filters')
    const action = screen.getByRole('button', { name: 'Report missing item' })
    expect(action.parentElement).toBe(filters)
    expect(container.querySelector('.ktb-search-wrap')?.parentElement).toBe(filters)
  })
})

describe('KitchenToolbar — kind filter', () => {
  it.each([
    {
      locale: 'en' as const,
      all: 'All kinds',
      wip: 'Prepared item (WIP)',
      raw: 'Raw material (RAW)',
      notSet: 'Not set',
    },
    {
      locale: 'id' as const,
      all: 'Semua jenis',
      wip: 'Item olahan (WIP)',
      raw: 'Bahan baku (RAW)',
      notSet: 'Belum diatur',
    },
  ])('uses localized kind names in $locale without changing the filter values', ({ locale, all, wip, raw, notSet }) => {
    const onKindChange = vi.fn()
    render(
      <I18nProvider initialLocale={locale}>
        <KitchenToolbar
          search=""
          onSearchChange={() => {}}
          kinds={['All', 'WIP', 'RAW', 'Unclassified']}
          kind="All"
          kindId="cafe-log-kind"
          onKindChange={onKindChange}
        />
      </I18nProvider>,
    )
    const kindAriaLabel = locale === 'id' ? 'Jenis item' : 'Item kind'
    const select = screen.getByRole('combobox', { name: kindAriaLabel })
    expect(select).toHaveAttribute('id', 'cafe-log-kind')
    fireEvent.click(select)
    const listbox = screen.getByRole('listbox', { name: kindAriaLabel })
    expect(listbox).toContainElement(screen.getByRole('option', { name: all }))
    expect(listbox).toContainElement(screen.getByRole('option', { name: wip }))
    expect(listbox).toContainElement(screen.getByRole('option', { name: raw }))
    expect(listbox).toContainElement(screen.getByRole('option', { name: notSet }))
    fireEvent.click(screen.getByRole('option', { name: raw }))
    expect(onKindChange).toHaveBeenCalledWith('RAW')
  })
})

describe('KitchenToolbar — status and unit filters', () => {
  it('renders shared Active and Needs unit filters with their selected values', () => {
    const onActiveChange = vi.fn()
    const onNeedsUnitChange = vi.fn()
    render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        activeStates={['All', 'Active', 'Inactive']}
        active="All"
        onActiveChange={onActiveChange}
        needsUnitStates={['All', 'Needs unit']}
        needsUnit="All"
        onNeedsUnitChange={onNeedsUnitChange}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Active status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Inactive' }))
    expect(onActiveChange).toHaveBeenCalledWith('Inactive')

    fireEvent.click(screen.getByRole('combobox', { name: 'Unit setup' }))
    fireEvent.click(screen.getByRole('option', { name: 'Needs unit' }))
    expect(onNeedsUnitChange).toHaveBeenCalledWith('Needs unit')
  })
})

describe('KitchenToolbar — category filter', () => {
  it('renders a category dropdown when categories are provided', () => {
    render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        categories={['All', 'Chicken', 'Seafood']}
        category="All"
        categoryId="cafe-log-category"
        onCategoryChange={() => {}}
      />,
    )
    const select = screen.getByRole('combobox', { name: /category/i })
    expect(select).toBeInTheDocument()
    expect(select).toHaveAttribute('id', 'cafe-log-category')
    expect(select).toHaveTextContent('All categories')
    fireEvent.click(select)
    // options reflect the provided list while the designed popup is open
    const listbox = screen.getByRole('listbox', { name: /category/i })
    expect(listbox).toContainElement(screen.getByRole('option', { name: 'Chicken' }))
    expect(listbox).toContainElement(screen.getByRole('option', { name: 'Seafood' }))
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
    fireEvent.click(screen.getByRole('combobox', { name: /category/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Chicken' }))
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
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveTextContent('Chicken')
  })

  it('keeps the caller supplied category trigger id across option rerenders', () => {
    const view = render(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        categories={['All', 'Chicken']}
        category="All"
        categoryId="cafe-log-category"
        onCategoryChange={() => {}}
      />,
    )

    view.rerender(
      <KitchenToolbar
        search=""
        onSearchChange={() => {}}
        categories={['All', 'Seafood']}
        category="Seafood"
        categoryId="cafe-log-category"
        onCategoryChange={() => {}}
      />,
    )

    expect(screen.getByRole('combobox', { name: /category/i })).toHaveAttribute('id', 'cafe-log-category')
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveTextContent('Seafood')
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
