// TDD: OwnerCell — typed PIC display with no legacy overflow grammar.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OwnerCell } from './owner-cell'

describe('OwnerCell', () => {
  it('renders avatar initials and the PIC first name', () => {
    const { container } = render(<OwnerCell fullName="Arief Said" />)
    expect(container.querySelector('.ownav')?.textContent).toBe('AS')
    expect(screen.getByText('Arief')).toBeTruthy()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('does not expose legacy additional-person controls', () => {
    render(<OwnerCell fullName="Budi Setiawan" />)
    expect(screen.queryByRole('button', { name: /show other people/i })).toBeNull()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('single-word name produces single-char initials', () => {
    const { container } = render(<OwnerCell fullName="Budi" />)
    expect(container.querySelector('.ownav')?.textContent).toBe('B')
  })
})
