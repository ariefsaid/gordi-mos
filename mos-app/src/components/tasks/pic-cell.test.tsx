// TDD: PicCell — typed PIC display with no legacy overflow grammar (V3 Issue 6: was OwnerCell).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PicCell } from './pic-cell'

describe('PicCell', () => {
  it('renders the PIC name', () => {
    render(<PicCell fullName="Arden Sample" />)
    expect(screen.getByText('Arden Sample')).toBeTruthy()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('does not expose legacy additional-person controls', () => {
    render(<PicCell fullName="Budi Setiawan" />)
    expect(screen.queryByRole('button', { name: /show other people/i })).toBeNull()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  // Design fix wave item 4 (OD-65 mockup regression) — the generated-ownership source line.
  describe('provenance ("via <role name>", item 4)', () => {
    it('renders "via <role name>" beside the PIC when provenance is given', () => {
      render(<PicCell fullName="Cahya Cafe" provenance="Cafe Ops Lead" />)
      expect(screen.getByText('via Cafe Ops Lead')).toBeInTheDocument()
    })

    it('renders nothing extra when provenance is omitted (no regression)', () => {
      render(<PicCell fullName="Cahya Cafe" />)
      expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
    })

    it('folds the provenance into the accessible name (WCAG AA — never sighted-only)', () => {
      render(<PicCell fullName="Cahya Cafe" provenance="Cafe Ops Lead" />)
      expect(screen.getByLabelText('PIC: Cahya Cafe (via Cafe Ops Lead)')).toBeInTheDocument()
    })
  })
})
