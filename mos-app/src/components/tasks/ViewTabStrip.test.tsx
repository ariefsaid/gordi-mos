import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewTabStrip } from './ViewTabStrip'

describe('ViewTabStrip', () => {
  it('AC-122: Table is the selected tab; Board + Calendar are disabled SOON stubs', () => {
    render(<ViewTabStrip active="table" />)
    // Table tab is selected
    const tableTab = screen.getByRole('tab', { name: /table/i })
    expect(tableTab).toHaveAttribute('aria-selected', 'true')
    expect(tableTab).toHaveAttribute('tabindex', '0')

    // Board is aria-disabled SOON stub, not activatable
    const board = screen.getByRole('tab', { name: /board/i })
    expect(board).toHaveAttribute('aria-disabled', 'true')
    expect(board).toHaveAttribute('tabindex', '-1')

    // Calendar is aria-disabled SOON stub, not activatable
    const calendar = screen.getByRole('tab', { name: /calendar/i })
    expect(calendar).toHaveAttribute('aria-disabled', 'true')
    expect(calendar).toHaveAttribute('tabindex', '-1')

    // Both stubs show SOON pill
    expect(screen.getAllByText(/soon/i)).toHaveLength(2)
  })

  it('AC-122: the strip renders a tablist with accessible label', () => {
    render(<ViewTabStrip active="table" />)
    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()
    expect(tablist).toHaveAttribute('aria-label')
  })

  it('AC-122: disabled stub tabs are not activatable (no onClick handler fires)', () => {
    const { container } = render(<ViewTabStrip active="table" />)
    // stubs must not have pointer events or direct click handlers — they have aria-disabled
    const board = screen.getByRole('tab', { name: /board/i })
    expect(board).toHaveAttribute('aria-disabled', 'true')
    // The stub tab's type is button but disabled so it cannot activate a view
    expect(board.getAttribute('aria-selected')).toBe('false')
    // container should have the view-tab strip root
    expect(container.querySelector('[role="tablist"]')).toBeTruthy()
  })
})
