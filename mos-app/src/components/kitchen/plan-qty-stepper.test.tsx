// C3a (OD-K-5 redesign §4.2 PE-4): PlanQtyStepper — the phone plan-qty stepper.
// 44px −/input/+, "Saving…" inline. Mirrors PlanQtyCell's contract, phone-laid-out.
// Lifted from the prior inline PlanRow so phone + desktop share the qty semantics.
// Fresh .kps-* namespace. role="spinbutton" min=0 + aria-label; ± are real <button>s.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanQtyStepper } from './plan-qty-stepper'

describe('PlanQtyStepper — at rest', () => {
  it('renders the qty as a spinbutton', () => {
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={12} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue(12)
  })

  it('renders the −/+ buttons (44px touch targets)', () => {
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /increase ayam bakar planned quantity/i })).toBeInTheDocument()
  })
})

describe('PlanQtyStepper — −/+ behavior', () => {
  it('+ calls onSave(qty+1)', () => {
    const onSave = vi.fn()
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /increase ayam bakar planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith(6)
  })

  it('− calls onSave(qty−1)', () => {
    const onSave = vi.fn()
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i }))
    expect(onSave).toHaveBeenCalledWith(4)
  })

  it('− is disabled when qty === 0', () => {
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={0} saving={false} disabled={false} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: /decrease ayam bakar planned quantity/i })).toBeDisabled()
  })
})

describe('PlanQtyStepper — direct input + states', () => {
  it('typing then blurring commits the typed value (clamped ≥ 0)', () => {
    const onSave = vi.fn()
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '17' } })
    fireEvent.blur(input)
    expect(onSave).toHaveBeenCalledWith(17)
  })

  // item 13 (OD-REDESIGN-22): the phone stepper now rides the shared useInlineCommit —
  // same contract as its desktop sibling PlanQtyCell. Goal: the lead can abandon a typo
  // and never write an unchanged value.
  it('Enter commits the typed value', () => {
    const onSave = vi.fn()
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSave).toHaveBeenCalledWith(9)
  })

  it('Escape discards the draft and restores the saved qty without committing', () => {
    const onSave = vi.fn()
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled={false} onSave={onSave} />)
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '17' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue(5) // restored to the last saved value
    expect(onSave).not.toHaveBeenCalled() // Escape never writes
  })

  it('blurring with an unchanged value does NOT commit (no needless upsert)', () => {
    const onSave = vi.fn()
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={12} saving={false} disabled={false} onSave={onSave} />)
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.blur(input) // blur with the same value 12
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows an inline "Saving…" status while saving', () => {
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving disabled={false} onSave={() => {}} />)
    expect(screen.getByText(/saving/i)).toHaveAttribute('role', 'status')
  })

  it('disables all controls when disabled=true', () => {
    render(<PlanQtyStepper itemName="Ayam Bakar" qty={5} saving={false} disabled onSave={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /increase ayam bakar planned quantity/i })).toBeDisabled()
  })
})
