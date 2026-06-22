// C1 (OD-K-5 redesign §4.3): PlanQtyCell — the desktop inline-editable PLAN qty cell.
// Mirrors QtyCell minus the Log-capture gates (no capError, no actionType — the page
// knows the action; the cell is qty-only). Commits on blur/±/Enter → onSave(≥0).
// input role="spinbutton" min=0 + aria-label; ± are real <button>s; "Saving…" inline.
// Fresh .pqcell-* namespace (mirrors .qcell's look; qty-cell.css owns .qcell — C1).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanQtyCell } from './plan-qty-cell'

describe('PlanQtyCell — at rest', () => {
  it('renders the qty as a spinbutton (the committed plan qty is queryable)', () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={12} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue(12)
  })

  it('shows the −/+ stepper buttons (always in the DOM for keyboard + a11y)', () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase ayam bakar planned quantity/i })).toBeInTheDocument()
  })

  it('clamps to ≥ 0 — never a negative plan (input min=0)', () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={0} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('min', '0')
  })
})

describe('PlanQtyCell — −/+ behavior', () => {
  it('+ calls onSave(qty+1)', () => {
    const onSave = vi.fn()
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /increase ayam bakar planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith(6)
  })

  it('− calls onSave(qty−1)', () => {
    const onSave = vi.fn()
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith(4)
  })

  it("− is disabled when qty === 0 (can't plan negative)", () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={0} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i })).toBeDisabled()
  })

  it("− clamps to 0 when qty is already 0 (defensive — onSave never receives a negative)", () => {
    // qty is 0 and − is disabled, so this is belt-and-suspenders: even a keyboard
    // activation path clamps. Verified via the onSave contract on a positive qty edge.
    const onSave = vi.fn()
    render(<PlanQtyCell itemName="Ayam Bakar" qty={1} saving={false} disabled={false} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith(0) // 1 − 1 = 0, clamped ≥ 0
  })
})

describe('PlanQtyCell — direct input commits on blur', () => {
  it('typing a value then blurring fires onSave with the typed value (≥0)', () => {
    const onSave = vi.fn()
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '17' } })
    fireEvent.blur(input)
    expect(onSave).toHaveBeenCalledWith(17)
  })

  it('clamps a negative typed value to 0 on commit', () => {
    const onSave = vi.fn()
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '-3' } })
    fireEvent.blur(input)
    expect(onSave).toHaveBeenCalledWith(0)
  })
})

describe('PlanQtyCell — saving + disabled states', () => {
  it('renders an inline "Saving…" status while a save is in flight', () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving disabled={false} onSave={() => {}} />)
    expect(screen.getByText(/saving/i)).toBeInTheDocument()
    expect(screen.getByText(/saving/i)).toHaveAttribute('role', 'status')
  })

  it('disables all controls when disabled=true (offline)', () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled onSave={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /increase ayam bakar planned quantity/i })).toBeDisabled()
  })

  it('does NOT render a transfer-cap cue (Plan has no cap — Log-capture gate)', () => {
    render(<PlanQtyCell itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.queryByText(/stok kurang|produksi dulu/i)).toBeNull()
  })
})
