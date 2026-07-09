// WhatsComingStrip tests — the honest "needs warehouse data" strip (FR-010/AC-010).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhatsComingStrip } from './whats-coming-strip'

describe('WhatsComingStrip (AC-010)', () => {
  it('AC-010: renders the four not-yet-backed KPI names (Opex, Material usage, Labor cost %, Roastery yield)', () => {
    render(<WhatsComingStrip />)
    expect(screen.getByText(/opex/i)).toBeInTheDocument()
    expect(screen.getByText(/material usage/i)).toBeInTheDocument()
    expect(screen.getByText(/labor cost/i)).toBeInTheDocument()
    expect(screen.getByText(/roastery yield/i)).toBeInTheDocument()
  })

  it('AC-010: none of the stubs show a faked number', () => {
    render(<WhatsComingStrip />)
    // Each stub renders a "needs warehouse data" value, never a numeric figure.
    const stubs = screen.getAllByText(/needs warehouse data/i)
    expect(stubs.length).toBe(4)
  })

  it('renders the "What\'s coming" strip heading', () => {
    render(<WhatsComingStrip />)
    expect(screen.getByText(/what.s coming/i)).toBeInTheDocument()
  })

  it('AC-010: each stub carries a "needs warehouse data" note (never faked)', () => {
    const { container } = render(<WhatsComingStrip />)
    // No numeric values (digits) appear as a stub value
    const stubVals = container.querySelectorAll('.whats-coming-stub-val')
    expect(stubVals.length).toBe(4)
    stubVals.forEach(v => {
      expect(v.textContent).not.toMatch(/^\s*[\d,]+\s*$/) // never a bare number
    })
  })
})
