// DQBadge tests — the data-quality badge from BOM coverage (FR-024/AC-024, design-plan §2.10).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DQBadge } from './dq-badge'

describe('DQBadge', () => {
  it('good: success tone + "good" label', () => {
    const { container } = render(<DQBadge dq="good" />)
    expect(screen.getByText(/good/i)).toBeInTheDocument()
    expect(container.querySelector('.dq-badge--good')).not.toBeNull()
  })

  it('partial: warning tone + "partial" label', () => {
    const { container } = render(<DQBadge dq="partial" />)
    expect(screen.getByText(/partial/i)).toBeInTheDocument()
    expect(container.querySelector('.dq-badge--partial')).not.toBeNull()
  })

  it('unknown: neutral tone + "unknown" label', () => {
    const { container } = render(<DQBadge dq="unknown" />)
    expect(screen.getByText(/unknown/i)).toBeInTheDocument()
    expect(container.querySelector('.dq-badge--unknown')).not.toBeNull()
  })

  it('always carries a leading dot (status semantics, unlike BasisChip)', () => {
    const { container } = render(<DQBadge dq="partial" />)
    expect(container.querySelector('.dq-badge .dot')).not.toBeNull()
  })

  it('renders "BOM coverage" as the accessible qualifier for each variant', () => {
    const { rerender } = render(<DQBadge dq="good" />)
    expect(screen.getByText(/good/i)).toBeInTheDocument()
    rerender(<DQBadge dq="partial" />)
    expect(screen.getByText(/partial/i)).toBeInTheDocument()
    rerender(<DQBadge dq="unknown" />)
    expect(screen.getByText(/unknown/i)).toBeInTheDocument()
  })
})
