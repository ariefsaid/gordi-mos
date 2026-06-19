import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupHeaderRow } from './group-header-row'

function renderRow(props: Partial<React.ComponentProps<typeof GroupHeaderRow>> = {}) {
  const base: React.ComponentProps<typeof GroupHeaderRow> = {
    label: 'Open', count: 4, overdue: 0, collapsed: false, colSpan: 5,
    onToggle: () => {}, onAddTask: () => {}, onOverdueFilter: () => {},
    ...props,
  }
  return render(<table><tbody><GroupHeaderRow {...base} /></tbody></table>)
}

describe('GroupHeaderRow', () => {
  it('AC-123: shows label, count, and an overdue subtotal when >0', () => {
    renderRow({ label: 'Blocked', count: 3, overdue: 2 })
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/2 overdue/i)).toBeInTheDocument()
  })

  it('AC-128: the overdue subtotal is a button that triggers the overdue-only filter', () => {
    const onOverdueFilter = vi.fn()
    renderRow({ label: 'Open', count: 4, overdue: 1, onOverdueFilter })
    fireEvent.click(screen.getByRole('button', { name: /filter to 1 overdue/i }))
    expect(onOverdueFilter).toHaveBeenCalled()
  })

  it('AC-124: a zero-count group still renders its header with no overdue subtotal', () => {
    renderRow({ label: 'Ada Lovelace', count: 0, overdue: 0 })
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText(/overdue/i)).toBeNull()
  })

  it('AC-132: the caret toggle carries aria-expanded and fires onToggle (keyboard-reachable)', () => {
    const onToggle = vi.fn()
    renderRow({ collapsed: false, onToggle })
    const caret = screen.getByRole('button', { name: /collapse|expand|open group/i })
    expect(caret).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(caret)
    expect(onToggle).toHaveBeenCalled()
  })

  it('collapsed=true reflects aria-expanded=false', () => {
    renderRow({ collapsed: true })
    const caret = screen.getByRole('button', { name: /collapse|expand|open group/i })
    expect(caret).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders a "+ Add task" affordance that fires onAddTask', () => {
    const onAddTask = vi.fn()
    renderRow({ onAddTask })
    const add = screen.getByRole('button', { name: /add task/i })
    fireEvent.click(add)
    expect(onAddTask).toHaveBeenCalled()
  })
})
