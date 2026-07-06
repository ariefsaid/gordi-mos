// FreshnessLabel tests — D11 obligation, sales design-plan §2.4.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FreshnessLabel } from './freshness-label'

describe('FreshnessLabel', () => {
  it('renders "as of {formatted datetime}" for a Date', () => {
    render(<FreshnessLabel asOf={new Date('2026-07-02T08:30:00Z')} />)
    expect(screen.getByText(/as of/i)).toBeInTheDocument()
  })

  it('renders "as of {formatted datetime}" for an ISO string', () => {
    render(<FreshnessLabel asOf="2026-07-02T08:30:00Z" />)
    expect(screen.getByText(/as of/i)).toBeInTheDocument()
  })

  it('accepts a custom prefix', () => {
    render(<FreshnessLabel asOf="2026-07-02T08:30:00Z" prefix="Snapshot" />)
    expect(screen.getByText(/^snapshot/i)).toBeInTheDocument()
    expect(screen.queryByText(/^as of/i)).toBeNull()
  })

  it('applies the .tabular utility to the timestamp digits', () => {
    const { container } = render(<FreshnessLabel asOf="2026-07-02T08:30:00Z" />)
    expect(container.querySelector('.tabular')).toBeInTheDocument()
  })

  it('has no accessible-name role conflicts — plain text, not a live region', () => {
    const { container } = render(<FreshnessLabel asOf="2026-07-02T08:30:00Z" />)
    expect(container.querySelector('[aria-live]')).toBeNull()
  })
})
