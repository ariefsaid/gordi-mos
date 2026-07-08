// BasisChip tests — the neutral basis-qualifier badge (FR-008/AC-008, design-plan §2.9).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BasisChip } from './basis-chip'

describe('BasisChip', () => {
  it('renders the given label', () => {
    render(<BasisChip label="interim — stock-movement" />)
    expect(screen.getByText('interim — stock-movement')).toBeInTheDocument()
  })

  it('is NOT a status pill (no leading dot — it is a qualifier, not a status)', () => {
    const { container } = render(<BasisChip label="interim — stock-movement" />)
    expect(container.querySelector('.dot')).toBeNull()
  })

  it('carries the basis-chip class', () => {
    const { container } = render(<BasisChip label="interim — stock-movement" />)
    expect(container.querySelector('.basis-chip')).not.toBeNull()
  })
})
