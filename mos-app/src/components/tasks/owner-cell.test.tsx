// TDD: OwnerCell — avatar initials, first name, +N overflow
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OwnerCell } from './owner-cell'

describe('OwnerCell', () => {
  it('renders avatar initials and first name', () => {
    const { container } = render(
      <OwnerCell fullName="Arief Said" otherCount={0} />
    )
    expect(container.querySelector('.ownav')?.textContent).toBe('AS')
    expect(screen.getByText('Arief')).toBeTruthy()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('renders +N badge when otherCount > 0', () => {
    render(<OwnerCell fullName="Budi Setiawan" otherCount={3} />)
    expect(screen.getByText('+3')).toBeTruthy()
  })

  it('does NOT render +N when otherCount is 0', () => {
    render(<OwnerCell fullName="Budi Setiawan" otherCount={0} />)
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('handles A=R (single-person RACI) — otherCount 0 shows no badge', () => {
    render(<OwnerCell fullName="Arief Said" otherCount={0} />)
    expect(screen.queryByText(/^\+/)).toBeNull()
    expect(screen.getByText('Arief')).toBeTruthy()
  })

  it('single-word name produces single-char initials', () => {
    const { container } = render(
      <OwnerCell fullName="Budi" otherCount={0} />
    )
    expect(container.querySelector('.ownav')?.textContent).toBe('B')
  })
})

describe('OwnerCell — legacy overflow disclosure', () => {
  it('the +N control reveals the other people on focus without role jargon', () => {
    render(<OwnerCell fullName="Ada Lovelace" otherCount={2}
      others={[{ role: 'C', name: 'Alan Turing' }, { role: 'I', name: 'Grace Hopper' }]} />)
    const more = screen.getByRole('button', { name: /show other people/i })
    fireEvent.focus(more)
    expect(screen.getByText('Alan Turing')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
  })

  it('without an others list the +N stays a plain badge', () => {
    render(<OwnerCell fullName="Budi Setiawan" otherCount={3} />)
    expect(screen.getByText('+3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /show other people/i })).toBeNull()
  })
})
