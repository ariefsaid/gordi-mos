// QtyCell — the desktop inline-editable "Made today" cell (plan §4.1 N5, §8.1).
// Flat number at rest (input showing qty); −/+ always in DOM (a11y + testable), revealed
// on hover/focus via CSS. + → onQtyChange(+1); − → onQtyChange(−1), disabled at 0.
// Direct numeric input works. Cap cue (TRANSFER_SHORT_CUE) renders when capError set.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QtyCell } from './qty-cell'
import type { KitchenLogLine } from '@/lib/db/kitchen-logs.types'

function line(over: Partial<KitchenLogLine> = {}): KitchenLogLine {
  return {
    wip_item_id: 'w1',
    qty_porsi: 0,
    notes: '',
    plan_qty: 20,
    stok: 0,
    tersedia: 0,
    dirty: false,
    error: '',
    capError: '',
    ...over,
  }
}

describe('QtyCell — at rest', () => {
  it('renders the qty as a spinbutton (the number is queryable)', () => {
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 12 })} onQtyChange={() => {}} />)
    const input = screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })
    expect(input).toHaveValue(12)
  })

  it('shows the −/+ stepper buttons (always in DOM for keyboard + a11y)', () => {
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 5 })} onQtyChange={() => {}} />)
    expect(screen.getByRole('button', { name: /decrease ayam bakar quantity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase ayam bakar quantity/i })).toBeInTheDocument()
  })
})

describe('QtyCell — −/+ behavior', () => {
  it('+ calls onQtyChange(qty+1)', () => {
    const onQtyChange = vi.fn()
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 5 })} onQtyChange={onQtyChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increase ayam bakar quantity/i }))
    expect(onQtyChange).toHaveBeenCalledWith(6)
  })

  it('− calls onQtyChange(qty−1)', () => {
    const onQtyChange = vi.fn()
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 5 })} onQtyChange={onQtyChange} />)
    fireEvent.click(screen.getByRole('button', { name: /decrease ayam bakar quantity/i }))
    expect(onQtyChange).toHaveBeenCalledWith(4)
  })

  it('− is disabled when qty === 0', () => {
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 0 })} onQtyChange={() => {}} />)
    expect(screen.getByRole('button', { name: /decrease ayam bakar quantity/i })).toBeDisabled()
  })

  it('direct numeric input calls onQtyChange with the typed value (≥0)', () => {
    const onQtyChange = vi.fn()
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 0 })} onQtyChange={onQtyChange} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i }), { target: { value: '17' } })
    expect(onQtyChange).toHaveBeenCalledWith(17)
  })
})

describe('QtyCell — transfer cap cue (FR-023)', () => {
  it('renders the cap cue when line.capError is set', () => {
    render(
      <QtyCell
        itemName="Ayam Bakar"
        line={line({ qty_porsi: 10, capError: 'Stok kurang — produksi dulu' })}
       
        onQtyChange={() => {}}
      />,
    )
    expect(screen.getByText(/stok kurang — produksi dulu/i)).toBeInTheDocument()
  })

  it('does not render a cap cue when capError is empty', () => {
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 5 })} onQtyChange={() => {}} />)
    expect(screen.queryByText(/stok kurang/i)).toBeNull()
  })
})

describe('QtyCell — disabled', () => {
  it('disables all controls when disabled=true', () => {
    render(<QtyCell itemName="Ayam Bakar" line={line({ qty_porsi: 5 })} onQtyChange={() => {}} disabled />)
    expect(screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /increase ayam bakar quantity/i })).toBeDisabled()
  })
})
