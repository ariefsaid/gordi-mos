// TDD: OwnerCell — avatar initials, first name, +N overflow
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OwnerCell } from './OwnerCell'

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
