// KitchenGroupHeader — thin kitchen group header (plan §4.1 N4, §8).
// variant="table": a <tr><td colSpan> (desktop); variant="cards": a <div> (phone).
// Caret (aria-expanded) + label (structural navy) + count (tabular). No "+ Add task".
// Reuses the OD-P3-6 hairline style. Both groups always shown (layout stability).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KitchenGroupHeader } from './kitchen-group-header'

describe('KitchenGroupHeader — variant="table"', () => {
  it('renders a <tr> with caret + label + count', () => {
    const { container } = render(
      <table><tbody>
        <KitchenGroupHeader variant="table" label="Planned today" count={6} collapsed={false} onToggle={() => {}} colSpan={5} />
      </tbody></table>,
    )
    expect(container.querySelector('tr.kgh')).not.toBeNull()
    expect(screen.getByText('Planned today')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('caret carries aria-expanded (true when expanded, false when collapsed)', () => {
    const { rerender } = render(
      <table><tbody>
        <KitchenGroupHeader variant="table" label="Planned today" count={6} collapsed={false} onToggle={() => {}} colSpan={5} />
      </tbody></table>,
    )
    expect(screen.getByRole('button', { name: /collapse planned today/i })).toHaveAttribute('aria-expanded', 'true')

    rerender(
      <table><tbody>
        <KitchenGroupHeader variant="table" label="Off-plan" count={3} collapsed onToggle={() => {}} colSpan={5} />
      </tbody></table>,
    )
    expect(screen.getByRole('button', { name: /expand off-plan/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('onToggle fires on caret click', () => {
    const onToggle = vi.fn()
    render(
      <table><tbody>
        <KitchenGroupHeader variant="table" label="Planned today" count={6} collapsed={false} onToggle={onToggle} colSpan={5} />
      </tbody></table>,
    )
    fireEvent.click(screen.getByRole('button', { name: /collapse planned today/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('renders the optional tabular subtotal', () => {
    render(
      <table><tbody>
        <KitchenGroupHeader variant="table" label="Planned today" count={6} sub="180 planned" collapsed={false} onToggle={() => {}} colSpan={5} />
      </tbody></table>,
    )
    expect(screen.getByText(/180 planned/i)).toBeInTheDocument()
  })
})

describe('KitchenGroupHeader — variant="cards" (phone)', () => {
  it('renders a <div> with caret + label + count', () => {
    const { container } = render(
      <KitchenGroupHeader variant="cards" label="Planned today" count={6} collapsed={false} onToggle={() => {}} />,
    )
    expect(container.querySelector('div.kgh-cards')).not.toBeNull()
    expect(screen.getByText('Planned today')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('onToggle fires on caret click', () => {
    const onToggle = vi.fn()
    render(
      <KitchenGroupHeader variant="cards" label="Off-plan" count={3} collapsed onToggle={onToggle} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /expand off-plan/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
